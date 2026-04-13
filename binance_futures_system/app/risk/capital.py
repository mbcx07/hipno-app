def calc_position_size(
    equity: float,
    entry: float,
    leverage: int,
    equity_allocation: float = 0.10,
    max_open_trades: int = 10,
):
    """
    Risk rule:
    - Use 10% equity total
    - Split across max 10 concurrent trades
    """
    if entry <= 0 or leverage <= 0 or max_open_trades <= 0:
        return 0.0

    alloc_per_trade = (equity * equity_allocation) / max_open_trades
    notional = alloc_per_trade * leverage
    qty = notional / entry
    return max(qty, 0.0)
