import Phaser from 'phaser';
import { app, session, VW } from '../game/app';
import { clearSave } from '../save/save';
import { INDICATOR_KEYS } from '../sim/state';
import { t } from '../ui/i18n';
import { fmt } from '../ui/labels';
import { PAL } from '../ui/palette';
import { FONT_TITULO, SIMBOLOS, simbolo, vbutton, vparrafo, vtext } from '../ui/vector';

/** Cierre: informe impreso con la variación real de los indicadores, Checo dijo/pasó y voces. */
export class DayReportScene extends Phaser.Scene {
  constructor() {
    super('DayReport');
  }
  create(): void {
    const ses = session();
    const { antes, snap } = app.lastClose!;
    this.cameras.main.setBackgroundColor(PAL.carbon);
    const X = 220, W = VW - 440;
    const g = this.add.graphics();
    g.fillStyle(PAL.crema);
    g.fillRect(X, 30, W, 750);
    g.fillStyle(PAL.naranjo);
    g.fillRect(X, 30, W, 12);
    vtext(this, X + 40, 62, t('cierre.titulo', { dia: snap.day }), 46, { color: PAL.negro, bold: true, font: FONT_TITULO, spacing: 4 });
    vtext(this, X + 40, 124, t('cierre.col.indicador'), 15, { color: PAL.cafe, spacing: 1 });
    vtext(this, X + 640, 124, t('cierre.col.ayerHoy'), 15, { color: PAL.cafe, spacing: 1 });
    vtext(this, X + 790, 124, t('cierre.col.var'), 15, { color: PAL.cafe, spacing: 1 });
    if (snap.checo) vtext(this, X + 880, 124, t('cierre.col.checo'), 15, { color: PAL.azul, spacing: 1 });

    INDICATOR_KEYS.forEach((k, i) => {
      const y = 152 + i * 40;
      const a = antes[k], b = snap.indicators[k], d = b - a;
      simbolo(g, SIMBOLOS[i % SIMBOLOS.length]!, X + 52, y + 13, 10, PAL.negro, true);
      vtext(this, X + 76, y, t(`ind.${k}`), 24, { color: PAL.negro });
      g.fillStyle(PAL.gris);
      g.fillRect(X + 370, y + 8, 240, 12);
      g.fillStyle(PAL.carbon);
      g.fillRect(X + 370, y + 8, (240 * b) / 100, 12);
      vtext(this, X + 640, y, `${fmt(a)} → ${fmt(b)}`, 24, { color: PAL.negro });
      vtext(this, X + 790, y, `${d >= 0 ? '+' : ''}${fmt(d, 1)}`, 24, { color: Math.abs(d) < 0.5 ? PAL.cafe : d > 0 ? PAL.verde_osc : PAL.rojo, bold: true });
      if (snap.checo) vtext(this, X + 880, y, fmt(snap.checo.dijo[k]), 24, { color: PAL.azul });
    });
    let y = 152 + 7 * 40 + 10;
    vtext(this, X + 40, y, t('cierre.calidad', { v: fmt(snap.calidadVida), infl: fmt(snap.inflacionMensual * 100, 1), alertas: snap.alertas.length }), 18, { color: PAL.cafe });
    y += 28;
    if (snap.checo) { vtext(this, X + 40, y, t('cierre.checoNota', { dia: snap.checo.hechoElDia }), 16, { color: PAL.azul }); y += 26; }
    y += 10;
    vtext(this, X + 40, y, t('cierre.voces'), 16, { color: PAL.cafe, spacing: 2 });
    y += 28;
    for (const v of snap.voces) {
      const p = vparrafo(this, X + 56, y, `«${v.texto}»`, 19, W - 110, { color: PAL.negro });
      g.fillStyle(v.tono === 'NEG' ? PAL.rojo : PAL.verde_osc);
      g.fillRect(X + 40, y + 2, 6, p.height - 4);
      y += p.height + 10;
    }

    const fin = ses.state.ending;
    const terminado = ses.over;
    if (terminado) {
      clearSave();
      vparrafo(this, X + 40, 668, t(fin ? `fin.${fin.id}` : 'fin.CAMPANA'), 22, 560, { color: fin ? PAL.rojo : PAL.verde_osc, bold: true });
    }
    const next = (): void => { this.scene.start(terminado ? 'Menu' : 'City'); };
    vbutton(this, X + W - 340, 708, 300, 52, t(terminado ? 'cierre.menu' : 'cierre.continuar'), next, { bg: PAL.naranjo, fg: PAL.negro, size: 22, font: FONT_TITULO });
    this.input.keyboard?.once('keydown-ENTER', next);
  }
}
