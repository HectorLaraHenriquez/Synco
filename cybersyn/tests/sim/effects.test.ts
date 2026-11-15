import { describe, expect, it } from 'vitest';
import { applyEffects, instantiate, scaleEffects, validateEffect } from '../../src/sim/effects';
import { ctx, days, engine } from './helpers';

const fresh = () => structuredClone(engine.init('fx'));

describe('effects', () => {
  it('rechaza paths y operaciones fuera de la lista blanca', () => {
    expect(() => validateEffect({ op: 'add', path: 'economy.secreto', value: 1 }, ctx)).toThrow(/no permitido/);
    expect(() => validateEffect({ op: 'mul', path: 'levers.emision', value: 2 }, ctx)).toThrow(/op/);
    expect(() => validateEffect({ op: 'set', path: 'firms.no_existe.eficiencia', value: 1 }, ctx)).toThrow(/inexistente/);
    expect(() => validateEffect({ op: 'mul', path: 'ramas.CON.nada.capacidad', value: 2 }, ctx)).toThrow(/inexistente/);
    expect(() => validateEffect({ op: 'set', path: 'levers.emision', value: 'MUCHO' }, ctx)).toThrow(/inválido/);
    expect(() => validateEffect({ op: 'delay', days: 1, effects: [{ op: 'add', path: 'x.y', value: 1 }] }, ctx)).toThrow();
  });
  it('add acota al rango del path', () => {
    const s = fresh();
    applyEffects(s, ctx, [{ op: 'add', path: 'zones.BIO.animo', value: 500 }], 'EVENTO');
    expect(s.zones.BIO.animo).toBe(100);
    applyEffects(s, ctx, [{ op: 'add', path: 'firms.tex_yarur.eficiencia', value: -5 }], 'EVENTO');
    expect(s.firms.tex_yarur!.eficiencia).toBe(0);
  });
  it('set y mul funcionan; insumosDias suma días de cobertura', () => {
    const s = fresh();
    const antes = s.sectors.CON.insumos;
    applyEffects(s, ctx, [
      { op: 'set', path: 'player.capitalPolitico', value: 10 },
      { op: 'mul', path: 'economy.divisas', value: 0.5 },
      { op: 'add', path: 'sectors.CON.insumosDias', value: 2 },
      { op: 'flag', key: 'visto', value: true },
    ], 'EVENTO');
    expect(s.player.capitalPolitico).toBe(10);
    expect(s.economy.divisas).toBe(100);
    expect(s.sectors.CON.insumos).toBeCloseTo(antes + 2 * s.sectors.CON.requeridoDia, 6);
    expect(s.flags.visto).toBe(true);
  });
  it('mul sobre una rama escala la capacidad de sus empresas y del sector', () => {
    const s = fresh();
    const antes = s.sectors.CON.capacidad;
    const textil = Object.values(s.firms).filter((f) => f.rama === 'textil').reduce((a, f) => a + f.capacidad, 0);
    applyEffects(s, ctx, [{ op: 'mul', path: 'ramas.CON.textil.capacidad', value: 1.5 }], 'EVENTO');
    expect(s.sectors.CON.capacidad).toBeCloseTo(antes + 0.5 * textil, 6);
  });
  it('delay queda pendiente y se aplica al comenzar el día indicado', () => {
    let s = fresh();
    applyEffects(s, ctx, [{ op: 'delay', days: 2, effects: [{ op: 'set', path: 'hidden.hostilidadNorte', value: 77 }] }], 'EVENTO');
    expect(s.pendingEffects).toHaveLength(1);
    s = days(s, 1);
    expect(s.hidden.hostilidadNorte).not.toBe(77);
    s = days(s, 1);
    expect(s.hidden.hostilidadNorte).toBe(77);
    expect(s.pendingEffects).toHaveLength(0);
  });
  it('set sobre levers.* aplica la palanca', () => {
    const s = fresh();
    applyEffects(s, ctx, [{ op: 'set', path: 'levers.emision', value: 'ALTO' }], 'EVENTO');
    expect(s.levers.emision).toBe('ALTO');
  });
  it('instantiate sustituye variables y scaleEffects amplifica sólo los add', () => {
    const fx = instantiate([{ op: 'add', path: 'zones.$id.animo', value: -2 }, { op: 'delay', days: 1, effects: [{ op: 'add', path: 'sectors.$sector.moral', value: 1 }] }], { id: 'BIO', sector: 'CON' });
    expect(fx[0]).toEqual({ op: 'add', path: 'zones.BIO.animo', value: -2 });
    expect(scaleEffects(fx, 3)[0]).toEqual({ op: 'add', path: 'zones.BIO.animo', value: -6 });
    expect(JSON.stringify(scaleEffects(fx, 3)[1])).toContain('"value":3');
  });
});
