/** Ecuaciones económicas (GDD 3.3). Mutan el estado recibido; el engine clona antes. */
import { SECTOR_IDS, ZONE_IDS } from '../data/schemas';
import { clamp, type Ctx } from './ctx';
import type { Rng } from './rng';
import type { GameState, NationalIndicators, SectorId } from './state';

/** Gasto de divisas por día que cubre exactamente el consumo planificado de cada sector. */
export function necesidadDivisas(s: GameState, ctx: Ctx): Record<SectorId, number> {
  const out = {} as Record<SectorId, number>;
  for (const id of SECTOR_IDS) out[id] = planConsumo(s, ctx, id) * ctx.sec[id].precioImport * s.economy.precioImportIdx;
  return out;
}

function planConsumo(s: GameState, ctx: Ctx, id: SectorId): number {
  const sec = s.sectors[id];
  return ctx.sec[id].insumoPorUnidad * sec.capacidadEfectiva * sec.utilizacion;
}

/** Recalcula lo derivado de palancas, capacidad y eficiencia de empresas. */
export function refreshSectorBasics(s: GameState, ctx: Ctx): void {
  const { utilizacionBase } = ctx.bal.inicio;
  for (const id of SECTOR_IDS) {
    s.sectors[id].capacidad = 0;
    s.sectors[id].capacidadEfectiva = 0;
  }
  for (const f of Object.values(s.firms)) {
    const sec = s.sectors[f.sector];
    sec.capacidad += f.capacidad;
    sec.capacidadEfectiva += f.capacidad * f.eficiencia;
  }
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    sec.meta = s.levers.metas[id];
    sec.utilizacion = Math.min(1, utilizacionBase * sec.meta * (1 + ctx.bal.autonomia[sec.autonomia].prod));
    sec.requeridoDia = ctx.sec[id].insumoPorUnidad * sec.capacidad * utilizacionBase;
  }
}

/** produccion[s] = capacidad·utilizacion·factorInsumos·factorMoral·(1−sabotaje) (·factorEnergia salvo ENT). */
export function computeProduction(s: GameState, ctx: Ctx): void {
  const factorEnergia = 1 - ctx.bal.economia.energiaPeso * (1 - s.sectors.ENT.factorInsumos);
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    const factorMoral = 0.6 + (0.4 * sec.moral) / 100;
    const energia = id === 'ENT' ? 1 : factorEnergia;
    sec.produccion =
      sec.capacidadEfectiva * sec.utilizacion * sec.factorInsumos * factorMoral * (1 - sec.sabotaje) * energia;
  }
  for (const f of Object.values(s.firms)) {
    const sec = s.sectors[f.sector];
    f.produccion = sec.capacidadEfectiva > 0 ? (sec.produccion * f.capacidad * f.eficiencia) / sec.capacidadEfectiva : 0;
  }
}

/** Valor relativo del cobre refinado en Chile frente al exportado en bruto (=1). */
export function valorRefinado(s: GameState, ctx: Ctx): number {
  const c = ctx.bal.cobre;
  return c.refinadoValorInicial + (c.refinadoValorMax - c.refinadoValorInicial) * s.economy.refinacionMadurez;
}

/** Abastecimiento por zona: base nacional × acceso + envíos + distribución prioritaria. */
export function computeZones(s: GameState, ctx: Ctx): void {
  const prio = s.levers.zonasPrioritarias;
  const P = ctx.bal.palancas.prioridadBonus;
  let popPrio = 0;
  for (const z of prio) popPrio += ctx.zone[z].poblacion;
  const castigo = popPrio > 0 && popPrio < 1 ? (P * popPrio) / (1 - popPrio) : 0;
  for (const z of ZONE_IDS) {
    const zs = s.zones[z];
    const ajuste = prio.includes(z) ? P : -castigo;
    zs.abastecimiento = clamp(s.economy.abastecimiento * ctx.zone[z].acceso + zs.abastBonus + ajuste, 0, 100);
  }
}

/** Un sub-paso (dt = fracción de día). */
export function stepEconomy(s: GameState, ctx: Ctx, dt: number): void {
  const eco = ctx.bal.economia;
  const e = s.economy;

  // 1) Insumos: llegada según divisas asignadas (limitada por lo realmente pagado).
  const budget = eco.presupuestoInsumosDia;
  const gastoDia = budget + eco.importAlimentosUnidades * eco.precioImportAlimento + eco.servicioDeudaDia;
  const disponible = e.divisas + e.ingresosDivisas * dt;
  const necesario = gastoDia * dt;
  const pagado = necesario > 0 ? Math.min(1, disponible / necesario) : 1;

  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    const llegada = (s.levers.asignacionDivisas[id] * budget * pagado) / (ctx.sec[id].precioImport * e.precioImportIdx);
    const usable = sec.insumos + llegada * dt;
    const need = planConsumo(s, ctx, id) * dt;
    sec.factorInsumos = need > 0 ? Math.min(1, usable / need) : 1;
    sec.insumos = Math.max(0, usable - need * sec.factorInsumos);
  }

  // 2) Producción.
  computeProduction(s, ctx);

  // 3) Divisas: cobre exportado en bruto + refinado en Chile.
  const share = s.levers.shareExportCobre;
  e.ingresosDivisas =
    s.sectors.MIN.produccion * e.precioCobre * eco.kCobre * (share + (1 - share) * valorRefinado(s, ctx));
  e.divisas = Math.max(0, disponible - necesario * pagado);
  e.deudaExterna += necesario * (1 - pagado);

  // 4) Mercado de básicos.
  const importFood = (eco.importAlimentosUnidades / e.precioImportIdx) * pagado;
  e.ofertaBasicos = s.sectors.CON.produccion + s.sectors.AGR.produccion + importFood;
  e.demandaBasicos = (e.salarioNominal * e.empleo) / e.precioOficial.BASICOS;
  e.brecha = (e.demandaBasicos - e.ofertaBasicos) / e.ofertaBasicos;

  const control = clamp(eco.controlBase + eco.controlPendiente * (e.ipc / e.precioOficial.BASICOS - 1), 0, 1.5);
  const fisc = eco.fiscalizacionNivel[s.levers.fiscalizacion];
  e.mercadoNegro = clamp(
    e.mercadoNegro + (eco.a1 * Math.max(0, e.brecha) * control - eco.a2 * fisc - eco.a3 * e.mercadoNegro) * dt,
    0, 1,
  );

  e.inflacionMensual =
    eco.inflacionBase +
    eco.b1 * Math.max(0, e.brecha) +
    eco.b2 * eco.emisionNivel[s.levers.emision] +
    eco.b3 * e.ajustePrecios +
    eco.b4 * e.mercadoNegro;
  e.ipc *= 1 + (e.inflacionMensual / 30) * dt;

  e.abastecimiento = clamp((100 * e.ofertaBasicos * (1 - e.mercadoNegro)) / e.demandaBasicos, 0, 100);
  computeZones(s, ctx);
}

export const salarioRealIdx = (s: GameState): number =>
  s.economy.salarioNominal / s.economy.ipc / s.economy.salarioBase;

export function ponderadoZonas(s: GameState, ctx: Ctx, campo: 'animo' | 'abastecimiento'): number {
  let a = 0;
  for (const z of ZONE_IDS) a += s.zones[z][campo] * ctx.zone[z].poblacion;
  return a;
}

export function computeIndicators(s: GameState, ctx: Ctx): NationalIndicators {
  const { escalas } = ctx.bal;
  const e = s.economy;
  let prod = 0;
  for (const id of SECTOR_IDS) prod += s.sectors[id].produccion;
  const refinado = 1 - s.levers.shareExportCobre;
  const deudaTerm = clamp(1 - e.deudaExterna / escalas.deudaRef, 0, 1);
  const soberaniaEcon = 0.5 * refinado + 0.5 * deudaTerm; // H6: sustitución de importaciones
  return {
    produccion: clamp((100 * prod) / e.capacidadBaseTotal, 0, 100),
    abastecimiento: ponderadoZonas(s, ctx, 'abastecimiento'),
    estabilidadPrecios: clamp(100 - (100 * e.inflacionMensual) / escalas.inflacionMax, 0, 100),
    divisas: clamp((100 * e.divisas) / escalas.divisasMax, 0, 100),
    estabilidadRed: 100, // H6: nodos operativos / total
    animo: ponderadoZonas(s, ctx, 'animo'),
    soberania: clamp(70 * soberaniaEcon + 0.3 * e.soberaniaCultural, 0, 100),
  };
}

/** Calidad de vida (GDD 3.3): se muestra en el cierre. */
export function calidadVida(s: GameState): number {
  const i = s.indicators;
  const sal = Math.min(100, 60 * salarioRealIdx(s));
  return 0.35 * i.abastecimiento + 0.25 * sal + 0.2 * i.animo + 0.2 * s.economy.soberaniaCultural;
}

/** Fin de día: exógenos, desgaste de capacidad, recuperación de averías. */
export function dailyEconomy(s: GameState, ctx: Ctx, rng: Rng): void {
  const { economia: eco, exogeno: ex } = ctx.bal;
  const e = s.economy;

  e.ajustePrecios *= 1 - eco.ajustePreciosDecay;
  e.salarioNominal *= 1 + (eco.indexacionSalarial * e.inflacionMensual) / 30;
  e.precioImportIdx *= 1 + ex.derivaPrecioImportDia;
  e.precioCobre = Math.max(
    0.2,
    e.precioCobre + ex.cobreReversion * (ex.cobreMedia - e.precioCobre) + ex.cobreVolatilidad * e.precioCobre * rng.normal(),
  );
  e.refinacionMadurez = clamp(e.refinacionMadurez + ctx.bal.cobre.madurezDia * (1 - s.levers.shareExportCobre), 0, 1);

  const averiadas = new Set(s.algedonic.filter((a) => a.origen.tipo === 'FIRM').map((a) => a.origen.id));
  const rec = ctx.bal.algedonico.recuperacionEficienciaDia;
  for (const f of Object.values(s.firms)) {
    const sobre = Math.max(0, s.sectors[f.sector].meta - 1);
    f.capacidad *= 1 - ex.depreciacionCapacidadDia - ex.desgasteMetaCapacidad * sobre;
    if (f.eficiencia < 1 && !averiadas.has(f.id)) f.eficiencia = Math.min(1, f.eficiencia + rec);
  }
  for (const z of ZONE_IDS) s.zones[z].abastBonus *= 1 - ctx.bal.cyberfolk.abastBonusDecay;
  refreshSectorBasics(s, ctx);
}
