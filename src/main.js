// Page world: annotates order-book levels and outcome buttons on Polymarket US, Kalshi and
// ProphetX with fee-adjusted taker prices. Runs in the MAIN world so it can read the exact
// best-ask price React passes to Polymarket US outcome buttons (labels are rounded).
(function () {
  "use strict";
  const X = globalThis.ExchangeCompanion;
  const SITE = X.siteForHost(location.hostname);
  if (!SITE) return;

  const QUOTE = "pmx-quote";
  const HIDE = "data-pmx-hide";
  const HEAD = "data-pmx-head";
  const THROTTLE_MS = 150;

  let settings = null;
  let settingsVersion = 0; // Invalidates cached quote signatures when settings change.
  let timer = 0;
  let observing = false;

  // ---- Shared helpers -------------------------------------------------------

  let fiberKey = null;
  /** Exact price prop React renders into a Polymarket US animated price label. */
  function fiberPrice(el) {
    if (!fiberKey) {
      fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber$")) || null;
      if (!fiberKey) return null;
    }
    let fiber = el[fiberKey];
    for (let i = 0; fiber && i < 10; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object" && typeof props.value === "number" && "format" in props) {
        return props.value > 0 && props.value < 1 ? props.value : null;
      }
    }
    return null;
  }

  /** First descendant of `root` matching `selector` whose text parses as a price. */
  function priceChild(root, selector) {
    for (const el of root.querySelectorAll(selector)) {
      if (el.childElementCount === 0 && X.parsePrice(el.textContent) !== null) return el;
    }
    return null;
  }

  // ---- Site adapters --------------------------------------------------------
  // Each yields items: { kind, p, side, container, before?, hide?, className?, prefix?, stacked?, decimals }.
  // The quote span is kept as a direct child of `container`, inserted before `before`.

  const adapters = {
    polyus: {
      unit: "¢",
      book(emit) {
        for (const panel of document.querySelectorAll('[data-polykit-slot="market-row-panel"]')) {
          for (const bar of panel.querySelectorAll(
            '[class*="--total-ask-value"], [class*="--total-bid-value"]'
          )) {
            const row = bar.closest("button");
            const priceEl = row && priceChild(row, "p");
            if (!priceEl) continue;
            emit({
              kind: "book",
              p: X.parsePrice(priceEl.textContent),
              side: bar.className.includes("--total-ask-value") ? "buy" : "sell",
              container: priceEl.parentElement,
              decimals: 2,
            });
          }
        }
      },
      buttons(emit) {
        for (const label of document.querySelectorAll("button [data-replay-block]")) {
          const p = fiberPrice(label) ?? X.parsePrice(label.textContent);
          if (p === null) continue;
          emit({ kind: "button", p, side: "buy", container: label.parentElement, hide: label, decimals: 0 });
        }
      },
    },

    kalshi: {
      unit: "¢",
      book(emit) {
        // Price cell: <div class="w-[44px]"><span style="color: var(--kalshi-palette-red-x40 …)"><span>44¢
        for (const cell of document.getElementsByClassName("w-[44px]")) {
          const colored = cell.firstElementChild;
          const style = colored && colored.getAttribute("style");
          if (!style) continue;
          const side = style.includes("palette-red") ? "buy" : style.includes("palette-green") ? "sell" : null;
          const priceEl = side && colored.firstElementChild;
          const firstCol = cell.previousElementSibling;
          if (!priceEl || !firstCol) continue;
          const p = X.parsePrice(priceEl.textContent);
          if (p === null) continue;
          emit({ kind: "book", p, side, container: firstCol, decimals: 2 });
        }
      },
      buttons(emit) {
        for (const pill of document.querySelectorAll('[data-testid="price-pill"]')) {
          const priceEl = priceChild(pill, "span");
          if (!priceEl) continue;
          emit({
            kind: "button",
            p: X.parsePrice(priceEl.textContent),
            side: "buy",
            container: priceEl.parentElement,
            before: priceEl.nextSibling,
            hide: priceEl,
            className: priceEl.className,
            decimals: 0,
          });
        }
        // Trade panel toggle: <button aria-pressed><span>YES 43¢</span></button>
        for (const button of document.querySelectorAll("button[aria-pressed]")) {
          const span = button.firstElementChild;
          const m = span && /^(YES|NO)\s+(\d{1,2}(?:\.\d+)?¢)$/.exec(span.textContent.trim());
          if (!m) continue;
          emit({
            kind: "button",
            p: X.parsePrice(m[2]),
            side: "buy",
            container: button,
            hide: span,
            prefix: `${m[1]} `,
            className: "pmx-compact",
            decimals: 0,
          });
        }
      },
    },

    prophetx: {
      unit: "%",
      context() {
        // Fee model hint for "auto": NHL events use maker/taker fees.
        const board = document.querySelector('[data-slot="scoreboard-center"]');
        const league = board
          ? board.firstElementChild && board.firstElementChild.textContent
          : document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
        return { nhl: (league || "").trim() === "NHL" };
      },
      book(emit, mark) {
        for (const ladder of document.querySelectorAll('[data-slot="trade-slip-liquidity-ladder"]')) {
          const header = ladder.children[1];
          if (header) {
            for (const span of header.querySelectorAll("span")) {
              if (span.textContent === "Price") mark(span, HEAD);
            }
          }
          for (const half of ladder.querySelectorAll('[data-slot="ladder-ask"], [data-slot="ladder-bid"]')) {
            const priceEl = priceChild(half, ":scope > span");
            if (!priceEl) continue;
            emit({
              kind: "book",
              p: X.parsePrice(priceEl.textContent),
              side: "buy", // Both columns are prices to take that outcome.
              container: half,
              before: priceEl.nextElementSibling,
              hide: priceEl,
              stacked: true,
              decimals: 2,
            });
          }
        }
      },
      buttons(emit) {
        for (const button of document.querySelectorAll('[data-slot="odds-button"]')) {
          const priceEl = priceChild(button, "span");
          if (!priceEl) continue;
          emit({
            kind: "button",
            p: X.parsePrice(priceEl.textContent),
            side: "buy",
            container: priceEl.parentElement,
            before: priceEl.nextSibling,
            hide: priceEl,
            decimals: 1,
          });
        }
      },
    },
  };

  const adapter = adapters[SITE];

  // ---- Render engine (mark and sweep) --------------------------------------

  function render() {
    timer = 0;
    stopObserving();

    const active = settings && settings.enabled && settings[`${SITE}Enabled`];
    const quotes = new Set();
    const marks = new Map([[HIDE, new Set()], [HEAD, new Set()]]);

    if (active) {
      const ctx = adapter.context ? adapter.context() : null;
      const model = X.pricing(SITE, settings, ctx);
      const modelKey = `${settingsVersion}|${ctx ? ctx.nhl : ""}`;
      const mark = (el, attr) => {
        marks.get(attr).add(el);
        if (!el.hasAttribute(attr)) el.setAttribute(attr, "");
      };
      const emit = (item) => {
        if (item.p === null) return;
        quotes.add(upsertQuote(item, model, modelKey));
        if (item.hide) mark(item.hide, HIDE);
      };
      if (settings.showBook) adapter.book(emit, mark);
      if (settings.showButtons) adapter.buttons(emit, mark);
    }

    // Sweep anything not produced by this pass (feature toggled off, row recycled, price gone).
    for (const el of document.querySelectorAll(`.${QUOTE}`)) if (!quotes.has(el)) el.remove();
    for (const [attr, keep] of marks) {
      for (const el of document.querySelectorAll(`[${attr}]`)) if (!keep.has(el)) el.removeAttribute(attr);
    }

    if (active) startObserving();
  }

  function upsertQuote(item, model, modelKey) {
    const { container } = item;
    let span = null;
    for (const child of container.children) {
      if (child.classList.contains(QUOTE)) {
        span = child;
        break;
      }
    }
    if (!span) {
      span = document.createElement("span");
      span.className = `${QUOTE} pmx-${item.kind} pmx-${SITE}${item.className ? ` ${item.className}` : ""}`;
      container.insertBefore(span, item.before || null);
    }
    // Unchanged input → nothing to recompute or write (the common case on live books).
    const sig = `${modelKey}|${item.side}|${item.p}|${item.prefix || ""}`;
    if (span.dataset.sig === sig) return span;
    span.dataset.sig = sig;

    const q = model.apply(item.p, item.side);
    const { format } = settings;
    const unit = adapter.unit;
    if (item.stacked && format === "both") {
      span.replaceChildren(
        line("pmx-line1", X.formatPrice(q, item.decimals, unit)),
        line("pmx-line2", X.formatAmerican(q))
      );
    } else {
      span.textContent = (item.prefix || "") + X.formatQuote(q, format, item.decimals, unit);
    }
    span.dataset.side = item.side;
    span.title = model.describe(item.p, item.side);
    return span;
  }

  function line(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  }

  // ---- Scheduling -----------------------------------------------------------

  function schedule() {
    if (timer || document.hidden) return;
    timer = setTimeout(render, THROTTLE_MS);
  }

  const observer = new MutationObserver(schedule);
  function startObserving() {
    if (observing) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    observing = true;
  }
  function stopObserving() {
    if (!observing) return;
    observer.disconnect();
    observing = false;
  }

  // Hidden tabs do no work; catch up once visible again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && settings) schedule();
  });

  window.addEventListener("exchange-companion:settings", (e) => {
    settings = JSON.parse(e.detail);
    settingsVersion++;
    clearTimeout(timer);
    timer = 0;
    render();
  });
  window.dispatchEvent(new CustomEvent("exchange-companion:request"));
})();
