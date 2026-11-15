import Phaser from 'phaser';
import { SECTOR_IDS, ZONE_IDS } from '../../data/schemas';
import type { Session } from '../../game/session';
import { report, zonasCyberfolk } from '../../sim/observe';
import { t } from '../i18n';
import { PAL, semaforo } from '../palette';
import { CLAVES_ESTADO, estadoSector } from '../status';
import { SIMBOLOS, simbolo, vtext } from '../vector';

const FILA0 = 92, FILA_H = 36;
const DIAL0 = 318;

/** Tablero de símbolos por sector + diales Cyberfolk por zona. */
export class SymbolBoard {
  private dyn: Phaser.GameObjects.Graphics;
  private cabecera: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, private session: Session, private w: number) {
    const { ctx } = session;
    const g = scene.add.graphics();
    g.fillStyle(PAL.verde_crt);
    g.fillRect(8, 30, w - 16, 44);
    g.lineStyle(1, PAL.gris);
    parent.add(g);
    parent.add(vtext(scene, 16, 34, t('sala.tablero.titulo'), 17, { color: PAL.negro, bold: true }));
    this.cabecera = vtext(scene, w - 16, 34, '', 15, { color: PAL.negro, origin: [1, 0] });
    parent.add(this.cabecera);
    SECTOR_IDS.forEach((id, i) => {
      const y = FILA0 + i * FILA_H;
      g.lineBetween(8, y + FILA_H - 4, w - 8, y + FILA_H - 4);
      parent.add(vtext(scene, 150, y + 4, ctx.sec[id].nombre.toUpperCase(), 17, { color: PAL.blanco }));
    });
    // Leyenda de símbolos.
    CLAVES_ESTADO.forEach((k, i) => {
      simbolo(g, SIMBOLOS[i]!, 20 + i * 64, FILA0 + 5 * FILA_H + 12, 6, PAL.gris, false);
      parent.add(vtext(scene, 30 + i * 64, FILA0 + 5 * FILA_H + 4, t(`sala.simbolo.${k}`), 12, { color: PAL.gris }));
    });
    parent.add(vtext(scene, 12, DIAL0 - 22, t('sala.tablero.cyberfolk'), 14, { color: PAL.gris, spacing: 2 }));
    ZONE_IDS.forEach((z, i) => {
      const [cx, cy] = this.dial(i);
      parent.add(vtext(scene, cx, cy + 5, z, 12, { color: PAL.gris, origin: [0.5, 0] }));
    });
    this.dyn = scene.add.graphics();
    parent.add(this.dyn);
  }

  private dial(i: number): [number, number] {
    return [50 + (i % 4) * 78, DIAL0 + 38 + Math.floor(i / 4) * 72];
  }

  refresh(parpadeo: boolean): void {
    const { state: s, ctx } = this.session;
    const g = this.dyn;
    g.clear();
    this.cabecera.setText(t('sala.tablero.dia', { dia: s.day }));
    SECTOR_IDS.forEach((id, i) => {
      const st = estadoSector(s, ctx, id);
      CLAVES_ESTADO.forEach((k, j) => {
        const n = st[k];
        const color = n === 2 ? PAL.rojo : n === 1 ? PAL.mostaza : PAL.crema;
        // Tablero en calma = sólo contornos. Lo que se enciende pide atención.
        simbolo(g, SIMBOLOS[j]!, 22 + j * 26, FILA0 + i * FILA_H + 14, 9, color, n === 1 || (n === 2 && parpadeo));
      });
    });
    const conMedidor = zonasCyberfolk(s, ctx);
    ZONE_IDS.forEach((z, i) => {
      const [cx, cy] = this.dial(i);
      const hay = conMedidor.includes(z);
      const animo = hay ? report(s, ctx, `zone:${z}`, 'animo').valor : 0;
      g.lineStyle(6, PAL.carbon);
      g.beginPath();
      g.arc(cx, cy, 26, Math.PI, 2 * Math.PI);
      g.strokePath();
      if (!hay) return;
      g.lineStyle(6, semaforo(animo));
      g.beginPath();
      g.arc(cx, cy, 26, Math.PI, Math.PI * (1 + animo / 100));
      g.strokePath();
      const a = Math.PI * (1 + animo / 100);
      g.lineStyle(2, PAL.blanco);
      g.lineBetween(cx, cy, cx + 22 * Math.cos(a), cy + 22 * Math.sin(a));
      g.fillStyle(PAL.blanco);
      g.fillCircle(cx, cy, 3);
    });
  }
}
