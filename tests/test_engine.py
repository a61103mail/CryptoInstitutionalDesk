from crypto_desk.engine import analyze_trade


def complete_long():
    return {
        "asset": "BTC",
        "direction": "long",
        "timeframe": "4H",
        "current_price": 100000,
        "account_size": 100000,
        "macro_bias": "risk_on",
        "sector_flow": "inflow",
        "btc_trend": "bullish",
        "btc_correlation": 0.9,
        "beta": 1.1,
        "ema_structure": "bullish",
        "rsi": 55,
        "macd": "bullish",
        "adx": 29,
        "bb_state": "middle",
        "atr": 2200,
        "price_change_24h": 3,
        "funding_rate": 0.01,
        "oi_change": 4,
        "cvd": "bullish",
        "liquidation_above": 107000,
        "liquidation_below": 96000,
    }


def test_complete_confluence_produces_risk_controlled_plan():
    report = analyze_trade(complete_long())
    assert report["verdict"] == "Execute"
    assert report["execution"]["rr"] >= 2.5
    assert report["risk"]["risk_budget_pct"] <= 1
    assert report["risk"]["exposure_pct"] <= 25


def test_missing_data_is_explicit_and_lowers_completeness():
    report = analyze_trade(
        {
            "asset": "ETH",
            "direction": "long",
            "timeframe": "1H",
            "current_price": 5000,
        }
    )
    assert report["missing"]
    assert report["completeness"] < 100


def test_invalid_stop_is_rejected():
    value = complete_long()
    value["invalidation_price"] = 110000
    try:
        analyze_trade(value)
    except ValueError as error:
        assert "無效點位" in str(error)
    else:
        raise AssertionError("invalid long stop should fail")


def test_observe_has_no_directional_trade_levels():
    value = complete_long()
    value["direction"] = "observe"
    report = analyze_trade(value)
    assert report["verdict"] == "Pass"
    assert report["execution"] is None

