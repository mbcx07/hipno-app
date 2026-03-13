import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.core.config import settings
from app.data.binance_market import BinanceMarketClient
from app.engine.trading_engine import TradingEngine
from app.execution.executor import PaperExecutor, RealExecutor
from app.strategy.wyckoff_strategy import WyckoffPAVolumeStrategy

BASE_DIR = Path(__file__).resolve().parent
DASHBOARD_PATH = BASE_DIR / "dashboard" / "index.html"

engine = None
engine_task = None


class RuntimeConfigUpdate(BaseModel):
    leverage_default: Optional[int] = None
    mode: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    symbol_limit: Optional[int] = None
    min_quote_volume_usdt: Optional[float] = None
    paper_equity: Optional[float] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, engine_task
    market = BinanceMarketClient(testnet=settings.binance_testnet)
    strategy = WyckoffPAVolumeStrategy(settings.min_rr, settings.ideal_rr)
    paper = PaperExecutor()
    real = RealExecutor(settings.api_key, settings.api_secret, settings.binance_testnet) if settings.api_key and settings.api_secret else None
    engine = TradingEngine(settings, market, strategy, paper, real)
    engine_task = asyncio.create_task(engine.run())
    yield
    engine.stop()
    if engine_task:
        engine_task.cancel()


app = FastAPI(title="Binance Futures Multi-Symbol Dashboard", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "dashboard")), name="static")


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    return DASHBOARD_PATH.read_text(encoding="utf-8")


@app.get("/api/state")
async def state():
    return engine.state()


@app.get("/api/analytics")
async def analytics():
    return engine.state().get("analytics", {})


@app.get("/api/trades")
async def trades(limit: int = 20):
    # Read last N trade events from persistent journal (if present).
    limit = max(1, min(500, int(limit)))
    path = getattr(engine, 'journal_path', None)
    if not path:
        return {"ok": False, "error": "journal_not_configured", "trades": []}
    try:
        p = Path(path)
        if not p.exists():
            return {"ok": True, "trades": []}
        lines = p.read_text(encoding="utf-8").splitlines()
        tail = lines[-limit:]
        import json
        return {"ok": True, "trades": [json.loads(x) for x in tail if x.strip()]}
    except Exception as e:
        return {"ok": False, "error": str(e), "trades": []}


@app.get("/api/universe")
async def universe():
    st = engine.state()
    return {"symbols": engine.universe, "count": st.get("universe_size", 0)}


@app.get("/api/config")
async def get_config():
    return {
        "mode": settings.app_mode,
        "leverage_default": settings.leverage_default,
        "symbol_limit": settings.symbol_limit,
        "min_quote_volume_usdt": settings.min_quote_volume_usdt,
        "paper_equity": settings.starting_equity,
        "has_api_key": bool(settings.api_key),
        "binance_testnet": settings.binance_testnet,
    }


@app.post("/api/mode/{mode}")
async def switch_mode(mode: str):
    if mode not in {"paper", "real"}:
        return {"ok": False, "error": "invalid mode"}
    if mode == "real" and not engine.real_executor:
        return {"ok": False, "error": "Load API key/secret first"}

    settings.app_mode = mode
    engine.cfg.app_mode = mode
    engine._log(f"Mode switched to {mode}")
    return {"ok": True, "mode": mode}


@app.post("/api/config")
async def update_config(payload: RuntimeConfigUpdate):
    if payload.leverage_default is not None:
        lev = max(1, min(125, int(payload.leverage_default)))
        settings.leverage_default = lev
        engine.cfg.leverage_default = lev

    if payload.symbol_limit is not None:
        settings.symbol_limit = max(5, min(200, int(payload.symbol_limit)))
        engine.cfg.symbol_limit = settings.symbol_limit

    if payload.min_quote_volume_usdt is not None:
        settings.min_quote_volume_usdt = max(0.0, float(payload.min_quote_volume_usdt))
        engine.cfg.min_quote_volume_usdt = settings.min_quote_volume_usdt

    if payload.paper_equity is not None:
        pe = max(1.0, float(payload.paper_equity))
        settings.starting_equity = pe
        engine.cfg.starting_equity = pe
        if settings.app_mode == "paper":
            engine.initial_equity = pe
            engine.equity = pe
            engine.realized_pnl = 0.0
            engine.positions = []
            engine.closed_trades = []
            engine._log(f"Paper equity reset to {pe:.2f} USDT")

    if payload.api_key:
        settings.api_key = payload.api_key.strip()
    if payload.api_secret:
        settings.api_secret = payload.api_secret.strip()

    if settings.api_key and settings.api_secret:
        engine.real_executor = RealExecutor(settings.api_key, settings.api_secret, settings.binance_testnet)

    if payload.mode:
        mode = payload.mode
        if mode not in {"paper", "real"}:
            return {"ok": False, "error": "invalid mode"}
        if mode == "real" and not engine.real_executor:
            return {"ok": False, "error": "No API credentials loaded"}
        settings.app_mode = mode
        engine.cfg.app_mode = mode

    engine._log("Runtime config updated")
    return {"ok": True, **(await get_config())}


@app.post("/api/trading/start")
async def trading_start():
    await engine.start_trading()
    return {"ok": True, "trading_enabled": True}


@app.post("/api/trading/stop")
async def trading_stop():
    await engine.stop_trading()
    return {"ok": True, "trading_enabled": False}


@app.websocket("/ws/state")
async def ws_state(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(engine.state())
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        return
