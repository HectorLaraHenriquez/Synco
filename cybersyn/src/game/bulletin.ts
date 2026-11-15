/** Boletín matutino: titular, novedades del día y objetivo. Sin Phaser. Devuelve claves de texto. */
import { LEVER_KEYS } from '../data/schemas';
import type { Ctx } from '../sim/ctx';
import { report, reportIndicators } from '../sim/observe';
import type { GameState } from '../sim/state';

export interface Bulletin {
  titular: string;                 // clave boletin.titular.*
  objetivo: string;                // clave boletin.objetivo.*
  novedades: string[];             // claves boletin.nuevo.*
  jefa?: string;                   // clave boletin.jefa.* (mensaje de la Jefa de Sala)
  cobre: number;
}

export function buildBulletin(s: GameState, ctx: Ctx): Bulletin {
  const ind = reportIndicators(s, ctx);
  const infl = report(s, ctx, 'pais', 'inflacion').valor;
  const caso =
    s.day === 1 ? 'inicio'
    : ind.abastecimiento.valor < 55 ? 'abastecimiento'
    : infl > 0.15 ? 'inflacion'
    : ind.animo.valor < 45 ? 'animo'
    : ind.divisas.valor < 12 ? 'divisas'
    : ind.produccion.valor < 60 ? 'produccion'
    : 'calma';
  const novedades: string[] = [];
  for (const k of [...LEVER_KEYS, 'autonomia'] as const) if (ctx.bal.palancas.desbloqueoDia[k] === s.day) novedades.push(`boletin.nuevo.${k}`);
  for (const p of ['checo', 'red', 'cyberfolk'] as const) if (ctx.bal.pantallas.desbloqueoDia[p] === s.day) novedades.push(`boletin.nuevo.pantalla.${p}`);
  const jefa = s.day <= 3 ? `boletin.jefa.dia${s.day}` : undefined;
  return { titular: `boletin.titular.${caso}`, objetivo: `boletin.objetivo.${caso}`, novedades, jefa, cobre: s.economy.precioCobre };
}
