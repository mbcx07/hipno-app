# Binance USDT-M Futures Multi-Symbol Monitoring/Trading Dashboard

Professional FastAPI + Web dashboard for **continuous multi-symbol scanning** on Binance USDT-M futures, with paper/real mode switching, risk controls, live positions, analytics, and charts.

## What this version includes

- Continuous opportunity scanner across many symbols (from `exchangeInfo` + 24h liquidity filter)
- Configurable universe (`SYMBOL_LIMIT`, `MIN_QUOTE_VOLUME_USDT`)
- Concurrent symbol evaluation (async tasks + bounded concurrency)
- Multi-position management (up to 10 concurrent operations)
- Real-time position monitoring with:
  - uPnL in **USDT**
  - uPnL in **%** (margin-based)
- Global analytics:
  - winrate
  - cumulative pnl
  - max drawdown (USDT)
  - trades/day
- Professional dashboard UI + Chart.js visual charts:
  - equity curve
  - pnl history
- WebSocket state stream (`/ws/state`) + REST endpoints
- Keeps existing controls:
  - `paper` / `real` mode
  - leverage selector
  - API key/secret input
  - risk rules:
    - max 10% equity exposure split across max 10 open trades
    - RR >= 1:2 (ideal 1:3)
    - trailing stop by Fibonacci levels

## Architecture

- `app/main.py`: FastAPI app, runtime config endpoints, WebSocket streaming
- `app/engine/trading_engine.py`: async multi-symbol trading engine, risk/position management, analytics
- `app/data/binance_market.py`: Binance Futures market data client (exchangeInfo, 24h tickers, klines, prices)
- `app/strategy/wyckoff_strategy.py`: PA + volume + liquidity sweep signal model
- `app/execution/executor.py`: paper executor and real executor (ccxt)
- `app/risk/capital.py`: capital sizing using 10% equity split rule
- `app/dashboard/index.html`: modern dashboard and charts

## API Endpoints

- `GET /` Dashboard
- `GET /api/state` Full engine state snapshot
- `GET /api/analytics` Analytics only
- `GET /api/universe` Active symbol universe
- `GET /api/config` Runtime config info
- `POST /api/config` Update runtime config
- `POST /api/mode/{paper|real}` Switch operating mode
- `WS /ws/state` Live state stream (1s updates)

## Quick run steps (Windows PowerShell)

```powershell
cd C:\Users\Administrator\.openclaw\workspace\binance_futures_system
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# edit .env if needed
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open: `http://localhost:8000`

## Runtime configuration from dashboard

You can change at runtime:
- leverage
- universe size limit
- minimum liquidity filter (24h quote volume)
- api key + api secret
- mode (paper/real)

## Important caveats

- Real mode requires valid Binance API credentials with futures permissions.
- Testnet behavior and liquidity can differ from production.
- Exchange precision/filters (lot size, tick size, min notional) are not yet fully enforced for every symbol before live orders.
- Funding, fees, and slippage are simplified in paper mode.

## Disclaimer

Educational software. Not financial advice. Leveraged futures trading carries substantial risk.
