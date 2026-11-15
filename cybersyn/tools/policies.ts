/** Políticas automáticas para balance y tests. Juegan sólo mediante comandos, como la UI. */
import { SECTOR_IDS, type LeverKey } from '../src/data/schemas';
import { finDeJornada } from '../src/sim/advance';
import { necesidadDivisas } from '../src/sim/economy';
import type { Engine } from '../src/sim/engine';
import { isUnlocked } from '../src/sim/levers';
import type { GameState, SectorId } from '../src/sim/state';

/** Se llama al comienzo de cada hora de juego. */
export type Policy = (engine: Engine, s: GameState) => GameState;

/** Pasividad: no toca nada. */
export const none: Policy = (_e, s) => s;

const pendiente = (s: GameState, k: LeverKey): boolean =>
  s.pendingEffects.some((p) => p.effects.some((e) => e.op === 'set' && e.path === `levers.${k}`));

/** Atiende señales (las más graves primero) con la primera opción que pueda pagar. */
export function atender(engine: Engine, s: GameState, reservaDivisas = 60): GameState {
  const libres = [...s.algedonic].filter((a) => !a.atendida).sort((a, b) => b.nivel - a.nivel);
  for (const sig of libres) {
    const op =
      sig.opciones.find((o) => !o.costo || (s.economy.divisas - (o.costo.divisas ?? 0) > reservaDivisas && !o.costo.capitalPolitico)) ??
      sig.opciones[sig.opciones.length - 1]!;
    s = engine.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: op.id });
  }
  return s;
}

/** Política razonable de prueba: lo que haría un operador atento, respetando desbloqueos y costos. */
export const reasonable: Policy = (engine, s) => {
  const { ctx } = engine;
  s = atender(engine, s);
  if (s.hour !== ctx.bal.tiempo.horaInicio) return s;

  const e = s.economy;
  const puede = (k: LeverKey): boolean => isUnlocked(s, ctx, k) && !pendiente(s, k);
  const draft = (lever: LeverKey, value: unknown): void => {
    s = engine.applyCommand(s, { t: 'SET_DRAFT_LEVER', lever, value });
  };

  if (puede('emision') && s.levers.emision !== 'BAJO') draft('emision', 'BAJO');
  if (puede('asignacionDivisas')) {
    const need = necesidadDivisas(s, ctx);
    const tot = SECTOR_IDS.reduce((a, id) => a + need[id], 0);
    const obj = {} as Record<SectorId, number>;
    for (const id of SECTOR_IDS) obj[id] = need[id] / tot;
    if (SECTOR_IDS.some((id) => Math.abs(obj[id] - s.levers.asignacionDivisas[id]) > 0.03)) draft('asignacionDivisas', obj);
  }
  if (puede('precios') && e.brecha > 0.12) draft('precios', { BASICOS: 0.04 });
  if (puede('fiscalizacion')) {
    const obj = e.mercadoNegro > 0.15 ? 'RACIONAMIENTO' : 'OFF';
    if (obj !== s.levers.fiscalizacion) draft('fiscalizacion', obj);
  }
  return engine.applyCommand(s, { t: 'EXECUTE_LEVERS' });
};

export const POLICIES: Record<string, Policy> = { none, reasonable };

/** Juega un día completo llamando a la política cada hora. */
export function playDay(engine: Engine, s: GameState, policy: Policy): GameState {
  const fin = finDeJornada(engine.ctx);
  while (!engine.isOver(s) && s.hour < fin - 1e-9) {
    s = policy(engine, s);
    s = engine.tick(s, Math.min(fin, Math.floor(s.hour + 1e-9) + 1) - s.hour);
  }
  return engine.endDay(s);
}

export function playCampaign(engine: Engine, seed: string, policy: Policy, days = 30): GameState {
  let s = engine.init(seed);
  for (let d = 0; d < days && !engine.isOver(s); d++) s = playDay(engine, s, policy);
  return s;
}
