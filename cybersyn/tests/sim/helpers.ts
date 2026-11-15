import { loadGameDataFromDir } from '../../src/data/node-loader';
import type { GameData } from '../../src/data/schemas';
import type { Command } from '../../src/sim/commands';
import { createEngine, type Engine } from '../../src/sim/engine';
import type { GameState } from '../../src/sim/state';
import { playCampaign, type Policy } from '../../tools/policies';

export const data = loadGameDataFromDir();
export const engine: Engine = createEngine(data);
export const ctx = engine.ctx;

export const play = (seed: string, policy: Policy, days = 30): GameState => playCampaign(engine, seed, policy, days);

/** Estado inicial adelantado al día `day` (sin simular), para probar desbloqueos. */
export function atDay(day: number, seed = 't', eng: Engine = engine): GameState {
  const s = structuredClone(eng.init(seed));
  s.day = day;
  s.act = day <= 10 ? 1 : day <= 20 ? 2 : day <= 25 ? 3 : 'CLIMAX';
  return s;
}

/** Aplica comandos en cadena y exige que todos se acepten. */
export function run(s: GameState, ...cmds: Command[]): GameState {
  for (const c of cmds) {
    const r = engine.tryCommand(s, c);
    if (!r.ok) throw new Error(`Comando ${c.t} rechazado: ${r.error}`);
    s = r.state;
  }
  return s;
}

export const errorOf = (s: GameState, c: Command): string | undefined => {
  const r = engine.tryCommand(s, c);
  return r.ok ? undefined : r.error;
};

/** Motor sin averías al azar (para pruebas deterministas de Checo). */
export function engineSinAverias(): Engine {
  const d: GameData = structuredClone(data);
  for (const k of ['1', '2', '3', 'CLIMAX'] as const) d.balance.algedonico.averiasDia[k] = 0;
  return createEngine(d);
}

export const days = (s: GameState, n: number, eng: Engine = engine): GameState => {
  for (let i = 0; i < n; i++) s = eng.runDay(s);
  return s;
};
