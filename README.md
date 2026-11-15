# companion

fee-adjusted odds overlay chrome extension for [Kalshi](https://kalshi.com) & [PolyUS](https://polymarket.us)

## install

1. `chrome://extensions` -> **Developer mode**
2. **Load unpacked** -> select this folder

## fee models

| exchange | fee | source |
| - | - | - |
| Polymarket US | `Θ × p × (1 − p)` per contract. Θ by 30-day taker volume: 0.095 / 0.085 / 0.075 / 0.0695 | [fee schedule](https://docs.polymarket.us/fees) |
| Kalshi | `0.07 × p × (1 − p)` per contract (0.035 on reduced-fee series) | [fee schedule](https://kalshi.com/fee-schedule) |

## layout

- `src/shared.js`: fee models, formatting, default settings
- `src/bridge.js`: isolated world. Reads `chrome.storage` and passes settings to the page script
- `src/main.js`: page (MAIN) world. Per-site adapters plus the render engine
- `src/content.css`: quote styles
- `popup/`: settings popup
