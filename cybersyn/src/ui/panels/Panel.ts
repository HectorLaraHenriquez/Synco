import Phaser from 'phaser';
import type { Session } from '../../game/session';
import { wrap } from '../glyphs';
import { t } from '../i18n';
import { PAL } from '../palette';
import { txt } from '../text';

export const PANEL_W = 360;
export const PANEL_H = 150;
export const COLS = 58;
const LEFT = 6;
const TOP = 16;
const ROW_H = 9;

/** Pantalla de la Opsroom. `draw()` se vuelve a ejecutar cada vez que cambia el estado. */
export abstract class Panel extends Phaser.GameObjects.Container {
  abstract readonly id: string;
  protected content: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, protected session: Session) {
    super(scene, 0, 0);
    const marco = scene.add.rectangle(0, 0, PANEL_W, PANEL_H, PAL.verde_osc).setOrigin(0).setStrokeStyle(2, PAL.carbon);
    const barra = scene.add.rectangle(1, 1, PANEL_W - 2, 11, PAL.negro).setOrigin(0);
    this.content = scene.add.container(0, 0);
    this.add([marco, barra, this.content]);
    scene.add.existing(this);
  }

  refresh(): void {
    this.content.removeAll(true);
    this.put(txt(this.scene, LEFT, 3, t(`panel.${this.id}.titulo`), PAL.verde_crt));
    this.draw();
  }

  protected abstract draw(): void;

  protected put<T extends Phaser.GameObjects.GameObject>(...objs: T[]): T {
    this.content.add(objs);
    return objs[0]!;
  }
  protected cx(col: number): number {
    return LEFT + col * 6;
  }
  protected ry(row: number): number {
    return TOP + row * ROW_H;
  }
  /** Escribe en la grilla de texto (58 × 15). Devuelve la fila siguiente. */
  protected line(col: number, row: number, s: string, color: number = PAL.verde_crt): number {
    const lines = wrap(s, COLS - col);
    lines.forEach((l, i) => this.put(txt(this.scene, this.cx(col), this.ry(row + i), l, color)));
    return row + lines.length;
  }
}

export const fmt = (v: number, d = 0): string => v.toFixed(d).replace('.', ',');
export const pad = (s: string | number, n: number): string => String(s).padStart(n);
