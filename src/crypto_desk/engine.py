from __future__ import annotations

import math
from dataclasses import asdict
from typing import Any

from .models import TradeInput


def _fmt(value: float, price: float) -> str:
    if price >= 1000:
        return f"{value:,.2f}"
    if price >= 1:
        return f"{value:,.4f}"
    if price >= 0.01:
        return f"{value:.6f}"
    return f"{value:.10f}"


def _direction_sign(direction: str) -> int:
    return 1 if direction == "long" else -1


def _add_signal(
    signals: list[dict[str, Any]],
    category: str,
    label: str,
    score: float,
    detail: str,
) -> None:
    signals.append(
        {"category": category, "label": label, "score": score, "detail": detail}
    )


def _score_signals(value: TradeInput) -> tuple[list[dict[str, Any]], list[str]]:
    signals: list[dict[str, Any]] = []
    missing: list[str] = []
    sign = _direction_sign(value.direction) if value.direction in {"long", "short"} else 0

    directional = {"bullish": 1, "bearish": -1}
    ema = directional.get(value.ema_structure)
    if ema is None:
        missing.append("EMA 結構")
    else:
        _add_signal(
            signals,
            "quant",
            "EMA 結構",
            sign * ema * 1.3,
            "均線排列支持預期方向" if sign == ema else "均線排列與預期方向衝突",
        )

    macd = directional.get(value.macd)
    if macd is None:
        missing.append("MACD")
    else:
        _add_signal(
            signals,
            "quant",
            "MACD",
            sign * macd,
            "動能共振" if sign == macd else "動能背離預期方向",
        )

    if value.rsi is None:
        missing.append("RSI")
    else:
        rsi_score = 0.0
        detail = f"RSI {value.rsi:.1f}，中性"
        if value.direction == "long":
            if 38 <= value.rsi <= 62:
                rsi_score, detail = 0.7, "多頭尚未過熱"
            elif value.rsi >= 75:
                rsi_score, detail = -1.2, "多頭過熱，追價風險高"
            elif value.rsi <= 28:
                rsi_score, detail = 0.4, "超賣但必須等待右側確認"
        elif value.direction == "short":
            if 38 <= value.rsi <= 62:
                rsi_score, detail = 0.7, "空頭尚未過度擁擠"
            elif value.rsi <= 25:
                rsi_score, detail = -1.2, "空頭過度延伸，擠壓風險高"
            elif value.rsi >= 72:
                rsi_score, detail = 0.4, "超買但必須等待轉弱確認"
        _add_signal(signals, "quant", "RSI", rsi_score, detail)

    if value.adx is None:
        missing.append("ADX")
    elif value.adx >= 25:
        _add_signal(signals, "quant", "ADX", 0.8, f"ADX {value.adx:.1f}，趨勢策略有效")
    elif value.adx < 18:
        _add_signal(
            signals, "quant", "ADX", -0.7, f"ADX {value.adx:.1f}，突破策略容易被假突破反殺"
        )
    else:
        _add_signal(signals, "quant", "ADX", 0.0, f"ADX {value.adx:.1f}，趨勢強度普通")

    if value.bb_state == "squeeze":
        _add_signal(signals, "quant", "布林帶", 0.2, "波動壓縮，需等待方向確認")
    elif value.bb_state == "upper":
        _add_signal(
            signals, "quant", "布林帶", 0.5 * sign, "價格貼近上軌，順勢與均值回歸風險並存"
        )
    elif value.bb_state == "lower":
        _add_signal(
            signals, "quant", "布林帶", -0.5 * sign, "價格貼近下軌，順勢與均值回歸風險並存"
        )
    else:
        missing.append("Bollinger Bands")

    if value.funding_rate is None:
        missing.append("資金費率")
    else:
        crowded = abs(value.funding_rate) >= 0.05
        funding_direction = 1 if value.funding_rate > 0 else -1
        score = -sign * funding_direction * (1.2 if crowded else 0.35)
        _add_signal(
            signals,
            "derivatives",
            "資金費率",
            score,
            f"{value.funding_rate:.4f}%"
            + ("，部位明顯擁擠" if crowded else "，尚未達極端"),
        )

    if value.oi_change is None or value.price_change_24h is None:
        missing.append("OI／價格變化")
    else:
        price_dir = 1 if value.price_change_24h > 0 else -1
        if value.oi_change > 0:
            score = sign * price_dir * 0.9
            detail = "價格與 OI 同向增加，主動建倉主導"
        else:
            score = sign * price_dir * 0.3
            detail = "OI 下降，行情較可能由回補或去槓桿驅動"
        _add_signal(signals, "derivatives", "OI 背離", score, detail)

    cvd = directional.get(value.cvd)
    if cvd is None:
        missing.append("CVD")
    else:
        _add_signal(
            signals,
            "derivatives",
            "CVD",
            sign * cvd,
            "主動成交支持方向" if sign == cvd else "訂單流與方向背離",
        )

    macro = {"risk_on": 1, "risk_off": -1}.get(value.macro_bias)
    if macro is None:
        missing.append("宏觀風險偏好")
    else:
        _add_signal(
            signals,
            "macro",
            "宏觀流動性",
            sign * macro,
            "宏觀環境支持風險方向" if sign == macro else "宏觀環境構成逆風",
        )

    sector = {"inflow": 1, "outflow": -1}.get(value.sector_flow)
    if sector is None:
        missing.append("板塊資金流")
    else:
        _add_signal(
            signals,
            "macro",
            "板塊輪動",
            sign * sector * 0.8,
            "板塊吸金" if sector > 0 else "板塊資金流出",
        )

    btc = directional.get(value.btc_trend)
    if btc is None:
        missing.append("BTC 趨勢")
    else:
        correlation = abs(value.btc_correlation or 0.7)
        _add_signal(
            signals,
            "macro",
            "BTC Beta",
            sign * btc * min(correlation, 1.0),
            f"以相關係數 {correlation:.2f} 評估大盤傳導",
        )
    return signals, missing


def _levels(value: TradeInput) -> dict[str, Any]:
    price = value.current_price
    atr = value.atr if value.atr and value.atr > 0 else price * 0.02
    inferred_atr = not value.atr or value.atr <= 0
    sign = _direction_sign(value.direction)
    entry_low = price - atr * (0.25 if sign > 0 else 0.10)
    entry_high = price + atr * (0.10 if sign > 0 else 0.25)
    entry_reference = (entry_low + entry_high) / 2
    default_stop = entry_reference - sign * max(atr * 1.10, price * 0.008)
    stop = value.invalidation_price if value.invalidation_price else default_stop
    valid_stop = stop < entry_reference if sign > 0 else stop > entry_reference
    if not valid_stop:
        raise ValueError("無效點位必須位於進場價的風險方向")
    risk = abs(entry_reference - stop)

    tp1 = entry_reference + sign * risk * 1.25
    tp2 = entry_reference + sign * risk * 2.70
    tp3 = entry_reference + sign * risk * 4.20
    if sign > 0 and value.liquidation_above and value.liquidation_above > entry_reference:
        tp2 = value.liquidation_above
        tp3 = max(tp3, value.liquidation_above + risk)
    if sign < 0 and value.liquidation_below and value.liquidation_below < entry_reference:
        tp2 = value.liquidation_below
        tp3 = min(tp3, value.liquidation_below - risk)
    rr = abs(tp2 - entry_reference) / risk
    return {
        "entry_low": entry_low,
        "entry_high": entry_high,
        "entry_reference": entry_reference,
        "stop": stop,
        "risk": risk,
        "tp1": tp1,
        "tp2": tp2,
        "tp3": tp3,
        "rr": rr,
        "atr": atr,
        "atr_inferred": inferred_atr,
    }


def _risk_metrics(
    value: TradeInput, probability: float, levels: dict[str, Any]
) -> dict[str, Any]:
    p = probability / 100
    q = 1 - p
    b = max(levels["rr"], 0.01)
    full_kelly = max(0.0, (b * p - q) / b)
    quarter_kelly = min(full_kelly * 0.25, 0.02)
    risk_budget_pct = min(1.0, quarter_kelly * 100)
    stop_pct = levels["risk"] / levels["entry_reference"]
    exposure_pct = min(25.0, risk_budget_pct / max(stop_pct, 0.0001))
    notional = value.account_size * exposure_pct / 100
    atr_pct = levels["atr"] / value.current_price
    beta = abs(value.beta) if value.beta is not None else 1.5
    var95 = notional * atr_pct * 1.65 * max(1.0, beta)
    return {
        "full_kelly_pct": full_kelly * 100,
        "quarter_kelly_pct": quarter_kelly * 100,
        "risk_budget_pct": risk_budget_pct,
        "exposure_pct": exposure_pct,
        "notional": notional,
        "var95": var95,
        "beta_used": beta,
    }


def analyze_trade(data: dict[str, Any]) -> dict[str, Any]:
    value = TradeInput.from_dict(data)
    if value.direction in {"observe", "delta-neutral"}:
        return {
            "input": asdict(value),
            "verdict": "Pass" if value.direction == "observe" else "Conditional",
            "verdict_zh": "拒絕交易" if value.direction == "observe" else "條件滿足後執行",
            "probability": 50,
            "summary": "方向性優勢不足；保留現金或等待價差／波動率條件明確。",
            "missing": [],
            "signals": [],
            "execution": None,
            "risk": None,
            "guardrails": [
                "沒有明確方向優勢時，零部位也是部位。",
                "Delta-Neutral 必須另外輸入兩腿、基差、借貸與交易成本後才可執行。",
            ],
            "disclaimer": "虛擬資金推演，不構成財務建議。",
        }

    signals, missing = _score_signals(value)
    score = sum(item["score"] for item in signals)
    completeness = max(0.0, 1 - len(missing) / 11)
    probability = round(max(35, min(74, 50 + score * 3.2)) * (0.85 + completeness * 0.15))
    levels = _levels(value)
    risk = _risk_metrics(value, probability, levels)

    if levels["rr"] < 2.5:
        verdict, verdict_zh = "Pass", "拒絕交易"
    elif score >= 3.5 and completeness >= 0.65:
        verdict, verdict_zh = "Execute", "強烈執行"
    elif score >= 1.2:
        verdict, verdict_zh = "Conditional", "條件滿足後執行"
    elif score <= -2.0:
        verdict, verdict_zh = "Reverse", "反向操作"
    else:
        verdict, verdict_zh = "Pass", "拒絕交易"

    direction_zh = "多頭" if value.direction == "long" else "空頭"
    strongest = sorted(signals, key=lambda item: abs(item["score"]), reverse=True)[:3]
    core = "；".join(item["detail"] for item in strongest)
    entry_style = (
        "右側確認後進場"
        if (value.adx or 0) < 25 or value.bb_state == "squeeze"
        else "分批限價，保留右側加倉"
    )
    liquidity_target = (
        value.liquidation_above if value.direction == "long" else value.liquidation_below
    )
    liquidity_note = (
        f"主要清算池 {liquidity_target:g}"
        if liquidity_target
        else "未提供清算熱區，目標採 ATR/R 倍數推導"
    )
    pool_distances: list[tuple[str, float, float]] = []
    if value.liquidation_above and value.liquidation_above > value.current_price:
        pool_distances.append(
            ("上方", value.liquidation_above, value.liquidation_above - value.current_price)
        )
    if value.liquidation_below and value.liquidation_below < value.current_price:
        pool_distances.append(
            ("下方", value.liquidation_below, value.current_price - value.liquidation_below)
        )
    nearest_pool = min(pool_distances, key=lambda item: item[2]) if pool_distances else None
    hunt_note = (
        f"最近流動性在{nearest_pool[0]} {nearest_pool[1]:g}，距現價 "
        f"{nearest_pool[2] / value.current_price * 100:.2f}%"
        if nearest_pool
        else "上下清算池資料不足，無法判斷最可能的流動性獵取方向"
    )
    if value.macro_news:
        moved = abs(value.price_change_24h or 0)
        priced_in = (
            "價格已提前移動超過 3%，事件可能部分 priced-in，需防買謠言賣事實"
            if moved >= 3
            else "價格尚未明顯提前移動，事件公布時的跳空風險仍高"
        )
        event_note = f"{value.macro_news}；{priced_in}"
    else:
        event_note = "未提供事件資料，無法判斷 priced-in 程度"
    beta = value.beta if value.beta is not None else 1.5
    guardrails = [
        (
            f"Beta 採 {beta:.2f}；若 BTC 瞬間反轉 5%，此標的可能出現約 "
            f"{abs(beta) * 5:.1f}% 的方向性衝擊。"
        ),
        "TP1 成交並達到至少 +1R 後，只有結構已形成新 HL/LH 才將止損推至保本。",
        "ADX 未轉強、CVD 未同向或 OI 僅由回補驅動時，不得因價格快速移動而追單。",
    ]
    if value.funding_rate is not None and abs(value.funding_rate) >= 0.05:
        guardrails.insert(0, "資金費率已極端，擁擠交易可能先被反向清算再走原方向。")
    if missing:
        guardrails.append("缺失資料會降低勝率可信度：" + "、".join(missing))

    return {
        "input": asdict(value),
        "verdict": verdict,
        "verdict_zh": verdict_zh,
        "probability": probability,
        "score": round(score, 2),
        "completeness": round(completeness * 100),
        "summary": f"{direction_zh}假設的核心共振：{core or '資料不足'}。",
        "missing": missing,
        "signals": signals,
        "breakdown": {
            "whale": (
                f"{liquidity_note}；{hunt_note}；資金費率與 OI/CVD 必須共同確認，"
                "單一價格突破不視為機構主動建倉。"
            ),
            "quant": (
                f"總共振分數 {score:.2f}；"
                + ("趨勢框架。" if (value.adx or 0) >= 25 else "震盪／等待確認框架。")
                + (f" 結構備註：{value.notes}" if value.notes else "")
            ),
            "macro": (
                f"宏觀偏好={value.macro_bias}、板塊流={value.sector_flow}、"
                f"BTC 趨勢={value.btc_trend}。{event_note}。"
            ),
        },
        "execution": {
            "entry_zone": f"{_fmt(levels['entry_low'], value.current_price)} – "
            f"{_fmt(levels['entry_high'], value.current_price)}",
            "entry_style": entry_style,
            "stop": _fmt(levels["stop"], value.current_price),
            "stop_reason": "跌破／突破此處後，原方向的結構與風險預算同時失效。",
            "tp1": _fmt(levels["tp1"], value.current_price),
            "tp2": _fmt(levels["tp2"], value.current_price),
            "tp3": _fmt(levels["tp3"], value.current_price),
            "rr": round(levels["rr"], 2),
            "atr": _fmt(levels["atr"], value.current_price),
            "atr_inferred": levels["atr_inferred"],
        },
        "risk": {
            "account_size": value.account_size,
            "quarter_kelly_pct": round(risk["quarter_kelly_pct"], 3),
            "risk_budget_pct": round(risk["risk_budget_pct"], 3),
            "exposure_pct": round(risk["exposure_pct"], 2),
            "notional": round(risk["notional"], 2),
            "var95": round(risk["var95"], 2),
            "beta_used": round(risk["beta_used"], 2),
            "classification": (
                "試探性輕倉"
                if risk["risk_budget_pct"] < 0.5
                else "受控標準倉"
                if risk["risk_budget_pct"] < 0.9
                else "高共振但仍受上限約束"
            ),
        },
        "guardrails": guardrails,
        "disclaimer": "虛擬資金推演，不構成財務建議。",
    }
