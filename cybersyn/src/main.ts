import Phaser from 'phaser';
import { loadGameData } from './data/loader';
import { app, H, initApp, W } from './game/app';
import { BootScene } from './scenes/BootScene';
import { DayReportScene } from './scenes/DayReportScene';
import { MenuScene } from './scenes/MenuScene';
import { OpsroomScene } from './scenes/OpsroomScene';
import { setStrings } from './ui/i18n';
import { css, PAL } from './ui/palette';

/** Escala entera: el mayor múltiplo de 480×270 que cabe en la ventana. */
const zoom = (): number => Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));

async function main(): Promise<void> {
  const [data, strings] = await Promise.all([
    loadGameData('./data'),
    fetch('./data/ui/es.json').then((r) => r.json() as Promise<Record<string, string>>),
  ]);
  initApp(data);
  setStrings(strings);
  // ?speed=N acelera el reloj (pruebas y balance).
  app.speed = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: css(PAL.negro),
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom: zoom() },
    scene: [BootScene, MenuScene, OpsroomScene, DayReportScene],
  });
  window.addEventListener('resize', () => game.scale.setZoom(zoom()));
  (window as unknown as { __cybersyn: unknown }).__cybersyn = { app, game };
}

main().catch((err) => {
  document.body.textContent = `Error al iniciar: ${(err as Error).message}`;
  throw err;
});
