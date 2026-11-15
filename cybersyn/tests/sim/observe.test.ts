import { describe, expect, it } from 'vitest';
import { investigado, report, reportIndicators, ruidoAmp, visibleSeries } from '../../src/sim/observe';
import { atDay, ctx, days, engine, errorOf, run } from './helpers';

describe('report(): ruido', () => {
  const s = engine.tick(engine.init('obs'));
  it('el dato reportado de cada empresa difiere del real, dentro de la amplitud de ruido', () => {
    const amp = ruidoAmp(s, ctx);
    let distintos = 0;
    for (const f of Object.values(s.firms)) {
      const r = report(s, ctx, `firm:${f.id}`, 'produccion');
      expect(Math.abs(r.valor / f.produccion - 1)).toBeLessThanOrEqual(amp + 1e-9);
      expect(r.fuente).toBe('REPORTADO');
      expect(r.ruidoPct).toBe(amp);
      if (r.valor !== f.produccion) distintos++;
    }
    expect(distintos).toBeGreaterThan(30);
  });
  it('es estable dentro del día y cambia de un día a otro', () => {
    const a = report(s, ctx, 'firm:tex_yarur', 'produccion').valor;
    expect(report(s, ctx, 'firm:tex_yarur', 'produccion').valor).toBe(a);
    const s2 = structuredClone(s);
    s2.day += 1;
    expect(report(s2, ctx, 'firm:tex_yarur', 'produccion').valor).not.toBe(a);
  });
  it('el ruido crece con el acto', () => {
    expect(ruidoAmp(atDay(12), ctx)).toBeGreaterThan(ruidoAmp(atDay(2), ctx));
    expect(ruidoAmp(atDay(27), ctx)).toBeGreaterThan(ruidoAmp(atDay(22), ctx));
  });
  it('divisas, cobre y soberanía son exactos; los agregados suman empresas', () => {
    expect(report(s, ctx, 'pais', 'divisasMUSD')).toMatchObject({ valor: s.economy.divisas, fuente: 'EXACTO' });
    expect(report(s, ctx, 'pais', 'cobre').valor).toBe(s.economy.precioCobre);
    const rama = report(s, ctx, 'rama:CON.textil', 'produccion').valor;
    const suma = Object.values(s.firms).filter((f) => f.rama === 'textil').reduce((a, f) => a + report(s, ctx, `firm:${f.id}`, 'produccion').valor, 0);
    expect(rama).toBeCloseTo(suma, 9);
    const ind = reportIndicators(s, ctx);
    expect(Math.abs(ind.produccion.valor - s.indicators.produccion)).toBeLessThan(3);
    expect(ind.produccion.valor).not.toBe(s.indicators.produccion);
  });
  it('nodo o indicador desconocido lanza', () => {
    expect(() => report(s, ctx, 'firm:nada', 'produccion')).toThrow();
    expect(() => report(s, ctx, 'pais', 'felicidad')).toThrow();
  });
});

describe('report(): falsificación, retraso e investigación', () => {
  it('una falsificación altera lo reportado, no lo real', () => {
    const s = structuredClone(engine.tick(engine.init('obs')));
    const antes = report(s, ctx, 'rama:CON.textil', 'produccion').valor;
    s.falsificaciones.push({ target: 'rama:CON.textil', indicador: 'produccion', factor: 1.25, offset: 0, hastaDia: 3 });
    expect(report(s, ctx, 'rama:CON.textil', 'produccion').valor).toBeCloseTo(antes * 1.25, 6);
    s.day = 4;
    expect(report(s, ctx, 'rama:CON.textil', 'produccion').valor).toBeLessThan(antes * 1.15);
  });
  it('investigar cuesta 30 min y revela la cifra real por 3 días', () => {
    const s0 = structuredClone(engine.tick(engine.init('obs')));
    s0.falsificaciones.push({ target: 'firm:tex_yarur', indicador: 'produccion', factor: 1.4, offset: 0, hastaDia: 30 });
    let s = run(s0, { t: 'INVESTIGATE', nodeId: 'firm:tex_yarur' });
    expect(s.hour).toBeCloseTo(s0.hour + ctx.bal.observacion.investigarMin / 60, 9);
    expect(report(s, ctx, 'firm:tex_yarur', 'produccion')).toMatchObject({ valor: s.firms.tex_yarur!.produccion, fuente: 'INVESTIGADO' });
    s = days(s, 2);
    expect(investigado(s, 'firm:tex_yarur')).toBe(true);
    s = days(s, 1);
    expect(investigado(s, 'firm:tex_yarur')).toBe(false);
    expect(report(s, ctx, 'firm:tex_yarur', 'produccion').valor).toBeGreaterThan(s.firms.tex_yarur!.produccion * 1.3);
  });
  it('investigar una rama cubre a sus empresas; una zona revela su ánimo real', () => {
    const s = run(engine.tick(engine.init('obs')), { t: 'INVESTIGATE', nodeId: 'rama:CON.textil' }, { t: 'INVESTIGATE', nodeId: 'zone:BIO' });
    expect(report(s, ctx, 'firm:tex_sumar', 'produccion').fuente).toBe('INVESTIGADO');
    expect(report(s, ctx, 'rama:CON.textil', 'produccion').fuente).toBe('INVESTIGADO');
    expect(report(s, ctx, 'zone:BIO', 'animo')).toMatchObject({ valor: s.zones.BIO.animo, fuente: 'INVESTIGADO' });
    expect(report(s, ctx, 'zone:STGO', 'animo').fuente).toBe('REPORTADO');
  });
  it('sólo se investigan ramas, empresas y zonas', () => {
    expect(errorOf(engine.init('obs'), { t: 'INVESTIGATE', nodeId: 'sector:CON' })).toBe('NODO_INVALIDO');
    expect(errorOf(engine.init('obs'), { t: 'INVESTIGATE', nodeId: 'firm:nada' })).toBe('NODO_INVALIDO');
  });
  it('una empresa con retraso muestra el dato de días anteriores', () => {
    let s = days(engine.init('obs'), 3);
    s = structuredClone(s);
    s.firms.tex_yarur!.reportLagDays = 2;
    const r = report(s, ctx, 'firm:tex_yarur', 'produccion');
    const serie = s.series['firm:tex_yarur.produccion']!;
    expect(r.edadDias).toBe(2);
    expect(r.valor).toBe(serie[serie.length - 2]);
    expect(visibleSeries(s, ctx, 'firm:tex_yarur', 'produccion')).toHaveLength(serie.length - 1);
  });
  it('un sector en autogestión reporta con un día de atraso', () => {
    let s = days(engine.init('obs'), 2);
    s = structuredClone(s);
    s.sectors.AGR.autonomia = 'AUTOGESTION';
    expect(report(s, ctx, 'sector:AGR', 'produccion').edadDias).toBe(1);
    expect(report(s, ctx, 'sector:CON', 'produccion').edadDias).toBe(0);
  });
  it('el cierre archiva una entrada por día en cada serie', () => {
    const s = days(engine.init('obs'), 3);
    for (const k of ['pais.produccion', 'pais.inflacion', 'sector:CON.insumosDias', 'rama:MIN.cobre.produccion', 'firm:tex_yarur.produccion', 'zone:BIO.animo'])
      expect(s.series[k], k).toHaveLength(3);
  });
});
