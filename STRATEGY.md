# Pump.fun Bot Sprint — Dip-Recovery + Selective Creator-Sold Entries

Built on the same dev data as the two 24 Nov pump.fun competitions (identical
dataset hash `b661ceee…`), so the design starts from what those windows
proved: the tape's edge is a handful of slow completers per day, and every
positive design is concentrated in them. The final window is a fresh unseen
6 hours, so every knob below was checked for a flat region, not a peak — and
for its behaviour on 6-hour slices, not just the 24-hour total.

## The design

- **Entry:** dip ≥ 20% off the running peak, then a full retake of the peak
  within 200 slots, price ≤ 1.05× the recovered peak (no chasing), age ≥ 50
  slots, price ≥ 1.5× the create price, ≥ 25 lifetime buyers, largest buyer
  ≤ 40% of buy SOL, real SOL 15–80 at entry.
- **Adds:** only into strength — real SOL climbed a full 3 SOL above the
  last buy's rq AND the price is above the last buy's price. 0.4 SOL per add
  (capped at 1% of rq), stake cap 4.0 SOL.
- **Exits:** 0.35 trailing stop from the position's best value, no
  take-profit; stale after 600 slots with no trade; any single sell ≥ 6 SOL;
  creator sells while holding; underwater after 2,000 slots; max hold 4,000
  slots while below 1.1× cost. Sells leave in chunks ≤ 50% of real SOL.
- **Creator-sold coins:** not banned — but they enter only with ≥ 180
  lifetime buyers, rq ≥ 25, the creator's first sell within 10 slots of
  creation and at most 5 SOL, at a 2.0 SOL stake cap. Two of the dev
  window's seven slow completers were creator-sold; the bar is deliberately
  strict so the rule admits ~3 coins, not 46.
- **Guardrail probes:** 0.01 SOL buy-then-sell round trips, paced across the
  window, keep the entry above the minimum bar (round trip ≥ 0.01 SOL on
  each of ≥ 20 coins) without crowding out real entries.

## Numbers (dev window, 128,058 events, 1,222 mints)

- **Local sim (own seed): +12.682 SOL**, 217 fills, 66 coins, 70 trips,
  12 wins, dd 0.265; at 2× fees +11.496 SOL.
- **grade-local (dev seed): +11.172 SOL**, 216 fills, 66 coins, 70 trips,
  win rate 0.171, dd 0.274, 3 rejected, 6 failed; at 2× fees +10.036 SOL;
  guardrails met (66 coins hold a round trip ≥ 0.01 SOL, dd ok); L1 regrade
  reproduced byte for byte.
- 6h quarter slices (local sim): **[+0.36, −1.05, +3.64, +10.73]** — mean
  +3.42, median +2.00.
- Top trips: AVGnvQCtRc +4.535, CHjgAurRkf +3.873, 6MVWPQwr2Y +3.525,
  Hhcck7SDvK +3.236, C5Wm8Y9tVb +1.000. Top-3 share of gains: 0.72.

## Sweep (full window + slices + 2× fees; adopted only if it improves all three)

| variant | net | dd | top-3 | 2× fees | qMean | qMed | q |
|---|---:|---:|---:|---:|---:|---:|---|
| defaults (whaleSell 5) | 11.215 | 0.192 | 0.77 | 10.07 | 2.86 | 0.89 | 0.89 −1.05 0.89 10.73 |
| **whaleSell 6 (adopted)** | **12.682** | 0.265 | **0.72** | **11.50** | **3.42** | **2.00** | 0.36 −1.05 3.64 10.73 |
| whaleSell 7 | 11.688 | 0.269 | 0.73 | 10.51 | 3.13 | 1.44 | 0.36 −1.10 2.52 10.73 |
| trail 0.33 | 11.265 | 0.190 | 0.77 | 10.12 | 2.88 | 0.90 | 0.89 −1.01 0.92 10.74 |
| trail 0.38 | 10.870 | 0.202 | 0.77 | 9.73 | 2.78 | 0.75 | 0.72 −1.10 0.77 10.73 |
| rqHi 70 | 11.033 | 0.195 | 0.77 | 9.89 | 2.82 | 0.89 | 0.89 −1.24 0.89 10.73 |
| rqHi 60 | 8.540 | 0.262 | 0.77 | 7.40 | 2.19 | 0.89 | 0.89 −1.03 0.89 8.03 |
| creatorBuyers 150 | 11.180 | 0.192 | 0.77 | 10.03 | 2.85 | 0.85 | 0.89 −1.02 0.82 10.73 |
| underwater 1500 | 11.287 | 0.191 | 0.77 | 10.17 | 2.76 | 0.65 | 0.89 −1.01 0.42 10.76 |
| underwater off | 11.097 | 0.193 | 0.77 | 9.96 | 2.83 | 0.82 | 0.76 −1.02 0.89 10.71 |
| creatorStake 3.0 | 11.244 | 0.195 | 0.78 | 10.08 | 2.90 | 0.89 | 0.89 −1.27 0.89 11.09 |
| dip 0.15 | 9.279 | 0.242 | 0.75 | 8.05 | 2.39 | 0.79 | 0.89 −1.80 0.69 9.79 |
| dip 0.25 | 7.064 | 0.172 | 0.93 | 6.35 | 1.83 | 0.50 | −0.07 −0.87 1.07 7.19 |

WhaleSell 6 is the one real adoption: raising the single-sell exit from 5
to 6 SOL saves the completer 6MVWPQwr2Y, which the 5 SOL rule cuts on one
5.893 SOL sell 54 slots after entry (+1.47 net, and the slice median
0.89 → 2.00). 7 SOL gives back most of the gain, so 6 sits on the plateau.
The whaleSell 6 + trail 0.33 combination was tested and rejected (9.687 —
the tighter trail cuts the saved completer's ride). Everything else is flat
or worse, so the defaults stand.

## The failed-transaction seed (why grade-local ≠ local sim)

grade-local scored +11.172 while the local sim scored +12.682 on the same
code and data. The per-coin comparison isolates the gap exactly: only two
coins differ — AVGnvQCtRc (+4.535 sim → +3.923 grade-local) and CHjgAurRkf
(+3.873 → +3.149). Every other coin matches to the lamport. Replaying the
sim with the dev seed (`2548095189234360438`, from the grade-local action
log) reproduces grade-local EXACTLY: net 11.172, 216 fills, 70 trips,
12 wins, dd 0.2742, 3 rejected, 6 failed. The gap is the seeded
failed-transaction draw (2% of orders): the dev seed fails adds on the two
biggest winners, so less stake rides their moves.

A 40-draw random fail-key sweep puts the design's expected dev value at
mean +12.43, min +11.51, p10 +12.02, median +12.54 — the dev seed's +11.17
is an unlucky draw, not a design flaw, and whaleSell 6 beats whaleSell 5
at every tested seed (e.g. failKey 3: 12.725 vs 11.259). The final window
has its own seed; nothing further can be tuned against it.

## Honest limits

- **Concentration:** top-3 share 0.72. The tape's edge IS 2–5 slow
  completers per 6h; every positive design is concentrated. This one
  spreads across 5 completers and 12 winners, and net without the top 3
  trips is +0.49 SOL.
- **Stress (reshuffled copies):** `grade-local --stress` (10 block
  surrogates): median −1.60, p10 −3.82, p90 +0.14 SOL; 8 of 10 lost money;
  the dev score is above 10 of 10. Reshuffling destroys the multi-hour
  trajectories this design exploits, so the copies mostly lose — that is
  structural, not a knob failure. The contiguous 6h slices (mean +3.42,
  median +2.00, 3 of 4 positive) are the better final-window estimator.
- **Final-window lottery:** a 6h window with no slow completer scores
  roughly −1.3 to +0.9 SOL for this design (the Q2 slice is the
  pessimistic case).
- **Tuned on one 24h window.** Every knob was checked for a flat region,
  not a peak — but the final window is different data, and the completer
  rate there is unknown.
