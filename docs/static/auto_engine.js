window.AutoDesk = (() => {
  const BASE = "https://fapi.binance.com";

  async function getJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${BASE}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const std = values => {
    const average = mean(values);
    return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
  };
  const pct = (from, to) => from ? (to / from - 1) * 100 : 0;

  function ema(values, period) {
    const alpha = 2 / (period + 1);
    let current = values[0];
    const output = [current];
    for (let i = 1; i < values.length; i++) {
      current = values[i] * alpha + current * (1 - alpha);
      output.push(current);
    }
    return output;
  }

  function rsi(values, period = 14) {
    const changes = values.slice(1).map((value, index) => value - values[index]);
    const recent = changes.slice(-period);
    const gains = recent.map(value => Math.max(value, 0));
    const losses = recent.map(value => Math.max(-value, 0));
    const averageLoss = mean(losses);
    if (averageLoss === 0) return 100;
    const rs = mean(gains) / averageLoss;
    return 100 - 100 / (1 + rs);
  }

  function atr(candles, period = 14) {
    const ranges = candles.slice(1).map((candle, index) => {
      const previousClose = candles[index].close;
      return Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose)
      );
    });
    return mean(ranges.slice(-period));
  }

  function adx(candles, period = 14) {
    const trs = [], plus = [], minus = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i], previous = candles[i - 1];
      const up = current.high - previous.high;
      const down = previous.low - current.low;
      plus.push(up > down && up > 0 ? up : 0);
      minus.push(down > up && down > 0 ? down : 0);
      trs.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
    }
    const dx = [];
    for (let i = period; i <= trs.length; i++) {
      const tr = trs.slice(i - period, i).reduce((a, b) => a + b, 0);
      if (!tr) continue;
      const pdi = 100 * plus.slice(i - period, i).reduce((a, b) => a + b, 0) / tr;
      const mdi = 100 * minus.slice(i - period, i).reduce((a, b) => a + b, 0) / tr;
      dx.push(100 * Math.abs(pdi - mdi) / Math.max(pdi + mdi, .0001));
    }
    return mean(dx.slice(-period));
  }

  function correlation(a, b) {
    const length = Math.min(a.length, b.length);
    const x = a.slice(-length), y = b.slice(-length);
    const mx = mean(x), my = mean(y);
    const covariance = mean(x.map((value, index) => (value - mx) * (y[index] - my)));
    const denominator = std(x) * std(y);
    return denominator ? covariance / denominator : 0;
  }

  function beta(assetReturns, btcReturns) {
    const length = Math.min(assetReturns.length, btcReturns.length);
    const x = assetReturns.slice(-length), y = btcReturns.slice(-length);
    const mx = mean(x), my = mean(y);
    const covariance = mean(x.map((value, index) => (value - mx) * (y[index] - my)));
    const variance = mean(y.map(value => (value - my) ** 2));
    return variance ? covariance / variance : 1;
  }

  function returns(values) {
    return values.slice(1).map((value, index) => value / values[index] - 1);
  }

  function intervalPeriod(interval) {
    return ({ "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" })[interval] || "4h";
  }

  async function collect(symbol, interval) {
    const encoded = encodeURIComponent(symbol.toUpperCase());
    const [rawKlines, ticker, premium, oiHistory] = await Promise.all([
      getJson(`/fapi/v1/klines?symbol=${encoded}&interval=${interval}&limit=220`),
      getJson(`/fapi/v1/ticker/24hr?symbol=${encoded}`),
      getJson(`/fapi/v1/premiumIndex?symbol=${encoded}`),
      getJson(`/futures/data/openInterestHist?symbol=${encoded}&period=${intervalPeriod(interval)}&limit=30`)
    ]);
    const candles = rawKlines.map(row => ({
      time: row[0], open: +row[1], high: +row[2], low: +row[3],
      close: +row[4], volume: +row[5]
    }));
    let btcCandles = candles;
    if (symbol.toUpperCase() !== "BTCUSDT") {
      const rawBtc = await getJson(`/fapi/v1/klines?symbol=BTCUSDT&interval=${interval}&limit=220`);
      btcCandles = rawBtc.map(row => ({ close: +row[4] }));
    }
    const closes = candles.map(candle => candle.close);
    const btcCloses = btcCandles.map(candle => candle.close);
    const ema20 = ema(closes, 20).at(-1);
    const ema50 = ema(closes, 50).at(-1);
    const ema200 = ema(closes, 200).at(-1);
    const macdLine = ema(closes, 12).at(-1) - ema(closes, 26).at(-1);
    const macdSeries = closes.map((_, index) => {
      const slice = closes.slice(0, index + 1);
      return ema(slice, 12).at(-1) - ema(slice, 26).at(-1);
    });
    const signal = ema(macdSeries, 9).at(-1);
    const recent = closes.slice(-20);
    const middle = mean(recent), deviation = std(recent);
    const upper = middle + deviation * 2, lower = middle - deviation * 2;
    const widthPct = (upper - lower) / middle * 100;
    const currentAtr = atr(candles);
    const currentAdx = adx(candles);
    const assetReturns = returns(closes.slice(-80));
    const btcReturns = returns(btcCloses.slice(-80));
    const oiFirst = +(oiHistory[0]?.sumOpenInterestValue || 0);
    const oiLast = +(oiHistory.at(-1)?.sumOpenInterestValue || 0);
    const signedVolume = candles.slice(-40).reduce(
      (sum, candle) => sum + (candle.close >= candle.open ? candle.volume : -candle.volume), 0
    );
    const swings = candles.slice(-49, -1);
    return {
      source: "Binance USD-M Futures public API",
      fetchedAt: new Date().toISOString(),
      symbol: symbol.toUpperCase(),
      interval,
      price: +ticker.lastPrice,
      change24h: +ticker.priceChangePercent,
      volume24h: +ticker.quoteVolume,
      fundingRate: +premium.lastFundingRate * 100,
      oiValue: oiLast,
      oiChange: pct(oiFirst, oiLast),
      ema20, ema50, ema200,
      rsi: rsi(closes),
      macdLine, macdSignal: signal,
      adx: currentAdx,
      atr: currentAtr,
      bbUpper: upper, bbLower: lower, bbMiddle: middle, bbWidthPct: widthPct,
      cvdProxy: signedVolume,
      correlation: correlation(assetReturns, btcReturns),
      beta: beta(assetReturns, btcReturns),
      liquidityAbove: Math.max(...swings.map(candle => candle.high)),
      liquidityBelow: Math.min(...swings.map(candle => candle.low))
    };
  }

  function analyze(market, accountSize) {
    let bias = 0;
    const signals = [];
    const add = (label, score, detail, category = "quant") => {
      bias += score;
      signals.push({ label, score, detail, category });
    };
    const bullishEma = market.ema20 > market.ema50 && market.ema50 > market.ema200;
    const bearishEma = market.ema20 < market.ema50 && market.ema50 < market.ema200;
    add("EMA 20/50/200", bullishEma ? 1.4 : bearishEma ? -1.4 : 0,
      bullishEma ? "多頭排列" : bearishEma ? "空頭排列" : "均線糾結");
    add("MACD", market.macdLine > market.macdSignal ? 1 : -1,
      market.macdLine > market.macdSignal ? "動能柱偏多" : "動能柱偏空");
    add("RSI", market.rsi > 72 ? -.7 : market.rsi < 28 ? .7 : market.rsi >= 50 ? .35 : -.35,
      `RSI ${market.rsi.toFixed(1)}`);
    add("ADX", market.adx >= 25 ? Math.sign(bias || market.change24h) * .7 : 0,
      `ADX ${market.adx.toFixed(1)}，${market.adx >= 25 ? "趨勢市" : "震盪市"}`);
    add("CVD Proxy", market.cvdProxy >= 0 ? .8 : -.8,
      market.cvdProxy >= 0 ? "近 40 根主動量偏買方" : "近 40 根主動量偏賣方", "derivatives");
    add("OI / Price", Math.sign(market.change24h) * (market.oiChange >= 0 ? .8 : .25),
      `價格 ${market.change24h.toFixed(2)}%，OI ${market.oiChange.toFixed(2)}%`, "derivatives");
    const crowded = Math.abs(market.fundingRate) >= .05;
    add("Funding", crowded ? -Math.sign(market.fundingRate) : -Math.sign(market.fundingRate) * .2,
      `${market.fundingRate.toFixed(4)}%${crowded ? "，擁擠" : ""}`, "derivatives");

    const direction = bias >= 0 ? "long" : "short";
    const directionalScore = Math.abs(bias);
    const probability = Math.round(Math.max(40, Math.min(74, 50 + directionalScore * 3.1)));
    const sign = direction === "long" ? 1 : -1;
    const entry = market.price;
    const stopDistance = Math.max(market.atr * 1.1, market.price * .008);
    const stop = entry - sign * stopDistance;
    const tp1 = entry + sign * stopDistance * 1.25;
    const structuralTp = direction === "long" ? market.liquidityAbove : market.liquidityBelow;
    const minimumTp2 = entry + sign * stopDistance * 2.7;
    const tp2 = direction === "long" ? Math.max(structuralTp, minimumTp2) : Math.min(structuralTp, minimumTp2);
    const tp3 = entry + sign * stopDistance * 4.2;
    const rr = Math.abs(tp2 - entry) / stopDistance;
    const p = probability / 100, b = rr;
    const quarterKelly = Math.min(Math.max(0, (b * p - (1 - p)) / b) * .25, .02);
    const riskBudget = Math.min(.01, quarterKelly);
    const stopPct = stopDistance / entry;
    const exposure = Math.min(.25, riskBudget / stopPct);
    const notional = accountSize * exposure;
    const var95 = notional * (market.atr / market.price) * 1.65 * Math.max(1, Math.abs(market.beta));
    const verdict = directionalScore >= 4 && market.adx >= 22 ? "Execute" :
      directionalScore >= 2 ? "Conditional" : "Pass";
    const verdictZh = verdict === "Execute" ? "強烈執行" :
      verdict === "Conditional" ? "條件滿足後執行" : "拒絕交易";
    const format = value => market.price >= 1000 ? value.toFixed(2) : market.price >= 1 ? value.toFixed(4) : value.toFixed(8);
    const bbState = market.bbWidthPct < 4 ? "極度收斂" :
      market.price >= market.bbUpper ? "上軌外" : market.price <= market.bbLower ? "下軌外" : "帶內";
    return {
      market,
      input: { asset: market.symbol.replace("USDT", ""), timeframe: market.interval, direction },
      verdict, verdict_zh: verdictZh, probability, score: +bias.toFixed(2), completeness: 91,
      summary: `${direction === "long" ? "多頭" : "空頭"}自動偏向；EMA、動能、OI、Funding 與訂單流代理合成分數 ${bias.toFixed(2)}。`,
      missing: ["真實清算熱力圖", "宏觀新聞 priced-in 人工判讀"],
      signals,
      breakdown: {
        whale: `OI ${market.oiChange.toFixed(2)}%，Funding ${market.fundingRate.toFixed(4)}%；上方 ${format(market.liquidityAbove)}、下方 ${format(market.liquidityBelow)} 為近期 swing 流動性代理。`,
        quant: `EMA20 ${format(market.ema20)} / EMA50 ${format(market.ema50)} / EMA200 ${format(market.ema200)}；RSI ${market.rsi.toFixed(1)}、ADX ${market.adx.toFixed(1)}、BB ${bbState}。`,
        macro: `與 BTC 報酬相關性 ${market.correlation.toFixed(2)}、Beta ${market.beta.toFixed(2)}。未接新聞 API，不虛構宏觀事件。`
      },
      execution: {
        entry_zone: `${format(entry - market.atr * .15)} – ${format(entry + market.atr * .10)}`,
        entry_style: market.adx >= 25 ? "分批限價，右側確認加倉" : "只在 ADX/結構確認後進場",
        stop: format(stop), stop_reason: "穿越 1.1 ATR 並破壞自動方向結構。",
        tp1: format(tp1), tp2: format(tp2), tp3: format(tp3), rr: +rr.toFixed(2),
        atr: format(market.atr), atr_inferred: false
      },
      risk: {
        risk_budget_pct: +(riskBudget * 100).toFixed(3),
        exposure_pct: +(exposure * 100).toFixed(2),
        var95: +var95.toFixed(2), beta_used: +market.beta.toFixed(2),
        classification: riskBudget < .005 ? "試探性輕倉" : riskBudget < .009 ? "受控標準倉" : "高共振但受 1% 上限約束"
      },
      guardrails: [
        `資料來源：${market.source}；更新時間 ${new Date(market.fetchedAt).toLocaleString()}`,
        "自動分析不包含新聞語意、鏈上巨鯨地址與真實清算熱力圖，不得把 swing proxy 當成交易所清算數據。",
        "TP1 達成且形成新 HL/LH 後才推保本；未確認前禁止 FOMO 追價。",
        `Beta ${market.beta.toFixed(2)}；BTC 急跌時必須按相關性風險縮倉。`
      ],
      disclaimer: "虛擬資金推演，不構成財務建議。"
    };
  }

  async function run(symbol, interval, accountSize) {
    const market = await collect(symbol, interval);
    return analyze(market, accountSize);
  }

  return { run };
})();
