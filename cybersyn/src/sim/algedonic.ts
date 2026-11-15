/** Señales algedónicas (GDD 2.1, 9.3): piden ayuda saltando niveles; si nadie atiende, escalan. */
import { SECTOR_IDS, ZONE_IDS, type AlgTemplate } from '../data/schemas';
import { actKey, clamp, type Ctx } from './ctx';
import { applyEffects, instantiate, scaleEffects } from './effects';
import type { Rng } from './rng';
import type { AlgedonicSignal, Autonomy, GameState, SectorId, ZoneId } from './state';

type Origen = AlgedonicSignal['origen'];
const keyOf = (templateId: string, o: Origen): string => `${templateId}|${o.tipo}:${o.id}`;

function metric(s: GameState, o: Origen, m: string): number | undefined {
  if (o.tipo === 'ZONE') {
    const z = s.zones[o.id as ZoneId];
    return m === 'abastecimiento' ? z.abastecimiento : m === 'animo' ? z.animo : undefined;
  }
  if (o.tipo === 'SECTOR') {
    const sec = s.sectors[o.id as SectorId];
    return m === 'insumosDias' ? (sec.requeridoDia > 0 ? sec.insumos / sec.requeridoDia : 0) : m === 'moral' ? sec.moral : undefined;
  }
  return undefined;
}

function autonomiaDe(s: GameState, o: Origen): Autonomy {
  if (o.tipo === 'SECTOR') return s.sectors[o.id as SectorId].autonomia;
  if (o.tipo === 'FIRM') {
    const f = s.firms[o.id]!;
    return f.autonomia !== 'COORDINADO' ? f.autonomia : s.sectors[f.sector].autonomia;
  }
  return 'COORDINADO';
}

function varsDe(s: GameState, o: Origen): Record<string, string> {
  if (o.tipo === 'FIRM') {
    const f = s.firms[o.id]!;
    return { id: f.id, sector: f.sector, zona: f.zona };
  }
  return o.tipo === 'ZONE' ? { id: o.id, zona: o.id } : { id: o.id, sector: o.id };
}

const cerrar = (s: GameState, sig: AlgedonicSignal, ctx: Ctx): void => {
  s.algedonic = s.algedonic.filter((a) => a.id !== sig.id);
  s.algCooldown[keyOf(sig.templateId, sig.origen)] = s.day + ctx.alg[sig.templateId]!.cooldownDias;
};

/** Crea una señal (o la resuelve sola si el nodo está en autogestión). */
export function spawn(s: GameState, ctx: Ctx, rng: Rng, t: AlgTemplate, o: Origen): AlgedonicSignal | undefined {
  const vars = varsDe(s, o);
  const aut = autonomiaDe(s, o);
  if (t.azar && o.tipo === 'FIRM') {
    const f = s.firms[o.id]!;
    f.eficiencia = Math.min(f.eficiencia, ctx.bal.algedonico.eficienciaAveria);
  }
  if (aut === 'AUTOGESTION') {
    // S1 autónomo: resuelve sus señales de nivel 1 sin subir a la sala.
    const auto = t.opciones.find((op) => op.id === t.autoOpcion)!;
    applyEffects(s, ctx, instantiate(auto.efectos, vars), 'EVENTO');
    s.algCooldown[keyOf(t.id, o)] = s.day + t.cooldownDias;
    s.log.push({ day: s.day, hour: s.hour, code: 'ALG_AUTORESUELTA', data: { templateId: t.id, origen: o.id } });
    return undefined;
  }
  const nivel = aut === 'CENTRALIZADO' ? 2 : 1;
  const lugar =
    o.tipo === 'ZONE' ? ctx.zone[o.id as ZoneId].lugares[Math.floor(rng.next() * ctx.zone[o.id as ZoneId].lugares.length)]!
    : o.tipo === 'SECTOR' ? ctx.sec[o.id as SectorId].nombre
    : s.firms[o.id]!.nombre;
  const v = t.cond ? metric(s, o, t.cond.metric) ?? 0 : 0;
  const valor = t.cond?.metric === 'insumosDias' ? v.toFixed(1).replace('.', ',') : String(Math.round(v));
  const sig: AlgedonicSignal = {
    id: `alg${s.nextId++}`, templateId: t.id, origen: o, nivel,
    causa: t.causa.replace('{lugar}', lugar).replace('{valor}', valor),
    creadaDia: s.day, venceEnMin: ctx.bal.algedonico.venceMin[nivel], atendida: false,
    opciones: t.opciones.map((op) => ({ ...op, efectos: instantiate(op.efectos, vars) })),
    alIgnorar: instantiate(t.alIgnorar, vars),
  };
  s.algedonic.push(sig);
  s.flags.alg_hoy = ((s.flags.alg_hoy as number) ?? 0) + 1;
  s.log.push({ day: s.day, hour: s.hour, code: 'ALG_NUEVA', data: { id: sig.id, nivel } });
  return sig;
}

/** Revisa condiciones y averías al azar. Se llama al cruzar cada hora de juego. */
export function spawnCheck(s: GameState, ctx: Ctx, rng: Rng): void {
  const cfg = ctx.bal.algedonico;
  const max = cfg.maxDia[actKey(s.act)]!;
  const hoy = (): number => (s.flags.alg_hoy as number) ?? 0;
  const libre = (t: AlgTemplate, o: Origen): boolean =>
    (s.algCooldown[keyOf(t.id, o)] ?? 0) <= s.day && !s.algedonic.some((a) => a.templateId === t.id && a.origen.id === o.id);

  for (const t of ctx.data.algedonic) {
    if (hoy() >= max) return;
    if (t.cond) {
      const ids: readonly string[] = t.origen === 'ZONE' ? ZONE_IDS : t.origen === 'SECTOR' ? SECTOR_IDS : [];
      for (const id of ids) {
        const o: Origen = { tipo: t.origen, id };
        const v = metric(s, o, t.cond.metric);
        if (v === undefined || !(t.cond.op === '<' ? v < t.cond.value : v > t.cond.value)) continue;
        if (!libre(t, o) || hoy() >= max) continue;
        if (rng.next() < cfg.probHora) spawn(s, ctx, rng, t, o);
      }
    } else if (t.azar && t.origen === 'FIRM') {
      if (rng.next() >= cfg.averiasDia[actKey(s.act)]! / ctx.bal.tiempo.horasPorDia) continue;
      const cand = Object.values(s.firms).filter((f) => f.conectada && libre(t, { tipo: 'FIRM', id: f.id }));
      if (cand.length === 0) continue;
      spawn(s, ctx, rng, t, { tipo: 'FIRM', id: cand[Math.floor(rng.next() * cand.length)]!.id });
    }
  }
}

/** Avanza temporizadores: resuelve las atendidas y escala las ignoradas. */
export function tickSignals(s: GameState, ctx: Ctx, dtMin: number): void {
  const cfg = ctx.bal.algedonico;
  for (const sig of [...s.algedonic]) {
    if (sig.atendida) {
      sig.resuelveEnMin = (sig.resuelveEnMin ?? 0) - dtMin;
      if (sig.resuelveEnMin > 1e-9) continue;
      const op = sig.opciones.find((x) => x.id === sig.opcionId)!;
      applyEffects(s, ctx, op.efectos, 'JUGADOR');
      s.player.confianza = clamp(s.player.confianza + cfg.confianzaResuelve, 0, 100);
      s.log.push({ day: s.day, hour: s.hour, code: 'ALG_RESUELTA', data: { id: sig.id, opcion: op.id } });
      cerrar(s, sig, ctx);
      continue;
    }
    sig.venceEnMin -= dtMin;
    // Nadie atendió: el daño se amplifica con el nivel y la señal sube un nivel VSM.
    // El tiempo sobrante se descuenta del nivel siguiente (el resultado no depende del tamaño del tick).
    while (sig.venceEnMin <= 1e-9) {
      applyEffects(s, ctx, scaleEffects(sig.alIgnorar, sig.nivel), 'EVENTO');
      if (sig.nivel === 3) {
        s.player.confianza = clamp(s.player.confianza + cfg.confianzaExpira, 0, 100);
        s.log.push({ day: s.day, hour: s.hour, code: 'ALG_EXPIRA', data: { id: sig.id } });
        cerrar(s, sig, ctx);
        break;
      }
      sig.nivel = (sig.nivel + 1) as 2 | 3;
      sig.venceEnMin += cfg.venceMin[sig.nivel];
      s.log.push({ day: s.day, hour: s.hour, code: 'ALG_ESCALA', data: { id: sig.id, nivel: sig.nivel } });
    }
  }
}

/** Atender: ocupa un slot de atención hasta que la opción elegida se resuelve. */
export function attend(s: GameState, signalId: string, optionId: string): string | undefined {
  const sig = s.algedonic.find((a) => a.id === signalId);
  if (!sig) return 'SENAL_INEXISTENTE';
  if (sig.atendida) return 'YA_ATENDIDA';
  const op = sig.opciones.find((o) => o.id === optionId);
  if (!op) return 'OPCION_INVALIDA';
  if (s.algedonic.filter((a) => a.atendida).length >= s.player.slotsAtencion) return 'SIN_ATENCION';
  if ((op.costo?.divisas ?? 0) > s.economy.divisas) return 'SIN_DIVISAS';
  if ((op.costo?.capitalPolitico ?? 0) > s.player.capitalPolitico) return 'SIN_CAPITAL_POLITICO';
  s.economy.divisas -= op.costo?.divisas ?? 0;
  s.player.capitalPolitico -= op.costo?.capitalPolitico ?? 0;
  sig.atendida = true;
  sig.opcionId = op.id;
  sig.resuelveEnMin = op.duraMin;
  return undefined;
}
