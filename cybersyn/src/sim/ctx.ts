import type { AlgTemplate, Balance, GameData, SectorDef, ZoneDef } from '../data/schemas';
import type { SectorId, ZoneId } from './state';

/** Datos estáticos + índices. `checo` marca una simulación hipotética (sin azar ni efectos de jugador). */
export interface Ctx {
  data: GameData;
  bal: Balance;
  sec: Record<SectorId, SectorDef>;
  zone: Record<ZoneId, ZoneDef>;
  alg: Record<string, AlgTemplate>;
  checo: boolean;
}

export function makeCtx(data: GameData, opts: { checo?: boolean; balance?: Balance } = {}): Ctx {
  const sec = {} as Record<SectorId, SectorDef>;
  for (const s of data.sectors) sec[s.id] = s;
  const zone = {} as Record<ZoneId, ZoneDef>;
  for (const z of data.zones) zone[z.id] = z;
  const alg: Record<string, AlgTemplate> = {};
  for (const t of data.algedonic) alg[t.id] = t;
  return { data, bal: opts.balance ?? data.balance, sec, zone, alg, checo: opts.checo ?? false };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const actKey = (act: 1 | 2 | 3 | 'CLIMAX'): '1' | '2' | '3' | 'CLIMAX' => String(act) as '1' | '2' | '3' | 'CLIMAX';
