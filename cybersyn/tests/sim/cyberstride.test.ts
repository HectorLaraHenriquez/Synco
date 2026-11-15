import { describe, expect, it } from 'vitest';
import { alertasDelDia, analizar, holt } from '../../src/sim/cyberstride';
import { ctx, days, engine } from './helpers';

const cfg = ctx.bal.cyberstride;
const lineal = Array.from({ length: 10 }, (_, i) => 50 + 2 * i);

describe('cyberstride: pronóstico', () => {
  it('Holt sigue exactamente una serie lineal', () => {
    const f = holt(lineal, cfg.alpha, cfg.beta);
    expect(f.nivel).toBeCloseTo(68, 6);
    expect(f.tendencia).toBeCloseTo(2, 6);
    expect(f.sigma).toBeCloseTo(0, 6);
    expect(analizar(lineal, cfg).pronostico[2]).toBeCloseTo(74, 6);
  });
  it('series vacías o de un punto no fallan', () => {
    expect(analizar([], cfg).pronostico).toHaveLength(cfg.horizonte);
    expect(analizar([5], cfg).pronostico[0]).toBe(5);
    expect(analizar([5], cfg).desvio).toBeUndefined();
  });
  it('la banda se ensancha con el horizonte y nunca es más angosta que el ruido de la fuente', () => {
    const a = analizar(lineal, cfg);
    expect(a.banda[4]!).toBeGreaterThan(a.banda[0]!);
    const ruidosa = analizar(lineal, cfg, 0.1);
    expect(ruidosa.banda[0]!).toBeGreaterThan(a.banda[0]!);
    expect(ruidosa.banda[0]!).toBeGreaterThanOrEqual(cfg.bandaRuidoMult * 0.1 * 68);
  });
});

describe('cyberstride: alertas', () => {
  it('alerta de desvío cuando el dato sale de la banda', () => {
    const a = analizar([...lineal, 40], cfg);
    expect(a.desvio).toBe('BAJA');
    expect(a.esperadoHoy).toBeCloseTo(70, 6);
    expect(analizar([...lineal, 95], cfg).desvio).toBe('SUBE');
  });
  it('sin desvío si el dato cae dentro de la banda', () => {
    expect(analizar([...lineal, 71], cfg).desvio).toBeUndefined();
  });
  it('necesita un mínimo de puntos para alertar desvíos', () => {
    expect(analizar([50, 52, 10], cfg).desvio).toBeUndefined();
  });
  it('alerta de tendencia con 3 días seguidos en la misma dirección', () => {
    expect(analizar([50, 50, 50, 48, 46, 44], cfg).tendencia).toBe('BAJA');
    expect(analizar([50, 50, 50, 52, 54, 56], cfg).tendencia).toBe('SUBE');
    expect(analizar([50, 50, 50, 48, 49, 47], cfg).tendencia).toBeUndefined();
  });
  it('ignora tendencias menores que el umbral o que el ruido de la fuente', () => {
    expect(analizar([50, 50, 50, 49.9, 49.8, 49.7], cfg).tendencia).toBeUndefined();
    expect(analizar([50, 50, 50, 48, 46, 44], cfg, 0.1).tendencia).toBeUndefined();
  });
  it('en la simulación: un sector sin divisas dispara alerta de tendencia en sus insumos', () => {
    const s = days(engine.forceLevers(engine.init('cs'), { asignacionDivisas: { ENT: 0.0001 } }), 4);
    expect(s.alerts).toEqual(alertasDelDia({ ...s, day: s.day - 1 }, ctx));
    expect(s.alerts.some((a) => a.serie === 'sector:ENT.insumosDias' && a.direccion === 'BAJA')).toBe(true);
    expect(s.history[3]!.alertas).toEqual(s.alerts);
  });
});
