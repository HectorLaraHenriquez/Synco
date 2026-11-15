// Prueba de humo en navegador: juega un día completo de punta a punta y guarda capturas.
// Uso: npx vite build && npx vite preview --port 4173 &  →  node tools/e2e-smoke.cjs [dirCapturas]
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

(async () => {
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, { recursive: true });
const url = process.env.URL ?? 'http://localhost:4173/?speed=60';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const state = () => page.evaluate(() => {
  const s = window.__cybersyn.app.session?.state;
  return s && { day: s.day, hour: s.hour, metas: s.levers.metas, pend: s.pendingEffects.length, hist: s.history.length, draft: s.draftLevers };
});
const scene = () => page.evaluate(() => window.__cybersyn.game.scene.getScenes(true).map((s) => s.scene.key).join(','));
/** Clic en coordenadas lógicas (480×270). */
const click = async (x, y) => {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x * box.width) / 480, box.y + (y * box.height) / 270);
};
const assert = (cond, msg) => { if (!cond) throw new Error(`FALLO: ${msg}`); };

await page.goto(url);
await page.waitForFunction(() => window.__cybersyn?.game.scene.isActive('Menu'));
await shot('01-menu');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__cybersyn.game.scene.isActive('Sala'));
await page.waitForTimeout(300);
await shot('01b-sala');
await page.keyboard.press('1'); // de la sala al panel de detalle
await page.waitForFunction(() => window.__cybersyn.game.scene.isActive('Opsroom'));
await page.keyboard.press('Space'); // pausa para inspeccionar
await page.waitForTimeout(200);
await shot('02-opsroom-datafeed');
for (const [k, name] of [['2', 'cyberstride'], ['3', 'checo'], ['4', 'algedonico'], ['5', 'cyberfolk'], ['6', 'red'], ['1', 'datafeed']]) {
  await page.keyboard.press(k);
  await page.waitForTimeout(350);
  await shot(`03-panel-${name}`);
}
// Palanca: subir la meta de MIN (botón [+] de la primera columna de METAS) y EJECUTAR.
await click(58 + 48 + 18 + 1 + 10 + 18 + 4, 204 + 11 + 5);
await page.waitForTimeout(100);
let st = await state();
assert(st.draft.metas?.MIN === 1.05, `borrador de metas no cambió: ${JSON.stringify(st.draft)}`);
await shot('04-borrador');
const h0 = st.hour;
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
st = await state();
assert(st.pend === 1 && Math.abs(st.hour - (h0 + 10 / 60)) < 1e-6, `EJECUTAR no aplicó: ${JSON.stringify(st)}`);
await shot('05-ejecutado');
await page.keyboard.press('Space'); // reanuda
await page.waitForFunction(() => window.__cybersyn.game.scene.isActive('DayReport'), null, { timeout: 30000 });
await page.waitForTimeout(200);
await shot('06-cierre');
st = await state();
assert(st.day === 2 && st.hist === 1 && st.metas.MIN === 1.05, `cierre incorrecto: ${JSON.stringify(st)}`);
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__cybersyn.game.scene.isActive('Sala'));
await page.keyboard.press('2');
await page.waitForFunction(() => window.__cybersyn.game.scene.isActive('Opsroom'));
await page.waitForTimeout(400);
await page.keyboard.press('Space');
await page.waitForTimeout(100);
await shot('07-dia2-cyberstride');
console.log('escena:', await scene(), 'estado:', JSON.stringify(await state()));
assert(errors.length === 0, `errores de consola: ${errors.join(' | ')}`);
console.log('OK: un día completo de punta a punta');
await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
