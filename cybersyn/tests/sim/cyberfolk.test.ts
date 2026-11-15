import { describe, expect, it } from 'vitest';
import { generarVoces } from '../../src/sim/cyberfolk';
import { Rng } from '../../src/sim/rng';
import { ctx, days, engine } from './helpers';

describe('cyberfolk: ánimo y moral', () => {
  it('una zona mejor abastecida gana ánimo frente a la línea base', () => {
    const s = structuredClone(engine.init('cf'));
    s.zones.AUS.abastBonus = 30;
    expect(days(s, 3).zones.AUS.animo).toBeGreaterThan(days(engine.init('cf'), 3).zones.AUS.animo);
  });
  it('la inflación alta deprime el ánimo', () => {
    const alta = days(engine.forceLevers(engine.init('cf'), { emision: 'ALTO' }), 1);
    const baja = days(engine.forceLevers(engine.init('cf'), { emision: 'BAJO' }), 1);
    // la emisión alta da un pequeño alivio inmediato, pero la inflación pesa más
    expect(days(alta, 12).indicators.animo).toBeLessThan(days(baja, 12).indicators.animo);
  });
  it('propaganda resta y cultura suma', () => {
    const a = structuredClone(engine.init('cf')), b = structuredClone(engine.init('cf'));
    a.zones.STGO.propaganda = 2;
    b.zones.STGO.cultura = 2;
    const base = days(engine.init('cf'), 2).zones.STGO.animo;
    expect(days(a, 2).zones.STGO.animo).toBeLessThan(base);
    expect(days(b, 2).zones.STGO.animo).toBeGreaterThan(base);
  });
  it('la moral de un sector sigue al ánimo de las zonas donde están sus empresas', () => {
    const s = structuredClone(engine.init('cf'));
    s.zones.NG.animo = 5; // minería concentrada en el Norte Grande
    const d = days(s, 3), base = days(engine.init('cf'), 3);
    expect(base.sectors.MIN.moral - d.sectors.MIN.moral).toBeGreaterThan(3);
    expect(Math.abs(base.sectors.AGR.moral - d.sectors.AGR.moral)).toBeLessThan(1.5);
  });
  it('la moral baja reduce la producción', () => {
    const s = structuredClone(engine.init('cf'));
    s.sectors.CON.moral = 20;
    expect(engine.tick(s).sectors.CON.produccion).toBeLessThan(engine.tick(engine.init('cf')).sectors.CON.produccion);
  });
});

describe('cyberfolk: voces ciudadanas', () => {
  it('el cierre trae entre 3 y 5 voces sin marcadores sin reemplazar', () => {
    const s = days(engine.init('cf'), 6);
    for (const h of s.history) {
      expect(h.voces.length).toBeGreaterThanOrEqual(ctx.bal.cyberfolk.vocesMin);
      expect(h.voces.length).toBeLessThanOrEqual(ctx.bal.cyberfolk.vocesMax);
      for (const v of h.voces) expect(v.texto).not.toMatch(/[{}]/);
      expect(new Set(h.voces.map((v) => v.texto)).size).toBe(h.voces.length);
    }
  });
  it('reflejan los peores indicadores reales: desabastecimiento → queja de la zona afectada', () => {
    const s = structuredClone(engine.tick(engine.init('cf')));
    s.zones.BIO.abastecimiento = 20;
    s.zones.BIO.animo = 15;
    const voces = generarVoces(s, ctx, new Rng(1));
    const bio = voces.find((v) => v.zona === 'BIO')!;
    expect(bio.tono).toBe('NEG');
    expect(ctx.zone.BIO.lugares.some((l) => bio.texto.includes(l))).toBe(true);
    expect(bio.texto).toMatch(/^En .* no hay /);
  });
  it('con ánimo alto predominan las voces positivas', () => {
    const s = structuredClone(engine.tick(engine.init('cf')));
    for (const z of Object.values(s.zones)) { z.animo = 90; z.abastecimiento = 95; }
    s.indicators.animo = 90;
    const voces = generarVoces(s, ctx, new Rng(2));
    expect(voces.filter((v) => v.tono === 'POS').length).toBeGreaterThan(voces.filter((v) => v.tono === 'NEG').length);
  });
});
