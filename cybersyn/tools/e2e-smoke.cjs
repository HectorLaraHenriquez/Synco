// Prueba de humo en navegador: juega un día completo de punta a punta y guarda capturas.
// Uso: npx vite build && npx vite preview --port 4173 &  →  node tools/e2e-smoke.cjs [dirCapturas]
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

(async () => {
  const out = process.argv[2] ?? 'e2e-out';
  mkdirSync(out, { recursive: true });
  const url = process.env.URL ?? 'http://localhost:4173/?speed=60';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const state = () => page.evaluate(() => {
    const s = window.__cybersyn.app.session?.state;
    return s && { day: s.day, hour: s.hour, metas: s.levers.metas, pend: s.pendingEffects.length, hist: s.history.length, draft: s.draftLevers, inv: Object.keys(s.investigaciones) };
  });
  const enEscena = async (k) => {
    try {
      await page.waitForFunction((key) => window.__cybersyn?.game.scene.isActive(key), k, { timeout: 30000 });
    } catch {
      const activas = await page.evaluate(() => window.__cybersyn?.game.scene.getScenes(true).map((s) => s.scene.key).join(','));
      throw new Error(`FALLO: se esperaba la escena ${k}; activas: ${activas}; errores: ${errors.join(' | ')}`);
    }
  };
  /** Clic en coordenadas lógicas (1440×810). */
  const click = async (x, y) => {
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + (x * box.width) / 1440, box.y + (y * box.height) / 810);
    await page.waitForTimeout(120);
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(`FALLO: ${msg}`); };

  await page.goto(url);
  await enEscena('Menu');
  await page.waitForTimeout(300);
  await shot('01-menu');
  await page.keyboard.press('Enter');
  await enEscena('City');
  await page.waitForTimeout(300);
  await shot('02-ciudad-boletin');
  await page.keyboard.press('Enter');
  await enEscena('Sala');
  await page.keyboard.press('Space'); // pausa para inspeccionar
  await page.waitForTimeout(300);
  await shot('03-sala');

  // Consola: subir la meta de MIN y EJECUTAR.
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await click(240 + 250 + 34 + 26 + 46 + 13, 132 + 84 + 13);
  let st = await state();
  assert(st.draft.metas?.MIN === 1.05, `borrador de metas no cambió: ${JSON.stringify(st.draft)}`);
  await shot('04-consola-borrador');
  const h0 = st.hour;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  st = await state();
  assert(st.pend === 1 && Math.abs(st.hour - (h0 + 10 / 60)) < 1e-6, `EJECUTAR no aplicó: ${JSON.stringify(st)}`);
  await page.keyboard.press('Escape');

  // Ficha de sector (clic en el diagrama VSM) e investigar una rama.
  await click(60 + 132, 130 + 205 + 2 * 58);
  await page.waitForTimeout(200);
  await shot('05-ficha-sector');
  await click(240 + 590 + 80, 132 + 280 + 17);
  st = await state();
  assert(st.inv.length === 1 && st.inv[0].startsWith('rama:CON.'), `investigar no funcionó: ${JSON.stringify(st.inv)}`);
  await page.keyboard.press('Escape');
  // Ficha de zona (clic en la ventana al país).
  await click(440 + 3.5 * 70, 300);
  await page.waitForTimeout(200);
  await shot('06-ficha-zona');
  await page.keyboard.press('Escape');
  for (const [k, name] of [['2', 'alertas'], ['3', 'checo'], ['4', 'senales']]) {
    await page.keyboard.press(k);
    await page.waitForTimeout(200);
    await shot(`07-ficha-${name}`);
  }
  await page.keyboard.press('Escape');

  await page.keyboard.press('Space'); // reanuda
  await enEscena('DayReport');
  await page.waitForTimeout(300);
  await shot('08-cierre');
  st = await state();
  assert(st.day === 2 && st.hist === 1 && st.metas.MIN === 1.05, `cierre incorrecto: ${JSON.stringify(st)}`);
  await page.keyboard.press('Enter');
  await enEscena('City');
  await page.waitForTimeout(300);
  await shot('09-ciudad-dia2');
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('cybersyn.autosave')).day);
  assert(guardado === 2, `autoguardado incorrecto: ${guardado}`);
  await page.keyboard.press('Enter');
  await enEscena('Sala');
  assert(errors.length === 0, `errores de consola: ${errors.join(' | ')}`);
  console.log('OK: un día completo de punta a punta', JSON.stringify(await state()));
  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
