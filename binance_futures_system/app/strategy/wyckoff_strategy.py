from statistics import mean

class WyckoffPAVolumeStrategy:
    """
    Implementación base (ajustable con PDFs del usuario):
    - Price Action: ruptura de estructura local (swing high/low)
    - Volumen: spike sobre media de volumen
    - Liquidez/Wyckoff proxy: barrido de mínimos/máximos previos con cierre de recuperación/rechazo
    """
    def __init__(self, min_rr: float = 2.0, ideal_rr: float = 3.0):
        self.min_rr = min_rr
        self.ideal_rr = ideal_rr

    def generate_signal(self, candles: list[dict]):
        if len(candles) < 30:
            return None
        recent = candles[-30:]
        last = recent[-1]
        prev = recent[-2]
        avg_vol = mean(c["volume"] for c in recent[:-1])
        vol_spike = last["volume"] > avg_vol * 1.35

        swing_high = max(c["high"] for c in recent[:-1])
        swing_low = min(c["low"] for c in recent[:-1])

        long_breakout = last["close"] > swing_high and vol_spike
        short_breakdown = last["close"] < swing_low and vol_spike

        # Liquidity sweep proxy
        bullish_sweep = last["low"] < min(c["low"] for c in recent[-8:-1]) and last["close"] > prev["high"] and vol_spike
        bearish_sweep = last["high"] > max(c["high"] for c in recent[-8:-1]) and last["close"] < prev["low"] and vol_spike

        if long_breakout or bullish_sweep:
            side = "LONG"
            entry = last["close"]
            stop = min(last["low"], prev["low"])
            risk = max(entry - stop, entry * 0.002)
            tp = entry + risk * self.ideal_rr
            rr = (tp - entry) / (entry - stop)
            if rr >= self.min_rr:
                return {"side": side, "entry": entry, "stop": stop, "tp": tp, "reason": "wyckoff_long"}

        if short_breakdown or bearish_sweep:
            side = "SHORT"
            entry = last["close"]
            stop = max(last["high"], prev["high"])
            risk = max(stop - entry, entry * 0.002)
            tp = entry - risk * self.ideal_rr
            rr = (entry - tp) / (stop - entry)
            if rr >= self.min_rr:
                return {"side": side, "entry": entry, "stop": stop, "tp": tp, "reason": "wyckoff_short"}

        return None
