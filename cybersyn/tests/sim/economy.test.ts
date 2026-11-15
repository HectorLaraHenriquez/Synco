import { describe, expect, it } from 'vitest';
import { SECTOR_IDS, ZONE_IDS } from '../../src/data/schemas';
import { engine } from './helpers';

describe('economía: estado inicial', () => {
  const s = engine.init('t');
  it('capacidad de sector = suma de sus empresas', () => {
    for (const id of SECTOR_IDS) {
      const sum = Object.values(s.firms).filter((f) => f.sector === id).reduce((a, f) => a + f.capacidad, 0);
      expect(s.sectors[id].capacidad).toBeCloseTo(sum, 6);
    }
  });
  it('producción de empresas = producción del sector', () => {
    for (const id of SECTOR_IDS) {
      const sum = Object.values(s.firms).filter((f) => f.sector === id).reduce((a, f) => a + f.produccion, 0);
      expect(sum).toBeCloseTo(s.sectors[id].produccion, 6);
    }
  });
  it('indicadores ∈ [0,100] y brecha inicial calibrada', () => {
    for (const v of Object.values(s.indicators)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(s.economy.brecha).toBeCloseTo(engine.data.balance.inicio.brechaInicial, 6);
  });
});

describe('economía: dinámica', () => {
  it('sin sabotaje ni cambios, un día mantiene los indicadores acotados y divisas ≥ 0', () => {
    let s = engine.init('t');
    for (let d = 0; d < 5; d++) {
      s = engine.runDay(s);
      expect(s.economy.divisas).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(s.indicators)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      for (const z of ZONE_IDS) expect(s.zones[z].animo).toBeGreaterThanOrEqual(0);
    }
  });
  it('quitar divisas a un sector agota sus insumos y baja su producción', () => {
    let a = engine.init('t');
    let b = engine.setLevers(a, { asignacionDivisas: { ENT: 0.0001 } });
    for (let d = 0; d < 12; d++) { a = engine.runDay(a); b = engine.runDay(b); }
    expect(b.sectors.ENT.produccion).toBeLessThan(a.sectors.ENT.produccion * 0.8);
  });
  it('energía en falta arrastra a los demás sectores', () => {
    let a = engine.init('t');
    let b = engine.setLevers(a, { asignacionDivisas: { ENT: 0.0001 } });
    for (let d = 0; d < 14; d++) { a = engine.runDay(a); b = engine.runDay(b); }
    expect(b.sectors.IND.produccion).toBeLessThan(a.sectors.IND.produccion);
  });
  it('subir precios oficiales reduce la brecha pero suma presión inflacionaria', () => {
    const base = engine.init('t');
    const up = engine.adjustPrices(base, 'BASICOS', 0.2);
    const a = engine.tick(base), b = engine.tick(up);
    expect(b.economy.brecha).toBeLessThan(a.economy.brecha);
    expect(b.economy.inflacionMensual).toBeGreaterThan(a.economy.inflacionMensual);
  });
  it('emisión alta sube la inflación respecto de baja', () => {
    const base = engine.init('t');
    const hi = engine.tick(engine.setLevers(base, { emision: 'ALTO' }));
    const lo = engine.tick(engine.setLevers(base, { emision: 'BAJO' }));
    expect(hi.economy.inflacionMensual).toBeGreaterThan(lo.economy.inflacionMensual);
  });
  it('fiscalización estricta contiene el mercado negro', () => {
    let a = engine.init('t');
    let b = engine.setLevers(a, { fiscalizacion: 'ESTRICTO' });
    for (let d = 0; d < 6; d++) { a = engine.runDay(a); b = engine.runDay(b); }
    expect(b.economy.mercadoNegro).toBeLessThan(a.economy.mercadoNegro);
  });
  it('metas > 100 % suben producción de corto plazo pero bajan la moral', () => {
    let a = engine.init('t');
    let b = engine.setLevers(a, { metas: { CON: 1.2 } });
    for (let d = 0; d < 5; d++) { a = engine.runDay(a); b = engine.runDay(b); }
    expect(b.sectors.CON.produccion).toBeGreaterThan(a.sectors.CON.produccion);
    expect(b.sectors.CON.moral).toBeLessThan(a.sectors.CON.moral);
  });
  it('setLevers normaliza la asignación y acota metas', () => {
    const s = engine.setLevers(engine.init('t'), { asignacionDivisas: { MIN: 5 }, metas: { MIN: 9 } });
    const tot = SECTOR_IDS.reduce((a, id) => a + s.levers.asignacionDivisas[id], 0);
    expect(tot).toBeCloseTo(1, 9);
    expect(s.levers.metas.MIN).toBe(engine.data.balance.limites.metaMax);
  });
});
