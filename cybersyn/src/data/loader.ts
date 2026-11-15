import { parseGameData, type GameData } from './schemas';

/** Carga en runtime (navegador) desde public/data. */
export async function loadGameData(base = './data'): Promise<GameData> {
  const get = async (rel: string): Promise<unknown> => {
    const r = await fetch(`${base}/${rel}`);
    if (!r.ok) throw new Error(`No se pudo cargar ${rel}: ${r.status}`);
    return r.json();
  };
  const [balance, sectors, zones, firms] = await Promise.all([
    get('balance.json'), get('world/sectors.json'), get('world/zones.json'), get('world/firms.json'),
  ]);
  return parseGameData({ balance, sectors, zones, firms });
}
