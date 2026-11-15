import { describe, expect, it } from 'vitest';
import { parseGameData } from '../../src/data/schemas';
import { validateData } from '../../src/sim/effects';
import { data } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (): any => structuredClone(data);

describe('data', () => {
  it('carga el mundo mínimo: 5 sectores, 8 zonas, 40 empresas, 18 ramas', () => {
    expect(data.sectors).toHaveLength(5);
    expect(data.zones).toHaveLength(8);
    expect(data.firms).toHaveLength(40);
    expect(data.sectors.reduce((a, s) => a + s.ramas.length, 0)).toBe(18);
  });
  it('rechaza una rama inexistente', () => {
    const r = raw();
    r.firms[0].rama = 'no_existe';
    expect(() => parseGameData(r)).toThrow(/Rama/);
  });
  it('rechaza población que no suma 1', () => {
    const r = raw();
    r.zones[0].poblacion += 0.2;
    expect(() => parseGameData(r)).toThrow(/población/);
  });
  it('rechaza asignación de divisas que no suma 1', () => {
    const r = raw();
    r.balance.inicio.asignacionDivisas.MIN += 0.3;
    expect(() => parseGameData(r)).toThrow(/asignacionDivisas/);
  });
  it('rechaza balance con campos faltantes', () => {
    const r = raw();
    delete r.balance.economia.b1;
    expect(() => parseGameData(r)).toThrow();
  });
  it('rechaza algedónica cuya autoOpcion no existe', () => {
    const r = raw();
    r.algedonic[0].autoOpcion = 'nada';
    expect(() => parseGameData(r)).toThrow(/autoOpcion/);
  });
  it('rechaza efectos con path fuera de la lista blanca', () => {
    const r = raw();
    r.algedonic[0].alIgnorar = [{ op: 'add', path: 'economy.inventado', value: 1 }];
    expect(() => validateData(parseGameData(r))).toThrow(/path no permitido/);
  });
});
