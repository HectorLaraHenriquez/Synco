/**
 * Checo (GDD 3.5): corre el mismo modelo económico sobre los datos REPORTADOS,
 * sin conocer eventos futuros ni sabotajes, y con supuestos propios (sesgo de parámetros).
 */
import { SECTOR_IDS, ZONE_IDS, type Balance } from '../data/schemas';
import { endDayMut, finDeJornada, stepMut } from './advance';
import { makeCtx, type Ctx } from './ctx';
import { refreshSectorBasics } from './economy';
import { executeDraft } from './levers';
import { report } from './observe';
import { Rng, ZeroRng } from './rng';
import type { ChecoRun, ChecoSerie, Difficulty, GameState } from './state';

/** Coeficientes de comportamiento que Checo sólo conoce aproximadamente. */
export const SESGO_PARAMS = [
  'economia.a1', 'economia.b1', 'economia.b4', 'cyberfolk.w1', 'cyberfolk.w3', 'exogeno.moralConvergencia',
] as const;

export function initSesgo(rng: Rng, bal: Balance, difficulty: Difficulty): Record<string, number> {
  const amp = bal.checo.sesgoParametros * bal.dificultad[difficulty]!.checoError;
  const out: Record<string, number> = {};
  for (const p of SESGO_PARAMS) out[p] = 1 + amp * rng.signed();
  return out;
}

export function checoBalance(bal: Balance, sesgo: Record<string, number>): Balance {
  const b = structuredClone(bal) as unknown as Record<string, Record<string, number>>;
  for (const [p, k] of Object.entries(sesgo)) {
    const [grupo, campo] = p.split('.') as [string, string];
    b[grupo]![campo]! *= k;
  }
  return b as unknown as Balance;
}

/** Estado de partida de Checo: lo que la sala cree que pasa, no lo que pasa. */
export function buildChecoState(s: GameState, ctx: Ctx): GameState {
  const c = structuredClone({ ...s, history: [], series: {}, checo: [], log: [] });
  for (const id of SECTOR_IDS) {
    const real = s.sectors[id].produccion;
    const ratio = real > 0 ? report(s, ctx, `sector:${id}`, 'produccion').valor / real : 1;
    for (const f of Object.values(c.firms)) if (f.sector === id) f.capacidad *= ratio;
  }
  for (const z of ZONE_IDS) c.zones[z].animo = report(s, ctx, `zone:${z}`, 'animo').valor;
  c.economy.mercadoNegro = report(s, ctx, 'pais', 'mercadoNegro').valor;
  c.pendingEffects = c.pendingEffects.filter((p) => p.origen === 'JUGADOR');
  c.algedonic = [];
  c.falsificaciones = [];
  refreshSectorBasics(c, ctx);
  return c;
}

function simular(c: GameState, ctxC: Ctx, horizonte: number): ChecoSerie {
  const zr = new ZeroRng();
  const out: ChecoSerie = { indicadores: [], inflacion: [], divisas: [] };
  for (let k = 0; k <= horizonte; k++) {
    stepMut(c, ctxC, zr, finDeJornada(ctxC) - c.hour);
    const snap = endDayMut(c, ctxC, zr);
    out.indicadores.push(snap.indicators);
    out.inflacion.push(snap.inflacionMensual);
    out.divisas.push(snap.divisas);
  }
  return out;
}

/** Abanico de error: 0 hoy, ±e7 a 7 días, ±e30 a 30 días. */
export function bandaError(bal: Balance, difficulty: Difficulty, k: number): number {
  const e7 = bal.checo.errorPct['7'], e30 = bal.checo.errorPct['30'];
  const base = k <= 7 ? (e7 * k) / 7 : e7 + ((e30 - e7) * (k - 7)) / 23;
  return base * bal.dificultad[difficulty]!.checoError;
}

/** Simula `horizonte` días: línea base (palancas actuales) vs. escenario (borrador aplicado). No muta `s`. */
export function runCheco(s: GameState, ctx: Ctx, horizonte: 7 | 30): ChecoRun {
  const ctxC = makeCtx(ctx.data, { checo: true, balance: checoBalance(ctx.bal, s.checoSesgo) });
  const inicial = buildChecoState(s, ctx);
  const base = simular(structuredClone(inicial), ctxC, horizonte);
  const esc = structuredClone(inicial);
  executeDraft(esc, ctxC, new Rng(s.rng), true);
  const escenario = simular(esc, ctxC, horizonte);
  const dias = Array.from({ length: horizonte + 1 }, (_, k) => s.day + k);
  return {
    dia: s.day, hora: s.hour, horizonte, dias, base, escenario,
    bandaPct: dias.map((_, k) => bandaError(ctx.bal, s.difficulty, k)),
    draft: structuredClone(s.draftLevers), adoptado: false,
  };
}
