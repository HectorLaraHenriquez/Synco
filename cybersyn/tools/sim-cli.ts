/** Uso: npm run sim -- [--policy none|reasonable] [--seed texto] [--days 30] */
import { loadGameDataFromDir } from '../src/data/node-loader';
import { createEngine } from '../src/sim/engine';
import { POLICIES, playDay } from './policies';

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
};

const policyName = arg('policy', 'none');
const seed = arg('seed', 'cybersyn');
const days = Number(arg('days', '30'));
const policy = POLICIES[policyName];
if (!policy) throw new Error(`Política desconocida: ${policyName} (${Object.keys(POLICIES).join(', ')})`);

const engine = createEngine(loadGameDataFromDir());
let s = engine.init(seed);
const f = (n: number, d = 0) => n.toFixed(d).padStart(6);
console.log(`policy=${policyName} seed=${seed}`);
console.log('día   prod abast  prec divis ánimo   ipc infl% mneg% brecha cobre  conf capit   alg alert');
for (let d = 1; d <= days && !engine.isOver(s); d++) {
  s = playDay(engine, s, policy);
  const h = s.history[s.history.length - 1]!;
  const i = h.indicators;
  console.log(
    `${String(h.day).padStart(3)} ${f(i.produccion)}${f(i.abastecimiento)}${f(i.estabilidadPrecios)}${f(i.divisas)}${f(i.animo)}` +
      `${f(h.ipc, 2)}${f(h.inflacionMensual * 100, 1)}${f(h.mercadoNegro * 100, 1)}${f(h.brecha, 2)}${f(h.precioCobre, 2)}` +
      `${f(s.player.confianza)}${f(s.player.capitalPolitico)}${f(s.algedonic.length)}${f(h.alertas.length)}`,
  );
}
const last = s.history[s.history.length - 1]!;
for (const v of last.voces) console.log(`  «${v.texto}» (${v.zona})`);
console.log(s.ending ? `FIN: ${s.ending.id} (${s.ending.reason}) día ${s.ending.day}` : `Sobrevivió ${s.history.length} días`);
