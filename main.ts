// SPDX-License-Identifier: MIT
// Pump.fun Bot Sprint entry: dip-recovery paper bot for the pump.fun replay
// (agent-fun/replay/v2). The grader runs `node /bot/main.ts`; the strategy
// lives in strategy.ts and the SDK shim is the kit's sdk/ts/makefun-bot.ts,
// vendored byte for byte in vendor/.
//
// Design (see strategy.ts for the full reasoning): buy only dip-then-full-
// recovery shapes on dispersed coins, scale into strength with small adds,
// ride winners on a 0.35 trailing stop with no take-profit, and cut losers
// on whale dumps, creator sells while holding, or long underwater holds.
// Creator-sold coins enter only behind a much higher dispersion bar, at a
// 2 SOL stake cap. Small 0.01 SOL probe round trips keep the entry above
// the competition's minimum bar (a round trip of at least 0.01 SOL on each
// of at least 20 coins) without crowding out real entries.

import { runBot } from './vendor/makefun-bot.ts';
import { buildBot, DEFAULT_CONFIG } from './strategy.ts';

await runBot(buildBot(DEFAULT_CONFIG));
