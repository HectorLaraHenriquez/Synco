/** Palancas económicas (GDD 3.4): borrador → EJECUTAR → efecto inmediato o diferido. */
import { LEVER_KEYS, SECTOR_IDS, ZONE_IDS, type LeverKey } from '../data/schemas';
import { clamp, type Ctx } from './ctx';
import { computeZones, refreshSectorBasics } from './economy';
import type { Rng } from './rng';
import {
  ONE_SHOT_LEVERS, PRICE_CATS, type Autonomy, type Emision, type Fiscalizacion, type GameState,
  type LeverPatch, type LeverState, type PriceCat, type SectorId, type ZoneId,
} from './state';

export type LeverName = LeverKey | 'autonomia';
const EMISION: Emision[] = ['BAJO', 'MEDIO', 'ALTO'];
const FISC: Fiscalizacion[] = ['OFF', 'RACIONAMIENTO', 'ESTRICTO'];

export function isUnlocked(s: GameState, ctx: Ctx, lever: LeverName): boolean {
  return s.flags[`unlock.${lever}`] === true || s.day >= ctx.bal.palancas.desbloqueoDia[lever];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function partialRecord<K extends string>(
  value: unknown, keys: readonly K[], fix: (v: number) => number,
): Partial<Record<K, number>> | undefined {
  if (!isObj(value)) return undefined;
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!keys.includes(k as K) || !isNum(v)) return undefined;
    out[k as K] = fix(v);
  }
  return out;
}

export function ramaExists(ctx: Ctx, ramaKey: string): boolean {
  const [sec, rama] = ramaKey.split('.');
  return SECTOR_IDS.includes(sec as SectorId) && ctx.sec[sec as SectorId].ramas.some((r) => r.id === rama);
}

/** Valida y normaliza el valor de una palanca. Devuelve undefined si es inválido. */
export function normalizeLever(ctx: Ctx, lever: LeverKey, value: unknown): LeverPatch[LeverKey] | undefined {
  const lim = ctx.bal.limites;
  switch (lever) {
    case 'precios':
      return partialRecord(value, PRICE_CATS, (v) => clamp(v, -lim.precioMaxCambio, lim.precioMaxCambio));
    case 'asignacionDivisas':
      return partialRecord(value, SECTOR_IDS, (v) => Math.max(0, v));
    case 'metas':
      return partialRecord(value, SECTOR_IDS, (v) => clamp(v, lim.metaMin, lim.metaMax));
    case 'reajusteSalarial':
      return isNum(value) ? clamp(value, 0, ctx.bal.palancas.reajusteMax) : undefined;
    case 'emision':
      return EMISION.includes(value as Emision) ? (value as Emision) : undefined;
    case 'fiscalizacion':
      return FISC.includes(value as Fiscalizacion) ? (value as Fiscalizacion) : undefined;
    case 'shareExportCobre':
      return isNum(value) ? clamp(value, 0, 1) : undefined;
    case 'zonasPrioritarias': {
      if (!Array.isArray(value) || value.some((z) => !ZONE_IDS.includes(z))) return undefined;
      const uniq = [...new Set(value as ZoneId[])];
      return uniq.length <= ctx.bal.palancas.maxZonasPrioritarias ? uniq : undefined;
    }
    case 'inversiones': {
      if (!Array.isArray(value) || value.some((r) => typeof r !== 'string' || !ramaExists(ctx, r))) return undefined;
      return [...new Set(value as string[])];
    }
  }
}

export function setDraft(s: GameState, ctx: Ctx, lever: LeverKey, value: unknown): string | undefined {
  if (!LEVER_KEYS.includes(lever)) return 'PALANCA_DESCONOCIDA';
  if (!isUnlocked(s, ctx, lever)) return 'PALANCA_BLOQUEADA';
  const v = normalizeLever(ctx, lever, value);
  if (v === undefined) return 'VALOR_INVALIDO';
  const d = s.draftLevers as Record<string, unknown>;
  d[lever] = isObj(v) ? { ...(d[lever] as object | undefined), ...v } : v;
  return undefined;
}

/** Valor final que tendría la palanca si se ejecutara el borrador. */
function resolved<K extends LeverKey>(s: GameState, k: K): LeverState[K] {
  const draft = s.draftLevers[k];
  const cur = s.levers[k];
  if (draft === undefined) return cur;
  if (k === 'asignacionDivisas') {
    const raw = { ...(cur as Record<SectorId, number>), ...(draft as object) } as Record<SectorId, number>;
    const tot = SECTOR_IDS.reduce((a, id) => a + raw[id], 0);
    if (tot <= 0) return cur;
    for (const id of SECTOR_IDS) raw[id] /= tot;
    return raw as LeverState[K];
  }
  if (isObj(draft)) return { ...(cur as object), ...(draft as object) } as LeverState[K];
  return draft as LeverState[K];
}

export function changedLevers(s: GameState): LeverKey[] {
  return LEVER_KEYS.filter((k) => {
    if (s.draftLevers[k] === undefined) return false;
    return JSON.stringify(resolved(s, k)) !== JSON.stringify(s.levers[k]);
  });
}

export interface ExecuteCost { cambios: LeverKey[]; minutos: number; capitalPolitico: number; divisas: number }

function capacidadRama(s: GameState, ramaKey: string): number {
  const [sec, rama] = ramaKey.split('.');
  let c = 0;
  for (const f of Object.values(s.firms)) if (f.sector === sec && f.rama === rama) c += f.capacidad;
  return c;
}

export function executeCost(s: GameState, ctx: Ctx): ExecuteCost {
  const pal = ctx.bal.palancas;
  const cambios = changedLevers(s);
  let capital = 0;
  let divisas = 0;
  for (const k of cambios) {
    if (k === 'precios') {
      const p = resolved(s, 'precios');
      for (const cat of PRICE_CATS)
        capital += Math.max(0, p[cat]) * 100 * pal.costoPolitico.precioPorPunto * ctx.bal.economia.pesoCategoria[cat];
    } else if (k === 'fiscalizacion') {
      const nuevo = resolved(s, 'fiscalizacion');
      if (FISC.indexOf(nuevo) > FISC.indexOf(s.levers.fiscalizacion) && nuevo !== 'OFF') capital += pal.costoPolitico[nuevo];
    } else if (k === 'inversiones') {
      for (const r of resolved(s, 'inversiones'))
        divisas += pal.inversion.costoPorCapacidad * pal.inversion.aumento * capacidadRama(s, r);
    }
  }
  return { cambios, minutos: cambios.length * pal.minutosPorCambio, capitalPolitico: capital, divisas };
}

export function delayFor(ctx: Ctx, rng: Rng, lever: LeverName): number {
  const [a, b] = ctx.bal.palancas.retrasoDias[lever];
  return a === b ? a : a + Math.floor(rng.next() * (b - a + 1));
}

/** Aplica ya el valor de una palanca (lo usan EJECUTAR sin retraso y los efectos diferidos). */
export function applyLeverNow(s: GameState, ctx: Ctx, lever: LeverKey, value: unknown): void {
  const e = s.economy;
  const pal = ctx.bal.palancas;
  switch (lever) {
    case 'precios': {
      const p = value as Record<PriceCat, number>;
      for (const cat of PRICE_CATS) {
        e.precioOficial[cat] *= 1 + (p[cat] ?? 0);
        e.ajustePrecios += (p[cat] ?? 0) * ctx.bal.economia.pesoCategoria[cat];
      }
      break;
    }
    case 'reajusteSalarial': {
      const p = value as number;
      e.salarioNominal *= 1 + p;
      for (const z of ZONE_IDS) s.zones[z].animo = clamp(s.zones[z].animo + pal.reajusteAnimo * p, 0, 100);
      break;
    }
    case 'inversiones':
      for (const r of value as string[]) {
        const sec = r.split('.')[0] as SectorId;
        s.pendingEffects.push({
          dueDay: s.day + pal.inversion.diasPorSector[sec],
          origen: 'JUGADOR',
          effects: [{ op: 'mul', path: `ramas.${r}.capacidad`, value: 1 + pal.inversion.aumento }],
        });
      }
      break;
    default:
      (s.levers as unknown as Record<string, unknown>)[lever] = structuredClone(value);
  }
  refreshSectorBasics(s, ctx);
  computeZones(s, ctx);
}

/**
 * Ejecuta el borrador. Devuelve un código de error o los minutos de reloj que cuesta.
 * `hipotetico` (Checo): sin validar desbloqueos ni cobrar costos.
 */
export function executeDraft(
  s: GameState, ctx: Ctx, rng: Rng, hipotetico = false,
): { error: string } | { minutos: number } {
  const cost = executeCost(s, ctx);
  if (!hipotetico) {
    if (cost.cambios.length === 0) return { error: 'SIN_CAMBIOS' };
    if (cost.cambios.some((k) => !isUnlocked(s, ctx, k))) return { error: 'PALANCA_BLOQUEADA' };
    if (s.hour + cost.minutos / 60 > ctx.bal.tiempo.horaInicio + ctx.bal.tiempo.horasPorDia + 1e-9) return { error: 'SIN_TIEMPO' };
    if (cost.capitalPolitico > s.player.capitalPolitico) return { error: 'SIN_CAPITAL_POLITICO' };
    if (cost.divisas > s.economy.divisas) return { error: 'SIN_DIVISAS' };
    s.player.capitalPolitico -= cost.capitalPolitico;
    s.economy.divisas -= cost.divisas;
    const last = s.checo[s.checo.length - 1];
    if (last && last.dia === s.day && JSON.stringify(last.draft) === JSON.stringify(s.draftLevers)) last.adoptado = true;
  }
  for (const k of cost.cambios) {
    const value = resolved(s, k);
    const d = delayFor(ctx, rng, k);
    if (d === 0) applyLeverNow(s, ctx, k, value);
    else s.pendingEffects.push({ dueDay: s.day + d, origen: 'JUGADOR', effects: [{ op: 'set', path: `levers.${k}`, value }] });
  }
  s.draftLevers = {};
  return { minutos: cost.minutos };
}

/** Cambio de autonomía de un nodo ('sector:CON' | 'firm:id'). */
export function setAutonomy(
  s: GameState, ctx: Ctx, rng: Rng, nodeId: string, value: Autonomy,
): { error: string } | { minutos: number } {
  if (!isUnlocked(s, ctx, 'autonomia')) return { error: 'PALANCA_BLOQUEADA' };
  const [tipo, id] = nodeId.split(':');
  let path: string;
  let actual: Autonomy;
  if (tipo === 'sector' && SECTOR_IDS.includes(id as SectorId)) {
    path = `sectors.${id}.autonomia`;
    actual = s.sectors[id as SectorId].autonomia;
  } else if (tipo === 'firm' && id !== undefined && s.firms[id]) {
    path = `firms.${id}.autonomia`;
    actual = s.firms[id].autonomia;
  } else return { error: 'NODO_INVALIDO' };
  if (!['AUTOGESTION', 'COORDINADO', 'CENTRALIZADO'].includes(value)) return { error: 'VALOR_INVALIDO' };
  if (actual === value) return { error: 'SIN_CAMBIOS' };
  const minutos = ctx.bal.palancas.minutosPorCambio;
  if (s.hour + minutos / 60 > ctx.bal.tiempo.horaInicio + ctx.bal.tiempo.horasPorDia + 1e-9) return { error: 'SIN_TIEMPO' };
  const capital = value === 'CENTRALIZADO' ? ctx.bal.palancas.costoPolitico.CENTRALIZADO : 0;
  if (capital > s.player.capitalPolitico) return { error: 'SIN_CAPITAL_POLITICO' };
  s.player.capitalPolitico -= capital;
  s.pendingEffects.push({
    dueDay: s.day + delayFor(ctx, rng, 'autonomia'), origen: 'JUGADOR', effects: [{ op: 'set', path, value }],
  });
  return { minutos };
}

/** Aplica un parche de inmediato, sin desbloqueos, costos ni retrasos (tests y herramientas). */
export function forceApply(s: GameState, ctx: Ctx, patch: LeverPatch): void {
  s.draftLevers = {};
  for (const [k, v] of Object.entries(patch) as [LeverKey, unknown][]) {
    const nv = normalizeLever(ctx, k, v);
    if (nv === undefined) throw new Error(`Valor inválido para la palanca ${k}`);
    (s.draftLevers as Record<string, unknown>)[k] = nv;
  }
  for (const k of changedLevers(s)) applyLeverNow(s, ctx, k, resolved(s, k));
  s.draftLevers = {};
}
