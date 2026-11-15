/** Guardado en localStorage (JSON versionado). H5 agrega ranuras, migraciones y exportar/importar. */
import { STATE_VERSION, type GameState } from '../sim/state';

const KEY = 'cybersyn.autosave';

export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const store = (): Store | undefined => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
};

export function saveGame(state: GameState, s: Store | undefined = store()): boolean {
  try {
    s?.setItem(KEY, JSON.stringify(state));
    return s !== undefined;
  } catch {
    return false; // sin espacio o almacenamiento bloqueado: se juega igual
  }
}

export function loadGame(s: Store | undefined = store()): GameState | undefined {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return undefined;
    const state = JSON.parse(raw) as GameState;
    return state.version === STATE_VERSION && typeof state.day === 'number' ? state : undefined;
  } catch {
    return undefined;
  }
}

export function clearSave(s: Store | undefined = store()): void {
  try {
    s?.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
}
