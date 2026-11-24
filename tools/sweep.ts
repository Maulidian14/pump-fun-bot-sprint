// Knob sweep: full window + 6h slices + top-3 concentration + 2x fees.
// Prints one line per variant. A knob is adopted only if it improves the full
// window AND the slice profile AND concentration — never on the dev total alone.
//
//   node tools/sweep.ts <kit dir>
//
// Uses tools/dataset-full.ts (ALL dataset parts) — never the kit sim's
// loadDataset, which reads only part-00000.

import { buildBot, DEFAULT_CONFIG, type Config } from '../strategy.ts';
import { loadFullDataset } from './dataset-full.ts';
import {
  makeHello,
  phaseSeed,
  simulate,
  type Dataset,
} from '/home/hatch/workspace/makefun/new16-20261124/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed-kit/baselines/pilot/momentum/tools/sim.ts';

const kit = process.argv[2];
if (kit === undefined) {
  console.error('usage: node tools/sweep.ts <kit dir>');
  process.exit(2);
}
const full = loadFullDataset(kit);
const hello = makeHello(phaseSeed('pilot-pumpfun-replay', 'dev', full.sha256));
const sol = (x: bigint) => Number(x) / 1e9;

function sliceDs(q: number): Dataset {
  const n = full.batches.length;
  const lo = Math.floor((n * q) / 4);
  const hi = Math.floor((n * (q + 1)) / 4);
  const batches = full.batches.slice(lo, hi);
  const slots = new Set(batches.map((b) => b.slot));
  const inSlice = new Set<string>();
  for (const b of batches) for (const e of b.events) inSlice.add(e.mint);
  const createdBefore = new Set<string>();
  for (const e of full.events) {
    if (e.event === 'CreateEvent' && inSlice.has(e.mint) && !slots.has(e.slot)) createdBefore.add(e.mint);
  }
  const synthetic = full.events.filter((e) => e.event === 'CreateEvent' && createdBefore.has(e.mint));
  const firstSlot = batches[0]!.slot;
  const allBatches = synthetic.length > 0 ? [{ slot: firstSlot, events: synthetic }, ...batches] : batches;
  return {
    ...full,
    batches: allBatches,
    events: [...synthetic, ...full.events.filter((e) => slots.has(e.slot))],
    endSlot: batches[batches.length - 1]!.slot,
  };
}
const slices = [0, 1, 2, 3].map(sliceDs);

function top3Share(trips: { pnl: bigint }[]): number {
  const gains = trips.map((t) => sol(t.pnl)).filter((x) => x > 0).sort((a, b) => b - a);
  const total = gains.reduce((a, b) => a + b, 0);
  if (total <= 0) return 1;
  return gains.slice(0, 3).reduce((a, b) => a + b, 0) / total;
}

function run(c: Config) {
  const r = simulate(full, hello, buildBot(c));
  const q = slices.map((d) => sol(simulate(d, hello, buildBot(c)).netPnl));
  const twoX = sol(simulate(full, hello, buildBot(c), { feeMultiplier: 2n }).netPnl);
  const qMean = q.reduce((a, b) => a + b, 0) / 4;
  const qSorted = [...q].sort((a, b) => a - b);
  const qMed = (qSorted[1]! + qSorted[2]!) / 2;
  return {
    net: sol(r.netPnl), dd: r.maxDrawdown, trips: r.trips.length,
    wins: r.trips.filter((t) => t.pnl > 0n).length, coins: r.mints,
    q, qMean, qMed, twoX, top3: top3Share(r.trips),
  };
}

const variants: Array<[string, Partial<Config>]> = [
  ['defaults', {}],
  ['whaleSell 6', { whaleSellSol: 6 }],
  ['whaleSell 7', { whaleSellSol: 7 }],
  ['trail 0.33', { trail: 0.33 }],
  ['trail 0.38', { trail: 0.38 }],
  ['rqHi 70', { rqHi: 70 }],
  ['rqHi 60', { rqHi: 60 }],
  ['creatorBuyers 150', { creatorBuyers: 150 }],
  ['underwater 1500', { underwaterMax: 1500 }],
  ['underwater 0 (off)', { underwaterMax: 0 }],
  ['creatorStake 3.0', { creatorStakeCap: 3.0 }],
  ['dip 0.15', { dip: 0.15 }],
  ['dip 0.25', { dip: 0.25 }],
];

for (const [name, over] of variants) {
  const c = { ...DEFAULT_CONFIG, ...over };
  const r = run(c);
  console.log(
    `${name.padEnd(24)} net ${r.net.toFixed(3)} dd ${r.dd.toFixed(3)} trips ${r.trips} wins ${r.wins} coins ${r.coins} top3 ${r.top3.toFixed(2)} 2x ${r.twoX.toFixed(2)} qMean ${r.qMean.toFixed(2)} qMed ${r.qMed.toFixed(2)} q [${r.q.map((x) => x.toFixed(2)).join(' ')}]`,
  );
}
