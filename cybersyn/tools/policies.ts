import { SECTOR_IDS } from '../src/data/schemas';
import { makeCtx, necesidadDivisas } from '../src/sim/economy';
import type { Engine } from '../src/sim/engine';
import type { GameState, SectorId } from '../src/sim/state';

export type Policy = (engine: Engine, s: GameState) => GameState;

/** Pasividad: no toca nada. */
export const none: Policy = (_e, s) => s;

/** Política razonable de prueba: lo que haría un operador atento en el acto I. */
export const reasonable: Policy = (engine, s) => {
  const ctx = makeCtx(engine.data);
  const need = necesidadDivisas(s, ctx);
  const tot = SECTOR_IDS.reduce((a, id) => a + need[id], 0);
  const asignacionDivisas = {} as Record<SectorId, number>;
  for (const id of SECTOR_IDS) asignacionDivisas[id] = need[id] / tot;

  const e = s.economy;
  s = engine.setLevers(s, {
    emision: 'BAJO',
    asignacionDivisas,
    fiscalizacion: e.mercadoNegro > 0.15 ? 'RACIONAMIENTO' : 'OFF',
  });
  // Subir el precio oficial de básicos cuando la escasez aprieta.
  if (e.brecha > 0.12) s = engine.adjustPrices(s, 'BASICOS', 0.04);
  return s;
};

export const POLICIES: Record<string, Policy> = { none, reasonable };
