import { describe, expect, it } from 'vitest';
import { bandaError, buildChecoState, runCheco } from '../../src/sim/checo';
import { INDICATOR_KEYS, type GameState, type NationalIndicators } from '../../src/sim/state';
import { atDay, ctx, days, engine, engineSinAverias, errorOf, run } from './helpers';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
/** Peor error entre los 7 indicadores, como fracción de la escala 0–100. */
const peorError = (dijo: NationalIndicators, paso: NationalIndicators): number =>
  Math.max(...INDICATOR_KEYS.map((k) => Math.abs(dijo[k] - paso[k]) / 100));

describe('Checo: comando', () => {
  it('cuesta 1 ciclo y 1 h (7 días) o 3 h (30 días); no altera palancas', () => {
    const s0 = atDay(4);
    const s = run(s0, { t: 'RUN_CHECO', horizonDays: 7 });
    expect(s.hour).toBe(9);
    expect(s.player.ciclosUsados).toBe(1);
    expect(s.checo).toHaveLength(1);
    expect(s.checo[0]!.dias).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(s.checo[0]!.base.indicadores).toHaveLength(8);
    expect(s.levers).toEqual(s0.levers);
    expect(run(s, { t: 'RUN_CHECO', horizonDays: 30 }).hour).toBe(12);
  });
  it('Checo llega el día 4', () => {
    expect(errorOf(atDay(3), { t: 'RUN_CHECO', horizonDays: 7 })).toBe('PANTALLA_BLOQUEADA');
  });
  it('se agotan los ciclos del día y se reponen al día siguiente', () => {
    let s = atDay(4);
    for (let i = 0; i < 4; i++) s = run(s, { t: 'RUN_CHECO', horizonDays: 7 });
    expect(errorOf(s, { t: 'RUN_CHECO', horizonDays: 7 })).toBe('SIN_CICLOS');
    expect(days(s, 1).player.ciclosUsados).toBe(0);
  });
  it('no hay tiempo para una corrida de 30 días al final de la jornada', () => {
    const s = atDay(4);
    s.hour = 18;
    expect(errorOf(s, { t: 'RUN_CHECO', horizonDays: 30 })).toBe('SIN_TIEMPO');
  });
  it('runCheco y buildChecoState no mutan el estado real', () => {
    const s = days(engine.init('ck'), 3);
    const antes = JSON.stringify(s);
    runCheco(s, ctx, 7);
    buildChecoState(s, ctx);
    expect(JSON.stringify(s)).toBe(antes);
  });
  it('el abanico de error crece con el horizonte: ±5 % a 7 días, ±20 % a 30', () => {
    expect(bandaError(ctx.bal, 'NORMAL', 0)).toBe(0);
    expect(bandaError(ctx.bal, 'NORMAL', 7)).toBeCloseTo(0.05, 9);
    expect(bandaError(ctx.bal, 'NORMAL', 30)).toBeCloseTo(0.2, 9);
    expect(bandaError(ctx.bal, 'BEER', 7)).toBeGreaterThan(0.05);
  });
});

describe('Checo: precisión (aceptación H2)', () => {
  const eng = engineSinAverias();
  it.each(SEEDS)('sin sabotaje ni eventos predice el día +7 con error < 8 puntos de 100 (semilla %s)', (seed) => {
    let s = days(eng.init(seed), 3, eng);
    s = eng.applyCommand(s, { t: 'RUN_CHECO', horizonDays: 7 });
    const corrida = s.checo[0]!;
    s = days(s, 8, eng);
    const real = s.history.find((h) => h.day === corrida.dia + 7)!;
    expect(peorError(corrida.base.indicadores[7]!, real.indicators)).toBeLessThan(0.08);
  });
  it('predice también el escenario adoptado (subir precios) con error < 8 %', () => {
    let s = days(eng.init('esc'), 3, eng);
    s = eng.applyCommand(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.15 } });
    s = eng.applyCommand(s, { t: 'RUN_CHECO', horizonDays: 7 });
    s = eng.applyCommand(s, { t: 'EXECUTE_LEVERS' });
    const corrida = s.checo[0]!;
    expect(corrida.adoptado).toBe(true);
    s = days(s, 8, eng);
    const real = s.history.find((h) => h.day === corrida.dia + 7)!;
    expect(peorError(corrida.escenario.indicadores[7]!, real.indicators)).toBeLessThan(0.08);
    expect(peorError(corrida.base.indicadores[7]!, real.indicators)).toBeGreaterThan(peorError(corrida.escenario.indicadores[7]!, real.indicators));
  });
});

describe('Checo: escenarios y límites', () => {
  it('el escenario con borrador difiere de la línea base', () => {
    let s = atDay(4);
    s = run(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.2 } }, { t: 'RUN_CHECO', horizonDays: 7 });
    const r = s.checo[0]!;
    expect(r.escenario.indicadores[7]!.abastecimiento).toBeGreaterThan(r.base.indicadores[7]!.abastecimiento);
    expect(r.draft).toEqual({ precios: { BASICOS: 0.2 } });
    expect(r.adoptado).toBe(false);
    expect(s.draftLevers).toEqual({ precios: { BASICOS: 0.2 } });
  });
  it('conoce las palancas ya ejecutadas que aún no entran en vigor', () => {
    const base = run(atDay(4), { t: 'RUN_CHECO', horizonDays: 7 }).checo[0]!;
    const conMeta = run(atDay(4), { t: 'SET_DRAFT_LEVER', lever: 'metas', value: { CON: 0.8, AGR: 0.8 } }, { t: 'EXECUTE_LEVERS' }, { t: 'RUN_CHECO', horizonDays: 7 }).checo[0]!;
    expect(conMeta.base.indicadores[3]!.produccion).toBeLessThan(base.base.indicadores[3]!.produccion);
  });
  it('con datos falsificados el pronóstico falla más', () => {
    const eng = engineSinAverias();
    const errorProd = (falso: boolean): number => {
      let s: GameState = structuredClone(days(eng.init('falso'), 3, eng));
      if (falso) for (const r of ['textil', 'alimentos', 'calzado', 'muebles']) s.falsificaciones.push({ target: `rama:CON.${r}`, indicador: 'produccion', factor: 1.3, offset: 0, hastaDia: 30 });
      s = eng.applyCommand(s, { t: 'RUN_CHECO', horizonDays: 7 });
      const corrida = s.checo[0]!;
      s = days(s, 4, eng);
      const real = s.history.find((h) => h.day === corrida.dia + 3)!;
      return Math.abs(corrida.base.indicadores[3]!.abastecimiento - real.indicators.abastecimiento);
    };
    expect(errorProd(true)).toBeGreaterThan(errorProd(false) + 3);
  });
  it('no conoce eventos ajenos al jugador (efectos diferidos de sabotaje)', () => {
    const s = structuredClone(atDay(4));
    s.pendingEffects.push({ dueDay: 5, origen: 'SABOTAJE', effects: [{ op: 'mul', path: 'sectors.CON.insumos', value: 0 }] });
    expect(buildChecoState(s, ctx).pendingEffects).toHaveLength(0);
  });
  it('el cierre registra "Checo dijo / pasó"', () => {
    let s = run(days(engine.init('dijo'), 3), { t: 'RUN_CHECO', horizonDays: 7 });
    s = days(s, 1);
    expect(s.history[3]!.checo).toBeUndefined();
    s = days(s, 1);
    const h = s.history[4]!;
    expect(h.checo?.hechoElDia).toBe(4);
    expect(Math.abs(h.checo!.dijo.produccion - h.indicators.produccion)).toBeLessThan(10);
  });
  it('sólo se guardan las últimas corridas', () => {
    let s = atDay(4);
    s.player.ciclosComputo = 20;
    for (let i = 0; i < ctx.bal.checo.maxRuns + 2; i++) s = run(s, { t: 'RUN_CHECO', horizonDays: 7 });
    expect(s.checo).toHaveLength(ctx.bal.checo.maxRuns);
  });
});
