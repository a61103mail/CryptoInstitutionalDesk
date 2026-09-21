from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


@dataclass(frozen=True)
class TradeInput:
    asset: str
    direction: str
    timeframe: str
    current_price: float
    account_size: float
    macro_news: str
    macro_bias: str
    sector_flow: str
    btc_trend: str
    btc_correlation: float | None
    beta: float | None
    ema_structure: str
    rsi: float | None
    macd: str
    adx: float | None
    bb_state: str
    atr: float | None
    price_change_24h: float | None
    funding_rate: float | None
    oi_change: float | None
    cvd: str
    liquidation_above: float | None
    liquidation_below: float | None
    invalidation_price: float | None
    notes: str

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TradeInput":
        asset = str(data.get("asset", "")).strip().upper()
        direction = str(data.get("direction", "")).strip().lower()
        timeframe = str(data.get("timeframe", "")).strip()
        current_price = float(data.get("current_price", 0))
        account_size = float(data.get("account_size", 100_000))
        if not asset:
            raise ValueError("交易標的不可空白")
        if direction not in {"long", "short", "delta-neutral", "observe"}:
            raise ValueError("方向必須是 Long、Short、Delta-Neutral 或觀望")
        if not timeframe:
            raise ValueError("交易週期不可空白")
        if current_price <= 0:
            raise ValueError("當前價格必須大於 0")
        if account_size <= 0:
            raise ValueError("虛擬資金規模必須大於 0")
        return cls(
            asset=asset,
            direction=direction,
            timeframe=timeframe,
            current_price=current_price,
            account_size=account_size,
            macro_news=str(data.get("macro_news", "")).strip(),
            macro_bias=str(data.get("macro_bias", "neutral")),
            sector_flow=str(data.get("sector_flow", "unknown")),
            btc_trend=str(data.get("btc_trend", "unknown")),
            btc_correlation=optional_float(data.get("btc_correlation")),
            beta=optional_float(data.get("beta")),
            ema_structure=str(data.get("ema_structure", "unknown")),
            rsi=optional_float(data.get("rsi")),
            macd=str(data.get("macd", "unknown")),
            adx=optional_float(data.get("adx")),
            bb_state=str(data.get("bb_state", "unknown")),
            atr=optional_float(data.get("atr")),
            price_change_24h=optional_float(data.get("price_change_24h")),
            funding_rate=optional_float(data.get("funding_rate")),
            oi_change=optional_float(data.get("oi_change")),
            cvd=str(data.get("cvd", "unknown")),
            liquidation_above=optional_float(data.get("liquidation_above")),
            liquidation_below=optional_float(data.get("liquidation_below")),
            invalidation_price=optional_float(data.get("invalidation_price")),
            notes=str(data.get("notes", "")).strip(),
        )

