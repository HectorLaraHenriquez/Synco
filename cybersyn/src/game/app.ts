/** Contexto global de la aplicación (datos cargados y partida en curso). */
import type { GameData } from '../data/schemas';
import { createEngine, type Engine } from '../sim/engine';
import type { GameState } from '../sim/state';
import { Session, type DayClose } from './session';

/** Resolución del juego: gráfica vectorial tipo diapositiva. */
export const VW = 1440;
export const VH = 810;

export const app: { data?: GameData; engine?: Engine; session?: Session; lastClose?: DayClose; speed: number } = { speed: 1 };

export function initApp(data: GameData): void {
  app.data = data;
  app.engine = createEngine(data);
}

export function newGame(seed = `${Date.now()}`): Session {
  app.session = new Session(app.engine!, seed);
  app.session.speed = app.speed;
  return app.session;
}

export function resumeGame(state: GameState): Session {
  app.session = new Session(app.engine!, state);
  app.session.speed = app.speed;
  return app.session;
}

export const session = (): Session => app.session!;
