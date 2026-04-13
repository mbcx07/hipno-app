from __future__ import annotations

import httpx


class BinanceMarketClient:
    def __init__(self, testnet: bool = True):
        self.base = "https://testnet.binancefuture.com" if testnet else "https://fapi.binance.com"
        self.timeout = httpx.Timeout(15.0, connect=8.0)

    async def _get(self, path: str, params: dict | None = None):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.get(f"{self.base}{path}", params=params)
            r.raise_for_status()
            return r.json()

    async def get_klines(self, symbol: str, interval: str = "1m", limit: int = 160):
        data = await self._get("/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": limit})
        return [
            {
                "open_time": int(k[0]),
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
                "close_time": int(k[6]),
            }
            for k in data
        ]

    async def get_all_prices(self) -> dict[str, float]:
        data = await self._get("/fapi/v1/ticker/price")
        return {item["symbol"]: float(item["price"]) for item in data}

    async def get_trade_universe(self, min_quote_volume_usdt: float, limit: int) -> list[str]:
        info = await self._get("/fapi/v1/exchangeInfo")
        tickers = await self._get("/fapi/v1/ticker/24hr")
        vol_map = {t["symbol"]: float(t.get("quoteVolume", 0.0)) for t in tickers}

        symbols: list[tuple[str, float]] = []
        for s in info.get("symbols", []):
            symbol = s.get("symbol", "")
            if (
                s.get("contractType") == "PERPETUAL"
                and s.get("status") == "TRADING"
                and s.get("quoteAsset") == "USDT"
                and symbol.endswith("USDT")
            ):
                qv = vol_map.get(symbol, 0.0)
                if qv >= min_quote_volume_usdt:
                    symbols.append((symbol, qv))

        symbols.sort(key=lambda x: x[1], reverse=True)
        return [s[0] for s in symbols[: max(1, limit)]]
