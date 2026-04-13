from __future__ import annotations

from statistics import mean


def ema(values: list[float], period: int) -> float:
    """Return last EMA value for a list."""
    if len(values) < period:
        return sum(values) / max(len(values), 1)
    k = 2 / (period + 1)
    e = values[0]
    for v in values[1:]:
        e = v * k + e * (1 - k)
    return e


def atr(candles: list[dict], period: int = 14) -> float:
    if len(candles) < period + 1:
        return 0.0
    trs = []
    for i in range(1, len(candles)):
        h = candles[i]["high"]
        l = candles[i]["low"]
        pc = candles[i - 1]["close"]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        trs.append(tr)
    window = trs[-period:]
    return sum(window) / max(len(window), 1)


class WyckoffPAVolumeStrategy:
    """Wyckoff proxy strategy (MVP) with basic guard filters.

    Core signals:
    - Breakout/breakdown of local structure with volume spike
    - Liquidity sweep proxy (spring/upthrust approximation) + volume confirmation

    Filters (to reduce negative chop trades):
    - Trend filter via EMA (only long above EMA, only short below EMA)
    - ATR%% filter to avoid too-low volatility chop and too-high volatility spikes

    Note: This is still a proxy; for full Wyckoff phase logic we'd expand later.
    """

    def __init__(
        self,
        min_rr: float = 2.0,
        ideal_rr: float = 3.0,
        ema_period: int = 200,
        atr_period: int = 14,
        atr_pct_min: float = 0.0015,
        atr_pct_max: float = 0.02,
        cooldown_after_sl_bars: int = 0,
    ):
        self.min_rr = min_rr
        self.ideal_rr = ideal_rr
        self.ema_period = ema_period
        self.atr_period = atr_period
        self.atr_pct_min = atr_pct_min
        self.atr_pct_max = atr_pct_max
        self.cooldown_after_sl_bars = cooldown_after_sl_bars

    def generate_signal(self, candles: list[dict]):
        if len(candles) < 60:
            return None

        recent = candles[-60:]
        last = recent[-1]
        prev = recent[-2]

        closes = [c["close"] for c in recent]
        ema_val = ema(closes, self.ema_period)

        a = atr(recent, self.atr_period)
        price = last["close"]
        atr_pct = (a / price) if price else 0.0

        # Volatility filter (avoid chop and extreme spikes)
        if atr_pct and (atr_pct < self.atr_pct_min or atr_pct > self.atr_pct_max):
            return None

        avg_vol = mean(c["volume"] for c in recent[:-1])
        vol_spike = last["volume"] > avg_vol * 1.35

        swing_high = max(c["high"] for c in recent[:-1])
        swing_low = min(c["low"] for c in recent[:-1])

        long_breakout = last["close"] > swing_high and vol_spike
        short_breakdown = last["close"] < swing_low and vol_spike

        # Liquidity sweep proxy (spring/upthrust approximation)
        bullish_sweep = (
            last["low"] < min(c["low"] for c in recent[-10:-1])
            and last["close"] > prev["high"]
            and vol_spike
        )
        bearish_sweep = (
            last["high"] > max(c["high"] for c in recent[-10:-1])
            and last["close"] < prev["low"]
            and vol_spike
        )

        # Trend filter
        ema_filter_long = last["close"] >= ema_val
        ema_filter_short = last["close"] <= ema_val

        if (long_breakout or bullish_sweep) and ema_filter_long:
            side = "LONG"
            entry = last["close"]
            stop = min(last["low"], prev["low"])
            risk = max(entry - stop, entry * 0.002)
            tp = entry + risk * self.ideal_rr
            rr = (tp - entry) / max(entry - stop, 1e-9)
            if rr >= self.min_rr:
                return {
                    "side": side,
                    "entry": entry,
                    "stop": stop,
                    "tp": tp,
                    "reason": f"wyckoff_long ema{self.ema_period} atr%={atr_pct:.4f}",
                }

        if (short_breakdown or bearish_sweep) and ema_filter_short:
            side = "SHORT"
            entry = last["close"]
            stop = max(last["high"], prev["high"])
            risk = max(stop - entry, entry * 0.002)
            tp = entry - risk * self.ideal_rr
            rr = (entry - tp) / max(stop - entry, 1e-9)
            if rr >= self.min_rr:
                return {
                    "side": side,
                    "entry": entry,
                    "stop": stop,
                    "tp": tp,
                    "reason": f"wyckoff_short ema{self.ema_period} atr%={atr_pct:.4f}",
                }

        return None
