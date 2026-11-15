import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../../src/sim/rng';

describe('rng', () => {
  it('es determinista por semilla', () => {
    const a = new Rng(hashSeed('x'));
    const b = new Rng(hashSeed('x'));
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });
  it('semillas distintas dan secuencias distintas', () => {
    expect(new Rng(hashSeed('a')).next()).not.toBe(new Rng(hashSeed('b')).next());
  });
  it('next() ∈ [0,1) y signed() ∈ [-1,1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(r.signed())).toBeLessThanOrEqual(1);
    }
  });
  it('normal() tiene media ~0 y desvío ~1', () => {
    const r = new Rng(7);
    const xs = Array.from({ length: 5000 }, () => r.normal());
    const m = xs.reduce((a, v) => a + v, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
    expect(Math.abs(m)).toBeLessThan(0.08);
    expect(Math.abs(sd - 1)).toBeLessThan(0.08);
  });
});
