import { describe, expect, it } from 'vitest';
import { SECTOR_IDS, ZONE_IDS } from '../../src/data/schemas';
import { days, engine } from './helpers';

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
  it('indicadores acotados y divisas ≥ 0 durante varios días', () => {
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
    const a = days(engine.init('t'), 12);
    const b = days(engine.forceLevers(engine.init('t'), { asignacionDivisas: { ENT: 0.0001 } }), 12);
    expect(b.sectors.ENT.produccion).toBeLessThan(a.sectors.ENT.produccion * 0.8);
  });
  it('energía en falta arrastra a los demás sectores', () => {
    const a = days(engine.init('t'), 14);
    const b = days(engine.forceLevers(engine.init('t'), { asignacionDivisas: { ENT: 0.0001 } }), 14);
    expect(b.sectors.IND.produccion).toBeLessThan(a.sectors.IND.produccion);
  });
  it('subir precios oficiales reduce la brecha pero suma presión inflacionaria', () => {
    const base = engine.init('t');
    const a = engine.tick(base);
    const b = engine.tick(engine.forceLevers(base, { precios: { BASICOS: 0.2 } }));
    expect(b.economy.brecha).toBeLessThan(a.economy.brecha);
    expect(b.economy.inflacionMensual).toBeGreaterThan(a.economy.inflacionMensual);
  });
  it('emisión alta sube la inflación respecto de baja', () => {
    const base = engine.init('t');
    const hi = engine.tick(engine.forceLevers(base, { emision: 'ALTO' }));
    const lo = engine.tick(engine.forceLevers(base, { emision: 'BAJO' }));
    expect(hi.economy.inflacionMensual).toBeGreaterThan(lo.economy.inflacionMensual);
  });
  it('fiscalización estricta contiene el mercado negro', () => {
    const a = days(engine.init('t'), 6);
    const b = days(engine.forceLevers(engine.init('t'), { fiscalizacion: 'ESTRICTO' }), 6);
    expect(b.economy.mercadoNegro).toBeLessThan(a.economy.mercadoNegro);
  });
  it('metas > 100 % suben producción de corto plazo pero bajan la moral', () => {
    const a = engine.tick(engine.init('t'));
    const b0 = engine.forceLevers(engine.init('t'), { metas: { CON: 1.1 } });
    expect(engine.tick(b0).sectors.CON.produccion).toBeGreaterThan(a.sectors.CON.produccion);
    expect(days(b0, 5).sectors.CON.moral).toBeLessThan(days(engine.init('t'), 5).sectors.CON.moral);
  });
  it('refinar cobre en Chile: menos divisas hoy, más soberanía y más valor con el tiempo', () => {
    const base = engine.init('t');
    const ref = engine.forceLevers(base, { shareExportCobre: 0.2 });
    const a = engine.tick(base), b = engine.tick(ref);
    expect(b.economy.ingresosDivisas).toBeLessThan(a.economy.ingresosDivisas);
    expect(b.indicators.soberania).toBeGreaterThan(a.indicators.soberania);
    const tarde = days(ref, 10);
    expect(tarde.economy.refinacionMadurez).toBeGreaterThan(0.25);
    expect(tarde.economy.ingresosDivisas / tarde.sectors.MIN.produccion / tarde.economy.precioCobre)
      .toBeGreaterThan(b.economy.ingresosDivisas / b.sectors.MIN.produccion / b.economy.precioCobre);
  });
  it('distribución prioritaria: una zona mejora y las otras empeoran', () => {
    const base = engine.tick(engine.init('t'));
    const prio = engine.tick(engine.forceLevers(engine.init('t'), { zonasPrioritarias: ['AUS'] }));
    expect(prio.zones.AUS.abastecimiento).toBeGreaterThan(base.zones.AUS.abastecimiento);
    expect(prio.zones.NG.abastecimiento).toBeLessThan(base.zones.NG.abastecimiento);
  });
  it('una avería (eficiencia < 1) reduce la producción de la empresa y se recupera sola', () => {
    const s = structuredClone(engine.init('t'));
    s.firms.tex_yarur!.eficiencia = 0.5;
    const a = engine.tick(engine.init('t')), b = engine.tick(engine.forceLevers(s, {}));
    expect(b.firms.tex_yarur!.produccion).toBeLessThan(a.firms.tex_yarur!.produccion * 0.6);
    expect(days(b, 2).firms.tex_yarur!.eficiencia).toBeGreaterThan(0.5);
  });
});
