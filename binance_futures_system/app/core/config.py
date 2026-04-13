import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseModel):
    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = int(os.getenv("APP_PORT", "8000"))

    app_mode: str = os.getenv("APP_MODE", "paper")
    binance_testnet: bool = os.getenv("BINANCE_TESTNET", "true").lower() == "true"
    api_key: str = os.getenv("BINANCE_API_KEY", "")
    api_secret: str = os.getenv("BINANCE_API_SECRET", "")

    timeframe: str = os.getenv("TIMEFRAME", "1m")
    poll_interval_sec: float = float(os.getenv("POLL_INTERVAL_SEC", "3"))
    universe_refresh_sec: int = int(os.getenv("UNIVERSE_REFRESH_SEC", "180"))

    symbol_limit: int = int(os.getenv("SYMBOL_LIMIT", "40"))
    min_quote_volume_usdt: float = float(os.getenv("MIN_QUOTE_VOLUME_USDT", "15000000"))

    starting_equity: float = float(os.getenv("STARTING_EQUITY", "1000"))
    leverage_default: int = int(os.getenv("LEVERAGE_DEFAULT", "5"))

    max_open_trades: int = int(os.getenv("MAX_OPEN_TRADES", "10"))
    equity_allocation: float = float(os.getenv("EQUITY_ALLOCATION", "0.10"))
    min_rr: float = float(os.getenv("MIN_RR", "2.0"))
    ideal_rr: float = float(os.getenv("IDEAL_RR", "3.0"))


settings = Settings()
