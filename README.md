# Exchange Companion

Chrome extension (Manifest V3) for [Polymarket US](https://polymarket.us), [Kalshi](https://kalshi.com) and [ProphetX](https://www.prophetx.co). It shows fee-adjusted taker prices and American odds on order-book levels and outcome buttons.

## Install

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

## Fee models

| Exchange | Fee | Value shown | Source |
| - | - | - | - |
| Polymarket US | `Θ × p × (1 − p)` per contract. Θ by 30-day taker volume: 0.095 / 0.085 / 0.075 / 0.0695 | ask + fee, bid − fee | [fee schedule](https://docs.polymarket.us/fees) (2026-11-14) |
| Kalshi | `0.07 × p × (1 − p)` per contract (0.035 on reduced-fee series) | ask + fee, bid − fee | [fee schedule](https://kalshi.com/fee-schedule) |
| ProphetX | 2% of net gains per market. NHL: taker `0.035 × p × (1 − p)` | Break-even probability `p / (1 − 0.02 × (1 − p))`, or ask + fee for NHL | [straight contract fee schedule](https://www.prophetx.co/t-c/trading-fees) (2026-11-05) |

Hover any quote to see the math.

Things to know:
- Polymarket US and Kalshi round the real fee per order, so the per-contract figures can be off by a fraction of a cent.
- The ProphetX commission is charged on your net result across the whole market. The extension assumes you hold no other position in that market.
- ProphetX **Auto** mode treats a market as NHL when the event header, or on the lobby the selected league tab, says NHL.

## Where quotes appear

| Exchange | Order book | Buttons |
| - | - | - |
| Polymarket US | Left of each level's price | Market-row and trade-panel outcome buttons. The exact best ask comes from the page's React props, because labels are rounded to a whole percent |
| Kalshi | Next to each level's price, in the first column | Yes/No price pills and the trade-panel Yes/No toggle |
| ProphetX | Replaces the price column of the trade-slip liquidity ladder, shown as two lines with "Price (net)" headers | Odds buttons |

## Performance

The page script only does work after the page changes:
- It watches the page for changes and runs at most one pass every 150 ms.
- It pauses while the tab is hidden.
- When the extension or the current site is turned off, it stops watching the page completely.
- A quote is only recomputed and redrawn when its price, side or settings changed.
- Quotes and hidden elements left over from the previous pass are cleaned up at the end of each pass.

## Layout

- `src/shared.js`: fee models, formatting, default settings
- `src/bridge.js`: isolated world. Reads `chrome.storage` and passes settings to the page script
- `src/main.js`: page (MAIN) world. Per-site adapters plus the render engine
- `src/content.css`: quote styles
- `popup/`: settings popup
