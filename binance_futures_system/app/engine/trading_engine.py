from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from statistics import mean

from app.risk.capital import calc_position_size


@dataclass
class Position:
    id: str
    symbol: str
    side: str
    entry_price: float
    stop_loss: float
    take_profit: float
    qty: float
    leverage: int
    opened_at: float
    rr: float
    reason: str
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0


@dataclass
class ClosedTrade:
    id: str
    symbol: str
    side: str
    opened_at: float
    closed_at: float
    entry_price: float
    exit_price: float
    qty: float
    leverage: int
    pnl_usdt: float
    pnl_pct: float
    exit_reason: str


class TradingEngine:
    def __init__(self, cfg, market_client, strategy, paper_executor, real_executor=None):
        self.cfg = cfg
        self.market = market_client
        self.strategy = strategy
        self.paper_executor = paper_executor
        self.real_executor = real_executor

        self.running = False
        self.positions: list[Position] = []
        self.closed_trades: list[ClosedTrade] = []
        self.events: list[str] = []
        self.universe: list[str] = []
        self.last_prices: dict[str, float] = {}

        self.initial_equity = cfg.starting_equity
        self.equity = cfg.starting_equity
        self.realized_pnl = 0.0
        self.total_scans = 0
        self._lock = asyncio.Lock()

    def _log(self, msg: str):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.events.append(f"[{ts}] {msg}")
        self.events = self.events[-400:]

    @property
    def floating_pnl(self) -> float:
        return sum(p.unrealized_pnl for p in self.positions)

    @property
    def equity_total(self) -> float:
        return self.equity + self.floating_pnl

    def _update_trailing_stop(self, pos: Position, price: float):
        move = abs(pos.take_profit - pos.entry_price)
        if move <= 0:
            return
        if pos.side == "LONG":
            progress = price - pos.entry_price
            if progress > move * 0.382:
                pos.stop_loss = max(pos.stop_loss, pos.entry_price)
            if progress > move * 0.5:
                pos.stop_loss = max(pos.stop_loss, pos.entry_price + move * 0.236)
            if progress > move * 0.618:
                pos.stop_loss = max(pos.stop_loss, pos.entry_price + move * 0.382)
        else:
            progress = pos.entry_price - price
            if progress > move * 0.382:
                pos.stop_loss = min(pos.stop_loss, pos.entry_price)
            if progress > move * 0.5:
                pos.stop_loss = min(pos.stop_loss, pos.entry_price - move * 0.236)
            if progress > move * 0.618:
                pos.stop_loss = min(pos.stop_loss, pos.entry_price - move * 0.382)

    async def _refresh_universe(self):
        while self.running:
            try:
                symbols = await self.market.get_trade_universe(
                    min_quote_volume_usdt=self.cfg.min_quote_volume_usdt,
                    limit=self.cfg.symbol_limit,
                )
                async with self._lock:
                    self.universe = symbols
                self._log(f"Universe updated: {len(symbols)} symbols")
            except Exception as e:
                self._log(f"Universe refresh error: {e}")
            await asyncio.sleep(self.cfg.universe_refresh_sec)

    async def _scan_symbol(self, symbol: str, sem: asyncio.Semaphore):
        async with sem:
            candles = await self.market.get_klines(symbol, self.cfg.timeframe, 160)
            signal = self.strategy.generate_signal(candles)
            if not signal:
                return None
            rr = abs((signal["tp"] - signal["entry"]) / max(abs(signal["entry"] - signal["stop"]), 1e-9))
            signal["rr"] = rr
            signal["symbol"] = symbol
            return signal

    async def _scan_entries(self):
        async with self._lock:
            symbols = self.universe[:]
            existing_symbols = {p.symbol for p in self.positions}
            max_new = self.cfg.max_open_trades - len(self.positions)

        if not symbols or max_new <= 0:
            return

        sem = asyncio.Semaphore(8)
        tasks = [self._scan_symbol(s, sem) for s in symbols if s not in existing_symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        candidates = []
        for r in results:
            if isinstance(r, Exception):
                continue
            if r and r["rr"] >= self.cfg.min_rr:
                candidates.append(r)

        candidates.sort(key=lambda x: x["rr"], reverse=True)
        for signal in candidates[:max_new]:
            await self._open_position(signal)

    async def _open_position(self, signal: dict):
        symbol = signal["symbol"]
        lev = self.cfg.leverage_default
        qty = calc_position_size(
            equity=self.equity_total,
            entry=signal["entry"],
            leverage=lev,
            equity_allocation=self.cfg.equity_allocation,
            max_open_trades=self.cfg.max_open_trades,
        )
        if qty <= 0:
            return

        if self.cfg.app_mode == "real" and self.real_executor:
            order = await self.real_executor.place_order(symbol, signal["side"], qty, lev)
            order_id = str(order.get("id", f"real_{symbol}"))
        else:
            order = await self.paper_executor.place_order(symbol, signal, qty, lev)
            order_id = order["id"] + f"_{int(time.time())}"

        pos = Position(
            id=order_id,
            symbol=symbol,
            side=signal["side"],
            entry_price=signal["entry"],
            stop_loss=signal["stop"],
            take_profit=signal["tp"],
            qty=qty,
            leverage=lev,
            opened_at=time.time(),
            rr=signal["rr"],
            reason=signal.get("reason", "strategy"),
        )

        async with self._lock:
            if len(self.positions) >= self.cfg.max_open_trades or any(p.symbol == symbol for p in self.positions):
                return
            self.positions.append(pos)
        self._log(f"OPEN {symbol} {pos.side} rr={pos.rr:.2f} qty={qty:.5f} lev={lev}x")

    def _close_position(self, pos: Position, exit_price: float, reason: str):
        pnl = (exit_price - pos.entry_price) * pos.qty if pos.side == "LONG" else (pos.entry_price - exit_price) * pos.qty
        margin = (pos.entry_price * pos.qty) / max(pos.leverage, 1)
        pnl_pct = (pnl / margin * 100.0) if margin > 0 else 0.0

        self.equity += pnl
        self.realized_pnl += pnl

        self.closed_trades.append(
            ClosedTrade(
                id=pos.id,
                symbol=pos.symbol,
                side=pos.side,
                opened_at=pos.opened_at,
                closed_at=time.time(),
                entry_price=pos.entry_price,
                exit_price=exit_price,
                qty=pos.qty,
                leverage=pos.leverage,
                pnl_usdt=pnl,
                pnl_pct=pnl_pct,
                exit_reason=reason,
            )
        )
        self.closed_trades = self.closed_trades[-1000:]
        self._log(f"CLOSE {pos.symbol} {reason} pnl={pnl:.2f} ({pnl_pct:.2f}%)")

    async def _mark_and_manage_positions(self):
        if not self.positions:
            return
        prices = await self.market.get_all_prices()
        async with self._lock:
            self.last_prices = prices
            remaining = []
            for p in self.positions:
                price = prices.get(p.symbol)
                if not price:
                    remaining.append(p)
                    continue

                self._update_trailing_stop(p, price)
                p.unrealized_pnl = (price - p.entry_price) * p.qty if p.side == "LONG" else (p.entry_price - price) * p.qty
                margin = (p.entry_price * p.qty) / max(p.leverage, 1)
                p.unrealized_pnl_pct = (p.unrealized_pnl / margin * 100.0) if margin > 0 else 0.0

                hit_sl = price <= p.stop_loss if p.side == "LONG" else price >= p.stop_loss
                hit_tp = price >= p.take_profit if p.side == "LONG" else price <= p.take_profit

                if hit_sl or hit_tp:
                    self._close_position(p, price, "TP" if hit_tp else "SL")
                else:
                    remaining.append(p)

            self.positions = remaining

    def _analytics(self):
        trades = self.closed_trades
        wins = [t for t in trades if t.pnl_usdt > 0]
        days = defaultdict(int)
        for t in trades:
            d = datetime.fromtimestamp(t.closed_at, tz=timezone.utc).strftime("%Y-%m-%d")
            days[d] += 1

        curve = [self.initial_equity]
        eq = self.initial_equity
        for t in trades:
            eq += t.pnl_usdt
            curve.append(eq)

        peak = curve[0] if curve else self.initial_equity
        max_dd = 0.0
        for v in curve:
            peak = max(peak, v)
            dd = (peak - v)
            max_dd = max(max_dd, dd)

        return {
            "total_trades": len(trades),
            "winrate": (len(wins) / len(trades) * 100.0) if trades else 0.0,
            "cumulative_pnl": self.realized_pnl,
            "max_drawdown_usdt": max_dd,
            "trades_per_day": round(mean(days.values()), 2) if days else 0.0,
            "equity_curve": curve[-300:],
            "pnl_history": [t.pnl_usdt for t in trades[-300:]],
        }

    async def run(self):
        self.running = True
        self._log("Engine started")

        universe_task = asyncio.create_task(self._refresh_universe())
        try:
            while self.running:
                try:
                    await self._mark_and_manage_positions()
                    await self._scan_entries()
                    self.total_scans += 1
                except Exception as e:
                    self._log(f"Cycle error: {e}")
                await asyncio.sleep(self.cfg.poll_interval_sec)
        finally:
            universe_task.cancel()
            self._log("Engine stopped")

    def stop(self):
        self.running = False

    def state(self):
        return {
            "mode": self.cfg.app_mode,
            "equity": self.equity,
            "equity_total": self.equity_total,
            "realized_pnl": self.realized_pnl,
            "floating_pnl": self.floating_pnl,
            "open_positions": len(self.positions),
            "universe_size": len(self.universe),
            "total_scans": self.total_scans,
            "positions": [asdict(p) for p in self.positions],
            "closed_trades": [asdict(t) for t in self.closed_trades[-100:]],
            "analytics": self._analytics(),
            "events": self.events,
        }
