// Sólo para Node (tests y tools). El navegador usa loader.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGameData, type GameData } from './schemas';

const read = (dir: string, rel: string): unknown => JSON.parse(readFileSync(join(dir, rel), 'utf8'));

export function loadGameDataFromDir(dir = join(process.cwd(), 'public', 'data')): GameData {
  return parseGameData({
    balance: read(dir, 'balance.json'),
    sectors: read(dir, 'world/sectors.json'),
    zones: read(dir, 'world/zones.json'),
    firms: read(dir, 'world/firms.json'),
  });
}
