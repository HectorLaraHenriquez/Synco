/** Textos visibles: viven en public/data/ui/es.json, no en el código. */
let STRINGS: Record<string, string> = {};

export function setStrings(s: Record<string, string>): void {
  STRINGS = s;
}

/** Traduce una clave e interpola {variables}. Si falta la clave devuelve la clave (visible para detectarla). */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const base = STRINGS[key] ?? key;
  return base.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export const hasString = (key: string): boolean => STRINGS[key] !== undefined;
