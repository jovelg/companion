// Shared by the popup, the isolated-world bridge, and the page-world renderer.
(function (root) {
  "use strict";

  // Polymarket US — https://docs.polymarket.us/fees (effective 2026-11-14).
  // Taker fee per contract = Θ × p × (1 − p); Θ set by trailing 30-day taker volume.
  const POLYUS_TIERS = {
    t1: { theta: 0.095, label: "Tier 1 — under $10K (Θ 0.095)" },
    t2: { theta: 0.085, label: "Tier 2 — $10K–$50K (Θ 0.085)" },
    t3: { theta: 0.075, label: "Tier 3 — $50K–$250K (Θ 0.075)" },
    t4: { theta: 0.0695, label: "Tier 4 — $250K+ / new-account week (Θ 0.0695)" },
  };

  // Kalshi — https://kalshi.com/fee-schedule. Taker fee per contract = 0.07 × M × p × (1 − p).
  const KALSHI_FEES = {
    standard: { theta: 0.07, label: "Standard markets (0.07)" },
    reduced: { theta: 0.035, label: "Reduced-fee series, e.g. S&P/Nasdaq (0.035)" },
  };

  // ProphetX — Fee Schedule for Straight Contracts v1.0 (2026-11-05).
  // NHL: taker fee per contract = 0.035 × p × (1 − p). Everything else: 2% of net gains per market.
  const PROPHETX_MODELS = {
    auto: { label: "Auto (NHL taker fee, else 2%)" },
    commission: { label: "2% of net winnings" },
    taker: { label: "NHL taker fee (0.035)" },
  };
  const PROPHETX_COMMISSION = 0.02;
  const PROPHETX_TAKER_THETA = 0.035;

  const SITES = {
    polyus: { name: "Polymarket US", hosts: ["polymarket.us"] },
    kalshi: { name: "Kalshi", hosts: ["kalshi.com"] },
    prophetx: { name: "ProphetX", hosts: ["prophetx.co"] },
  };

  const FORMATS = {
    both: "Both (45.1¢ (+122))",
    american: "American Odds (+122)",
    price: "Price Only (45.1¢)",
  };

  const DEFAULTS = {
    enabled: true,
    format: "both",
    showBook: true,
    showButtons: true,
    polyusEnabled: true,
    polyusTier: "t1",
    kalshiEnabled: true,
    kalshiFee: "standard",
    prophetxEnabled: true,
    prophetxModel: "auto",
  };

  function siteForHost(hostname) {
    for (const [id, site] of Object.entries(SITES)) {
      if (site.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) return id;
    }
    return null;
  }

  const c2 = (x) => `${(x * 100).toFixed(2)}¢`;

  /**
   * Per-contract taker model with fee θ × p × (1 − p).
   * side "buy" (lifting an ask): pay p + fee. side "sell" (hitting a bid): receive p − fee.
   */
  function thetaModel(theta) {
    return {
      apply(p, side) {
        const fee = theta * p * (1 - p);
        return side === "sell" ? p - fee : p + fee;
      },
      describe(p, side) {
        const fee = theta * p * (1 - p);
        if (side === "sell") {
          const net = p - fee;
          return (
            `Sell at bid ${c2(p)} − taker fee ${c2(fee)} (Θ ${theta}) = ${c2(net)} per contract\n` +
            `Equivalent to buying the opposite side at ${c2(1 - net)}`
          );
        }
        return `Buy at ask ${c2(p)} + taker fee ${c2(fee)} (Θ ${theta}) = ${c2(p + fee)} per contract`;
      },
    };
  }

  /**
   * Commission on winnings: pay p, win (1 − p) minus rate × (1 − p).
   * Break-even probability q = p / (1 − rate × (1 − p)).
   */
  function commissionModel(rate) {
    const pct = (x) => `${(x * 100).toFixed(2)}%`;
    return {
      apply(p) {
        return p / (1 - rate * (1 - p));
      },
      describe(p) {
        const q = p / (1 - rate * (1 - p));
        return (
          `Buy at ${pct(p)}; ${rate * 100}% fee on winnings cuts profit per $1 contract ` +
          `from ${c2(1 - p)} to ${c2((1 - p) * (1 - rate))}\n` +
          `Break-even probability ${pct(q)} (assumes no other position in this market)`
        );
      },
    };
  }

  /** Fee model for a site given settings; ctx.nhl is the ProphetX league hint. */
  function pricing(site, settings, ctx) {
    if (site === "polyus") {
      return thetaModel((POLYUS_TIERS[settings.polyusTier] || POLYUS_TIERS.t1).theta);
    }
    if (site === "kalshi") {
      return thetaModel((KALSHI_FEES[settings.kalshiFee] || KALSHI_FEES.standard).theta);
    }
    const model = settings.prophetxModel;
    const taker = model === "taker" || (model === "auto" && ctx && ctx.nhl);
    return taker ? thetaModel(PROPHETX_TAKER_THETA) : commissionModel(PROPHETX_COMMISSION);
  }

  /** American odds for an implied probability q (0–1), rounded to an integer. */
  function americanOdds(q) {
    if (!(q > 0 && q < 1)) return null;
    if (q > 0.5) return -Math.round((100 * q) / (1 - q));
    return Math.round((100 * (1 - q)) / q);
  }

  function formatAmerican(q) {
    const odds = americanOdds(q);
    if (odds === null) return "—";
    return odds > 0 ? `+${odds}` : `\u2212${Math.abs(odds)}`;
  }

  /** unit "¢" → "45.08¢"; unit "%" → "45.08%". */
  function formatPrice(q, decimals, unit) {
    return `${(q * 100).toFixed(decimals)}${unit}`;
  }

  function formatQuote(q, format, decimals, unit) {
    if (format === "american") return formatAmerican(q);
    const price = formatPrice(q, decimals, unit);
    return format === "price" ? price : `${price} (${formatAmerican(q)})`;
  }

  /** Parses "42.75¢", "43%", "$0.43" into a 0–1 price; null otherwise. */
  function parsePrice(text) {
    const t = text.replace(/\s+/g, "");
    let m = /^(\d{1,2}(?:\.\d+)?)[¢%]$/.exec(t);
    if (m) return Number(m[1]) / 100;
    m = /^\$(0?\.\d+)$/.exec(t);
    if (m) return Number(m[1]);
    return null;
  }

  const api = {
    POLYUS_TIERS,
    KALSHI_FEES,
    PROPHETX_MODELS,
    SITES,
    FORMATS,
    DEFAULTS,
    siteForHost,
    pricing,
    americanOdds,
    formatAmerican,
    formatPrice,
    formatQuote,
    parsePrice,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ExchangeCompanion = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
