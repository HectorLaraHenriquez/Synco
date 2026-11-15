/** Paleta fija de 12 colores (GDD 6.1). Todo el juego usa sólo estos tokens. */
export const PAL = {
  negro: 0x1a1714,
  carbon: 0x3b342e,
  cafe: 0x6b4a2f,
  naranjo: 0xe0652b,
  mostaza: 0xe3a82b,
  crema: 0xefe4cc,
  blanco: 0xf8f5ee,
  rojo: 0xb8322a,
  verde_crt: 0x7fd46a,
  verde_osc: 0x2f5d3a,
  azul: 0x2c5a8c,
  gris: 0x9a9388,
} as const;
export type PalToken = keyof typeof PAL;

export const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Semáforo para valores 0–100. */
export const semaforo = (v: number): number => (v < 25 ? PAL.rojo : v < 50 ? PAL.mostaza : PAL.verde_crt);
