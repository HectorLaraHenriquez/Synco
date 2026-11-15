import Phaser from 'phaser';
import type { Session } from '../../game/session';
import { pantallaDesbloqueada, visibleSeries } from '../../sim/observe';
import { t } from '../i18n';
import { PAL } from '../palette';
import { vtext } from '../vector';

type C = Phaser.GameObjects.Container;

/** Los tres monitores bajo la pantalla central: Cyberstride, Checo y luz algedónica. */
export class Monitors {
  private g: Phaser.GameObjects.Graphics[];
  private txt: Phaser.GameObjects.Text[];

  constructor(private scene: Phaser.Scene, private parents: [C, C, C], private session: Session, private w: number, private h: number) {
    this.g = parents.map((p) => { const g = scene.add.graphics(); p.add(g); return g; });
    this.txt = parents.map((p, i) => {
      const tx = vtext(scene, 14, 10, '', 13, { color: i === 1 ? PAL.crema : PAL.verde_crt, spacing: 1 });
      p.add(tx);
      return tx;
    });
  }

  private linea(g: Phaser.GameObjects.Graphics, xs: number[], n: number, color: number, grosor = 2): void {
    if (xs.length < 2) return;
    const x = (i: number): number => 14 + (i / Math.max(1, n - 1)) * (this.w - 28);
    const y = (v: number): number => this.h - 14 - (Phaser.Math.Clamp(v, 0, 100) / 100) * (this.h - 50);
    g.lineStyle(grosor, color);
    g.beginPath();
    xs.forEach((v, i) => (i === 0 ? g.moveTo(x(i), y(v)) : g.lineTo(x(i), y(v))));
    g.strokePath();
  }

  refresh(parpadeo: boolean): void {
    const { state: s, ctx } = this.session;
    const [g1, g2, g3] = this.g as [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
    const dias = Math.max(10, s.history.length); // la escala crece con la campaña

    // 1) Cyberstride: producción y abastecimiento reportados, día a día.
    g1.clear();
    g1.lineStyle(1, PAL.verde_osc);
    for (let k = 1; k < 4; k++) g1.lineBetween(14, 36 + k * ((this.h - 50) / 4), this.w - 14, 36 + k * ((this.h - 50) / 4));
    this.linea(g1, visibleSeries(s, ctx, 'pais', 'produccion'), dias, PAL.crema);
    this.linea(g1, visibleSeries(s, ctx, 'pais', 'abastecimiento'), dias, PAL.verde_crt, 3);
    this.txt[0]!.setText(t('sala.monitor.alertas', { n: s.alerts.length }));

    // 2) Checo: línea base vs. escenario.
    g2.clear();
    const run = s.checo[s.checo.length - 1];
    if (!pantallaDesbloqueada(s, ctx, 'checo')) this.txt[1]!.setText(t('sala.monitor.checoBloqueado', { dia: ctx.bal.pantallas.desbloqueoDia.checo }));
    else if (!run) this.txt[1]!.setText(t('sala.monitor.checoVacio'));
    else {
      this.txt[1]!.setText(t('sala.monitor.checo', { dias: run.horizonte }));
      const n = run.dias.length;
      this.linea(g2, run.base.indicadores.map((i) => i.abastecimiento), n, PAL.gris);
      this.linea(g2, run.escenario.indicadores.map((i) => i.abastecimiento), n, PAL.naranjo, 3);
    }

    // 3) Algedónico: la luz roja de la silla.
    g3.clear();
    const libres = s.algedonic.filter((a) => !a.atendida);
    const cx = this.w / 2, cy = this.h / 2 + 12;
    g3.fillStyle(PAL.carbon);
    g3.fillCircle(cx, cy, 40);
    g3.fillStyle(libres.length > 0 ? (parpadeo ? PAL.rojo : PAL.carbon) : PAL.negro);
    g3.fillCircle(cx, cy, 32);
    if (libres.length > 0) {
      const urgente = libres.reduce((a, b) => (a.venceEnMin < b.venceEnMin ? a : b));
      const frac = urgente.venceEnMin / ctx.bal.algedonico.venceMin[urgente.nivel];
      g3.lineStyle(5, PAL.mostaza);
      g3.beginPath();
      g3.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac);
      g3.strokePath();
    }
    this.txt[2]!.setText(t('sala.monitor.senales', { n: s.algedonic.length })).setColor(libres.length > 0 ? '#' + PAL.rojo.toString(16) : '#' + PAL.gris.toString(16));
  }
}
