/** Fichas: láminas de detalle que se abren sobre la sala (consola, señales, Checo, alertas, sector, zona). */
import Phaser from 'phaser';
import { SECTOR_IDS, ZONE_IDS, type LeverKey, type SectorId, type ZoneId } from '../data/schemas';
import type { Session } from '../game/session';
import { executeCost, isUnlocked } from '../sim/levers';
import { investigado, pantallaDesbloqueada, report, zonasCyberfolk } from '../sim/observe';
import { INDICATOR_KEYS, PRICE_CATS, type Autonomy, type Emision, type Fiscalizacion, type NationalIndicators } from '../sim/state';
import { t } from './i18n';
import { fmt, nombreSerie } from './labels';
import { PAL, semaforo } from './palette';
import { CLAVES_ESTADO, estadoSector } from './status';
import { SIMBOLOS, simbolo, vbutton, vparrafo, vstepper, vtext } from './vector';

export const FW = 960;
export const FH = 600;

export type FichaId =
  | { tipo: 'consola' } | { tipo: 'algedonico' } | { tipo: 'checo' } | { tipo: 'stride' }
  | { tipo: 'sector'; id: SectorId } | { tipo: 'zona'; id: ZoneId };

export interface FichaCtx {
  scene: Phaser.Scene;
  c: Phaser.GameObjects.Container;
  ses: Session;
  abrir(f: FichaId): void;
  ui: { checoInd: keyof NationalIndicators };
}

export function tituloFicha(f: FichaId, x: FichaCtx): string {
  if (f.tipo === 'sector') return x.ses.ctx.sec[f.id].nombre.toUpperCase();
  if (f.tipo === 'zona') return x.ses.ctx.zone[f.id].nombre.toUpperCase();
  return t(`ficha.${f.tipo}.titulo`);
}

const EMISION: Emision[] = ['BAJO', 'MEDIO', 'ALTO'];
const FISC: Fiscalizacion[] = ['OFF', 'RACIONAMIENTO', 'ESTRICTO'];
const AUTONOMIA: Autonomy[] = ['AUTOGESTION', 'COORDINADO', 'CENTRALIZADO'];
const r2 = (v: number): number => Math.round(v * 100) / 100;

function consola(x: FichaCtx): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  const d = s.draftLevers;
  const set = (lever: LeverKey, value: unknown): void => void ses.dispatch({ t: 'SET_DRAFT_LEVER', lever, value });
  const pct = (v: number): string => `${v > 0 ? '+' : ''}${fmt(v * 100)}%`;
  const FILA = 62, X0 = 250;

  /** Etiqueta + ayuda de la palanca; false si aún está bloqueada. */
  const fila = (i: number, lever: LeverKey | 'autonomia', xl = 24): boolean => {
    const y = 16 + i * FILA;
    const ok = isUnlocked(s, ctx, lever);
    c.add(vtext(scene, xl, y, t(`palanca.${lever}`), 19, { color: ok ? PAL.blanco : PAL.gris, bold: true, spacing: 1 }));
    c.add(vparrafo(scene, xl, y + 24, ok ? t(`palanca.ayuda.${lever}`) : t('palanca.bloqueada', { dia: ctx.bal.palancas.desbloqueoDia[lever] }), 13, 215, { color: PAL.gris }));
    return ok;
  };
  const yc = (i: number): number => 22 + i * FILA;

  if (fila(0, 'precios')) {
    PRICE_CATS.forEach((cat, i) => {
      const v = d.precios?.[cat] ?? 0;
      c.add(vtext(scene, X0 + i * 230, yc(0) + 4, t(`precio.${cat}`), 15, { color: PAL.gris }));
      c.add(vstepper(scene, X0 + 92 + i * 230, yc(0), pct(v), v !== 0, (dir) => set('precios', { [cat]: r2(v + dir * 0.05) }), 62));
    });
  }
  const porSector = (i: number, lever: 'metas' | 'asignacionDivisas', paso: number): void => {
    if (!fila(i, lever)) return;
    SECTOR_IDS.forEach((id, k) => {
      const v = d[lever]?.[id] ?? s.levers[lever][id];
      c.add(vtext(scene, X0 + k * 140, yc(i) + 4, id, 15, { color: PAL.gris }));
      c.add(vstepper(scene, X0 + 34 + k * 140, yc(i), fmt(v * 100), d[lever]?.[id] !== undefined && v !== s.levers[lever][id], (dir) => set(lever, { [id]: Math.max(0, r2(v + dir * paso)) }), 46));
    });
  };
  porSector(1, 'metas', 0.05);
  porSector(2, 'asignacionDivisas', 0.02);

  const segmentos = <T extends string>(i: number, xl: number, lever: 'emision' | 'fiscalizacion', ops: T[]): void => {
    if (!fila(i, lever, xl)) return;
    const actual = s.levers[lever] as T, v = (d[lever] as T | undefined) ?? actual;
    ops.forEach((o, k) => c.add(vbutton(scene, xl + 226 + k * 74, yc(i), 70, 28, t(`valor.${o}`), () => set(lever, o), { bg: o === v ? (o === actual ? PAL.verde_osc : PAL.naranjo) : PAL.carbon, fg: o === v && o !== actual ? PAL.negro : PAL.crema, size: 14 })));
  };
  segmentos(3, 24, 'emision', EMISION);
  segmentos(3, 490, 'fiscalizacion', FISC);

  const unico = (i: number, xl: number, lever: 'shareExportCobre' | 'reajusteSalarial', paso: number): void => {
    if (!fila(i, lever, xl)) return;
    const v = d[lever] ?? s.levers[lever];
    c.add(vstepper(scene, xl + 226, yc(i), `${fmt(v * 100)}%`, v !== s.levers[lever], (dir) => set(lever, r2(v + dir * paso)), 70));
  };
  unico(4, 24, 'shareExportCobre', 0.1);
  unico(4, 490, 'reajusteSalarial', 0.05);

  if (fila(5, 'zonasPrioritarias')) {
    const sel = d.zonasPrioritarias ?? s.levers.zonasPrioritarias;
    ZONE_IDS.forEach((z, k) => {
      const on = sel.includes(z);
      c.add(vbutton(scene, X0 + k * 86, yc(5), 82, 28, z, () => set('zonasPrioritarias', on ? sel.filter((q) => q !== z) : [...sel, z]), { bg: on ? PAL.naranjo : PAL.carbon, fg: on ? PAL.negro : PAL.crema, size: 15 }));
    });
  }

  // Pie: costo del borrador, cambios en camino y botones.
  const g = scene.add.graphics();
  g.lineStyle(2, PAL.carbon);
  g.lineBetween(20, 396, FW - 20, 396);
  c.add(g);
  const cost = executeCost(s, ctx);
  const pendientes = s.pendingEffects.filter((p) => p.origen === 'JUGADOR').flatMap((p) =>
    p.effects.filter((e) => e.op === 'set' && e.path.startsWith('levers.')).map((e) => `${t(`palanca.${(e as { path: string }).path.slice(7)}`)} (${t('reloj.dia', { dia: p.dueDay })})`));
  const inv = d.inversiones?.length ? t('consola.inversiones', { lista: d.inversiones.join(', ') }) : '';
  c.add(vtext(scene, 24, 408, cost.cambios.length > 0 ? t('consola.borrador', { n: cost.cambios.length, min: cost.minutos, cap: fmt(cost.capitalPolitico, 1), div: fmt(cost.divisas, 1) }) : t('consola.sinCambios'), 18, { color: cost.cambios.length > 0 ? PAL.naranjo : PAL.gris }));
  if (inv) c.add(vtext(scene, 24, 434, inv, 14, { color: PAL.naranjo }));
  c.add(vparrafo(scene, 24, 456, pendientes.length > 0 ? t('consola.enCamino', { lista: pendientes.join(' · ') }) : t('consola.nadaEnCamino'), 14, FW - 48, { color: PAL.gris }));
  c.add(vtext(scene, 24, 500, t('consola.capital', { cap: fmt(s.player.capitalPolitico), conf: fmt(s.player.confianza) }), 16, { color: PAL.crema }));
  c.add(vbutton(scene, 24, 536, 240, 46, t('consola.ejecutar'), () => void ses.dispatch({ t: 'EXECUTE_LEVERS' }), { bg: PAL.naranjo, fg: PAL.negro, size: 22, enabled: cost.cambios.length > 0 }));
  c.add(vbutton(scene, 280, 536, 150, 46, t('consola.limpiar'), () => void ses.dispatch({ t: 'CLEAR_DRAFT' }), { size: 18, enabled: Object.keys(d).length > 0 }));
  c.add(vbutton(scene, 446, 536, 280, 46, t('consola.simular'), () => x.abrir({ tipo: 'checo' }), { bg: PAL.azul, size: 18, enabled: pantallaDesbloqueada(s, ctx, 'checo') }));
}

function algedonico(x: FichaCtx): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  const ocupados = s.algedonic.filter((a) => a.atendida).length;
  c.add(vtext(scene, 24, 14, t('ficha.algedonico.atencion', { n: ocupados, max: s.player.slotsAtencion }), 17, { color: PAL.gris }));
  if (s.algedonic.length === 0) {
    c.add(vtext(scene, 24, 60, t('ficha.algedonico.vacio'), 20, { color: PAL.verde_crt }));
    return;
  }
  const orden = [...s.algedonic].sort((a, b) => Number(a.atendida) - Number(b.atendida) || a.venceEnMin - b.venceEnMin);
  const g = scene.add.graphics();
  c.add(g);
  let y = 48;
  for (const sig of orden.slice(0, 3)) {
    const alto = sig.atendida ? 74 : 60 + sig.opciones.length * 34;
    g.fillStyle(sig.atendida ? PAL.carbon : PAL.rojo);
    g.fillRect(20, y, FW - 40, 30);
    g.lineStyle(2, sig.atendida ? PAL.carbon : PAL.rojo);
    g.strokeRect(20, y, FW - 40, alto);
    c.add(vtext(scene, 30, y + 5, `ALG-${sig.nivel} · ${sig.causa}`, 17, { color: PAL.blanco, bold: true }));
    if (sig.atendida) {
      const op = sig.opciones.find((o) => o.id === sig.opcionId)!;
      c.add(vtext(scene, 30, y + 42, t('ficha.algedonico.atendiendo', { min: Math.ceil(sig.resuelveEnMin ?? 0), opcion: op.texto }), 16, { color: PAL.crema }));
    } else {
      const frac = sig.venceEnMin / ctx.bal.algedonico.venceMin[sig.nivel];
      g.fillStyle(PAL.carbon);
      g.fillRect(30, y + 40, 300, 8);
      g.fillStyle(PAL.mostaza);
      g.fillRect(30, y + 40, 300 * Phaser.Math.Clamp(frac, 0, 1), 8);
      c.add(vtext(scene, 340, y + 34, t(sig.nivel < 3 ? 'ficha.algedonico.vence' : 'ficha.algedonico.expira', { min: Math.ceil(sig.venceEnMin) }), 15, { color: PAL.mostaza }));
      sig.opciones.forEach((op, k) => {
        const costo = op.costo?.divisas ? ` · ${fmt(op.costo.divisas, 1)} MUSD` : op.costo?.capitalPolitico ? ` · ${t('comun.capital')} ${op.costo.capitalPolitico}` : '';
        c.add(vbutton(scene, 30, y + 56 + k * 34, FW - 60, 30, `${op.texto}${costo} · ${op.duraMin} min`, () => void ses.dispatch({ t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: op.id }), { size: 15 }));
      });
    }
    y += alto + 12;
  }
  if (orden.length > 3) c.add(vtext(scene, 24, FH - 30, t('comun.mas', { n: orden.length - 3 }), 15, { color: PAL.gris }));
}

function checo(x: FichaCtx): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  if (!pantallaDesbloqueada(s, ctx, 'checo')) {
    c.add(vtext(scene, 24, 30, t('panel.bloqueado', { dia: ctx.bal.pantallas.desbloqueoDia.checo }), 20, { color: PAL.gris }));
    return;
  }
  const libres = s.player.ciclosComputo - s.player.ciclosUsados;
  const costo = ctx.bal.checo.costoHoras;
  c.add(vparrafo(scene, 24, 12, t('ficha.checo.ayuda', { n: libres, max: s.player.ciclosComputo }), 15, 560, { color: PAL.gris }));
  ([7, 30] as const).forEach((h, i) => c.add(vbutton(scene, 610 + i * 166, 14, 158, 40, t('ficha.checo.correr', { dias: h, horas: costo[h] }), () => void ses.dispatch({ t: 'RUN_CHECO', horizonDays: h }), { bg: PAL.azul, size: 15, enabled: libres > 0 })));
  const run = s.checo[s.checo.length - 1];
  if (!run) {
    c.add(vtext(scene, 24, 110, t('ficha.checo.sinCorridas'), 18, { color: PAL.crema }));
    return;
  }
  const ind = x.ui.checoInd;
  INDICATOR_KEYS.forEach((k, i) => c.add(vbutton(scene, 24 + i * 132, 72, 128, 28, t(`ind.franja.${k}`), () => { x.ui.checoInd = k; x.abrir({ tipo: 'checo' }); }, { bg: k === ind ? PAL.verde_osc : PAL.carbon, size: 13 })));

  // Gráfico: línea base (gris) vs. escenario (naranjo) con abanico de error.
  const X0 = 60, X1 = 700, Y0 = 130, Y1 = 520, n = run.dias.length;
  const px = (i: number): number => X0 + (i / (n - 1)) * (X1 - X0);
  const py = (v: number): number => Y1 - (Phaser.Math.Clamp(v, 0, 100) / 100) * (Y1 - Y0);
  const g = scene.add.graphics();
  c.add(g);
  g.lineStyle(1, PAL.carbon);
  for (let v = 0; v <= 100; v += 25) {
    g.lineBetween(X0, py(v), X1, py(v));
    c.add(vtext(scene, X0 - 8, py(v), String(v), 13, { color: PAL.gris, origin: [1, 0.5] }));
  }
  const base = run.base.indicadores.map((q) => q[ind]), esc = run.escenario.indicadores.map((q) => q[ind]);
  g.fillStyle(PAL.naranjo, 0.22);
  g.fillPoints([
    ...esc.map((v, i) => new Phaser.Math.Vector2(px(i), py(v * (1 + run.bandaPct[i]!)))),
    ...esc.map((v, i) => new Phaser.Math.Vector2(px(i), py(v * (1 - run.bandaPct[i]!)))).reverse(),
  ], true);
  const linea = (xs: number[], color: number, grosor: number): void => {
    g.lineStyle(grosor, color);
    g.beginPath();
    xs.forEach((v, i) => (i === 0 ? g.moveTo(px(i), py(v)) : g.lineTo(px(i), py(v))));
    g.strokePath();
  };
  linea(base, PAL.gris, 2);
  linea(esc, PAL.naranjo, 4);
  c.add(vtext(scene, X0, Y1 + 8, t('reloj.dia', { dia: run.dias[0]! }), 13, { color: PAL.gris }));
  c.add(vtext(scene, X1, Y1 + 8, t('reloj.dia', { dia: run.dias[n - 1]! }), 13, { color: PAL.gris, origin: [1, 0] }));

  const k = n - 1, dif = esc[k]! - base[k]!;
  const col = 730;
  c.add(vtext(scene, col, 130, t(`ind.${ind}`).toUpperCase(), 16, { color: PAL.gris, spacing: 1 }));
  c.add(vtext(scene, col, 162, t('ficha.checo.base'), 14, { color: PAL.gris }));
  c.add(vtext(scene, col, 178, fmt(base[k]!), 40, { color: PAL.gris, bold: true }));
  c.add(vtext(scene, col, 236, t('ficha.checo.escenario'), 14, { color: PAL.naranjo }));
  c.add(vtext(scene, col, 252, fmt(esc[k]!), 40, { color: PAL.naranjo, bold: true }));
  c.add(vtext(scene, col, 312, `${dif >= 0 ? '+' : ''}${fmt(dif, 1)}`, 26, { color: Math.abs(dif) < 0.5 ? PAL.gris : dif > 0 ? PAL.verde_crt : PAL.rojo, bold: true }));
  c.add(vparrafo(scene, col, 360, t('ficha.checo.nota', { banda: fmt(run.bandaPct[k]! * 100), dia: run.dia }), 14, 210, { color: PAL.gris }));
  c.add(vparrafo(scene, col, 450, t(run.adoptado ? 'ficha.checo.adoptado' : 'ficha.checo.noAdoptado'), 14, 210, { color: run.adoptado ? PAL.verde_crt : PAL.mostaza }));
  c.add(vbutton(scene, col, 536, 206, 46, t('ficha.checo.irConsola'), () => x.abrir({ tipo: 'consola' }), { size: 16 }));
}

function stride(x: FichaCtx): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  if (s.history.length === 0) {
    c.add(vtext(scene, 24, 30, t('ficha.stride.sinDatos'), 20, { color: PAL.gris }));
    return;
  }
  c.add(vtext(scene, 24, 14, t('ficha.stride.cabecera', { dia: s.day - 1, n: s.alerts.length }), 17, { color: PAL.gris }));
  if (s.alerts.length === 0) c.add(vtext(scene, 24, 60, t('ficha.stride.sinAlertas'), 20, { color: PAL.verde_crt }));
  const orden = [...s.alerts].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'DESVIO' ? -1 : 1));
  const g = scene.add.graphics();
  c.add(g);
  orden.slice(0, 14).forEach((a, i) => {
    const y = 52 + i * 36;
    const color = a.tipo === 'DESVIO' ? PAL.mostaza : PAL.verde_crt;
    const sube = a.direccion === 'SUBE';
    g.fillStyle(color);
    g.fillTriangle(34, y + (sube ? 22 : 6), 54, y + (sube ? 22 : 6), 44, y + (sube ? 6 : 22));
    c.add(vtext(scene, 70, y + 4, t(`alerta.${a.tipo}`), 15, { color, bold: true }));
    c.add(vtext(scene, 170, y + 2, nombreSerie(ctx, s, a.serie), 18, { color: PAL.blanco }));
    c.add(vtext(scene, FW - 30, y + 2, fmt(a.valor, 1), 18, { color, origin: [1, 0] }));
    g.lineStyle(1, PAL.carbon);
    g.lineBetween(24, y + 32, FW - 24, y + 32);
  });
  if (orden.length > 14) c.add(vtext(scene, 24, FH - 30, t('comun.mas', { n: orden.length - 14 }), 15, { color: PAL.gris }));
}

function sector(x: FichaCtx, id: SectorId): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  const st = estadoSector(s, ctx, id);
  const prod = report(s, ctx, `sector:${id}`, 'produccion');
  const valores: Record<string, string> = {
    produccion: `${fmt(report(s, ctx, `sector:${id}`, 'utilizacion').valor * 100)} %`,
    insumos: t('ficha.sector.dias', { n: fmt(report(s, ctx, `sector:${id}`, 'insumosDias').valor, 1) }),
    moral: fmt(report(s, ctx, `sector:${id}`, 'moral').valor),
    datos: prod.edadDias > 0 ? t('dato.edad', { n: prod.edadDias }) : t('ficha.sector.alDia', { ruido: fmt(prod.ruidoPct * 100) }),
    senal: String(s.algedonic.filter((a) => a.origen.id === id || s.firms[a.origen.id]?.sector === id).length),
  };
  const g = scene.add.graphics();
  c.add(g);
  CLAVES_ESTADO.forEach((k, i) => {
    const n = st[k], color = n === 2 ? PAL.rojo : n === 1 ? PAL.mostaza : PAL.crema;
    const cx = 80 + i * 186;
    simbolo(g, SIMBOLOS[i]!, cx, 56, 26, color, n > 0);
    c.add(vtext(scene, cx, 96, t(`ficha.sector.${k}`), 14, { color: PAL.gris, origin: [0.5, 0], spacing: 1 }));
    c.add(vtext(scene, cx, 114, valores[k]!, 22, { color, bold: true, origin: [0.5, 0] }));
  });

  // Autonomía (GDD 3.1).
  const okAut = isUnlocked(s, ctx, 'autonomia');
  c.add(vtext(scene, 24, 168, t('palanca.autonomia'), 18, { color: okAut ? PAL.blanco : PAL.gris, bold: true, spacing: 1 }));
  c.add(vparrafo(scene, 24, 192, okAut ? t(`autonomia.ayuda.${s.sectors[id].autonomia}`) : t('palanca.bloqueada', { dia: ctx.bal.palancas.desbloqueoDia.autonomia }), 13, 420, { color: PAL.gris }));
  if (okAut) {
    AUTONOMIA.forEach((a, k) => c.add(vbutton(scene, 470 + k * 156, 170, 150, 34, t(`autonomia.${a}`), () => void ses.dispatch({ t: 'SET_AUTONOMY', nodeId: `sector:${id}`, value: a }), { bg: a === s.sectors[id].autonomia ? PAL.verde_osc : PAL.carbon, size: 15 })));
  }

  // Ramas: dato reportado, investigar (S3*) e invertir.
  g.lineStyle(2, PAL.carbon);
  g.lineBetween(20, 240, FW - 20, 240);
  c.add(vtext(scene, 24, 250, t('ficha.sector.ramas'), 15, { color: PAL.gris, spacing: 2 }));
  const okInv = isUnlocked(s, ctx, 'inversiones');
  const draftInv = s.draftLevers.inversiones ?? [];
  ctx.sec[id].ramas.forEach((r, i) => {
    const y = 280 + i * 62, key = `${id}.${r.id}`, node = `rama:${key}`;
    const lect = report(s, ctx, node, 'produccion');
    const firmas = Object.values(s.firms).filter((f) => f.sector === id && f.rama === r.id);
    const cap = firmas.reduce((a, f) => a + f.capacidad, 0);
    c.add(vtext(scene, 24, y, r.nombre.toUpperCase(), 20, { color: PAL.blanco, bold: true }));
    c.add(vtext(scene, 24, y + 26, firmas.map((f) => f.nombre).join(' · '), 12, { color: PAL.gris }));
    g.fillStyle(PAL.carbon);
    g.fillRect(330, y + 6, 160, 12);
    g.fillStyle(lect.fuente === 'INVESTIGADO' ? PAL.blanco : PAL.verde_crt);
    g.fillRect(330, y + 6, 160 * Phaser.Math.Clamp(cap > 0 ? lect.valor / cap : 0, 0, 1), 12);
    c.add(vtext(scene, 500, y, fmt(lect.valor, 1), 20, { color: lect.fuente === 'INVESTIGADO' ? PAL.blanco : PAL.verde_crt }));
    c.add(vtext(scene, 330, y + 24, t(lect.fuente === 'INVESTIGADO' ? 'ficha.sector.real' : 'ficha.sector.reportado'), 12, { color: PAL.gris }));
    c.add(vbutton(scene, 590, y, 170, 34, t('ficha.investigar', { min: ctx.bal.observacion.investigarMin }), () => void ses.dispatch({ t: 'INVESTIGATE', nodeId: node }), { size: 14, enabled: !investigado(s, node) }));
    const enBorrador = draftInv.includes(key);
    c.add(vbutton(scene, 770, y, 166, 34, t(enBorrador ? 'ficha.sector.invertido' : 'ficha.sector.invertir'), () => void ses.dispatch({ t: 'SET_DRAFT_LEVER', lever: 'inversiones', value: enBorrador ? draftInv.filter((q) => q !== key) : [...draftInv, key] }), { size: 14, enabled: okInv, bg: enBorrador ? PAL.naranjo : PAL.carbon, fg: enBorrador ? PAL.negro : PAL.crema }));
  });
  c.add(vparrafo(scene, 24, FH - 44, t(okInv ? 'ficha.sector.pieInversion' : 'ficha.sector.pieBloqueada', { dia: ctx.bal.palancas.desbloqueoDia.inversiones }), 13, FW - 48, { color: PAL.gris }));
}

function zona(x: FichaCtx, id: ZoneId): void {
  const { scene, c, ses } = x;
  const { state: s, ctx } = ses;
  const node = `zone:${id}`;
  const hay = zonasCyberfolk(s, ctx).includes(id);
  const abast = report(s, ctx, node, 'abastecimiento');
  const g = scene.add.graphics();
  c.add(g);
  const medidor = (cx: number, valor: number | undefined, clave: string, real: boolean): void => {
    g.lineStyle(16, PAL.carbon);
    g.beginPath();
    g.arc(cx, 190, 110, Math.PI, 2 * Math.PI);
    g.strokePath();
    c.add(vtext(scene, cx, 210, t(clave), 16, { color: PAL.gris, origin: [0.5, 0], spacing: 2 }));
    if (valor === undefined) {
      c.add(vtext(scene, cx, 140, t('ficha.zona.sinMedidor', { dia: ctx.bal.pantallas.desbloqueoDia.cyberfolk }), 15, { color: PAL.gris, origin: [0.5, 0.5] }));
      return;
    }
    g.lineStyle(16, semaforo(valor));
    g.beginPath();
    g.arc(cx, 190, 110, Math.PI, Math.PI * (1 + valor / 100));
    g.strokePath();
    const a = Math.PI * (1 + valor / 100);
    g.lineStyle(4, PAL.blanco);
    g.lineBetween(cx, 190, cx + 92 * Math.cos(a), 190 + 92 * Math.sin(a));
    c.add(vtext(scene, cx, 150, fmt(valor), 44, { color: semaforo(valor), bold: true, origin: [0.5, 0.5] }));
    c.add(vtext(scene, cx, 232, t(real ? 'ficha.sector.real' : 'ficha.sector.reportado'), 12, { color: PAL.gris, origin: [0.5, 0] }));
  };
  const animo = hay ? report(s, ctx, node, 'animo') : undefined;
  medidor(250, animo?.valor, 'ind.animo', animo?.fuente === 'INVESTIGADO');
  medidor(710, abast.valor, 'ind.abastecimiento', abast.fuente === 'INVESTIGADO');

  c.add(vtext(scene, 24, 290, ctx.zone[id].lugares.join(' · '), 16, { color: PAL.crema }));
  const firmas = Object.values(s.firms).filter((f) => f.zona === id);
  c.add(vparrafo(scene, 24, 318, t('ficha.zona.empresas', { lista: firmas.map((f) => f.nombre).join(' · ') || '—' }), 13, FW - 48, { color: PAL.gris }));
  const senales = s.algedonic.filter((a) => a.origen.id === id || s.firms[a.origen.id]?.zona === id);
  senales.slice(0, 3).forEach((a, i) => c.add(vtext(scene, 24, 372 + i * 26, `ALG-${a.nivel} · ${a.causa}`, 16, { color: a.atendida ? PAL.gris : PAL.rojo })));
  if (senales.length > 0) c.add(vbutton(scene, 690, 370, 246, 36, t('ficha.zona.verSenales'), () => x.abrir({ tipo: 'algedonico' }), { bg: PAL.rojo, size: 15 }));

  c.add(vbutton(scene, 24, 536, 250, 46, t('ficha.investigar', { min: ctx.bal.observacion.investigarMin }), () => void ses.dispatch({ t: 'INVESTIGATE', nodeId: node }), { size: 16, enabled: !investigado(s, node) }));
  const okPrio = isUnlocked(s, ctx, 'zonasPrioritarias');
  const sel = s.draftLevers.zonasPrioritarias ?? s.levers.zonasPrioritarias;
  const on = sel.includes(id);
  c.add(vbutton(scene, 290, 536, 330, 46, t(on ? 'ficha.zona.quitarPrioridad' : 'ficha.zona.prioridad'), () => void ses.dispatch({ t: 'SET_DRAFT_LEVER', lever: 'zonasPrioritarias', value: on ? sel.filter((q) => q !== id) : [...sel, id] }), { size: 16, enabled: okPrio, bg: on ? PAL.naranjo : PAL.carbon, fg: on ? PAL.negro : PAL.crema }));
  c.add(vparrafo(scene, 636, 536, t(okPrio ? 'ficha.zona.piePrioridad' : 'palanca.bloqueada', { dia: ctx.bal.palancas.desbloqueoDia.zonasPrioritarias }), 13, 300, { color: PAL.gris }));
}

export function dibujarFicha(f: FichaId, x: FichaCtx): void {
  switch (f.tipo) {
    case 'consola': return consola(x);
    case 'algedonico': return algedonico(x);
    case 'checo': return checo(x);
    case 'stride': return stride(x);
    case 'sector': return sector(x, f.id);
    case 'zona': return zona(x, f.id);
  }
}
