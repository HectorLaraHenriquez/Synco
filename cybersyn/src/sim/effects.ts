/** Intérprete de Effect (GDD 7.4) con lista blanca de paths. */
import { LEVER_KEYS, SECTOR_IDS, ZONE_IDS, type Effect, type GameData, type LeverKey } from '../data/schemas';
import { clamp, makeCtx, type Ctx } from './ctx';
import { computeZones, refreshSectorBasics } from './economy';
import { applyLeverNow, normalizeLever, ramaExists } from './levers';
import { FACTION_IDS, type EffectOrigin, type GameState, type SectorId } from './state';

type Op = 'add' | 'mul' | 'set';
interface Rule { re: RegExp; ops: Op[]; min?: number; max?: number }

const S = SECTOR_IDS.join('|');
const Z = ZONE_IDS.join('|');
const NUM: Op[] = ['add', 'mul', 'set'];
const RULES: Rule[] = [
  { re: /^economy\.(divisas|deudaExterna|precioCobre|salarioNominal|precioImportIdx)$/, ops: NUM, min: 0 },
  { re: /^economy\.ajustePrecios$/, ops: ['add', 'set'] },
  { re: /^economy\.mercadoNegro$/, ops: NUM, min: 0, max: 1 },
  { re: /^economy\.soberaniaCultural$/, ops: NUM, min: 0, max: 100 },
  { re: new RegExp(`^zones\\.(${Z})\\.animo$`), ops: NUM, min: 0, max: 100 },
  { re: new RegExp(`^zones\\.(${Z})\\.abastBonus$`), ops: NUM, min: -50, max: 50 },
  { re: new RegExp(`^zones\\.(${Z})\\.(propaganda|cultura)$`), ops: NUM, min: 0, max: 10 },
  { re: new RegExp(`^sectors\\.(${S})\\.moral$`), ops: NUM, min: 0, max: 100 },
  { re: new RegExp(`^sectors\\.(${S})\\.sabotaje$`), ops: NUM, min: 0, max: 1 },
  { re: new RegExp(`^sectors\\.(${S})\\.insumos$`), ops: NUM, min: 0 },
  { re: new RegExp(`^sectors\\.(${S})\\.insumosDias$`), ops: ['add'] },
  { re: new RegExp(`^sectors\\.(${S})\\.autonomia$`), ops: ['set'] },
  { re: /^firms\.[a-z0-9_]+\.eficiencia$/, ops: NUM, min: 0, max: 1 },
  { re: /^firms\.[a-z0-9_]+\.reportLagDays$/, ops: ['add', 'set'], min: 0, max: 5 },
  { re: /^firms\.[a-z0-9_]+\.autonomia$/, ops: ['set'] },
  { re: new RegExp(`^ramas\\.(${S})\\.[a-z_]+\\.capacidad$`), ops: ['mul'] },
  { re: /^player\.(confianza|capitalPolitico)$/, ops: NUM, min: 0, max: 100 },
  { re: /^player\.(ciclosComputo|slotsAtencion)$/, ops: ['add', 'set'], min: 0 },
  { re: /^hidden\.(autoritarismo|hostilidadNorte)$/, ops: NUM, min: 0, max: 100 },
  { re: new RegExp(`^factions\\.(${FACTION_IDS.join('|')})$`), ops: NUM, min: 0, max: 100 },
  { re: new RegExp(`^levers\\.(${LEVER_KEYS.join('|')})$`), ops: ['set'] },
];

const ruleFor = (path: string): Rule | undefined => RULES.find((r) => r.re.test(path));

/** Lanza si el efecto usa un path u operación fuera de la lista blanca, o referencia un nodo inexistente. */
export function validateEffect(e: Effect, ctx: Ctx): void {
  if (e.op === 'delay') return e.effects.forEach((x) => validateEffect(x, ctx));
  if (e.op === 'flag' || e.op === 'spawnTelex' || e.op === 'spawnAlgedonic') return;
  const rule = ruleFor(e.path);
  if (!rule) throw new Error(`Effect: path no permitido "${e.path}"`);
  if (!rule.ops.includes(e.op)) throw new Error(`Effect: op "${e.op}" no permitida en "${e.path}"`);
  const parts = e.path.split('.');
  if (parts[0] === 'firms' && !ctx.data.firms.some((f) => f.id === parts[1])) throw new Error(`Effect: empresa inexistente "${parts[1]}"`);
  if (parts[0] === 'ramas' && !ramaExists(ctx, `${parts[1]}.${parts[2]}`)) throw new Error(`Effect: rama inexistente "${parts[1]}.${parts[2]}"`);
  if (parts[0] === 'levers' && normalizeLever(ctx, parts[1] as LeverKey, e.value) === undefined) throw new Error(`Effect: valor inválido para "${e.path}"`);
  if (e.op !== 'set' && typeof e.value !== 'number') throw new Error(`Effect: valor no numérico en "${e.path}"`);
}

/** Sustituye $id, $sector, $zona en los paths. */
export function instantiate(effects: Effect[], vars: Record<string, string>): Effect[] {
  const sub = (p: string): string => p.replace(/\$(\w+)/g, (m, k: string) => vars[k] ?? m);
  return effects.map((e) => {
    if (e.op === 'delay') return { ...e, effects: instantiate(e.effects, vars) };
    if (e.op === 'add' || e.op === 'mul' || e.op === 'set') return { ...e, path: sub(e.path) };
    return e;
  });
}

/** Valida todos los efectos del contenido (se llama al cargar la data). */
export function validateData(data: GameData): GameData {
  const ctx = makeCtx(data);
  const f0 = data.firms[0]!;
  const dummy = {
    ZONE: { id: f0.zona, zona: f0.zona },
    SECTOR: { id: f0.sector, sector: f0.sector },
    FIRM: { id: f0.id, sector: f0.sector, zona: f0.zona },
  };
  for (const t of data.algedonic) {
    const all = [...t.alIgnorar, ...t.opciones.flatMap((o) => o.efectos)];
    try {
      instantiate(all, dummy[t.origen]).forEach((e) => validateEffect(e, ctx));
    } catch (err) {
      throw new Error(`Algedónica ${t.id}: ${(err as Error).message}`);
    }
  }
  return data;
}

function applyOne(s: GameState, ctx: Ctx, e: Effect, origen: EffectOrigin): void {
  switch (e.op) {
    case 'delay':
      s.pendingEffects.push({ dueDay: s.day + e.days, effects: e.effects, origen });
      return;
    case 'flag':
      s.flags[e.key] = e.value;
      return;
    case 'spawnTelex':
    case 'spawnAlgedonic':
      s.log.push({ day: s.day, hour: s.hour, code: 'EFECTO_NO_IMPLEMENTADO', data: { op: e.op, templateId: e.templateId } });
      return;
  }
  validateEffect(e, ctx);
  const rule = ruleFor(e.path)!;
  const parts = e.path.split('.');
  if (parts[0] === 'levers') return applyLeverNow(s, ctx, parts[1] as LeverKey, e.value);
  if (parts[0] === 'ramas') {
    for (const f of Object.values(s.firms)) if (f.sector === parts[1] && f.rama === parts[2]) f.capacidad *= e.value as number;
    return;
  }
  if (parts[0] === 'sectors' && parts[2] === 'insumosDias') {
    const sec = s.sectors[parts[1] as SectorId];
    sec.insumos = Math.max(0, sec.insumos + (e.value as number) * sec.requeridoDia);
    return;
  }
  let obj = s as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]!] as Record<string, unknown>;
    if (obj === undefined) throw new Error(`Effect: path inexistente "${e.path}"`);
  }
  const key = parts[parts.length - 1]!;
  if (e.op === 'set' && typeof e.value !== 'number') {
    obj[key] = e.value;
    return;
  }
  const cur = obj[key] as number;
  const v = e.value as number;
  const next = e.op === 'add' ? cur + v : e.op === 'mul' ? cur * v : v;
  obj[key] = clamp(next, rule.min ?? -Infinity, rule.max ?? Infinity);
}

export function applyEffects(s: GameState, ctx: Ctx, effects: Effect[], origen: EffectOrigin): void {
  for (const e of effects) applyOne(s, ctx, e, origen);
  refreshSectorBasics(s, ctx);
  computeZones(s, ctx);
}

/** Aplica los efectos diferidos que vencen hoy (se llama al comenzar el día). */
export function processDue(s: GameState, ctx: Ctx): void {
  const due = s.pendingEffects.filter((p) => p.dueDay <= s.day);
  if (due.length === 0) return;
  s.pendingEffects = s.pendingEffects.filter((p) => p.dueDay > s.day);
  for (const p of due) applyEffects(s, ctx, p.effects, p.origen);
}

/** Escala los valores numéricos 'add' (amplificación por nivel algedónico). */
export function scaleEffects(effects: Effect[], k: number): Effect[] {
  return effects.map((e) => (e.op === 'add' ? { ...e, value: e.value * k } : e.op === 'delay' ? { ...e, effects: scaleEffects(e.effects, k) } : e));
}
