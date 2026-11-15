import Phaser from 'phaser';
import { loadGameData } from './data/loader';
import '@fontsource/jost/500.css';
import '@fontsource/jost/700.css';
import '@fontsource/barlow-condensed/500.css';
import { app, initApp, VH, VW } from './game/app';
import { BootScene } from './scenes/BootScene';
import { DayReportScene } from './scenes/DayReportScene';
import { MenuScene } from './scenes/MenuScene';
import { OpsroomScene } from './scenes/OpsroomScene';
import { SalaScene } from './scenes/SalaScene';
import { setStrings } from './ui/i18n';
import { css, PAL } from './ui/palette';

async function main(): Promise<void> {
  const [data, strings] = await Promise.all([
    loadGameData('./data'),
    fetch('./data/ui/es.json').then((r) => r.json() as Promise<Record<string, string>>),
  ]);
  await Promise.all(['500 16px Jost', '700 16px Jost', '500 16px "Barlow Condensed"'].map((f) => document.fonts.load(f, 'Ñandú 123')));
  initApp(data);
  setStrings(strings);
  // ?speed=N acelera el reloj (pruebas y balance).
  app.speed = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VW,
    height: VH,
    backgroundColor: css(PAL.negro),
    antialias: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, SalaScene, OpsroomScene, DayReportScene],
  });
  (window as unknown as { __cybersyn: unknown }).__cybersyn = { app, game };
}

main().catch((err) => {
  document.body.textContent = `Error al iniciar: ${(err as Error).message}`;
  throw err;
});
