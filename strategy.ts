// SPDX-License-Identifier: MIT
// Pump.fun Bot Sprint entry: a dip-recovery paper bot for the pump.fun
// bonding-curve replay (agent-fun/replay/v2), built for this competition's
// 6-hour final window. The grader runs `node /bot/main.ts`; the strategy
// lives in this file and the SDK shim is the kit's sdk/ts/makefun-bot.ts,
// vendored byte for byte in vendor/.
//
// The idea, in one paragraph: most pump.fun coins die fast, but a few slow
// completers climb for hours after a deep dip and a full recovery. This bot
// only buys that shape — a dip of at least 20% off the running peak, then a
// retake of the peak, on a coin that already has real dispersion (25+
// distinct buyers, no whale over 40% of buy SOL, 15-80 SOL of real SOL in
// the curve) — and then scales into strength with small adds while the
// curve's real SOL keeps climbing. Winners are ridden with a 0.35 trailing
// stop and no take-profit; losers are cut by the same trail, by a single
// whale dump, by the creator selling while the bot holds, or by sitting
// underwater too long. Creator-sold coins are not banned outright: a sold
// creator can still enter, but only behind a much higher dispersion bar
// (180+ buyers, 25+ SOL, first sell early and small), because two of the
// dev window's seven slow completers were creator-sold and are worth
// catching as cheap options at a 2 SOL stake cap.
//
// Everything is a pure function of the batch stream: no clock, no
// environment, no randomness, so the two graded executions produce
// byte-identical action logs. Iteration is only over insertion-ordered maps
// fed by the batches.

import type { Batch, Bot, BotState, OrderInput, Pubkey } from './vendor/makefun-bot.ts';

export interface Config {
  /** Dip depth below the running peak that arms a recovery (share). */
  dip: number;
  /** Share of the peak the price must retake to count as recovered (1 = full). */
  retake: number;
  /** Slots after a recovery during which an entry may still be taken. */
  retakeWindow: number;
  /** Highest entry price as a multiple of the recovered peak (no chasing). */
  chaseCap: number;
  /** Lifetime distinct buyers a clean coin needs at entry. */
  buyers: number;
  /** Largest lifetime buyer's share of lifetime buy SOL. */
  topShare: number;
  /** Real SOL bounds at entry. */
  rqLo: number;
  rqHi: number;
  /** Youngest age (slots since CreateEvent) at entry. */
  ageMin: number;
  /** Entry price at least this multiple of the create price. */
  createMult: number;
  /** When true, creator-sold coins never enter. When false, they may enter
   * if they clear the stricter creator bars below. */
  blockCreatorSold: boolean;
  /** Lifetime distinct buyers a creator-sold coin needs at entry. */
  creatorBuyers: number;
  /** Real SOL a creator-sold coin needs at entry. */
  creatorRq: number;
  /** A creator-sold coin's first creator sell must be within this many
   * slots of creation (0 = no constraint). */
  creatorFirstSellAge: number;
  /** A creator-sold coin's first creator sell must be at most this many
   * SOL (0 = no constraint). */
  creatorFirstSellSol: number;
  /** When true, exit only on creator sells that happen while holding (the
   * sell count at open is remembered). When false, exit whenever the
   * creator has EVER sold. */
  creatorExitWhileHolding: boolean;
  /** When false, creator sells never trigger an exit at all (large dumps
   * are still caught by whaleSellSol). */
  creatorExit: boolean;
  /** Most entries ever taken on one coin (1 = a coin is traded once). */
  entriesPerCoin: number;
  /** First buy of a position (SOL). */
  firstBuy: number;
  /** Each add-on buy (SOL), capped by addRqShare of current rq. */
  addSize: number;
  /** Add size also capped at this share of current rq. */
  addRqShare: number;
  /** Rq must climb this much (SOL) above the last buy's rq to earn an add. */
  addStep: number;
  /** Most SOL at cost in one position. */
  stakeCap: number;
  /** Most SOL at cost in one position on a creator-sold coin (0 = same as
   * stakeCap). Creator-sold entries are lower conviction, so a smaller cap
   * bounds the damage on a reshuffled window where their completions are
   * destroyed but the entries still happen. */
  creatorStakeCap: number;
  /** Smallest buy worth sending. */
  minBuy: number;
  /** Slippage on buys (bps); sells always go out wide open. */
  buySlippage: number;
  /** Trailing stop from the position's best value (share). */
  trail: number;
  /** Exit when no trade has printed for this many slots. */
  staleAfter: number;
  /** Exit after this many slots held (unless the position is well up). */
  holdMax: number;
  /** Exit after this many slots held while still underwater (0 = disabled). */
  underwaterMax: number;
  /** Exit on any single recorded sell of at least this many SOL. */
  whaleSellSol: number;
  /** Most real positions open at once (the rest of the cap is for probes). */
  maxPositions: number;
  /** Most SOL at cost across all positions at once (a drawdown guard). */
  exposureCap: number;
  /** Guardrail pacing targets. */
  probeCoins: number;
  probeFills: number;
  paceWindowSecs: number;
  probeSize: number;
  probeMax: number;
}

export const DEFAULT_CONFIG: Config = {
  dip: 0.2,
  retake: 1.0,
  retakeWindow: 200,
  chaseCap: 1.05,
  buyers: 25,
  topShare: 0.4,
  rqLo: 15,
  rqHi: 80,
  ageMin: 50,
  createMult: 1.5,
  blockCreatorSold: false,
  creatorBuyers: 180,
  creatorRq: 25,
  creatorFirstSellAge: 10,
  creatorFirstSellSol: 5,
  creatorExitWhileHolding: true,
  creatorExit: true,
  entriesPerCoin: 1,
  firstBuy: 0.15,
  addSize: 0.4,
  addRqShare: 0.01,
  addStep: 3,
  stakeCap: 4.0,
  creatorStakeCap: 2.0,
  minBuy: 0.01,
  buySlippage: 1500,
  trail: 0.35,
  staleAfter: 600,
  holdMax: 4000,
  underwaterMax: 2000,
  whaleSellSol: 6,
  maxPositions: 4,
  exposureCap: 9,
  probeCoins: 25,
  probeFills: 60,
  paceWindowSecs: 21_600,
  probeSize: 0.01,
  probeMax: 1,
};

const SOL = 1e9;
/** Curve fees (protocol + creator) charged on each side, as a share of quote. */
const CURVE_FEE = 0.0125;
/** Sells always go out wide open: the full 10,000 bps of slippage. */
const SELL_SLIPPAGE = 10_000;
/** A position past its max hold only exits while below this multiple of cost. */
const HOLD_EXIT_BELOW = 1.1;
/** Probes only open on curves holding at least this much real SOL above the minimum. */
const PROBE_RQ_MARGIN = 1.5;
/** Each sell chunk's proceeds stay under this share of current real SOL. */
const SELL_CHUNK_SHARE = 0.5;
/** Sentinel for "this coin has never been exited". */
const NEVER = -1e12;

interface CoinTape {
  created: number | null;
  createPrice: number;
  creator: string | null;
  creatorSold: boolean;
  /** Creator sells counted so far (for the while-holding exit). */
  creatorSellCount: number;
  /** Slot of the creator's first sell, or null if the creator never sold. */
  firstSellSlot: number | null;
  /** SOL size of the creator's first sell, or null if never sold. */
  firstSellSol: number | null;
  /** Highest recorded price since creation. */
  peak: number;
  /** True once the price has dipped dip below the running peak. */
  dipped: boolean;
  /** Slot of the latest full recovery (price retaking the peak after a dip). */
  recoveredSlot: number;
  /** The peak price that was retaken at the latest recovery. */
  recoveredPeak: number;
  /** Lifetime buy SOL by wallet. */
  buyerSol: Map<string, number>;
  /** Lifetime buy SOL across all wallets. */
  totalBuySol: number;
  /** Slot of the latest recorded trade. */
  lastTrade: number;
  entries: number;
  lastExitSlot: number;
}

interface OpenPosition {
  openedSlot: number;
  bestValue: number;
  /** SOL sent in buys for this position (fees included). */
  invested: number;
  exiting: boolean;
  filled: boolean;
  /** Add-on buys taken so far (0 = first buy only). */
  adds: number;
  /** Creator sells counted when the position opened (while-holding exit). */
  creatorSellsAtOpen: number;
  /** Real SOL in the curve when the last buy was decided. */
  lastBuyRq: number;
  /** Recorded price when the last buy was decided. */
  lastBuyPrice: number;
  /** Close value at the latest batch (SOL, curve and tx fees deducted). */
  closeValue: number;
}

/** Mark-to-market close value of a position in SOL, after curve and tx fees. */
function markToMarket(tokens: number, vq: number, vt: number, txSol: number): number {
  return ((tokens * vq) / (vt + tokens) / SOL) * (1 - CURVE_FEE) - txSol;
}

/**
 * Exit decision for a held position, checks in order: trailing stop, stale
 * (no trade for a while), whale sell, creator sell while holding,
 * underwater too long, then the time limit — which only fires while the
 * position is not well up. There is no take-profit: winners are ridden
 * until they roll over. A position already exiting stays exiting.
 */
function exitWanted(
  pos: OpenPosition,
  value: number,
  cost: number,
  now: number,
  lastTradeSlot: number,
  whaleDump: boolean,
  creatorSoldNow: boolean,
  cfg: Config,
): boolean {
  if (pos.exiting) return true;
  if (pos.bestValue > 0 && value < pos.bestValue * (1 - cfg.trail)) return true;
  if (now - lastTradeSlot > cfg.staleAfter) return true;
  if (whaleDump) return true;
  if (cfg.creatorExit && creatorSoldNow) return true;
  if (cfg.underwaterMax > 0 && now - pos.openedSlot > cfg.underwaterMax && value < cost) return true;
  if (now - pos.openedSlot > cfg.holdMax && value < cost * HOLD_EXIT_BELOW) return true;
  return false;
}

/**
 * Size a buy in SOL from the per-mint cap, the wanted size, the exposure
 * headroom and the free cash; returns null when the result is too small.
 */
function sizeOrder(capSol: number, want: number, headroom: number, freeSol: number, txSol: number, minBuy: number): number | null {
  let amount = Math.min(capSol, want, headroom);
  if (amount > freeSol - txSol) amount = freeSol - txSol;
  return amount < minBuy ? null : amount;
}

/**
 * Largest token chunk whose sale proceeds stay under SELL_CHUNK_SHARE of the
 * curve's real SOL: a big position on a thin curve must leave in pieces, or
 * the whole sell is rejected for exceeding the reserves.
 */
function sellSlice(tokens: number, vq: number, vt: number, rqLamports: number): number {
  const targetQuote = (rqLamports * SELL_CHUNK_SHARE) / SOL;
  const vqSol = vq / SOL;
  if (targetQuote <= 0 || vqSol <= targetQuote) return tokens;
  const chunk = (targetQuote * vt) / (vqSol - targetQuote);
  return Math.min(tokens, Math.max(1, Math.floor(chunk)));
}

export function buildBot(cfg: Config = DEFAULT_CONFIG): Bot {
  const tapes = new Map<Pubkey, CoinTape>();
  const open = new Map<Pubkey, OpenPosition>();
  /** Probe round trips in flight, by mint: false while buying, true once selling. */
  const probes = new Map<Pubkey, boolean>();
  /** The bot's own filled orders and the coins they were on (harness closes excluded). */
  let fillsSeen = 0;
  const coinsTouched = new Set<Pubkey>();
  let windowStart: number | null = null;
  let windowEnd: number | null = null;

  const tapeOf = (mint: Pubkey): CoinTape => {
    let t = tapes.get(mint);
    if (t === undefined) {
      t = {
        created: null, createPrice: 0, creator: null, creatorSold: false,
        creatorSellCount: 0, firstSellSlot: null, firstSellSol: null,
        peak: 0, dipped: false, recoveredSlot: NEVER, recoveredPeak: 0,
        buyerSol: new Map(), totalBuySol: 0, lastTrade: 0, entries: 0, lastExitSlot: NEVER,
      };
      tapes.set(mint, t);
    }
    return t;
  };

  /** Dip-recovery entry signal on a coin's lifetime tape at slot `now`. */
  const entryOk = (t: CoinTape, now: number, rqSol: number, price: number): boolean => {
    if (t.created === null || now - t.created < cfg.ageMin) return false;
    if (t.creatorSold) {
      // A sold creator is not an automatic no — but the bar is much higher:
      // the coin must have proved itself with far more buyers and real SOL
      // than a clean coin needs, and the creator's first sell must have been
      // early (a dump after a pump stays out).
      if (cfg.blockCreatorSold) return false;
      if (t.buyerSol.size < cfg.creatorBuyers) return false;
      if (rqSol < cfg.creatorRq) return false;
      if (cfg.creatorFirstSellAge > 0 && (t.firstSellSlot === null || t.firstSellSlot - t.created > cfg.creatorFirstSellAge)) return false;
      if (cfg.creatorFirstSellSol > 0 && (t.firstSellSol === null || t.firstSellSol > cfg.creatorFirstSellSol)) return false;
    }
    if (rqSol < cfg.rqLo || rqSol > cfg.rqHi) return false;
    if (t.createPrice <= 0 || price < t.createPrice * cfg.createMult) return false;
    if (t.buyerSol.size < cfg.buyers) return false;
    let biggest = 0;
    for (const v of t.buyerSol.values()) if (v > biggest) biggest = v;
    if (t.totalBuySol <= 0 || biggest > cfg.topShare * t.totalBuySol) return false;
    // A recovery must have happened recently, and the price must not have
    // run away from it since (no chasing a vertical move).
    if (t.recoveredSlot === NEVER || now - t.recoveredSlot > cfg.retakeWindow) return false;
    if (price > t.recoveredPeak * cfg.chaseCap) return false;
    return true;
  };

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const now = batch.slot;
      const whaleDump = new Set<Pubkey>();
      const traded = new Set<Pubkey>();
      for (const f of batch.fills) {
        if (f.status === 'filled' && !f.client_id.startsWith('_')) {
          fillsSeen++;
          coinsTouched.add(f.mint);
        }
      }
      for (const e of batch.events) {
        if (e.block_time !== null) {
          if (windowStart === null) windowStart = e.block_time;
          if (windowEnd === null || e.block_time > windowEnd) windowEnd = e.block_time;
        }
        if (e.event === 'CreateEvent') {
          const t = tapeOf(e.mint);
          t.created = e.slot;
          t.creator = e.creator;
          const vq = Number(e.virtual_quote_reserves);
          const vt = Number(e.virtual_token_reserves);
          t.createPrice = vt > 0 ? vq / vt : 0;
          if (t.createPrice > t.peak) t.peak = t.createPrice;
        } else if (e.event === 'TradeEvent') {
          const t = tapeOf(e.mint);
          const sol = Number(e.sol_amount) / SOL;
          const price = Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves);
          t.lastTrade = e.slot;
          if (price > t.peak) t.peak = price;
          // Dip then recovery, tracked off the running peak: once the price
          // has fallen dip below the peak, the next retake of the peak
          // (to retake of it) is a recovery event.
          if (t.peak > 0 && price <= t.peak * (1 - cfg.dip)) t.dipped = true;
          if (t.dipped && t.peak > 0 && price >= t.peak * cfg.retake) {
            t.recoveredSlot = e.slot;
            t.recoveredPeak = t.peak;
            t.dipped = false;
          }
          if (e.is_buy) {
            t.buyerSol.set(e.user, (t.buyerSol.get(e.user) ?? 0) + sol);
            t.totalBuySol += sol;
          } else {
            if (sol >= cfg.whaleSellSol) whaleDump.add(e.mint);
            if (t.creator !== null && e.user === t.creator) {
              t.creatorSold = true;
              t.creatorSellCount++;
              if (t.firstSellSlot === null) {
                t.firstSellSlot = e.slot;
                t.firstSellSol = sol;
              }
            }
          }
          traded.add(e.mint);
        }
      }
      const marks = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingCount = new Map<Pubkey, number>();
      for (const po of state.pending.values()) pendingCount.set(po.order.mint, (pendingCount.get(po.order.mint) ?? 0) + 1);

      const orders: OrderInput[] = [];
      const orderCap = state.hello.caps.max_orders_per_batch;
      const txSol = Number(state.txFeeLamports()) / SOL;

      // Exits first, in chunks sized to the curve's real SOL.
      for (const [mint, pos] of open) {
        const heldPos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (heldPos === undefined) {
          if (!pendingCount.has(mint)) {
            open.delete(mint);
            const t = tapeOf(mint);
            if (pos.filled) t.lastExitSlot = now;
            else t.entries--;
          }
          continue;
        }
        pos.filled = true;
        if (curve === undefined || curve.complete) continue;
        const mk = marks.get(mint);
        const vq = mk ? Number(mk.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const vt = mk ? Number(mk.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const tokens = Number(heldPos.token_amount);
        const value = markToMarket(tokens, vq, vt, txSol);
        const cost = Number(heldPos.cost_lamports) / SOL;
        if (value > pos.bestValue) pos.bestValue = value;
        pos.closeValue = value;
        const t = tapeOf(mint);
        // Creator exit: only on sells that happen while holding (when the
        // while-holding mode is on); a creator who sold before entry is
        // already priced into the stricter entry bar.
        const creatorSoldNow = cfg.creatorExitWhileHolding
          ? t.creatorSellCount > pos.creatorSellsAtOpen
          : t.creatorSold;
        if (!exitWanted(pos, value, cost, now, t.lastTrade, whaleDump.has(mint), creatorSoldNow, cfg)) continue;
        pos.exiting = true;
        if (pendingCount.has(mint)) {
          let sellPending = false;
          for (const po of state.pending.values()) if (po.order.mint === mint && po.order.side === 'sell') sellPending = true;
          if (sellPending) continue;
        }
        if (orders.length >= orderCap) break;
        const rqLamports = Number(curve.real_quote_reserves);
        const chunk = sellSlice(tokens, vq, vt, rqLamports);
        orders.push({ side: 'sell', mint, token_amount: BigInt(Math.floor(chunk)), max_slippage_bps: SELL_SLIPPAGE });
      }

      // Probe round trips: sell the whole probe as soon as its buy has landed.
      for (const [mint, selling] of probes) {
        const heldPos = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (heldPos === undefined) {
          if (!pendingCount.has(mint)) probes.delete(mint);
          continue;
        }
        if (curve === undefined || curve.complete || pendingCount.has(mint)) continue;
        if (orders.length >= orderCap) break;
        orders.push({ side: 'sell', mint, token_amount: heldPos.token_amount, max_slippage_bps: SELL_SLIPPAGE });
        if (!selling) probes.set(mint, true);
      }

      // Then entries and adds.
      let freeSol = Number(state.freeCashLamports()) / SOL;
      let slotsLeft = state.hello.caps.max_open_positions - state.committedPositionCount();
      let mainLeft = cfg.maxPositions - open.size;
      let exposure = 0;
      for (const [mint, pos] of open) exposure += Math.max(pos.invested, Number(state.positions.get(mint)?.cost_lamports ?? 0n) / SOL);
      for (const mint of traded) {
        if (orders.length >= orderCap) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (pendingCount.has(mint) || probes.has(mint)) continue;
        const t = tapes.get(mint)!;
        const pos = open.get(mint);
        const price = Number(curve.virtual_quote_reserves) / Number(curve.virtual_token_reserves);
        const rqSol = Number(curve.real_quote_reserves) / SOL;
        let want: number;
        if (pos === undefined) {
          if (slotsLeft <= 0 || mainLeft <= 0) continue;
          if (t.entries >= cfg.entriesPerCoin) continue;
          if (!entryOk(t, now, rqSol, price)) continue;
          want = cfg.firstBuy;
        } else {
          // Add only into real strength: rq climbed a full step above the
          // last buy's rq AND the price is above the last buy's price.
          // Losers stall and never earn an add; winners keep earning them.
          // Creator-sold positions scale to a smaller cap (when set): they
          // are lower conviction, and in a reshuffled window their
          // completions are destroyed while the entries still happen.
          const cap = t.creatorSold && cfg.creatorStakeCap > 0 ? cfg.creatorStakeCap : cfg.stakeCap;
          if (pos.exiting || !pos.filled || pos.invested >= cap - cfg.minBuy) continue;
          const heldPos = state.positions.get(mint);
          if (heldPos === undefined) continue;
          if (rqSol < pos.lastBuyRq + cfg.addStep) continue;
          if (price <= pos.lastBuyPrice) continue;
          want = Math.min(cfg.addSize, cfg.addRqShare * rqSol, cap - pos.invested);
        }
        const capSol = Math.floor(Number(state.maxBuyLamports(mint))) / SOL;
        const amount = sizeOrder(capSol, want, cfg.exposureCap - exposure, freeSol, txSol, cfg.minBuy);
        if (amount === null) continue;
        const lamports = BigInt(Math.floor(amount * SOL));
        orders.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: cfg.buySlippage });
        freeSol -= amount + txSol;
        exposure += amount;
        if (pos === undefined) {
          open.set(mint, { openedSlot: now, bestValue: 0, invested: amount, exiting: false, filled: false, adds: 0, creatorSellsAtOpen: t.creatorSellCount, lastBuyRq: rqSol, lastBuyPrice: price, closeValue: 0 });
          t.entries++;
          slotsLeft--;
          mainLeft--;
        } else {
          pos.invested += amount;
          pos.adds++;
          pos.lastBuyRq = rqSol;
          pos.lastBuyPrice = price;
        }
      }

      // Guardrail pacing: open a probe when the bot's fills or coins lag the pace.
      // The competition's minimum bar is a round trip of at least 0.01 SOL on
      // each of at least 20 coins, so a bot that only ever finds a handful of
      // dip-recovery entries would rank below every entry that meets it.
      // Probes are 0.01 SOL buy-then-sell round trips on fresh curves, paced
      // across the window so they do not crowd out real entries early.
      if (probes.size < cfg.probeMax && slotsLeft > 0 && windowStart !== null && windowEnd !== null) {
        const pace = Math.min(1, (windowEnd - windowStart) / cfg.paceWindowSecs);
        const needCoins = coinsTouched.size < Math.ceil(cfg.probeCoins * pace);
        const needFills = fillsSeen < Math.ceil(cfg.probeFills * pace);
        if (needCoins || needFills) {
          const minRq = (cfg.probeSize * 10_000) / state.hello.caps.max_order_bps_of_real_reserve;
          for (const mint of traded) {
            if (orders.length >= orderCap || probes.size >= cfg.probeMax) break;
            if (open.has(mint) || probes.has(mint) || pendingCount.has(mint) || state.positions.has(mint)) continue;
            if (needCoins && !needFills && coinsTouched.has(mint)) continue;
            const curve = state.curves.get(mint);
            if (curve === undefined || curve.complete) continue;
            if (Number(curve.real_quote_reserves) / SOL < minRq * PROBE_RQ_MARGIN) continue;
            if (freeSol < cfg.probeSize + 2 * txSol) break;
            orders.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(cfg.probeSize * SOL)), max_slippage_bps: cfg.buySlippage });
            probes.set(mint, false);
            freeSol -= cfg.probeSize + txSol;
          }
        }
      }
      return orders;
    },
  };
}
