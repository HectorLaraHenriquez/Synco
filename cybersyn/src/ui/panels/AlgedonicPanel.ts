import { t } from '../i18n';
import { PAL } from '../palette';
import { bar } from '../widgets/Bar';
import { Button } from '../widgets/Button';
import { fmt, Panel } from './Panel';

/** Panel 4: señales activas con temporizador y opciones. */
export class AlgedonicPanel extends Panel {
  readonly id = 'algedonico';

  protected draw(): void {
    const { state: s, ctx } = this.session;
    const ocupados = s.algedonic.filter((a) => a.atendida).length;
    this.line(0, 0, t('panel.algedonico.atencion', { n: ocupados, max: s.player.slotsAtencion }), PAL.gris);
    if (s.algedonic.length === 0) {
      this.line(0, 2, t('panel.algedonico.vacio'));
      return;
    }
    const orden = [...s.algedonic].sort((a, b) => Number(a.atendida) - Number(b.atendida) || a.venceEnMin - b.venceEnMin);
    let row = 1;
    for (const sig of orden.slice(0, 2)) {
      const total = ctx.bal.algedonico.venceMin[sig.nivel];
      this.put(this.scene.add.rectangle(this.cx(0) - 2, this.ry(row) - 1, 350, 10, sig.atendida ? PAL.carbon : PAL.rojo).setOrigin(0));
      this.line(0, row, `ALG-${sig.nivel} ${sig.causa}`.slice(0, 57), PAL.blanco);
      row += 1;
      if (sig.atendida) {
        const op = sig.opciones.find((o) => o.id === sig.opcionId)!;
        this.line(0, row, t('panel.algedonico.atendiendo', { min: Math.ceil(sig.resuelveEnMin ?? 0), opcion: op.texto }).slice(0, 57), PAL.crema);
        row += 2;
        continue;
      }
      this.put(...bar(this.scene, this.cx(0), this.ry(row) + 1, 120, 5, (100 * sig.venceEnMin) / total, PAL.mostaza));
      this.line(21, row, t('panel.algedonico.vence', { min: Math.ceil(sig.venceEnMin) }), PAL.mostaza);
      row += 1;
      for (const op of sig.opciones) {
        const costo = op.costo?.divisas ? ` (${fmt(op.costo.divisas, 1)} MUSD)` : op.costo?.capitalPolitico ? ` (${t('comun.capital')} ${op.costo.capitalPolitico})` : '';
        const label = `▶ ${op.texto}${costo}`.slice(0, 56);
        this.put(new Button(this.scene, this.cx(0), this.ry(row), label, () => this.session.dispatch({ t: 'ATTEND_ALGEDONIC', signalId: sig.id, optionId: op.id }), { w: 346, h: 9, bg: PAL.negro }));
        row += 1;
      }
      row += 0.5;
    }
    if (orden.length > 2) this.line(0, 14, t('comun.mas', { n: orden.length - 2 }), PAL.gris);
  }
}
