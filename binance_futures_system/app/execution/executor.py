from __future__ import annotations

import asyncio
import ccxt


class PaperExecutor:
    async def place_order(self, symbol: str, signal: dict, qty: float, leverage: int):
        return {
            "status": "filled",
            "id": f"paper_{symbol}_{signal['side']}",
            "symbol": symbol,
            "side": signal["side"],
            "entry": signal["entry"],
            "qty": qty,
            "leverage": leverage,
        }


class RealExecutor:
    def __init__(self, api_key: str, api_secret: str, testnet: bool = True):
        self.exchange = ccxt.binanceusdm(
            {
                "apiKey": api_key,
                "secret": api_secret,
                "options": {"defaultType": "future"},
                "enableRateLimit": True,
            }
        )
        if testnet:
            self.exchange.set_sandbox_mode(True)

    async def place_order(self, symbol: str, side: str, qty: float, leverage: int):
        market_side = "buy" if side == "LONG" else "sell"

        def _do_order():
            self.exchange.set_leverage(leverage, symbol)
            return self.exchange.create_market_order(symbol, market_side, qty)

        return await asyncio.to_thread(_do_order)
