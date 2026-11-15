import type { SectorId, ZoneId } from '../data/schemas';
import type { Ctx } from '../sim/ctx';
import type { GameState } from '../sim/state';
import { t } from './i18n';

/** Nombre legible de un nodo VSM ('pais', 'sector:CON', 'rama:CON.textil', 'firm:id', 'zone:BIO'). */
export function nombreNodo(ctx: Ctx, s: GameState, node: string): string {
  const [tipo, id = ''] = node.split(':');
  if (tipo === 'sector') return ctx.sec[id as SectorId]?.nombre ?? id;
  if (tipo === 'zone') return ctx.zone[id as ZoneId]?.nombre ?? id;
  if (tipo === 'firm') return s.firms[id]?.nombre ?? id;
  if (tipo === 'rama') {
    const [sec, rama] = id.split('.');
    return ctx.sec[sec as SectorId]?.ramas.find((r) => r.id === rama)?.nombre ?? id;
  }
  return t('nodo.pais');
}

/** 'sector:ENT.insumosDias' → 'Energía y transporte · insumos (días)'. */
export function nombreSerie(ctx: Ctx, s: GameState, serie: string): string {
  const i = serie.lastIndexOf('.');
  return `${nombreNodo(ctx, s, serie.slice(0, i))} · ${t(`ind.${serie.slice(i + 1)}`)}`;
}

export const hora = (h: number): string => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
