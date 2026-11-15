import { loadGameDataFromDir } from '../../src/data/node-loader';
import { createEngine, type Engine } from '../../src/sim/engine';
import type { GameState } from '../../src/sim/state';
import type { Policy } from '../../tools/policies';

export const data = loadGameDataFromDir();
export const engine: Engine = createEngine(data);

export function play(seed: string, policy: Policy, days = 30): GameState {
  let s = engine.init(seed);
  for (let d = 0; d < days && !engine.isOver(s); d++) s = engine.runDay(policy(engine, s));
  return s;
}
