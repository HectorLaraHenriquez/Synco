// Sólo para Node (tests y tools). El navegador usa loader.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateData } from '../sim/effects';
import { DATA_FILES } from './files';
import { parseGameData, type GameData, type RawGameData } from './schemas';

export function loadGameDataFromDir(dir = join(process.cwd(), 'public', 'data')): GameData {
  const raw = {} as Record<string, unknown>;
  for (const [k, rel] of Object.entries(DATA_FILES)) raw[k] = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  return validateData(parseGameData(raw as unknown as RawGameData));
}
