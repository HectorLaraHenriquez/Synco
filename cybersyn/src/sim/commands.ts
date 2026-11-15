/** Comandos del jugador (GDD 7.4). Única vía por la que la UI modifica el estado. */
import type { LeverKey } from '../data/schemas';
import { finDeJornada } from './advance';
import { attend } from './algedonic';
import { runCheco } from './checo';
import type { Ctx } from './ctx';
import { executeDraft, setAutonomy, setDraft } from './levers';
import { investigate, pantallaDesbloqueada } from './observe';
import type { Rng } from './rng';
import type { Autonomy, GameState, Telex } from './state';

export type Command =
  | { t: 'SET_DRAFT_LEVER'; lever: LeverKey; value: unknown }
  | { t: 'CLEAR_DRAFT' }
  | { t: 'EXECUTE_LEVERS' }
  | { t: 'RUN_CHECO'; horizonDays: 7 | 30 }
  | { t: 'INVESTIGATE'; nodeId: string }
  | { t: 'ATTEND_ALGEDONIC'; signalId: string; optionId: string }
  | { t: 'TELEX_ACTION'; telexId: string; action: Telex['acciones'][number] }
  | { t: 'SET_AUTONOMY'; nodeId: string; value: Autonomy }
  | { t: 'COUNCIL_CHOICE'; decisionId: string; optionId: string }
  | { t: 'START_RESEARCH'; techId: string };

export type CommandError =
  | 'JUEGO_TERMINADO' | 'NO_IMPLEMENTADO' | 'PANTALLA_BLOQUEADA' | 'PALANCA_DESCONOCIDA' | 'PALANCA_BLOQUEADA' | 'VALOR_INVALIDO'
  | 'SIN_CAMBIOS' | 'SIN_TIEMPO' | 'SIN_CAPITAL_POLITICO' | 'SIN_DIVISAS' | 'SIN_CICLOS' | 'SIN_ATENCION'
  | 'NODO_INVALIDO' | 'SENAL_INEXISTENTE' | 'YA_ATENDIDA' | 'OPCION_INVALIDA';

/** Ejecuta el comando sobre `s` (ya clonado). Devuelve error o los minutos de reloj que consume. */
export function execCommand(s: GameState, ctx: Ctx, rng: Rng, cmd: Command): { error?: string; minutos?: number } {
  switch (cmd.t) {
    case 'SET_DRAFT_LEVER':
      return { error: setDraft(s, ctx, cmd.lever, cmd.value) };
    case 'CLEAR_DRAFT':
      s.draftLevers = {};
      return {};
    case 'EXECUTE_LEVERS':
      return executeDraft(s, ctx, rng);
    case 'RUN_CHECO': {
      if (!pantallaDesbloqueada(s, ctx, 'checo')) return { error: 'PANTALLA_BLOQUEADA' };
      if (cmd.horizonDays !== 7 && cmd.horizonDays !== 30) return { error: 'VALOR_INVALIDO' };
      if (s.player.ciclosUsados >= s.player.ciclosComputo) return { error: 'SIN_CICLOS' };
      const horas = ctx.bal.checo.costoHoras[cmd.horizonDays];
      if (s.hour + horas > finDeJornada(ctx) + 1e-9) return { error: 'SIN_TIEMPO' };
      s.checo.push(runCheco(s, ctx, cmd.horizonDays));
      if (s.checo.length > ctx.bal.checo.maxRuns) s.checo.shift();
      s.player.ciclosUsados += 1;
      return { minutos: horas * 60 };
    }
    case 'INVESTIGATE':
      return investigate(s, ctx, cmd.nodeId);
    case 'ATTEND_ALGEDONIC':
      return { error: attend(s, cmd.signalId, cmd.optionId) };
    case 'SET_AUTONOMY':
      return setAutonomy(s, ctx, rng, cmd.nodeId, cmd.value);
    case 'TELEX_ACTION':
    case 'COUNCIL_CHOICE':
    case 'START_RESEARCH':
      return { error: 'NO_IMPLEMENTADO' }; // H5
  }
}
