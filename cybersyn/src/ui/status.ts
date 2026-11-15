/** Estado simbólico de un sector para los tableros (sin Phaser). Sólo usa datos reportados. */
import type { SectorId } from '../data/schemas';
import type { Ctx } from '../sim/ctx';
import { report } from '../sim/observe';
import type { GameState } from '../sim/state';

/** 0 = normal (símbolo apagado), 1 = atención, 2 = crítico. */
export type Nivel = 0 | 1 | 2;
export interface EstadoSector { produccion: Nivel; insumos: Nivel; moral: Nivel; datos: Nivel; senal: Nivel }
export const CLAVES_ESTADO: (keyof EstadoSector)[] = ['produccion', 'insumos', 'moral', 'datos', 'senal'];

const escala = (v: number, ok: number, alerta: number): Nivel => (v >= ok ? 0 : v >= alerta ? 1 : 2);

export function estadoSector(s: GameState, ctx: Ctx, id: SectorId): EstadoSector {
  const prod = report(s, ctx, `sector:${id}`, 'produccion');
  const util = report(s, ctx, `sector:${id}`, 'utilizacion').valor;
  const senales = s.algedonic.filter((a) => a.origen.id === id || s.firms[a.origen.id]?.sector === id);
  return {
    produccion: escala(util, 0.7, 0.5),
    insumos: escala(report(s, ctx, `sector:${id}`, 'insumosDias').valor, 2.5, 1),
    moral: escala(report(s, ctx, `sector:${id}`, 'moral').valor, 55, 40),
    datos: prod.edadDias >= 2 ? 2 : prod.edadDias === 1 ? 1 : 0,
    senal: senales.some((a) => !a.atendida) ? 2 : senales.length > 0 ? 1 : 0,
  };
}

/** Peor nivel del sector (para el semáforo general). */
export const peor = (e: EstadoSector): Nivel => Math.max(...CLAVES_ESTADO.map((k) => e[k])) as Nivel;
