import type { RawGameData } from './schemas';

export const DATA_FILES: Record<keyof RawGameData, string> = {
  balance: 'balance.json',
  sectors: 'world/sectors.json',
  zones: 'world/zones.json',
  firms: 'world/firms.json',
  algedonic: 'algedonic/templates.json',
  voices: 'voices/templates.json',
};
