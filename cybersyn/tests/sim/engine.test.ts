import { describe, expect, it } from 'vitest';
import { bus } from '../../src/sim/bus';
import { engine, play } from './helpers';
import { none } from '../../tools/policies';

describe('engine', () => {
  it('tick y endDay son puros (no mutan la entrada)', () => {
    const s = engine.init('p');
    const frozen = JSON.stringify(s);
    engine.tick(s);
    engine.endDay(s);
    engine.setLevers(s, { emision: 'ALTO' });
    engine.adjustPrices(s, 'BASICOS', 0.1);
    expect(JSON.stringify(s)).toBe(frozen);
  });
  it('12 ticks avanzan la hora de 8 a 20; endDay pasa al día siguiente y archiva snapshot', () => {
    let s = engine.init('p');
    for (let h = 0; h < 12; h++) s = engine.tick(s);
    expect(s.hour).toBe(20);
    s = engine.endDay(s);
    expect(s.day).toBe(2);
    expect(s.hour).toBe(8);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.day).toBe(1);
  });
  it('misma semilla = mismo resultado', () => {
    expect(JSON.stringify(play('semilla', none, 10))).toBe(JSON.stringify(play('semilla', none, 10)));
  });
  it('semillas distintas divergen (precio del cobre)', () => {
    expect(play('a', none, 5).economy.precioCobre).not.toBe(play('b', none, 5).economy.precioCobre);
  });
  it('un estado terminado ya no avanza', () => {
    const s = play('p', none, 30);
    expect(engine.isOver(s)).toBe(true);
    expect(engine.runDay(s)).toBe(s);
  });
  it('emite eventos en el bus', () => {
    const seen: string[] = [];
    const off1 = bus.on('tick', () => seen.push('tick'));
    const off2 = bus.on('dayEnded', () => seen.push('day'));
    engine.runDay(engine.init('p'));
    off1(); off2();
    expect(seen.filter((x) => x === 'tick')).toHaveLength(12);
    expect(seen.filter((x) => x === 'day')).toHaveLength(1);
  });
  it('el acto avanza con el día', () => {
    const s = play('p', (_e, st) => _e.setLevers(st, { emision: 'BAJO' }), 11);
    expect(s.act === 2 || s.ending !== undefined).toBe(true);
  });
});
