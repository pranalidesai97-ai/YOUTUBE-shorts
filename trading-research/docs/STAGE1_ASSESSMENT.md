# Stage 1 — Feasibility, Independent Assessment & Architecture

Status: **proposal, not implementation.** Nothing in this document has been
tested against live market data. No strategy is claimed to work.
Date of assessment: 2026-10-29.

---

## 0. What was inspected

| Item | Finding |
|---|---|
| Repository | `YOUTUBE-shorts` holds an unrelated video-rendering pipeline (Node + Python). It has no trading code to build on. |
| Python | 3.13, with numpy 2.5 and pandas 3.0 preinstalled. PyPI is reachable, so dependencies can be installed. |
| Node | v22 (not needed for the recommended stack). |
| Network | **The egress policy blocks every market-data host tested:** `nsearchives.nseindia.com`, `archives.nseindia.com`, `www.nseindia.com`, `niftyindices.com`, `query1.finance.yahoo.com`, `www.bseindia.com` (all return HTTP 403 at the proxy). Only package registries are allowed. |
| Disk | About 30 GB free. That is enough for full NSE daily history. |

**Consequence:** no data source can be evaluated empirically from this
session. To fix it, add the NSE hosts to *Allowed domains* in the cloud
environment's network settings
(https://code.claude.com/docs/en/cloud-environments#network-access), or run the
data job on your own machine. Until then, every data claim below comes from
documentation and prior knowledge, and each one is marked *unverified*.

---

## 1. Five highest-impact improvements to the brief (ranked)

### 1. Reframe November as an operational forward test, and pre-register before 2 November

*Problem.* Today is Thu 29 Oct 2026. The window opens Mon 2 Nov, which is two
working days away. November has roughly 18–19 regular sessions. Diwali falls in
this window: Muhurat trading is a special session to exclude, and the exchange
holidays must come from NSE's official 2026 holiday list, not from memory. A
swing strategy holding 5–15 days will produce maybe **10–40 closed trades**.
Statistically, that sample cannot tell an edge from noise. If per-trade returns
have a standard deviation of about 1.2R, detecting a true expectancy of +0.2R at
95% confidence needs about (1.96 × 1.2 / 0.2)² ≈ **140 trades**. November alone
cannot answer questions 5, 6 or 8 in the brief.

*Proposal.*
- Freeze a written **baseline spec v0** (Section 4) before the first signal.
  Record its hash in Git, so its rules provably predate the outcomes.
- Treat November as a test of the **pipeline and execution realism**:
  - Data arrives on time and passes validation.
  - The gap between signal price and achievable open price.
  - Cancelled entries.
  - Operational errors.
- Strategy edge is judged on the walk-forward historical out-of-sample results.
- Paper trading **continues after November** until the forward sample reaches
  about 100+ trades.
- If the full pipeline isn't ready by 2 Nov, logging starts on the first day it
  is ready. Missed days are reported as missed and never backfilled.

*Cost:* none. *Test:* a pre-registration hash, an append-only log, and a
report that states its sample size and confidence intervals.

### 2. Build point-in-time, survivorship-free data from official NSE archives, not Yahoo or a current constituent list

*Problem.*
- `yfinance` is an unofficial scraper, and Yahoo's terms prohibit that use.
- Its adjusted prices for NSE stocks have well-known split and bonus errors and
  missing sessions, and it often breaks.
- A universe built from today's Nifty 500 list is **survivorship-biased**: it
  quietly drops delisted, merged and demoted stocks, which inflates backtests.

*Proposal.*
- Use the NSE **daily CM bhavcopy** archive as the primary source. Since July
  2024 it uses the UDiFF format, `BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F_0000.csv.zip`,
  and older files use the legacy format.
- Each file lists every security traded that day, including ones that later
  delisted. That lets us build the universe point-in-time: for example, the top
  N by trailing median traded value as of each date. No historical
  index-membership data is needed.
- Store the raw files **immutably**, with a SHA-256 hash and a download
  timestamp for each.
- Build adjusted series ourselves from NSE's corporate-actions data (splits,
  bonuses, rights; dividends optional), with an auditable adjustment-factor table.
- Benchmark: **Nifty 50 TRI and Nifty 500 TRI**, total-return indices from
  niftyindices.com. A price index would understate the benchmark by the
  dividend yield.
- Secondary or cross-check source: a broker historical-data API (Upstox, Angel
  One SmartAPI, or Zerodha Kite Connect). These need a broker account and API
  key, so they are an explicit opt-in decision for you.

*Caveats (unverified until tested):*
- NSE's website terms restrict automated access. Downloading published reports
  for personal, non-commercial research is common practice, not an explicit
  licence. Read the terms yourself. A commercial use would need licensed data
  from NSE Data & Analytics.
- NSE is known to throttle or block many datacenter IPs. Whether the daily job
  works from GitHub Actions or a cloud VM must be **tested before we depend on
  it**. A home connection in India is the most likely to work.
- Bhavcopy prices are unadjusted. Corporate-action adjustment is real
  engineering and the most error-prone part of the data layer, so it gets its
  own tests.

*Cost:* ₹0. *Test:* reconcile adjusted closes against a second source for a
sample of known split and bonus events, and check that coverage is complete
for every trading day.

### 3. Model Indian market microstructure, not generic costs

Generic backtesters miss several things that matter on NSE:

- **Circuit limits.** Price bands of 2/5/10/20%. A stock locked at its upper
  circuit cannot be bought. One locked at its lower circuit cannot be sold, so
  **the stop-loss does not execute**. The engine must detect locked days
  (high = low = band limit) and refuse fills.
- **Series and surveillance.** Trade only the `EQ` series. Exclude `BE`
  (trade-to-trade) and, where lists are available, stocks under ASM/GSM
  surveillance. Historical ASM/GSM lists are hard to get, which is a documented
  limitation.
- **Gaps and the pre-open auction.** The bhavcopy open is the pre-open
  equilibrium price. A gap through the stop fills at the open, not at the stop.
- **Delivery costs.** These must be versioned by effective date, and the current
  values must be verified before use:
  - STT 0.1% on both buy and sell.
  - NSE transaction charge.
  - SEBI fee.
  - Stamp duty 0.015% on buys.
  - 18% GST on brokerage and charges.
  - DP charge per scrip on each sell day.
  - Brokerage (your broker's plan).
- **Tax.** Short-term capital gains (20% under the rules in force since July
  2024; re-verify) is applied as an annual overlay with loss set-off, not as a
  per-trade cost.
- **Capacity.** Cap each order at a small fraction (for example 1%) of the
  stock's 20-day median traded volume.
- **Slippage.** Configurable basis points, set wider for lower-liquidity names.

*Cost:* engineering only. *Test:* hand-computed unit tests for each rule
(Stage 3).

### 4. A research protocol that defends against overfitting and multiple testing

*Problem.* Trying many indicators and parameters and keeping the best result
almost guarantees a false positive.

*Proposal:*
- **Experiment registry.** Every backtest run is logged with its config hash,
  data-version hash, Git commit, date and full metrics, whether the result was
  kept or discarded. The number of trials is always visible.
- **Chronological splits.**
  - Development: about 2010–2020.
  - Validation: 2021–2023.
  - Locked holdout: 2024 to Oct 2026, opened once per strategy version.
  - Anchored walk-forward inside the development period.
- **Mandatory baselines** that every strategy must beat after costs:
  - Buy-and-hold Nifty 50 TRI.
  - An equal-weight universe.
  - **Random entries with the same exits, holding period and exposure.** This
    one tells us whether the *selection* adds value, or whether returns come
    from market beta and exit rules.
- **Statistics:**
  - Bootstrap confidence intervals on expectancy.
  - Deflated Sharpe, or at least a trial-count disclosure.
  - Results with the top 5 trades removed (concentration check).
  - Results by regime.

*Cost:* modest. *Test:* the registry is append-only, and reports refuse to
render metrics without trade count, period and cost assumptions.

### 5. Narrow the strategy menu to families with documented evidence, and test portfolios rather than isolated signals

*Problem.* A long indicator list (RSI, MACD, Bollinger and so on) adds
parameters, not evidence. Per-signal backtests also ignore what actually
happens with limited capital: concurrency limits, risk caps and overlapping
positions change results materially.

*Proposal:*
- **Start with one family that has published evidence in Indian equities:**
  cross-sectional **momentum / relative strength** (for example 6–12-month
  return with the last week or month skipped), combined with a **trend/regime
  filter** and **ATR-based risk**. NSE's own momentum indices, such as Nifty200
  Momentum 30, show the effect is well recognised locally. That is not a
  guarantee it persists, or that it survives swing-trading turnover costs.
- **Treat breakouts and pullbacks as hypotheses** to test against that baseline,
  one change at a time.
- **Test fixed targets against trailing exits.** Fixed 2R targets cut off the
  right tail that momentum strategies depend on. The brief assumes targets; the
  data should decide.
- **Defer machine learning** until the baseline has several hundred
  out-of-sample trades. Before that, ML mostly fits noise.
- Run the **backtest at portfolio level**, with the risk module (Section E)
  inside the engine, so the backtest and the paper ledger use identical sizing
  and limits.

*Also challenged:*
- **"Missed opportunities = stocks that rose."** This invites hindsight bias.
  Define it mechanically: names in the eligible universe whose forward return
  ranked in the top decile, and which rule excluded them. Report it as a
  diagnostic only, and **never tune on November's misses.** Any tuning goes into
  v1 and is judged on fresh data.
- **AI news summaries.** These need a verified, licensed announcement source
  (NSE corporate announcements, which have the same access caveats) and an LLM
  API. Defer to after Stage 4. The core works without them.

---

## 2. Recommended architecture

Keep the **data and signal pipeline separate from the UI**, because the daily
job must run where NSE is reachable.

```
┌──────────────── daily job (CLI, cron) ────────────────┐
│ fetch bhavcopy + index + corp actions → raw/ (immutable, hashed)
│ validate → quality report → clean Parquet (adjusted)
│ scan (frozen strategy version) → signals
│ append to ledger (hash-chained) → git commit + push   │  ← GitHub's push time
└───────────────────────────────────────────────────────┘    acts as an external
                 │                                           timestamp
        ┌────────┴─────────┐
        │  core library    │  data · validation · indicators · strategies ·
        │  (pure Python)   │  backtest engine · costs · risk · metrics · ledger
        └────────┬─────────┘
                 │
        ┌────────┴─────────┐
        │ Streamlit UI     │  overview/data quality · watchlist · stock view ·
        │ (read-only)      │  backtests · paper ledger · strategy comparison ·
        └──────────────────┘  risk · CSV export
```

| Concern | Choice | Why / alternatives rejected |
|---|---|---|
| Language | Python 3.12+ with pandas and numpy | Matches the brief and the environment. |
| Backtest engine | **Own small event-loop over daily bars** | Transparent, testable fill rules. Backtrader is unmaintained. vectorbt's vectorised semantics hide fill details. Zipline-reloaded is heavy and US-centric. |
| Market data store | Parquet with DuckDB for queries | Free, fast, single-file, no server. |
| Ledger / experiments | SQLite with append-only triggers, a hash chain, and a JSONL mirror committed to Git | Tamper-evident and free. Git history gives an audit trail outside the database. |
| UI | **Streamlit** with Plotly | Python-only and fast to build. Acceptable on mobile for tables and charts. The UI is read-only, so the engine never depends on it. FastAPI with a JS frontend gives a better mobile UX but roughly 3× the work. Revisit only if Streamlit limits us. |
| Tests | pytest with hand-computed fixtures | Required for Stage 3. |
| Daily job host | (a) **your own machine** (most likely to reach NSE), (b) GitHub Actions cron (free; NSE reachability untested), (c) Oracle Cloud Always-Free VM in an Indian region, or a small India VPS (~₹400–1,000/month) | Choose after a reachability test. |
| UI host | Local first. Optionally Streamlit Community Cloud (free; restrict viewers; ephemeral disk, so it reads ledger and data from the repo or artifacts). | |
| AI assistant | Deferred. When added: Claude API, key in env/secret store only, estimated a few US dollars per month for a daily summary. Optional and off by default. | The core works without it. |

Timing convention: the bhavcopy is typically published in the evening (IST).
Signals are computed after it is validated, and become eligible at the **next
session's open (09:15 IST, pre-open 09:00–09:08)**. A signal is never filled at
the signal day's close.

Proposed layout (in its own repository):

```
swingtrade/
  data/        sources.py  ingest.py  validate.py  adjust.py  universe.py  calendar.py
  features/    indicators.py  (each feature documented with purpose)
  strategies/  base.py  momentum_trend_v0.py
  engine/      backtest.py  fills.py  costs.py  risk.py  metrics.py  splits.py
  ledger/      store.py  hashchain.py  paper.py
  research/    registry.py  baselines.py  bootstrap.py
  cli.py
app/           streamlit pages
config/        costs_2026.yaml  risk.yaml  universe.yaml  strategy_v0.yaml
tests/
docs/
```

---

## 3. Expected costs

| Item | Cost |
|---|---|
| Software stack | ₹0 |
| NSE bhavcopy, indices and corporate actions | ₹0 (personal-use caveat above) |
| Hosting | ₹0 locally or on GitHub Actions / Oracle free tier; ~₹400–1,000/month for an India VPS if needed |
| Broker data API (optional cross-check) | ₹0–500/month depending on broker; verify current pricing |
| LLM API (optional, deferred) | ~US$1–5/month for daily summaries |
| Licensed NSE data (commercial use only) | Expensive; not needed for personal research |

---

## 4. Draft baseline strategy spec v0 (to be frozen before paper trading)

Purpose: a deliberately simple, literature-motivated baseline. **This is not a
claim of an edge.**

- **Universe (point-in-time):**
  - `EQ` series only.
  - At least 250 sessions of history.
  - Close of ₹50 or more.
  - Top 200 by 60-day median traded value as of the signal date.
- **Regime filter:** Nifty 50 close above its 200-day SMA. When off, no new
  entries; the "No qualifying setup" state is shown.
- **Setup:**
  - Close > SMA50 > SMA200.
  - 126-day return, skipping the last 5 days, is in the top 20% of the universe.
  - Close at a 20-day closing high.
- **Entry:** next session's open, *only if* the open is no more than signal
  close + 0.5 × ATR14. Otherwise the signal is **cancelled and recorded**.
  Locked upper circuit means no fill.
- **Initial stop:** fill price − 2 × ATR14 (ATR measured on the signal day).
- **Exits, two pre-registered variants (two trials, disclosed):**
  - A: target at +2R, plus the stop, plus a 15-session time stop.
  - B: stop plus a trailing exit at a close below the 10-day low, plus a
    40-session time stop.
- **Same-bar ambiguity:** if one bar touches both stop and target, assume the
  **stop** filled. A gap through the stop fills at the open.
- **Sizing:**
  - Risk 0.5% of equity per trade.
  - Total open risk capped at 3%.
  - At most 8 positions.
  - Each position at most 20% of equity.
  - Participation at most 1% of 20-day median volume.
- **Costs:** delivery cost schedule (Section 1.3) plus 10 bps slippage on each
  side.

All parameters are placeholders until you confirm capital, broker and risk
limits.

---

## 5. Unresolved decisions and external dependencies

1. **Repository:** build in a new dedicated repo (recommended) or a subfolder
   of this one?
2. **Network access:** allow `nsearchives.nseindia.com`, `www.nseindia.com`,
   `archives.nseindia.com` and `niftyindices.com` for this environment so
   ingestion can be tested here.
3. **Where the daily job runs:** your machine, GitHub Actions, or a VM.
   Decided by the reachability test.
4. **November start:** accept a minimal "frozen v0 + logger" target for
   2 Nov (best effort), or start the forward log whenever the validated pipeline
   is ready, with no backfill either way.
5. **Risk inputs:** notional capital, broker (for the brokerage and DP charge
   schedule), and the risk limits in Section 4.
6. **Optional broker data account** as a cross-check source.
7. **AI assistant:** confirm deferral.

## 6. What is verified vs not

- Verified: environment contents, Python/pandas availability, and that this
  session's network policy blocks all market-data hosts.
- **Not verified:**
  - Any data source's reachability, format, completeness or terms.
  - Cost rates and tax rules (must be checked against current circulars).
  - The 2026 NSE holiday list.
  - Every performance-related statement. No backtest has been run.
