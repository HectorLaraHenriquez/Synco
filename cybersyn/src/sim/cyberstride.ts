/** Cyberstride (GDD 3.5): series diarias, pronóstico de corto plazo (Holt), banda de tolerancia y alertas. */
import type { Balance } from '../data/schemas';
import type { Ctx } from './ctx';
import { report, visibleSeries, watchedSeries } from './observe';
import type { GameState, StrideAlert } from './state';

export type StrideCfg = Balance['cyberstride'];

export interface HoltFit { nivel: number; tendencia: number; unPaso: number[]; sigma: number }

/** Suavizamiento exponencial doble. unPaso[t] = predicción de xs[t] con los datos hasta t−1. */
export function holt(xs: number[], alpha: number, beta: number): HoltFit {
  if (xs.length === 0) return { nivel: 0, tendencia: 0, unPaso: [], sigma: 0 };
  let l = xs[0]!;
  let b = xs.length > 1 ? xs[1]! - xs[0]! : 0;
  const unPaso = [xs[0]!];
  let sq = 0, nres = 0;
  for (let t = 1; t < xs.length; t++) {
    const pred = l + b;
    unPaso.push(pred);
    if (t >= 2) { sq += (xs[t]! - pred) ** 2; nres++; }
    const l2 = alpha * xs[t]! + (1 - alpha) * pred;
    b = beta * (l2 - l) + (1 - beta) * b;
    l = l2;
  }
  return { nivel: l, tendencia: b, unPaso, sigma: nres > 0 ? Math.sqrt(sq / nres) : 0 };
}

export interface Analisis {
  pronostico: number[];       // próximos `horizonte` días
  banda: number[];            // semiancho de tolerancia por día pronosticado
  esperadoHoy?: number;       // lo que se esperaba del último dato
  bandaHoy?: number;
  desvio?: 'SUBE' | 'BAJA';   // el último dato salió de la banda
  tendencia?: 'SUBE' | 'BAJA';// N días seguidos en la misma dirección
}

/** `amp` = amplitud conocida del ruido de la fuente: la banda nunca es más angosta que ese ruido. */
export function analizar(xs: number[], cfg: StrideCfg, amp = 0): Analisis {
  const n = xs.length;
  const fit = holt(xs, cfg.alpha, cfg.beta);
  const minPct = Math.max(cfg.bandaMinPct, cfg.bandaRuidoMult * amp);
  const ancho = (f: number, sigma: number) => Math.max(cfg.bandaSigmas * sigma, minPct * Math.abs(f));
  const out: Analisis = { pronostico: [], banda: [] };
  for (let h = 1; h <= cfg.horizonte; h++) {
    const f = fit.nivel + h * fit.tendencia;
    out.pronostico.push(f);
    out.banda.push(ancho(f, fit.sigma) * Math.sqrt(h));
  }
  if (n - 1 >= cfg.minPuntos) {
    const prev = holt(xs.slice(0, n - 1), cfg.alpha, cfg.beta);
    const esperado = prev.nivel + prev.tendencia;
    const banda = ancho(esperado, prev.sigma);
    out.esperadoHoy = esperado;
    out.bandaHoy = banda;
    const d = xs[n - 1]! - esperado;
    if (Math.abs(d) > banda) out.desvio = d > 0 ? 'SUBE' : 'BAJA';
  }
  const k = cfg.tendenciaDias;
  if (n > k) {
    let up = true, down = true;
    for (let t = n - k; t < n; t++) {
      const d = xs[t]! - xs[t - 1]!;
      if (d <= 0) up = false;
      if (d >= 0) down = false;
    }
    const base = xs[n - 1 - k]!;
    if ((up || down) && Math.abs(xs[n - 1]! - base) >= Math.max(cfg.tendenciaMinPct, cfg.bandaRuidoMult * amp) * Math.abs(base)) out.tendencia = up ? 'SUBE' : 'BAJA';
  }
  return out;
}

/** Alertas del día sobre las series vigiladas (se llama en el cierre, tras archivar los datos). */
export function alertasDelDia(s: GameState, ctx: Ctx): StrideAlert[] {
  const out: StrideAlert[] = [];
  for (const [node, ind] of watchedSeries(ctx, s)) {
    const xs = visibleSeries(s, ctx, node, ind);
    if (xs.length === 0) continue;
    const a = analizar(xs, ctx.bal.cyberstride, report(s, ctx, node, ind).ruidoPct);
    const valor = xs[xs.length - 1]!;
    const serie = `${node}.${ind}`;
    if (a.desvio) out.push({ day: s.day, serie, tipo: 'DESVIO', valor, esperado: a.esperadoHoy!, direccion: a.desvio });
    else if (a.tendencia) out.push({ day: s.day, serie, tipo: 'TENDENCIA', valor, esperado: a.esperadoHoy ?? valor, direccion: a.tendencia });
  }
  return out;
}
