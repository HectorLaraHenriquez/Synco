/** Gráfica vectorial tipo diapositiva retroiluminada (Opsroom real): formas planas, tipografía geométrica. */
import Phaser from 'phaser';
import { css, PAL } from './palette';

export const FONT_TITULO = 'Jost';
export const FONT_DATO = '"Barlow Condensed"';

export interface VTextOpts { color?: number; bold?: boolean; font?: string; origin?: [number, number]; spacing?: number }

export function vtext(scene: Phaser.Scene, x: number, y: number, s: string, size: number, o: VTextOpts = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, s, {
    fontFamily: o.font ?? FONT_DATO,
    fontSize: `${size}px`,
    fontStyle: o.bold ? '700' : '500',
    color: css(o.color ?? PAL.crema),
  });
  if (o.spacing) t.setLetterSpacing(o.spacing);
  t.setOrigin(o.origin?.[0] ?? 0, o.origin?.[1] ?? 0);
  return t;
}

/** Los cinco símbolos de estado de los tableros de la Opsroom. */
export type Simbolo = 'circulo' | 'cuadrado' | 'trianguloInv' | 'triangulo' | 'pentagono';
export const SIMBOLOS: Simbolo[] = ['circulo', 'cuadrado', 'trianguloInv', 'triangulo', 'pentagono'];

function poligono(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, lados: number, rot: number, fill: boolean): void {
  const pts = Array.from({ length: lados }, (_, i) => {
    const a = rot + (2 * Math.PI * i) / lados;
    return new Phaser.Math.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
  if (fill) g.fillPoints(pts, true);
  else g.strokePoints(pts, true, true);
}

/** Dibuja un símbolo lleno (encendido) o sólo su contorno (apagado). */
export function simbolo(g: Phaser.GameObjects.Graphics, tipo: Simbolo, cx: number, cy: number, r: number, color: number, lleno: boolean): void {
  g.fillStyle(color);
  g.lineStyle(2, color);
  switch (tipo) {
    case 'circulo':
      if (lleno) g.fillCircle(cx, cy, r * 0.9); else g.strokeCircle(cx, cy, r * 0.9);
      break;
    case 'cuadrado':
      if (lleno) g.fillRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); else g.strokeRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
      break;
    case 'trianguloInv': poligono(g, cx, cy - r * 0.15, r * 1.1, 3, Math.PI / 2, lleno); break;
    case 'triangulo': poligono(g, cx, cy + r * 0.15, r * 1.1, 3, -Math.PI / 2, lleno); break;
    case 'pentagono': poligono(g, cx, cy, r, 5, -Math.PI / 2, lleno); break;
  }
}

/** Pantalla retroiluminada con marco de madera. Devuelve un contenedor con origen en la esquina de la pantalla. */
export function pantalla(scene: Phaser.Scene, x: number, y: number, w: number, h: number, titulo: string, onClick?: () => void): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const marco = scene.add.rectangle(-10, -10, w + 20, h + 20, PAL.carbon).setOrigin(0).setStrokeStyle(3, PAL.negro);
  const vidrio = scene.add.rectangle(0, 0, w, h, PAL.negro).setOrigin(0);
  c.add([marco, vidrio, vtext(scene, 12, 8, titulo, 17, { color: PAL.gris, spacing: 2 })]);
  if (onClick) {
    vidrio.setInteractive({ useHandCursor: true });
    vidrio.on('pointerdown', onClick);
    vidrio.on('pointerover', () => marco.setStrokeStyle(3, PAL.naranjo));
    vidrio.on('pointerout', () => marco.setStrokeStyle(3, PAL.negro));
  }
  return c;
}

/** Monitor de consola con carcasa blanca (fibra de vidrio) y tubo redondeado. */
export function monitor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, onClick?: () => void): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(PAL.blanco);
  g.fillRoundedRect(-12, -12, w + 24, h + 30, 14);
  g.fillStyle(PAL.gris);
  g.fillRoundedRect(-12, h + 6, w + 24, 12, { tl: 0, tr: 0, bl: 14, br: 14 });
  g.fillStyle(PAL.negro);
  g.fillRoundedRect(0, 0, w, h, 16);
  c.add(g);
  if (onClick) {
    const zona = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zona.on('pointerdown', onClick);
    c.add(zona);
  }
  return c;
}
