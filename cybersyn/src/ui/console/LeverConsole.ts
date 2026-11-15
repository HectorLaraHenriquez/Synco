import Phaser from 'phaser';
import { SECTOR_IDS, type LeverKey } from '../../data/schemas';
import type { Session } from '../../game/session';
import { executeCost, isUnlocked } from '../../sim/levers';
import { PRICE_CATS, type Emision, type Fiscalizacion, type PriceCat, type SectorId } from '../../sim/state';
import { t } from '../i18n';
import { PAL } from '../palette';
import { txt } from '../text';
import { Button } from '../widgets/Button';
import { fmt } from '../panels/Panel';

const EMISION: Emision[] = ['BAJO', 'MEDIO', 'ALTO'];
const FISC: Fiscalizacion[] = ['OFF', 'RACIONAMIENTO', 'ESTRICTO'];
const ROW_H = 10;
const LABEL_W = 48;
const ERROR_MS = 4000;

/** Consola inferior: palancas en borrador y botón EJECUTAR. */
export class LeverConsole extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, private session: Session) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  private setDraft(lever: LeverKey, value: unknown): void {
    this.session.dispatch({ t: 'SET_DRAFT_LEVER', lever, value });
  }

  /** [-] valor [+] */
  private stepper(x: number, y: number, label: string, value: string, cambiado: boolean, onStep: (dir: 1 | -1) => void): void {
    const s = this.scene;
    this.add(txt(s, x, y + 1, label, PAL.gris));
    const bx = x + label.length * 6 + 1;
    this.add(new Button(s, bx, y, '-', () => onStep(-1), { w: 8, h: 9 }));
    this.add(txt(s, bx + 9, y + 1, value, cambiado ? PAL.naranjo : PAL.crema));
    this.add(new Button(s, bx + 10 + value.length * 6, y, '+', () => onStep(1), { w: 8, h: 9 }));
  }

  /** Dibuja la etiqueta de fila; devuelve false si la palanca está bloqueada. */
  private fila(row: number, lever: LeverKey): boolean {
    const { state: s, ctx } = this.session;
    const ok = isUnlocked(s, ctx, lever);
    this.add(txt(this.scene, 0, row * ROW_H + 1, t(`palanca.${lever}`), ok ? PAL.crema : PAL.gris));
    if (!ok) this.add(txt(this.scene, LABEL_W, row * ROW_H + 1, t('palanca.bloqueada', { dia: ctx.bal.palancas.desbloqueoDia[lever] }), PAL.gris));
    return ok;
  }

  refresh(): void {
    this.removeAll(true);
    const { state: s, ctx } = this.session;
    const d = s.draftLevers;
    const pct = (v: number): string => `${v > 0 ? '+' : ''}${fmt(v * 100)}%`.padStart(4);

    if (this.fila(0, 'precios')) {
      PRICE_CATS.forEach((cat: PriceCat, i) => {
        const v = d.precios?.[cat] ?? 0;
        this.stepper(LABEL_W + i * 72, 0, t(`precio.${cat}`), pct(v), v !== 0, (dir) => this.setDraft('precios', { [cat]: Math.round((v + dir * 0.05) * 100) / 100 }));
      });
    }
    if (this.fila(1, 'metas')) {
      SECTOR_IDS.forEach((id: SectorId, i) => {
        const v = d.metas?.[id] ?? s.levers.metas[id];
        this.stepper(LABEL_W + i * 55, ROW_H, id, fmt(v * 100).padStart(3), v !== s.levers.metas[id], (dir) => this.setDraft('metas', { [id]: Math.round((v + dir * 0.05) * 100) / 100 }));
      });
    }
    if (this.fila(2, 'asignacionDivisas')) {
      SECTOR_IDS.forEach((id: SectorId, i) => {
        const v = d.asignacionDivisas?.[id] ?? s.levers.asignacionDivisas[id];
        this.stepper(LABEL_W + i * 55, 2 * ROW_H, id, fmt(v * 100).padStart(3), d.asignacionDivisas?.[id] !== undefined, (dir) => this.setDraft('asignacionDivisas', { [id]: Math.max(0, Math.round((v + dir * 0.02) * 100) / 100) }));
      });
    }
    // Fila 3: emisión, fiscalización (ciclan), cobre y salario.
    const y3 = 3 * ROW_H;
    const ciclo = <T extends string>(x: number, lever: LeverKey, opciones: T[], actual: T, borrador: T | undefined): void => {
      const ok = isUnlocked(s, ctx, lever);
      this.add(txt(this.scene, x, y3 + 1, t(`palanca.${lever}`), ok ? PAL.crema : PAL.gris));
      const v = borrador ?? actual;
      const lx = x + t(`palanca.${lever}`).length * 6 + 6;
      if (!ok) { this.add(txt(this.scene, lx, y3 + 1, t('palanca.bloqueadaCorta', { dia: ctx.bal.palancas.desbloqueoDia[lever] }), PAL.gris)); return; }
      this.add(new Button(this.scene, lx, y3, t(`valor.${v}`), () => this.setDraft(lever, opciones[(opciones.indexOf(v) + 1) % opciones.length]), { w: 40, h: 9, bg: v !== actual ? PAL.naranjo : PAL.carbon }));
    };
    ciclo(0, 'emision', EMISION, s.levers.emision, d.emision);
    ciclo(92, 'fiscalizacion', FISC, s.levers.fiscalizacion, d.fiscalizacion);
    const paso = (x: number, lever: 'shareExportCobre' | 'reajusteSalarial', step: number): void => {
      const ok = isUnlocked(s, ctx, lever);
      const v = d[lever] ?? s.levers[lever];
      if (!ok) { this.add(txt(this.scene, x, y3 + 1, `${t(`palanca.${lever}`)} ${t('palanca.bloqueadaCorta', { dia: ctx.bal.palancas.desbloqueoDia[lever] })}`, PAL.gris)); return; }
      this.stepper(x, y3, t(`palanca.${lever}`), `${fmt(v * 100)}%`.padStart(4), v !== s.levers[lever], (dir) => this.setDraft(lever, Math.round((v + dir * step) * 100) / 100));
    };
    paso(184, 'shareExportCobre', 0.1);
    paso(255, 'reajusteSalarial', 0.05);

    // Fila 4: estado del borrador, error o palancas en camino.
    const cost = executeCost(s, ctx);
    const y4 = 4 * ROW_H + 1;
    const err = this.session.lastError;
    const pendientes = s.pendingEffects
      .filter((p) => p.origen === 'JUGADOR')
      .flatMap((p) => p.effects.filter((e) => e.op === 'set' && e.path.startsWith('levers.')).map((e) => `${t(`palanca.${(e as { path: string }).path.slice(7)}`)} D${p.dueDay}`));
    if (err && this.session.now - err.realMs < ERROR_MS) this.add(txt(this.scene, 0, y4, t(`error.${err.code}`), PAL.rojo));
    else if (cost.cambios.length > 0)
      this.add(txt(this.scene, 0, y4, t('consola.borrador', { n: cost.cambios.length, min: cost.minutos, cap: fmt(cost.capitalPolitico, 1) }), PAL.naranjo));
    else if (pendientes.length > 0) this.add(txt(this.scene, 0, y4, t('consola.enCamino', { lista: pendientes.join(', ') }).slice(0, 53), PAL.gris));
    else this.add(txt(this.scene, 0, y4, t('consola.sinCambios'), PAL.gris));

    const y5 = 5 * ROW_H;
    this.add(new Button(this.scene, 0, y5, t('consola.ejecutar'), () => this.session.dispatch({ t: 'EXECUTE_LEVERS' }), { w: 70, h: 11, bg: PAL.naranjo, fg: PAL.negro, enabled: cost.cambios.length > 0 }));
    this.add(new Button(this.scene, 76, y5, t('consola.limpiar'), () => this.session.dispatch({ t: 'CLEAR_DRAFT' }), { w: 58, h: 11, enabled: Object.keys(d).length > 0 }));
    this.add(txt(this.scene, 142, y5 + 2, t('consola.capital', { cap: fmt(s.player.capitalPolitico), conf: fmt(s.player.confianza) }), PAL.gris));
  }
}
