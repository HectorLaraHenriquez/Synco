import { describe, expect, it } from 'vitest';
import { bus } from '../../src/sim/bus';
import { none, reasonable } from '../../tools/policies';
import { atDay, engine, play } from './helpers';

describe('engine', () => {
  it('tick, endDay y los comandos son puros (no mutan la entrada)', () => {
    const s = atDay(4, 'p');
    const frozen = JSON.stringify(s);
    engine.tick(s);
    engine.endDay(s);
    engine.runDay(s);
    engine.forceLevers(s, { emision: 'ALTO' });
    engine.applyCommand(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.1 } });
    engine.applyCommand(s, { t: 'RUN_CHECO', horizonDays: 7 });
    engine.applyCommand(s, { t: 'INVESTIGATE', nodeId: 'zone:BIO' });
    expect(JSON.stringify(s)).toBe(frozen);
  });
  it('12 ticks avanzan la hora de 8 a 20; endDay pasa al día siguiente y archiva snapshot', () => {
    let s = engine.init('p');
    for (let h = 0; h < 12; h++) s = engine.tick(s);
    expect(s.hour).toBe(20);
    expect(engine.tick(s).hour).toBe(20);
    s = engine.endDay(s);
    expect(s.day).toBe(2);
    expect(s.hour).toBe(8);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]!.day).toBe(1);
  });
  it('ticks fraccionarios equivalen (casi) a ticks de una hora', () => {
    let a = engine.init('p'), b = engine.init('p');
    for (let i = 0; i < 12; i++) a = engine.tick(a, 1);
    for (let i = 0; i < 48; i++) b = engine.tick(b, 0.25);
    expect(b.hour).toBe(20);
    expect(b.economy.divisas).toBeCloseTo(a.economy.divisas, 1);
    expect(b.indicators.abastecimiento).toBeCloseTo(a.indicators.abastecimiento, 0);
  });
  it('misma semilla = mismo resultado, también jugando con comandos', () => {
    expect(JSON.stringify(play('semilla', none, 8))).toBe(JSON.stringify(play('semilla', none, 8)));
    expect(JSON.stringify(play('semilla', reasonable, 8))).toBe(JSON.stringify(play('semilla', reasonable, 8)));
  });
  it('semillas distintas divergen', () => {
    expect(play('a', none, 5).economy.precioCobre).not.toBe(play('b', none, 5).economy.precioCobre);
  });
  it('un estado terminado ya no avanza ni acepta comandos', () => {
    const s = play('p', none, 30);
    expect(engine.isOver(s)).toBe(true);
    expect(engine.runDay(s)).toBe(s);
    expect(engine.tick(s)).toBe(s);
    expect(engine.tryCommand(s, { t: 'CLEAR_DRAFT' })).toMatchObject({ ok: false, error: 'JUEGO_TERMINADO' });
  });
  it('un comando rechazado devuelve el mismo estado y avisa por el bus', () => {
    const seen: string[] = [];
    const off = bus.on('commandRejected', (e) => seen.push(e.error));
    const s = engine.init('p');
    expect(engine.applyCommand(s, { t: 'EXECUTE_LEVERS' })).toBe(s);
    expect(engine.applyCommand(s, { t: 'TELEX_ACTION', telexId: 'x', action: 'ARCHIVAR' })).toBe(s);
    off();
    expect(seen).toEqual(['SIN_CAMBIOS', 'NO_IMPLEMENTADO']);
  });
  it('emite tick y dayEnded', () => {
    const seen: string[] = [];
    const off1 = bus.on('tick', () => seen.push('tick'));
    const off2 = bus.on('dayEnded', () => seen.push('day'));
    let s = engine.init('p');
    for (let h = 0; h < 12; h++) s = engine.tick(s);
    engine.endDay(s);
    off1(); off2();
    expect(seen.filter((x) => x === 'tick')).toHaveLength(12);
    expect(seen.filter((x) => x === 'day')).toHaveLength(1);
  });
  it('el acto avanza con el día y los ciclos de cómputo se reponen', () => {
    const s = play('p', reasonable, 11);
    expect(s.day).toBe(12);
    expect(s.act).toBe(2);
    expect(s.player.ciclosUsados).toBe(0);
  });
  it('confianza en 0 termina la partida en despido', () => {
    const s = structuredClone(engine.init('p'));
    s.player.confianza = 0;
    s.indicators.abastecimiento = 0;
    const fin = engine.forceLevers(s, { zonasPrioritarias: [] });
    const r = engine.runDay({ ...fin, zones: Object.fromEntries(Object.entries(fin.zones).map(([k, z]) => [k, { ...z, abastBonus: -50, animo: 5 }])) as typeof fin.zones });
    expect(r.ending?.id).toBe('DESPIDO');
  });
});
