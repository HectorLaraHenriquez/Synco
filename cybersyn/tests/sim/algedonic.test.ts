import { describe, expect, it } from 'vitest';
import { spawn, spawnCheck } from '../../src/sim/algedonic';
import { Rng } from '../../src/sim/rng';
import type { AlgedonicSignal, GameState } from '../../src/sim/state';
import { ctx, days, engineSinAverias, errorOf } from './helpers';

const eng = engineSinAverias();
const cfg = ctx.bal.algedonico;
const T = (id: string) => ctx.alg[id]!;

/** Estado con una señal recién creada. */
function conSenal(templateId: string, origen: AlgedonicSignal['origen'], prep?: (s: GameState) => void): { s: GameState; sig: AlgedonicSignal } {
  const s = structuredClone(eng.init('alg'));
  prep?.(s);
  const sig = spawn(s, ctx, new Rng(1), T(templateId), origen)!;
  return { s, sig };
}
const min = (s: GameState, m: number): GameState => eng.tick(s, m / 60);
const zona = { tipo: 'ZONE', id: 'BIO' } as const;

describe('algedónicas: aparición', () => {
  it('una condición cumplida genera la señal durante la jornada', () => {
    const s = structuredClone(eng.init('alg'));
    s.zones.BIO.abastBonus = -50;
    const fin = eng.tick(s, 12);
    const sig = fin.algedonic.find((a) => a.templateId === 'alg_abast_zona' && a.origen.id === 'BIO');
    expect(sig ?? fin.log.find((l) => l.code === 'ALG_NUEVA')).toBeDefined();
  });
  it('la causa nombra un lugar de la zona y el valor', () => {
    const { sig } = conSenal('alg_abast_zona', zona);
    expect(sig.nivel).toBe(1);
    expect(sig.venceEnMin).toBe(cfg.venceMin['1']);
    expect(ctx.zone.BIO.lugares.some((l) => sig.causa.includes(l))).toBe(true);
    expect(sig.causa).not.toMatch(/[{}$]/);
    expect(JSON.stringify(sig.opciones)).not.toContain('$');
  });
  it('sin condiciones ni averías no aparece nada', () => {
    expect(eng.tick(eng.init('alg'), 12).algedonic).toHaveLength(0);
  });
  it('respeta el máximo diario del acto y el enfriamiento', () => {
    const s = structuredClone(eng.init('alg'));
    for (const z of Object.values(s.zones)) z.abastecimiento = 5;
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) spawnCheck(s, ctx, rng);
    expect(s.algedonic).toHaveLength(cfg.maxDia['1']);
    const s2 = structuredClone(eng.init('alg'));
    s2.zones.BIO.abastecimiento = 5;
    s2.algCooldown['alg_abast_zona|ZONE:BIO'] = 3;
    for (let i = 0; i < 50; i++) spawnCheck(s2, ctx, rng);
    expect(s2.algedonic.filter((a) => a.templateId === 'alg_abast_zona')).toHaveLength(0);
  });
  it('una avería baja la eficiencia de la empresa', () => {
    const { s } = conSenal('alg_averia_firma', { tipo: 'FIRM', id: 'tex_yarur' });
    expect(s.firms.tex_yarur!.eficiencia).toBe(cfg.eficienciaAveria);
  });
});

describe('algedónicas: escalamiento (aceptación H2)', () => {
  it('una señal ignorada sube de nivel exactamente al vencer su temporizador', () => {
    const { s, sig } = conSenal('alg_abast_zona', zona);
    const animo0 = s.zones.BIO.animo;
    let st = min(s, cfg.venceMin['1'] - 1);
    expect(st.algedonic[0]).toMatchObject({ id: sig.id, nivel: 1 });
    expect(st.algedonic[0]!.venceEnMin).toBeCloseTo(1, 6);
    st = min(st, 1);
    expect(st.algedonic[0]).toMatchObject({ nivel: 2 });
    expect(st.algedonic[0]!.venceEnMin).toBeCloseTo(cfg.venceMin['2'], 6);
    expect(st.zones.BIO.animo).toBeCloseTo(animo0 - 2, 6); // alIgnorar × nivel 1
    st = min(st, cfg.venceMin['2']);
    expect(st.algedonic[0]).toMatchObject({ nivel: 3 });
    expect(st.zones.BIO.animo).toBeCloseTo(animo0 - 2 - 4, 6); // amplificado × nivel 2
  });
  it('al expirar en nivel 3 desaparece, cuesta confianza y queda en enfriamiento', () => {
    const { s } = conSenal('alg_abast_zona', zona);
    const total = cfg.venceMin['1'] + cfg.venceMin['2'] + cfg.venceMin['3'];
    const st = min(s, total);
    expect(st.algedonic).toHaveLength(0);
    expect(st.player.confianza).toBe(s.player.confianza + cfg.confianzaExpira);
    expect(st.log.map((l) => l.code)).toEqual(expect.arrayContaining(['ALG_ESCALA', 'ALG_EXPIRA']));
    expect(st.algCooldown['alg_abast_zona|ZONE:BIO']).toBe(1 + T('alg_abast_zona').cooldownDias);
  });
  it('el temporizador sigue corriendo al día siguiente', () => {
    const { s } = conSenal('alg_abast_zona', zona);
    s.hour = 19.5;
    const st = days(s, 1, eng);
    expect(st.algedonic[0]!.venceEnMin).toBeCloseTo(cfg.venceMin['1'] - 30, 6);
  });
  it('un nodo centralizado sube directo a nivel 2; uno en autogestión resuelve solo', () => {
    const c = conSenal('alg_moral_sector', { tipo: 'SECTOR', id: 'CON' }, (s) => { s.sectors.CON.autonomia = 'CENTRALIZADO'; });
    expect(c.sig.nivel).toBe(2);
    const s = structuredClone(eng.init('alg'));
    s.sectors.CON.autonomia = 'AUTOGESTION';
    const moral0 = s.sectors.CON.moral;
    expect(spawn(s, ctx, new Rng(1), T('alg_moral_sector'), { tipo: 'SECTOR', id: 'CON' })).toBeUndefined();
    expect(s.algedonic).toHaveLength(0);
    expect(s.sectors.CON.moral).toBeGreaterThan(moral0);
    expect(s.log.at(-1)!.code).toBe('ALG_AUTORESUELTA');
  });
});

describe('algedónicas: atender', () => {
  it('ocupa un slot, detiene el vencimiento y aplica la opción al resolverse', () => {
    const { s, sig } = conSenal('alg_abast_zona', zona);
    let st = eng.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'reserva' });
    expect(st.algedonic[0]).toMatchObject({ atendida: true, opcionId: 'reserva', resuelveEnMin: 60 });
    expect(st.economy.divisas).toBeCloseTo(s.economy.divisas - 2, 6);
    st = min(st, 59);
    expect(st.algedonic).toHaveLength(1);
    expect(st.algedonic[0]!.venceEnMin).toBe(cfg.venceMin['1']);
    expect(st.zones.BIO.abastBonus).toBe(0);
    st = min(st, 1);
    expect(st.algedonic).toHaveLength(0);
    expect(st.zones.BIO.abastBonus).toBe(12);
    expect(st.player.confianza).toBe(s.player.confianza + cfg.confianzaResuelve);
    expect(st.zones.BIO.abastecimiento).toBeGreaterThan(min(s, 60).zones.BIO.abastecimiento + 8);
  });
  it('los efectos diferidos de una opción llegan después', () => {
    const { s, sig } = conSenal('alg_abast_zona', zona);
    let st = eng.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'delegar' });
    st = min(st, 30);
    expect(st.zones.BIO.abastBonus).toBe(0);
    expect(st.pendingEffects).toHaveLength(1);
    expect(days(st, 2, eng).zones.BIO.abastBonus).toBe(5);
  });
  it('no se puede atender más señales que slots de atención', () => {
    const s = structuredClone(eng.init('alg'));
    const rng = new Rng(1);
    const ids = (['BIO', 'ARL', 'AUS'] as const).map((z) => spawn(s, ctx, rng, T('alg_abast_zona'), { tipo: 'ZONE', id: z })!.id);
    let st = eng.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: ids[0]!, optionId: 'delegar' });
    st = eng.applyCommand(st, { t: 'ATTEND_ALGEDONIC', signalId: ids[1]!, optionId: 'delegar' });
    expect(errorOf(st, { t: 'ATTEND_ALGEDONIC', signalId: ids[2]!, optionId: 'delegar' })).toBe('SIN_ATENCION');
    expect(errorOf(min(st, 30), { t: 'ATTEND_ALGEDONIC', signalId: ids[2]!, optionId: 'delegar' })).toBeUndefined();
  });
  it('rechaza señal inexistente, opción inválida, doble atención y costos impagables', () => {
    const { s, sig } = conSenal('alg_abast_zona', zona);
    expect(errorOf(s, { t: 'ATTEND_ALGEDONIC', signalId: 'x', optionId: 'reserva' })).toBe('SENAL_INEXISTENTE');
    expect(errorOf(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'x' })).toBe('OPCION_INVALIDA');
    const at = eng.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'reserva' });
    expect(errorOf(at, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'reserva' })).toBe('YA_ATENDIDA');
    const pobre = structuredClone(s);
    pobre.economy.divisas = 1;
    expect(errorOf(pobre, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'reserva' })).toBe('SIN_DIVISAS');
  });
  it('reparar una avería devuelve la eficiencia', () => {
    const { s, sig } = conSenal('alg_averia_firma', { tipo: 'FIRM', id: 'tex_yarur' });
    const st = min(eng.applyCommand(s, { t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: 'repuestos' }), 45);
    expect(st.firms.tex_yarur!.eficiencia).toBe(1);
  });
});
