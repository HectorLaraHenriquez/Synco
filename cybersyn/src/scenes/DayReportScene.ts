import Phaser from 'phaser';
import { app, session, W } from '../game/app';
import { INDICATOR_KEYS } from '../sim/state';
import { wrap } from '../ui/glyphs';
import { t } from '../ui/i18n';
import { PAL } from '../ui/palette';
import { fmt } from '../ui/panels/Panel';
import { txt } from '../ui/text';
import { bar } from '../ui/widgets/Bar';
import { Button } from '../ui/widgets/Button';

/** Cierre: informe impreso con la variación real de los indicadores, Checo dijo/pasó y voces. */
export class DayReportScene extends Phaser.Scene {
  constructor() {
    super('DayReport');
  }
  create(): void {
    const ses = session();
    const { antes, snap } = app.lastClose!;
    this.cameras.main.setBackgroundColor(PAL.carbon);
    this.add.rectangle(20, 6, W - 40, 258, PAL.crema).setOrigin(0).setStrokeStyle(1, PAL.negro);
    this.add.rectangle(20, 6, W - 40, 4, PAL.naranjo).setOrigin(0);
    const X = 30;
    txt(this, X, 16, t('cierre.titulo', { dia: snap.day }), PAL.negro, 2);
    txt(this, X, 36, t('cierre.col.indicador'), PAL.cafe);
    txt(this, X + 238, 36, t('cierre.col.ayerHoy'), PAL.cafe);
    txt(this, X + 300, 36, t('cierre.col.var'), PAL.cafe);
    if (snap.checo) txt(this, X + 344, 36, t('cierre.col.checo'), PAL.azul);

    INDICATOR_KEYS.forEach((k, i) => {
      const y = 46 + i * 10;
      const a = antes[k], b = snap.indicators[k], d = b - a;
      txt(this, X, y, t(`ind.${k}`).padEnd(24), PAL.negro);
      bar(this, X + 150, y + 1, 80, 5, b, PAL.carbon, PAL.gris);
      txt(this, X + 238, y, `${fmt(a).padStart(3)} → ${fmt(b).padStart(3)}`, PAL.negro);
      txt(this, X + 300, y, `${d >= 0 ? '+' : ''}${fmt(d, 1)}`, Math.abs(d) < 0.5 ? PAL.cafe : d > 0 ? PAL.verde_osc : PAL.rojo);
      if (snap.checo) txt(this, X + 344, y, fmt(snap.checo.dijo[k]).padStart(4), PAL.azul);
    });
    let y = 46 + 7 * 10 + 4;
    txt(this, X, y, t('cierre.calidad', { v: fmt(snap.calidadVida), infl: fmt(snap.inflacionMensual * 100, 1), alertas: snap.alertas.length }), PAL.cafe);
    y += 10;
    if (snap.checo) { txt(this, X, y, t('cierre.checoNota', { dia: snap.checo.hechoElDia }), PAL.azul); y += 10; }

    y += 4;
    txt(this, X, y, t('cierre.voces'), PAL.cafe);
    y += 10;
    for (const v of snap.voces) {
      for (const linea of wrap(`«${v.texto}»`, 68)) { txt(this, X, y, linea, v.tono === 'NEG' ? PAL.rojo : PAL.verde_osc); y += 9; }
    }

    const fin = ses.state.ending;
    const terminado = ses.over;
    if (fin) txt(this, X, 232, t(`fin.${fin.id}`), PAL.rojo);
    else if (terminado) txt(this, X, 232, t('fin.CAMPANA'), PAL.verde_osc);
    const next = (): void => { this.scene.start(terminado ? 'Menu' : 'Opsroom'); };
    new Button(this, W - 150, 244, t(terminado ? 'cierre.menu' : 'cierre.continuar'), next, { w: 120, h: 14, bg: PAL.naranjo, fg: PAL.negro });
    this.input.keyboard?.once('keydown-ENTER', next);
  }
}
