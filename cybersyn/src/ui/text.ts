import Phaser from 'phaser';
import { CELL_H, CELL_W, CHARS, GLYPHS, sanitize } from './glyphs';
import { PAL } from './palette';

export const FONT = 'pix';
const PER_ROW = 32;

/** Genera la textura de la fuente bitmap y la registra (una vez, en Boot). */
export function buildFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(FONT)) return;
  const chars = [...CHARS];
  const rows = Math.ceil(chars.length / PER_ROW);
  const tex = scene.textures.createCanvas('fontTex', PER_ROW * CELL_W, rows * CELL_H)!;
  const c = tex.getContext();
  c.fillStyle = 'white'; // máscara: el color lo da el tint de la paleta
  chars.forEach((ch, i) => {
    const ox = (i % PER_ROW) * CELL_W, oy = Math.floor(i / PER_ROW) * CELL_H;
    GLYPHS[ch]!.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') c.fillRect(ox + x, oy + y, 1, 1);
    });
  });
  tex.refresh();
  const cfg = {
    image: 'fontTex', width: CELL_W, height: CELL_H, chars: CHARS, charsPerRow: PER_ROW,
    'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 1,
  } as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig;
  scene.cache.bitmapFont.add(FONT, Phaser.GameObjects.RetroFont.Parse(scene, cfg));
}

/** Texto bitmap en coordenadas de píxel lógico. */
export function txt(scene: Phaser.Scene, x: number, y: number, s: string, color: number = PAL.crema, scale = 1): Phaser.GameObjects.BitmapText {
  const o = scene.add.bitmapText(Math.round(x), Math.round(y), FONT, sanitize(s));
  o.setTint(color);
  if (scale !== 1) o.setScale(scale);
  return o;
}

export const textW = (s: string, scale = 1): number => s.length * CELL_W * scale;
