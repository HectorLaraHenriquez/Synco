import { describe, expect, it } from 'vitest';
import { none, reasonable } from '../../tools/policies';
import { play } from './helpers';

const SEEDS = ['cybersyn', 'beer', 'allende', 'opsroom', 'checo', 'viable', 'x1', 'x2', 'x3', 'x4'];

describe('balance (GDD 3.3: la pasividad pierde)', () => {
  it.each(SEEDS)('sin intervención la partida se pierde entre los días 12 y 30 (semilla %s)', (seed) => {
    const s = play(seed, none);
    expect(s.ending).toBeDefined();
    expect(s.ending!.day).toBeGreaterThanOrEqual(12);
    expect(s.ending!.day).toBeLessThanOrEqual(30);
  });
  it.each(SEEDS)('la política razonable (sólo comandos, con desbloqueos y costos) sobrevive 30 días (semilla %s)', (seed) => {
    const s = play(seed, reasonable);
    expect(s.ending).toBeUndefined();
    expect(s.history).toHaveLength(30);
    expect(s.indicators.abastecimiento).toBeGreaterThan(60);
  });
  it('la política razonable termina mejor que la pasividad en el día 10', () => {
    const a = play('cybersyn', none, 10), b = play('cybersyn', reasonable, 10);
    expect(b.indicators.abastecimiento).toBeGreaterThan(a.indicators.abastecimiento);
    expect(b.player.confianza).toBeGreaterThan(a.player.confianza);
  });
});
