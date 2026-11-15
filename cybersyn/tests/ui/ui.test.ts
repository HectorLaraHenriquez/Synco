import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Session } from '../../src/game/session';
import { buildBulletin } from '../../src/game/bulletin';
import { clearSave, loadGame, saveGame, type Store } from '../../src/save/save';
import { setStrings, t } from '../../src/ui/i18n';
import { PAL } from '../../src/ui/palette';
import { data, engine } from '../sim/helpers';

const strings = JSON.parse(readFileSync('public/data/ui/es.json', 'utf8')) as Record<string, string>;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const fuentes = [...files('src/ui'), ...files('src/scenes'), ...files('src/game')].map((f) => readFileSync(f, 'utf8')).join('\n');

describe('textos en JSON', () => {
  it('toda clave literal usada en la UI existe en es.json', () => {
    const usadas = [...fuentes.matchAll(/\bt\('([^'`]+)'/g)].map((m) => m[1]!);
    expect(usadas.length).toBeGreaterThan(40);
    for (const k of usadas) expect(strings[k], k).toBeDefined();
  });
  it('las familias de claves dinámicas están completas', () => {
    const req = [
      ...['produccion', 'abastecimiento', 'estabilidadPrecios', 'divisas', 'estabilidadRed', 'animo', 'soberania'].map((k) => `ind.${k}`),
      ...['consola', 'algedonico', 'checo', 'stride'].map((p) => `ficha.${p}.titulo`),
      ...['precios', 'metas', 'asignacionDivisas', 'emision', 'fiscalizacion', 'shareExportCobre', 'reajusteSalarial', 'zonasPrioritarias', 'inversiones', 'autonomia'].flatMap((k) => [`palanca.${k}`, `boletin.nuevo.${k}`]),
      ...['precios', 'metas', 'asignacionDivisas', 'emision', 'fiscalizacion', 'shareExportCobre', 'reajusteSalarial', 'zonasPrioritarias'].map((k) => `palanca.ayuda.${k}`),
      ...['AUTOGESTION', 'COORDINADO', 'CENTRALIZADO'].flatMap((k) => [`autonomia.${k}`, `autonomia.ayuda.${k}`]),
      ...['inicio', 'abastecimiento', 'inflacion', 'animo', 'divisas', 'produccion', 'calma'].flatMap((k) => [`boletin.titular.${k}`, `boletin.objetivo.${k}`]),
      ...['checo', 'red', 'cyberfolk'].map((k) => `boletin.nuevo.pantalla.${k}`),
      ...['produccion', 'insumos', 'moral', 'datos', 'senal'].map((k) => `ficha.sector.${k}`),
      'boletin.jefa.dia1', 'boletin.jefa.dia2', 'boletin.jefa.dia3', 'fin.CAMPANA',
      ...['BAJO', 'MEDIO', 'ALTO', 'OFF', 'RACIONAMIENTO', 'ESTRICTO'].map((k) => `valor.${k}`),
      ...['BASICOS', 'MANUFACTURAS', 'SERVICIOS'].map((k) => `precio.${k}`),
      ...['produccion', 'abastecimiento', 'estabilidadPrecios', 'divisas', 'estabilidadRed', 'animo', 'soberania'].map((k) => `ind.franja.${k}`),
      ...['MIN', 'IND', 'CON', 'AGR', 'ENT'].map((k) => `sector.corto.${k}`),
      ...['produccion', 'insumos', 'moral', 'datos', 'senal'].map((k) => `sala.simbolo.${k}`),
      'alerta.DESVIO', 'alerta.TENDENCIA', 'fin.DESPIDO', 'fin.COLAPSO', 'ind.insumosDias', 'ind.moral',
    ];
    for (const k of req) expect(strings[k], k).toBeDefined();
  });
  it('cada código de error del motor tiene texto', () => {
    const cmds = readFileSync('src/sim/commands.ts', 'utf8');
    const desde = cmds.indexOf('export type CommandError');
    const codigos = [...cmds.slice(desde, cmds.indexOf(';', desde)).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
    expect(codigos.length).toBeGreaterThan(10);
    for (const c of new Set(codigos)) expect(strings[`error.${c}`], c).toBeDefined();
  });
  it('t() interpola y deja visible una clave faltante', () => {
    setStrings({ hola: 'Día {n}' });
    expect(t('hola', { n: 3 })).toBe('Día 3');
    expect(t('no.existe')).toBe('no.existe');
  });
  it('la UI no usa colores fuera de la paleta', () => {
    expect(Object.keys(PAL)).toHaveLength(12);
    const sinPaleta = [...files('src/ui'), ...files('src/scenes'), ...files('src/game')].filter((f) => !f.endsWith('palette.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(sinPaleta).not.toMatch(/0x[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{6}\b/);
  });
});

describe('sesión (reloj en tiempo real)', () => {
  const seg = data.balance.tiempo.segundosPorHora;
  it('1 hora de juego = segundosPorHora reales; avanza por minutos enteros', () => {
    const ses = new Session(engine, 's');
    ses.advanceReal(100);
    expect(ses.state.hour).toBe(8);
    ses.advanceReal(seg * 1000);
    expect(ses.state.hour).toBeCloseTo(9, 6);
  });
  it('la pausa detiene el reloj y la velocidad lo multiplica', () => {
    const ses = new Session(engine, 's');
    ses.togglePause();
    ses.advanceReal(seg * 1000);
    expect(ses.state.hour).toBe(8);
    ses.togglePause();
    ses.speed = 4;
    ses.advanceReal(seg * 1000);
    expect(ses.state.hour).toBeCloseTo(12, 6);
  });
  it('al terminar la jornada se detiene; closeDay entrega la comparación y abre el día siguiente', () => {
    const ses = new Session(engine, 's');
    let cambios = 0;
    ses.onChange(() => cambios++);
    ses.speed = 100;
    for (let i = 0; i < 20 && !ses.dayOver; i++) ses.advanceReal(1000);
    expect(ses.dayOver).toBe(true);
    expect(ses.state.hour).toBe(20);
    const antes0 = { ...ses.state.indicators };
    const cierre = ses.closeDay();
    expect(cierre.snap.day).toBe(1);
    expect(cierre.antes.produccion).not.toBe(antes0.produccion);
    expect(ses.state.day).toBe(2);
    expect(ses.dayOver).toBe(false);
    expect(cambios).toBeGreaterThan(5);
  });
  it('dispatch devuelve el código de error y lo recuerda', () => {
    const ses = new Session(engine, 's');
    expect(ses.dispatch({ t: 'EXECUTE_LEVERS' })).toBe('SIN_CAMBIOS');
    expect(ses.lastError?.code).toBe('SIN_CAMBIOS');
    expect(ses.dispatch({ t: 'SET_DRAFT_LEVER', lever: 'metas', value: { MIN: 1.1 } })).toBeUndefined();
    expect(ses.lastError).toBeUndefined();
  });
});

describe('tablero de símbolos', () => {
  it('en calma todo apagado; un sector sin insumos y con señal sin atender se enciende', async () => {
    const { estadoSector, peor } = await import('../../src/ui/status');
    const s = structuredClone(engine.tick(engine.init('tab')));
    expect(peor(estadoSector(s, engine.ctx, 'CON'))).toBe(0);
    s.sectors.ENT.insumos = 0.5 * s.sectors.ENT.requeridoDia;
    s.sectors.ENT.moral = 45;
    expect(estadoSector(s, engine.ctx, 'ENT')).toMatchObject({ insumos: 2, moral: 1, senal: 0 });
    s.algedonic.push({ id: 'x', templateId: 'alg_averia_firma', origen: { tipo: 'FIRM', id: 'ent_endesa' }, nivel: 1, causa: '', creadaDia: 1, venceEnMin: 10, atendida: false, opciones: [], alIgnorar: [] });
    expect(estadoSector(s, engine.ctx, 'ENT').senal).toBe(2);
    s.algedonic[0]!.atendida = true;
    expect(estadoSector(s, engine.ctx, 'ENT').senal).toBe(1);
  });
});

describe('boletín y guardado', () => {
  it('el boletín del día 1 presenta la sala; el del día 2 anuncia la palanca de precios', () => {
    const b1 = buildBulletin(engine.init('b'), engine.ctx);
    expect(b1).toMatchObject({ titular: 'boletin.titular.inicio', jefa: 'boletin.jefa.dia1' });
    expect(b1.novedades).toContain('boletin.nuevo.metas');
    const b2 = buildBulletin(engine.runDay(engine.init('b')), engine.ctx);
    expect(b2.novedades).toEqual(['boletin.nuevo.precios']);
    expect(b2.titular).not.toBe('boletin.titular.inicio');
  });
  it('el titular sigue al peor problema', () => {
    const s = structuredClone(engine.runDay(engine.init('b')));
    for (const z of Object.values(s.zones)) z.abastecimiento = 30;
    expect(buildBulletin(s, engine.ctx).titular).toBe('boletin.titular.abastecimiento');
  });
  it('guardar y cargar devuelve el mismo estado; versiones ajenas se descartan', () => {
    const mem = new Map<string, string>();
    const store: Store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    expect(loadGame(store)).toBeUndefined();
    const s = engine.runDay(engine.init('g'));
    expect(saveGame(s, store)).toBe(true);
    const cargado = loadGame(store)!;
    expect(cargado).toEqual(JSON.parse(JSON.stringify(s)));
    // La partida cargada sigue siendo determinista.
    expect(JSON.stringify(engine.runDay(cargado))).toBe(JSON.stringify(engine.runDay(s)));
    const ses = new Session(engine, cargado);
    expect(ses.state.day).toBe(2);
    saveGame({ ...s, version: 999 }, store);
    expect(loadGame(store)).toBeUndefined();
    clearSave(store);
    expect(mem.size).toBe(0);
  });
});
