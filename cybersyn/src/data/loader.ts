import { validateData } from '../sim/effects';
import { DATA_FILES } from './files';
import { parseGameData, type GameData, type RawGameData } from './schemas';

/** Carga en runtime (navegador) desde public/data. */
export async function loadGameData(base = './data'): Promise<GameData> {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([k, rel]) => {
      const r = await fetch(`${base}/${rel}`);
      if (!r.ok) throw new Error(`No se pudo cargar ${rel}: ${r.status}`);
      return [k, await r.json()] as const;
    }),
  );
  return validateData(parseGameData(Object.fromEntries(entries) as unknown as RawGameData));
}
