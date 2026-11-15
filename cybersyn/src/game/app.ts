/** Contexto global de la aplicación (datos cargados y partida en curso). */
import type { GameData } from '../data/schemas';
import { createEngine, type Engine } from '../sim/engine';
import { Session, type DayClose } from './session';

export const W = 480;
export const H = 270;

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

export const session = (): Session => app.session!;
