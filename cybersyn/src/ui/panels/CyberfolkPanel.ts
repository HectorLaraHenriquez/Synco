import { SECTOR_IDS, ZONE_IDS } from '../../data/schemas';
import { pantallaDesbloqueada, report, zonasCyberfolk } from '../../sim/observe';
import { t } from '../i18n';
import { PAL, semaforo } from '../palette';
import { bar } from '../widgets/Bar';
import { fmt, pad, Panel } from './Panel';

/** Panel 5: ánimo por zona y moral por sector (H4: diales con aguja y voces). */
export class CyberfolkPanel extends Panel {
  readonly id = 'cyberfolk';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    const conMedidor = zonasCyberfolk(s, ctx);
    this.line(0, 0, t('panel.cyberfolk.cabecera'), PAL.gris);
    ZONE_IDS.forEach((z, i) => {
      const row = 1 + i;
      const abast = report(s, ctx, `zone:${z}`, 'abastecimiento').valor;
      this.line(0, row, ctx.zone[z].nombre.padEnd(20));
      if (conMedidor.includes(z)) {
        const animo = report(s, ctx, `zone:${z}`, 'animo').valor;
        this.put(...bar(this.scene, this.cx(21), this.ry(row) + 1, 90, 5, animo, semaforo(animo)));
        this.line(37, row, pad(fmt(animo), 3));
      } else this.line(21, row, t('panel.cyberfolk.sinMedidor'), PAL.gris);
      this.line(44, row, pad(fmt(abast), 3), semaforo(abast));
    });
    if (!pantallaDesbloqueada(s, ctx, 'cyberfolk')) this.line(0, 10, t('panel.cyberfolk.piloto', { dia: ctx.bal.pantallas.desbloqueoDia.cyberfolk }), PAL.gris);
    this.line(0, 12, t('panel.cyberfolk.moral'), PAL.gris);
    this.line(0, 13, SECTOR_IDS.map((id) => `${id} ${pad(fmt(report(s, ctx, `sector:${id}`, 'moral').valor), 3)}`).join('   '));
  }
}
