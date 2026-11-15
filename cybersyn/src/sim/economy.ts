/** Ecuaciones económicas (GDD 3.3). Funciones que mutan el estado recibido (el engine clona antes). */
import { SECTOR_IDS, ZONE_IDS, type GameData, type SectorDef, type ZoneDef } from '../data/schemas';
import type { GameState, NationalIndicators, SectorId, ZoneId } from './state';
import type { Rng } from './rng';

export interface Ctx {
  data: GameData;
  sec: Record<SectorId, SectorDef>;
  zone: Record<ZoneId, ZoneDef>;
}

export function makeCtx(data: GameData): Ctx {
  const sec = {} as Record<SectorId, SectorDef>;
  for (const s of data.sectors) sec[s.id] = s;
  const zone = {} as Record<ZoneId, ZoneDef>;
  for (const z of data.zones) zone[z.id] = z;
  return { data, sec, zone };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export { clamp };

/** Gasto de divisas por día que cubre exactamente el consumo planificado de cada sector (para políticas). */
export function necesidadDivisas(s: GameState, ctx: Ctx): Record<SectorId, number> {
  const { utilizacionBase } = ctx.data.balance.inicio;
  const out = {} as Record<SectorId, number>;
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    const consumo = ctx.sec[id].insumoPorUnidad * sec.capacidad * Math.min(1, utilizacionBase * sec.meta);
    out[id] = consumo * ctx.sec[id].precioImport * s.economy.precioImportIdx;
  }
  return out;
}

function planConsumo(s: GameState, ctx: Ctx, id: SectorId): number {
  const sec = s.sectors[id];
  return ctx.sec[id].insumoPorUnidad * sec.capacidad * sec.utilizacion;
}

/** Utilización y requerimiento diario dependen de metas y capacidad. */
export function refreshSectorBasics(s: GameState, ctx: Ctx): void {
  const { utilizacionBase } = ctx.data.balance.inicio;
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    sec.meta = s.levers.metas[id];
    sec.utilizacion = Math.min(1, utilizacionBase * sec.meta);
    sec.requeridoDia = ctx.sec[id].insumoPorUnidad * sec.capacidad * utilizacionBase;
  }
}

/** produccion[s] = capacidad·utilizacion·factorInsumos·factorMoral·(1−sabotaje) (·factorEnergia salvo ENT). */
export function computeProduction(s: GameState, ctx: Ctx): void {
  const { energiaPeso } = ctx.data.balance.economia;
  const factorEnergia = 1 - energiaPeso * (1 - s.sectors.ENT.factorInsumos);
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    const factorMoral = 0.6 + (0.4 * sec.moral) / 100;
    const energia = id === 'ENT' ? 1 : factorEnergia;
    sec.produccion = sec.capacidad * sec.utilizacion * sec.factorInsumos * factorMoral * (1 - sec.sabotaje) * energia;
    sec.reportado = sec.produccion; // H2: report() aplica ruido/retraso/falsificación
  }
  for (const f of Object.values(s.firms)) {
    const sec = s.sectors[f.sector];
    f.produccion = sec.produccion * (f.capacidad / sec.capacidad);
    f.reportado = f.produccion;
  }
}

/** Un sub-paso (dtDias = fracción de día). */
export function stepEconomy(s: GameState, ctx: Ctx, dt: number): void {
  const { economia: eco } = ctx.data.balance;
  const e = s.economy;

  // 1) Insumos: llegada según divisas asignadas (limitada por lo realmente pagado).
  const budget = eco.presupuestoInsumosDia;
  const alimGasto = eco.importAlimentosUnidades * eco.precioImportAlimento;
  const gastoDia = budget + alimGasto + eco.servicioDeudaDia;
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

  // 2) Producción con los factores recién calculados.
  computeProduction(s, ctx);

  // 3) Divisas.
  e.ingresosDivisas = s.sectors.MIN.produccion * s.levers.shareExportCobre * e.precioCobre * eco.kCobre;
  const ingresoPaso = e.ingresosDivisas * dt;
  e.divisas = Math.max(0, e.divisas + ingresoPaso - necesario * pagado);
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
}

export const salarioRealIdx = (s: GameState): number =>
  s.economy.salarioNominal / s.economy.ipc / s.economy.salarioBase;

export function animoNacional(s: GameState, ctx: Ctx): number {
  let a = 0;
  for (const z of ZONE_IDS) a += s.zones[z].animo * ctx.zone[z].poblacion;
  return a;
}

export function computeIndicators(s: GameState, ctx: Ctx): NationalIndicators {
  const { escalas } = ctx.data.balance;
  const e = s.economy;
  let prod = 0;
  for (const id of SECTOR_IDS) prod += s.sectors[id].produccion;
  const refinado = 1 - s.levers.shareExportCobre;
  const deudaTerm = clamp(1 - e.deudaExterna / escalas.deudaRef, 0, 1);
  const soberaniaEcon = 0.5 * refinado + 0.5 * deudaTerm; // H2+: sustitución de importaciones
  return {
    produccion: clamp((100 * prod) / e.capacidadBaseTotal, 0, 100),
    abastecimiento: e.abastecimiento,
    estabilidadPrecios: clamp(100 - (100 * e.inflacionMensual) / escalas.inflacionMax, 0, 100),
    divisas: clamp((100 * e.divisas) / escalas.divisasMax, 0, 100),
    estabilidadRed: 100, // H2: nodos operativos / total
    animo: animoNacional(s, ctx),
    soberania: clamp(70 * soberaniaEcon + 0.3 * e.soberaniaCultural, 0, 100),
  };
}

/** Calidad de vida (GDD 3.3): se muestra en el cierre. */
export function calidadVida(s: GameState): number {
  const i = s.indicators;
  const sal = Math.min(100, 60 * salarioRealIdx(s));
  return 0.35 * i.abastecimiento + 0.25 * sal + 0.2 * i.animo + 0.2 * s.economy.soberaniaCultural;
}

/** Actualizaciones de fin de día: exógenos, desgaste, ánimo, moral. */
export function dailyUpdate(s: GameState, ctx: Ctx, rng: Rng): void {
  const { economia: eco, exogeno: ex, cyberfolk: cf } = ctx.data.balance;
  const e = s.economy;

  e.ajustePrecios *= 1 - eco.ajustePreciosDecay;
  e.salarioNominal *= 1 + (eco.indexacionSalarial * e.inflacionMensual) / 30;
  e.precioImportIdx *= 1 + ex.derivaPrecioImportDia;
  e.precioCobre = Math.max(
    0.2,
    e.precioCobre + ex.cobreReversion * (ex.cobreMedia - e.precioCobre) + ex.cobreVolatilidad * e.precioCobre * rng.normal(),
  );

  // Capacidad: depreciación + desgaste por metas > 100 %.
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    const sobre = Math.max(0, sec.meta - 1);
    const factor = 1 - ex.depreciacionCapacidadDia - ex.desgasteMetaCapacidad * sobre;
    sec.capacidad = 0;
    for (const f of Object.values(s.firms)) {
      if (f.sector !== id) continue;
      f.capacidad *= factor;
      sec.capacidad += f.capacidad;
    }
  }

  // Cyberfolk mínimo (H2 lo expande): ánimo por zona.
  const sal = salarioRealIdx(s);
  const prio = 0;
  for (const z of ZONE_IDS) {
    const zs = s.zones[z];
    zs.abastecimiento = clamp(e.abastecimiento * ctx.zone[z].acceso + prio, 0, 100);
    const delta =
      (cf.w1 * (zs.abastecimiento - 60)) / 40 +
      cf.w2 * (sal - 1) -
      cf.w3 * e.inflacionMensual +
      eco.emisionAnimo[s.levers.emision] +
      eco.fiscalizacionAnimo[s.levers.fiscalizacion] -
      zs.propaganda +
      zs.cultura +
      cf.ruido * rng.signed();
    zs.animo = clamp(zs.animo + delta, 0, 100);
  }

  // Moral sectorial converge al ánimo nacional; metas altas la desgastan.
  const an = animoNacional(s, ctx);
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    sec.moral = clamp(
      sec.moral + ex.moralConvergencia * (an - sec.moral) - ex.desgasteMetaMoral * Math.max(0, sec.meta - 1),
      0, 100,
    );
  }
  refreshSectorBasics(s, ctx);
}
