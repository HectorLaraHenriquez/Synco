import { ZONE_IDS } from '../../data/schemas';
import { pantallaDesbloqueada, report } from '../../sim/observe';
import { t } from '../i18n';
import { PAL } from '../palette';
import { fmt, Panel } from './Panel';

/** Panel 6: estado de la red Cybernet (H4: mapa tipo metro; H6: cortes y técnicos). */
export class NetworkPanel extends Panel {
  readonly id = 'red';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    if (!pantallaDesbloqueada(s, ctx, 'red')) {
      this.line(0, 1, t('panel.bloqueado', { dia: ctx.bal.pantallas.desbloqueoDia.red }), PAL.gris);
      return;
    }
    this.line(0, 0, t('panel.red.estabilidad', { v: fmt(report(s, ctx, 'pais', 'estabilidadRed').valor) }), PAL.gris);
    ZONE_IDS.forEach((z, i) => {
      const firmas = Object.values(s.firms).filter((f) => f.zona === z);
      const ok = firmas.filter((f) => f.conectada).length;
      const y = this.ry(2 + i);
      this.put(this.scene.add.rectangle(this.cx(1) + 3, y - 4, 1, 8, PAL.azul).setOrigin(0.5, 0));
      this.put(this.scene.add.circle(this.cx(1) + 3, y + 3, 3, ok === firmas.length ? PAL.verde_crt : ok === 0 ? PAL.gris : PAL.mostaza));
      this.line(3, 2 + i, `${ctx.zone[z].nombre.padEnd(22)}${t('panel.red.nodos', { ok, total: firmas.length })}`);
    });
  }
}
