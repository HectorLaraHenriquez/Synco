import Phaser from 'phaser';
import { app, session, W } from '../game/app';
import type { Session } from '../game/session';
import { reportIndicators } from '../sim/observe';
import { INDICATOR_KEYS } from '../sim/state';
import { LeverConsole } from '../ui/console/LeverConsole';
import { t } from '../ui/i18n';
import { hora } from '../ui/labels';
import { PAL, semaforo } from '../ui/palette';
import { AlgedonicPanel } from '../ui/panels/AlgedonicPanel';
import { ChecoPanel } from '../ui/panels/ChecoPanel';
import { CyberfolkPanel } from '../ui/panels/CyberfolkPanel';
import { CyberstridePanel } from '../ui/panels/CyberstridePanel';
import { DatafeedPanel } from '../ui/panels/DatafeedPanel';
import { NetworkPanel } from '../ui/panels/NetworkPanel';
import { PANEL_H, PANEL_W, fmt, type Panel } from '../ui/panels/Panel';
import { txt } from '../ui/text';
import { bar } from '../ui/widgets/Bar';
import { Button } from '../ui/widgets/Button';

const STRIP_H = 24;
const VIEW_H = 176;
const PANEL_X = (W - PANEL_W) / 2;
const PANEL_Y = STRIP_H + (VIEW_H - PANEL_H) / 2;
const CONSOLE_Y = STRIP_H + VIEW_H;
const PAN_MS = 200;
const ICONOS = ['■', '▶', '±', '○', '#', '●', '▲'];

/** Pantalla principal: franja de indicadores, panel activo, consola. */
export class OpsroomScene extends Phaser.Scene {
  private ses!: Session;
  private panels: Panel[] = [];
  private active = 0;
  private dirty = true;
  private strip!: Phaser.GameObjects.Container;
  private chrome!: Phaser.GameObjects.Container;
  private levers!: LeverConsole;
  private unsubscribe?: () => void;

  constructor() {
    super('Opsroom');
  }

  create(): void {
    this.ses = session();
    this.active = 0;
    this.cameras.main.setBackgroundColor(PAL.negro);

    // Sala: pared de madera y paneles vecinos en escorzo.
    this.add.rectangle(0, STRIP_H, W, VIEW_H, PAL.cafe).setOrigin(0);
    this.add.rectangle(0, STRIP_H + VIEW_H - 10, W, 10, PAL.carbon).setOrigin(0);
    this.add.rectangle(0, CONSOLE_Y, W, 70, PAL.carbon).setOrigin(0).setStrokeStyle(1, PAL.negro);
    this.add.rectangle(0, CONSOLE_Y, W, 2, PAL.naranjo).setOrigin(0);

    this.panels = [
      new DatafeedPanel(this, this.ses), new CyberstridePanel(this, this.ses), new ChecoPanel(this, this.ses),
      new AlgedonicPanel(this, this.ses), new CyberfolkPanel(this, this.ses), new NetworkPanel(this, this.ses),
    ];
    this.panels.forEach((p, i) => p.setPosition(PANEL_X, PANEL_Y).setVisible(i === this.active));

    this.strip = this.add.container(0, 0);
    this.chrome = this.add.container(0, 0);
    this.levers = new LeverConsole(this, 58, CONSOLE_Y + 5, this.ses);

    const kb = this.input.keyboard!;
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.show(i)));
    kb.on('keydown-SPACE', () => this.ses.togglePause());
    kb.on('keydown-ENTER', () => this.ses.dispatch({ t: 'EXECUTE_LEVERS' }));
    kb.on('keydown-ESC', () => this.scene.start('Menu'));

    this.unsubscribe = this.ses.onChange(() => { this.dirty = true; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    this.dirty = true;
  }

  /** Gira hacia otro panel (paneo de 200 ms). */
  private show(i: number): void {
    if (i === this.active) return;
    const dir = i > this.active ? 1 : -1;
    const prev = this.panels[this.active]!;
    const next = this.panels[i]!;
    this.active = i;
    this.tweens.killTweensOf([prev, next]);
    this.panels.forEach((p) => { if (p !== prev && p !== next) p.setVisible(false); });
    this.tweens.add({ targets: prev, x: PANEL_X - dir * 60, alpha: 0, duration: PAN_MS, onComplete: () => prev.setVisible(false) });
    next.setVisible(true).setAlpha(0).setX(PANEL_X + dir * 60);
    next.refresh();
    this.tweens.add({ targets: next, x: PANEL_X, alpha: 1, duration: PAN_MS });
    this.dirty = true;
  }

  private drawStrip(): void {
    const s = this.ses.state;
    this.strip.removeAll(true);
    this.strip.add(this.add.rectangle(0, 0, W, STRIP_H, PAL.negro).setOrigin(0));
    const ind = reportIndicators(s, this.ses.ctx);
    INDICATOR_KEYS.forEach((k, i) => {
      const x = 3 + i * 55;
      const v = ind[k].valor;
      this.strip.add(txt(this, x, 3, `${ICONOS[i]}${t(`ind.corto.${k}`)}`, PAL.crema));
      this.strip.add(txt(this, x + 34, 3, fmt(v).padStart(3), semaforo(v)));
      this.strip.add(bar(this, x, 14, 51, 5, v, semaforo(v), PAL.carbon));
    });
    this.strip.add(txt(this, 392, 3, t('reloj.dia', { dia: s.day }), PAL.crema));
    this.strip.add(txt(this, 392, 13, hora(s.hour), PAL.verde_crt));
    if (this.ses.paused) this.strip.add(txt(this, 428, 13, t('reloj.pausa'), PAL.naranjo));
    else if (this.ses.speed !== 1) this.strip.add(txt(this, 428, 13, `×${this.ses.speed}`, PAL.gris));
  }

  private drawChrome(): void {
    const s = this.ses.state;
    const c = this.chrome;
    c.removeAll(true);
    // Paneles vecinos (escorzo) a izquierda y derecha.
    const vecino = (i: number, x: number): void => {
      if (i < 0 || i >= this.panels.length) return;
      c.add(this.add.rectangle(x, PANEL_Y + 14, 44, PANEL_H - 28, PAL.verde_osc).setOrigin(0).setStrokeStyle(2, PAL.carbon));
      c.add(txt(this, x + 4, PANEL_Y + 20, String(i + 1), PAL.verde_crt, 2));
      c.add(txt(this, x + 4, PANEL_Y + 40, t(`panel.${this.panels[i]!.id}.corto`), PAL.verde_crt));
    };
    vecino(this.active - 1, 8);
    vecino(this.active + 1, W - 52);

    // Bandeja de télex (H5).
    c.add(this.add.rectangle(6, CONSOLE_Y + 8, 44, 40, PAL.crema).setOrigin(0).setStrokeStyle(1, PAL.negro));
    c.add(txt(this, 10, CONSOLE_Y + 12, t('telex.titulo'), PAL.negro));
    c.add(txt(this, 10, CONSOLE_Y + 24, String(s.telexQueue.length).padStart(2, '0'), PAL.negro, 2));
    c.add(txt(this, 6, CONSOLE_Y + 54, t('telex.tecla'), PAL.gris));

    // Botones de panel 1–6 y luz algedónica.
    this.panels.forEach((p, i) => {
      const bx = 388 + (i % 3) * 30, by = CONSOLE_Y + 6 + Math.floor(i / 3) * 16;
      c.add(new Button(this, bx, by, String(i + 1), () => this.show(i), { w: 27, h: 14, bg: i === this.active ? PAL.naranjo : PAL.negro, fg: i === this.active ? PAL.negro : PAL.crema }));
    });
    const activas = s.algedonic.filter((a) => !a.atendida).length;
    const luz = this.add.circle(400, CONSOLE_Y + 52, 8, activas > 0 ? PAL.rojo : PAL.negro).setStrokeStyle(1, PAL.negro);
    luz.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.show(3));
    c.add(luz);
    c.add(txt(this, 414, CONSOLE_Y + 44, t('consola.algedonico'), activas > 0 ? PAL.rojo : PAL.gris));
    c.add(txt(this, 414, CONSOLE_Y + 54, t('consola.senales', { n: s.algedonic.length }), activas > 0 ? PAL.crema : PAL.gris));
  }

  override update(_time: number, delta: number): void {
    this.ses.speed = app.speed;
    this.ses.advanceReal(delta);
    if (this.ses.dayOver) {
      app.lastClose = this.ses.closeDay();
      this.scene.start('DayReport');
      return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.drawStrip();
    this.drawChrome();
    this.panels[this.active]!.refresh();
    this.levers.refresh();
  }
}
