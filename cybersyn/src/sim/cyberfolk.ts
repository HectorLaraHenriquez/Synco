/** Cyberfolk (GDD 3.7): ánimo por zona, moral por sector y voces ciudadanas. */
import { SECTOR_IDS, ZONE_IDS, type Cond } from '../data/schemas';
import { clamp, type Ctx } from './ctx';
import { ponderadoZonas, salarioRealIdx } from './economy';
import type { Rng } from './rng';
import type { GameState, SectorId, Voz, ZoneId } from './state';

/** animo[z] += w1·(abast−60)/40 + w2·(salarioReal−1) − w3·inflación + medidas − propaganda + cultura + ruido. */
export function updateAnimo(s: GameState, ctx: Ctx, rng: Rng): void {
  const cf = ctx.bal.cyberfolk;
  const eco = ctx.bal.economia;
  const sal = salarioRealIdx(s);
  for (const z of ZONE_IDS) {
    const zs = s.zones[z];
    const delta =
      (cf.w1 * (zs.abastecimiento - 60)) / 40 +
      cf.w2 * (sal - 1) -
      cf.w3 * s.economy.inflacionMensual +
      eco.emisionAnimo[s.levers.emision] +
      eco.fiscalizacionAnimo[s.levers.fiscalizacion] -
      zs.propaganda +
      zs.cultura +
      cf.ruido * rng.signed();
    zs.animo = clamp(zs.animo + delta, 0, 100);
  }
}

/** La moral de cada sector converge al ánimo de las zonas donde están sus empresas. */
export function updateMoral(s: GameState, ctx: Ctx): void {
  const ex = ctx.bal.exogeno;
  const peso = {} as Record<SectorId, Partial<Record<ZoneId, number>>>;
  for (const id of SECTOR_IDS) peso[id] = {};
  for (const f of Object.values(s.firms)) peso[f.sector][f.zona] = (peso[f.sector][f.zona] ?? 0) + f.capacidad;
  for (const id of SECTOR_IDS) {
    const sec = s.sectors[id];
    let num = 0, den = 0;
    for (const [z, w] of Object.entries(peso[id]) as [ZoneId, number][]) { num += s.zones[z].animo * w; den += w; }
    const animoSector = den > 0 ? num / den : ponderadoZonas(s, ctx, 'animo');
    sec.moral = clamp(
      sec.moral + ex.moralConvergencia * (animoSector - sec.moral)
        - ex.desgasteMetaMoral * Math.max(0, sec.meta - 1)
        + ctx.bal.autonomia[sec.autonomia].moralDia,
      0, 100,
    );
  }
}

const cumple = (c: Cond, v: number | undefined): boolean => v !== undefined && (c.op === '<' ? v < c.value : v > c.value);

function metricasZona(s: GameState, z: ZoneId): Record<string, number> {
  return {
    abastecimiento: s.zones[z].abastecimiento,
    animo: s.zones[z].animo,
    inflacion: s.economy.inflacionMensual * 100,
    mercadoNegro: s.economy.mercadoNegro * 100,
    cultura: s.economy.soberaniaCultural,
    autoritarismo: s.hidden.autoritarismo,
    salarioReal: salarioRealIdx(s),
  };
}

/** 3–5 frases ciudadanas desde plantillas, según los peores y mejores indicadores por zona (valores reales). */
export function generarVoces(s: GameState, ctx: Ctx, rng: Rng): Voz[] {
  const cf = ctx.bal.cyberfolk;
  const { plantillas, bienes, dias } = ctx.data.voices;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]!;
  const total = cf.vocesMin + Math.floor(rng.next() * (cf.vocesMax - cf.vocesMin + 1));
  const nNeg = clamp(Math.round(total * (1 - s.indicators.animo / 100)), 1, total - 1);
  const porAnimo = [...ZONE_IDS].sort((a, b) => s.zones[a].animo - s.zones[b].animo);
  const usadas = new Set<string>();
  const out: Voz[] = [];

  const tomar = (zonas: ZoneId[], tono: 'NEG' | 'POS', cuantas: number): void => {
    let n = 0;
    for (const z of zonas) {
      if (n >= cuantas) break;
      const m = metricasZona(s, z);
      const t = plantillas.find((p) => p.tono === tono && !usadas.has(p.id) && cumple(p.cond, m[p.cond.metric]));
      if (!t) continue;
      usadas.add(t.id);
      const texto = t.texto
        .replace('{lugar}', pick(ctx.zone[z].lugares))
        .replace('{bien}', pick(bienes))
        .replace('{dia}', pick(dias));
      out.push({ zona: z, tono, texto });
      n++;
    }
  };
  tomar(porAnimo, 'NEG', nNeg);
  tomar([...porAnimo].reverse(), 'POS', total - out.length);
  if (out.length < cf.vocesMin) tomar(porAnimo, 'NEG', cf.vocesMin - out.length);
  return out;
}
