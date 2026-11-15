/**
 * Capa de observación: todo número visible pasa por report() (GDD 7.4), que aplica
 * ruido, retraso y falsificación. La UI nunca lee el valor real salvo en nodos investigados.
 */
import { SECTOR_IDS, ZONE_IDS } from '../data/schemas';
import { actKey, clamp, type Ctx } from './ctx';
import { salarioRealIdx } from './economy';
import { hashNoise } from './rng';
import { INDICATOR_KEYS, type FirmState, type GameState, type SectorId, type ZoneId } from './state';

export type Fuente = 'REPORTADO' | 'INVESTIGADO' | 'EXACTO';
export interface Reading { valor: number; fuente: Fuente; edadDias: number; ruidoPct: number }

const exacto = (valor: number): Reading => ({ valor, fuente: 'EXACTO', edadDias: 0, ruidoPct: 0 });

export function ruidoAmp(s: GameState, ctx: Ctx): number {
  return ctx.bal.observacion.ruido[actKey(s.act)]! * ctx.bal.dificultad[s.difficulty]!.ruido;
}

export const investigado = (s: GameState, nodeId: string): boolean => (s.investigaciones[nodeId] ?? 0) >= s.day;
const firmInvestigada = (s: GameState, f: FirmState): boolean =>
  investigado(s, `firm:${f.id}`) || investigado(s, `rama:${f.sector}.${f.rama}`);

function falsear(s: GameState, valor: number, indicador: string, targets: string[]): number {
  for (const f of s.falsificaciones) {
    if (f.hastaDia >= s.day && f.indicador === indicador && targets.includes(f.target)) valor = valor * f.factor + f.offset;
  }
  return valor;
}

const ruido = (s: GameState, key: string, amp: number): number => 1 + amp * hashNoise(s.seed, s.day, key);

export function firmLag(s: GameState, ctx: Ctx, f: FirmState): number {
  const aut = f.autonomia !== 'COORDINADO' ? f.autonomia : s.sectors[f.sector].autonomia;
  return f.reportLagDays + ctx.bal.autonomia[aut].lagDias;
}

/** Reporte del día de una empresa, sin retraso (lo que se archiva en la serie). */
function firmLive(s: GameState, ctx: Ctx, f: FirmState): Reading {
  if (firmInvestigada(s, f)) return { valor: f.produccion, fuente: 'INVESTIGADO', edadDias: 0, ruidoPct: 0 };
  const amp = ruidoAmp(s, ctx);
  const key = `firm:${f.id}.produccion`;
  const v = falsear(s, f.produccion, 'produccion', [`firm:${f.id}`, `rama:${f.sector}.${f.rama}`]) * ruido(s, key, amp);
  return { valor: Math.max(0, v), fuente: 'REPORTADO', edadDias: 0, ruidoPct: amp };
}

/** Lo que la sala ve hoy de una empresa (con retraso si corresponde). */
function firmReading(s: GameState, ctx: Ctx, f: FirmState): Reading {
  const live = firmLive(s, ctx, f);
  const lag = firmLag(s, ctx, f);
  if (lag <= 0 || live.fuente === 'INVESTIGADO') return live;
  const serie = s.series[`firm:${f.id}.produccion`] ?? [];
  if (serie.length === 0) return live;
  const idx = Math.max(0, serie.length - lag);
  return { valor: serie[idx]!, fuente: 'REPORTADO', edadDias: serie.length - idx, ruidoPct: live.ruidoPct };
}

function sumFirms(s: GameState, ctx: Ctx, pred: (f: FirmState) => boolean, inv: boolean): Reading {
  let valor = 0, edad = 0, ruidoPct = 0, todas = true;
  for (const f of Object.values(s.firms)) {
    if (!pred(f)) continue;
    const r = firmReading(s, ctx, f);
    valor += r.valor;
    edad = Math.max(edad, r.edadDias);
    ruidoPct = Math.max(ruidoPct, r.ruidoPct);
    if (r.fuente !== 'INVESTIGADO') todas = false;
  }
  return { valor, fuente: inv || todas ? 'INVESTIGADO' : 'REPORTADO', edadDias: edad, ruidoPct };
}

function zoneReading(s: GameState, ctx: Ctx, z: ZoneId, ind: 'animo' | 'abastecimiento'): Reading {
  const real = s.zones[z][ind];
  if (investigado(s, `zone:${z}`)) return { valor: real, fuente: 'INVESTIGADO', edadDias: 0, ruidoPct: 0 };
  const amp = ruidoAmp(s, ctx);
  const v = falsear(s, real, ind, [`zone:${z}`]) * ruido(s, `zone:${z}.${ind}`, amp);
  return { valor: clamp(v, 0, 100), fuente: 'REPORTADO', edadDias: 0, ruidoPct: amp };
}

export type Pantalla = 'checo' | 'red' | 'cyberfolk';
export const pantallaDesbloqueada = (s: GameState, ctx: Ctx, p: Pantalla): boolean =>
  s.flags[`unlock.pantalla.${p}`] === true || s.day >= ctx.bal.pantallas.desbloqueoDia[p];

/** Zonas con medidores Cyberfolk instalados (antes del despliegue nacional sólo hay zonas piloto). */
export function zonasCyberfolk(s: GameState, ctx: Ctx): readonly ZoneId[] {
  return pantallaDesbloqueada(s, ctx, 'cyberfolk') ? ZONE_IDS : ctx.bal.pantallas.cyberfolkPiloto;
}

function ponderado(s: GameState, ctx: Ctx, ind: 'animo' | 'abastecimiento'): Reading {
  const zonas = ind === 'animo' ? zonasCyberfolk(s, ctx) : ZONE_IDS;
  let v = 0, pop = 0;
  for (const z of zonas) {
    v += zoneReading(s, ctx, z, ind).valor * ctx.zone[z].poblacion;
    pop += ctx.zone[z].poblacion;
  }
  return { valor: v / pop, fuente: 'REPORTADO', edadDias: 0, ruidoPct: ruidoAmp(s, ctx) };
}

function inflacionReading(s: GameState, ctx: Ctx): Reading {
  const amp = ruidoAmp(s, ctx) * ctx.bal.observacion.ruidoInflacion;
  return { valor: s.economy.inflacionMensual * ruido(s, 'pais.inflacion', amp), fuente: 'REPORTADO', edadDias: 0, ruidoPct: amp };
}

/**
 * Lectura visible de un indicador.
 * Nodos: 'pais' | 'sector:CON' | 'rama:CON.textil' | 'firm:<id>' | 'zone:BIO'.
 */
export function report(s: GameState, ctx: Ctx, node: string, ind: string): Reading {
  const [tipo, id = ''] = node.split(':');
  const e = s.economy;
  if (tipo === 'pais') {
    switch (ind) {
      case 'produccion': {
        const r = sumFirms(s, ctx, () => true, false);
        return { ...r, valor: clamp((100 * r.valor) / e.capacidadBaseTotal, 0, 100) };
      }
      case 'abastecimiento': return ponderado(s, ctx, 'abastecimiento');
      case 'animo': return ponderado(s, ctx, 'animo');
      case 'inflacion': return inflacionReading(s, ctx);
      case 'estabilidadPrecios': {
        const r = inflacionReading(s, ctx);
        return { ...r, valor: clamp(100 - (100 * r.valor) / ctx.bal.escalas.inflacionMax, 0, 100) };
      }
      case 'mercadoNegro': {
        const amp = ruidoAmp(s, ctx) * ctx.bal.observacion.ruidoMercadoNegro;
        return { valor: clamp(e.mercadoNegro * ruido(s, 'pais.mercadoNegro', amp), 0, 1), fuente: 'REPORTADO', edadDias: 0, ruidoPct: amp };
      }
      case 'divisas': case 'estabilidadRed': case 'soberania': return exacto(s.indicators[ind]);
      case 'divisasMUSD': return exacto(e.divisas);
      case 'cobre': return exacto(e.precioCobre);
      case 'salarioReal': return exacto(salarioRealIdx(s));
    }
  } else if (tipo === 'sector' && SECTOR_IDS.includes(id as SectorId)) {
    const sec = s.sectors[id as SectorId];
    switch (ind) {
      case 'produccion': return sumFirms(s, ctx, (f) => f.sector === id, false);
      case 'utilizacion': {
        const r = sumFirms(s, ctx, (f) => f.sector === id, false);
        return { ...r, valor: sec.capacidad > 0 ? r.valor / sec.capacidad : 0 };
      }
      case 'insumosDias': return exacto(sec.requeridoDia > 0 ? sec.insumos / sec.requeridoDia : 0);
      case 'moral': {
        const amp = ruidoAmp(s, ctx);
        return { valor: clamp(sec.moral * ruido(s, `sector:${id}.moral`, amp), 0, 100), fuente: 'REPORTADO', edadDias: 0, ruidoPct: amp };
      }
    }
  } else if (tipo === 'rama' && ind === 'produccion') {
    const [sec, rama] = id.split('.');
    return sumFirms(s, ctx, (f) => f.sector === sec && f.rama === rama, investigado(s, node));
  } else if (tipo === 'firm' && ind === 'produccion' && s.firms[id]) {
    return firmReading(s, ctx, s.firms[id]);
  } else if (tipo === 'zone' && ZONE_IDS.includes(id as ZoneId) && (ind === 'animo' || ind === 'abastecimiento')) {
    return zoneReading(s, ctx, id as ZoneId, ind);
  }
  throw new Error(`report(): nodo/indicador desconocido "${node}" / "${ind}"`);
}

/** Los 7 indicadores nacionales tal como los ve la sala. */
export function reportIndicators(s: GameState, ctx: Ctx): Record<(typeof INDICATOR_KEYS)[number], Reading> {
  const out = {} as Record<(typeof INDICATOR_KEYS)[number], Reading>;
  for (const k of INDICATOR_KEYS) out[k] = report(s, ctx, 'pais', k);
  return out;
}

const PAIS_EXTRA = ['inflacion', 'mercadoNegro', 'divisasMUSD', 'cobre', 'salarioReal'];
const SECTOR_INDS = ['produccion', 'insumosDias', 'moral'];

/** Series que vigila Cyberstride cada día (las de empresa se analizan a demanda). */
export function watchedSeries(ctx: Ctx, s?: GameState): [node: string, ind: string][] {
  const conMedidor = s ? zonasCyberfolk(s, ctx) : ZONE_IDS;
  const out: [string, string][] = INDICATOR_KEYS.map((k) => ['pais', k]);
  for (const sec of ctx.data.sectors) {
    for (const ind of SECTOR_INDS) out.push([`sector:${sec.id}`, ind]);
    for (const r of sec.ramas) out.push([`rama:${sec.id}.${r.id}`, 'produccion']);
  }
  for (const z of ZONE_IDS) {
    if (conMedidor.includes(z)) out.push([`zone:${z}`, 'animo']);
    out.push([`zone:${z}`, 'abastecimiento']);
  }
  return out;
}

/** Archiva los datos reportados del día (se llama en el cierre, antes de avanzar el día). */
export function recordDay(s: GameState, ctx: Ctx): void {
  const vals: [string, number][] = [];
  for (const [node, ind] of watchedSeries(ctx)) vals.push([`${node}.${ind}`, report(s, ctx, node, ind).valor]);
  for (const ind of PAIS_EXTRA) vals.push([`pais.${ind}`, report(s, ctx, 'pais', ind).valor]);
  for (const f of Object.values(s.firms)) vals.push([`firm:${f.id}.produccion`, firmLive(s, ctx, f).valor]);
  for (const [k, v] of vals) (s.series[k] ??= []).push(v);
}

/** Serie visible de un indicador (las empresas con retraso muestran menos días). */
export function visibleSeries(s: GameState, ctx: Ctx, node: string, ind: string): number[] {
  const serie = s.series[`${node}.${ind}`] ?? [];
  if (node.startsWith('zone:') && ind === 'animo' && !ctx.bal.pantallas.cyberfolkPiloto.includes(node.slice(5) as ZoneId)) {
    // Zona sin medidor hasta el despliegue nacional: no hay historia anterior.
    return pantallaDesbloqueada(s, ctx, 'cyberfolk') ? serie.slice(ctx.bal.pantallas.desbloqueoDia.cyberfolk - 1) : [];
  }
  if (node.startsWith('firm:')) {
    const f = s.firms[node.slice(5)];
    if (f && !firmInvestigada(s, f)) {
      const lag = firmLag(s, ctx, f);
      if (lag > 0) return serie.slice(0, Math.max(0, serie.length - lag + 1));
    }
  }
  return serie;
}

/** S3* Auditoría: revela la cifra real de una rama, empresa o zona por unos días. */
export function investigate(s: GameState, ctx: Ctx, nodeId: string): { error: string } | { minutos: number } {
  const [tipo, id = ''] = nodeId.split(':');
  const [sec, rama] = id.split('.');
  const ok =
    (tipo === 'firm' && s.firms[id] !== undefined) ||
    (tipo === 'zone' && ZONE_IDS.includes(id as ZoneId)) ||
    (tipo === 'rama' && SECTOR_IDS.includes(sec as SectorId) && ctx.sec[sec as SectorId].ramas.some((r) => r.id === rama));
  if (!ok) return { error: 'NODO_INVALIDO' };
  const { investigarMin, investigarDias } = ctx.bal.observacion;
  if (s.hour + investigarMin / 60 > ctx.bal.tiempo.horaInicio + ctx.bal.tiempo.horasPorDia + 1e-9) return { error: 'SIN_TIEMPO' };
  s.investigaciones[nodeId] = s.day + investigarDias - 1;
  return { minutos: investigarMin };
}
