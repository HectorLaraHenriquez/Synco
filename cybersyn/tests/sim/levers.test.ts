import { describe, expect, it } from 'vitest';
import { SECTOR_IDS } from '../../src/data/schemas';
import { atDay, ctx, days, engine, errorOf, run } from './helpers';

const pal = ctx.bal.palancas;

describe('palancas: borrador y EJECUTAR', () => {
  it('una palanca bloqueada no admite borrador; un flag de desbloqueo la habilita', () => {
    const s = engine.init('l');
    expect(errorOf(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.1 } })).toBe('PALANCA_BLOQUEADA');
    const s2 = structuredClone(s);
    s2.flags['unlock.precios'] = true;
    expect(errorOf(s2, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.1 } })).toBeUndefined();
  });
  it('valores inválidos se rechazan', () => {
    const s = atDay(12);
    expect(errorOf(s, { t: 'SET_DRAFT_LEVER', lever: 'emision', value: 'MUCHO' })).toBe('VALOR_INVALIDO');
    expect(errorOf(s, { t: 'SET_DRAFT_LEVER', lever: 'metas', value: { XXX: 1 } })).toBe('VALOR_INVALIDO');
    expect(errorOf(s, { t: 'SET_DRAFT_LEVER', lever: 'inversiones', value: ['CON.nada'] })).toBe('VALOR_INVALIDO');
    expect(errorOf(s, { t: 'SET_DRAFT_LEVER', lever: 'zonasPrioritarias', value: ['NG', 'NC', 'VAL', 'STGO'] })).toBe('VALOR_INVALIDO');
  });
  it('el borrador no cambia nada hasta ejecutar; sin cambios se rechaza', () => {
    const s0 = atDay(2);
    expect(errorOf(s0, { t: 'EXECUTE_LEVERS' })).toBe('SIN_CAMBIOS');
    const s = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.1 } });
    expect(s.economy.precioOficial.BASICOS).toBe(1);
    expect(s.hour).toBe(8);
    expect(run(s, { t: 'CLEAR_DRAFT' }).draftLevers).toEqual({});
  });
  it('precios: efecto inmediato, cuesta 10 min y capital político; el valor se acota a ±30 %', () => {
    const s0 = atDay(2);
    const s = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.1 } }, { t: 'EXECUTE_LEVERS' });
    expect(s.economy.precioOficial.BASICOS).toBeCloseTo(1.1, 9);
    expect(s.hour).toBeCloseTo(8 + pal.minutosPorCambio / 60, 9);
    expect(s.player.capitalPolitico).toBeCloseTo(s0.player.capitalPolitico - 10 * pal.costoPolitico.precioPorPunto * ctx.bal.economia.pesoCategoria.BASICOS, 6);
    expect(s.draftLevers).toEqual({});
    expect(s.levers.precios.BASICOS).toBe(0);
    const tope = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.9 } }, { t: 'EXECUTE_LEVERS' });
    expect(tope.economy.precioOficial.BASICOS).toBeCloseTo(1.3, 9);
  });
  it('sin capital político no se pueden subir precios', () => {
    const s = atDay(2);
    s.player.capitalPolitico = 1;
    const d = run(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.3 } });
    expect(errorOf(d, { t: 'EXECUTE_LEVERS' })).toBe('SIN_CAPITAL_POLITICO');
  });
  it('sin tiempo de reloj no se ejecuta', () => {
    const s = atDay(2);
    s.hour = 19.95;
    const d = run(s, { t: 'SET_DRAFT_LEVER', lever: 'precios', value: { BASICOS: 0.05 } });
    expect(errorOf(d, { t: 'EXECUTE_LEVERS' })).toBe('SIN_TIEMPO');
  });
  it('metas: retraso de 1 día', () => {
    let s = run(engine.init('l'), { t: 'SET_DRAFT_LEVER', lever: 'metas', value: { CON: 1.2 } }, { t: 'EXECUTE_LEVERS' });
    expect(s.levers.metas.CON).toBe(1);
    expect(s.pendingEffects).toHaveLength(1);
    s = days(s, 1);
    expect(s.levers.metas.CON).toBe(1.2);
    expect(s.sectors.CON.meta).toBe(1.2);
  });
  it('emisión: retraso de 3 días', () => {
    let s = run(atDay(3), { t: 'SET_DRAFT_LEVER', lever: 'emision', value: 'BAJO' }, { t: 'EXECUTE_LEVERS' });
    s = days(s, 2);
    expect(s.levers.emision).toBe('MEDIO');
    s = days(s, 1);
    expect(s.levers.emision).toBe('BAJO');
  });
  it('asignación de divisas: se normaliza a 100 % y llega en 2–4 días', () => {
    let s = run(atDay(5), { t: 'SET_DRAFT_LEVER', lever: 'asignacionDivisas', value: { ENT: 0.6 } }, { t: 'EXECUTE_LEVERS' });
    const due = s.pendingEffects[0]!.dueDay - s.day;
    expect(due).toBeGreaterThanOrEqual(2);
    expect(due).toBeLessThanOrEqual(4);
    s = days(s, due);
    expect(SECTOR_IDS.reduce((a, id) => a + s.levers.asignacionDivisas[id], 0)).toBeCloseTo(1, 9);
    expect(s.levers.asignacionDivisas.ENT).toBeGreaterThan(0.4);
  });
  it('dos palancas cambiadas cuestan 20 min', () => {
    const s = run(atDay(3),
      { t: 'SET_DRAFT_LEVER', lever: 'emision', value: 'BAJO' },
      { t: 'SET_DRAFT_LEVER', lever: 'metas', value: { MIN: 1.1 } },
      { t: 'EXECUTE_LEVERS' });
    expect(s.hour).toBeCloseTo(8 + (2 * pal.minutosPorCambio) / 60, 9);
  });
  it('reajuste salarial: inmediato, sube salario y ánimo, y es de un solo uso', () => {
    const s0 = atDay(9);
    const s = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'reajusteSalarial', value: 0.2 }, { t: 'EXECUTE_LEVERS' });
    expect(s.economy.salarioNominal).toBeCloseTo(s0.economy.salarioNominal * 1.2, 6);
    expect(s.zones.STGO.animo).toBeGreaterThan(s0.zones.STGO.animo);
    expect(s.levers.reajusteSalarial).toBe(0);
  });
  it('fiscalización: cuesta capital político al endurecer y sube el autoritarismo', () => {
    const s0 = atDay(11);
    let s = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'fiscalizacion', value: 'ESTRICTO' }, { t: 'EXECUTE_LEVERS' });
    expect(s.player.capitalPolitico).toBeCloseTo(s0.player.capitalPolitico - pal.costoPolitico.ESTRICTO, 6);
    s = days(s, 4);
    expect(s.levers.fiscalizacion).toBe('ESTRICTO');
    expect(s.hidden.autoritarismo).toBeGreaterThan(days(s0, 4).hidden.autoritarismo);
  });
  it('inversión: divisas ahora, capacidad después', () => {
    const s0 = atDay(10);
    let s = run(s0, { t: 'SET_DRAFT_LEVER', lever: 'inversiones', value: ['CON.textil'] }, { t: 'EXECUTE_LEVERS' });
    expect(s.economy.divisas).toBeLessThan(s0.economy.divisas - 1);
    const n = pal.inversion.diasPorSector.CON;
    const capTextil = (st: typeof s) => Object.values(st.firms).filter((f) => f.rama === 'textil').reduce((a, f) => a + f.capacidad, 0);
    expect(capTextil(days(s, n - 1)) / capTextil(days(s0, n - 1))).toBeCloseTo(1, 6);
    expect(capTextil(days(s, n)) / capTextil(days(s0, n))).toBeCloseTo(1 + pal.inversion.aumento, 6);
  });
  it('sin divisas no hay inversión', () => {
    const s = atDay(10);
    s.economy.divisas = 0.1;
    const d = run(s, { t: 'SET_DRAFT_LEVER', lever: 'inversiones', value: ['MIN.cobre'] });
    expect(errorOf(d, { t: 'EXECUTE_LEVERS' })).toBe('SIN_DIVISAS');
  });
});

describe('autonomía por nodo', () => {
  it('bloqueada antes del día 6; nodos inválidos se rechazan', () => {
    expect(errorOf(engine.init('l'), { t: 'SET_AUTONOMY', nodeId: 'sector:CON', value: 'CENTRALIZADO' })).toBe('PALANCA_BLOQUEADA');
    expect(errorOf(atDay(6), { t: 'SET_AUTONOMY', nodeId: 'sector:XXX', value: 'CENTRALIZADO' })).toBe('NODO_INVALIDO');
    expect(errorOf(atDay(6), { t: 'SET_AUTONOMY', nodeId: 'sector:CON', value: 'COORDINADO' })).toBe('SIN_CAMBIOS');
  });
  it('centralizar: +producción de corto plazo, −moral, +autoritarismo, cuesta capital', () => {
    const s0 = atDay(6);
    let s = run(s0, { t: 'SET_AUTONOMY', nodeId: 'sector:CON', value: 'CENTRALIZADO' });
    expect(s.player.capitalPolitico).toBe(s0.player.capitalPolitico - pal.costoPolitico.CENTRALIZADO);
    expect(s.sectors.CON.autonomia).toBe('COORDINADO');
    s = days(s, 1);
    expect(s.sectors.CON.autonomia).toBe('CENTRALIZADO');
    expect(s.sectors.CON.utilizacion).toBeGreaterThan(days(s0, 1).sectors.CON.utilizacion);
    const a = days(s, 6), b = days(days(s0, 1), 6);
    expect(a.sectors.CON.moral).toBeLessThan(b.sectors.CON.moral);
    expect(a.hidden.autoritarismo).toBeGreaterThan(b.hidden.autoritarismo);
  });
  it('autogestión: +moral y −autoritarismo', () => {
    const s0 = atDay(6);
    const s = days(run(s0, { t: 'SET_AUTONOMY', nodeId: 'sector:AGR', value: 'AUTOGESTION' }), 7);
    const b = days(s0, 7);
    expect(s.sectors.AGR.moral).toBeGreaterThan(b.sectors.AGR.moral);
    expect(s.hidden.autoritarismo).toBeLessThan(b.hidden.autoritarismo);
  });
});
