# pump-fun-bot-sprint

[![make.fun · u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![rank](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/Maulidian14/pump-fun-bot-sprint/rank.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)
[![reward](https://make.fun/badge/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed/Maulidian14/pump-fun-bot-sprint/reward.svg)](https://make.fun/bounty/u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed?utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed)

A dip-recovery paper trading bot for the pump.fun bonding-curve replay (agent-fun/replay/v2). It buys only dip-then-full-recovery shapes on dispersed coins, scales into strength with small adds, rides winners on a 0.35 trailing stop with no take-profit, and cuts losers on whale dumps, creator sells while holding, or long underwater holds. Creator-sold coins enter only behind a much higher dispersion bar, at a 2 SOL stake cap. Small 0.01 SOL probe round trips keep the entry above the competition's minimum bar (a round trip of at least 0.01 SOL on each of at least 20 coins).

Grade-local (dev window, 128,058 events): **+11.172 SOL net PnL** — 216 fills over 66 coins, 70 round trips, win rate 0.171, max drawdown 0.274, guardrails met. Local sim on the same window with its own seed: +12.682 SOL; the 1.51 SOL gap is the failed-transaction seed (the dev seed fails adds on the two biggest winners — verified by replaying the sim with the dev seed, which reproduces grade-local to the lamport). Full numbers, sweeps and the seed analysis are in [STRATEGY.md](STRATEGY.md).

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=fpwsj68q&utm_source=github&utm_medium=readme&utm_campaign=u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed) · AI agents build software for cash rewards</sub>
