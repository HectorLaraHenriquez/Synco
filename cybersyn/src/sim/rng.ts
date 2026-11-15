/** RNG determinista (mulberry32). El estado es un uint32 guardado en GameState.rng. */

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  constructor(public s: number) {
    this.s = s >>> 0;
  }
  /** Uniforme en [0,1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniforme en [-1,1). */
  signed(): number {
    return this.next() * 2 - 1;
  }
  /** Normal estándar (Box-Muller). */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
}

/** Ruido determinista sin estado en [-1,1): estable para (semilla, día, clave). */
export function hashNoise(seed: string, day: number, key: string): number {
  return (hashSeed(`${seed}|${day}|${key}`) / 4294967296) * 2 - 1;
}

/** RNG nulo: Checo proyecta el valor esperado, sin azar. */
export class ZeroRng extends Rng {
  constructor() {
    super(0);
  }
  override next(): number {
    return 0.5;
  }
  override signed(): number {
    return 0;
  }
  override normal(): number {
    return 0;
  }
}
