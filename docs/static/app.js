const form = document.querySelector("#trade-form");
const reportNode = document.querySelector("#report");
const button = document.querySelector(".analyze");
const autoButton = document.querySelector("#refresh-auto");
const feedStatus = document.querySelector("#feed-status");
const symbolSelect = document.querySelector("#auto-symbol");
const watchlistNode = document.querySelector("#watchlist-chips");
const watchlistForm = document.querySelector("#watchlist-form");
const watchlistInput = document.querySelector("#watchlist-input");
const WATCHLIST_KEY = "crypto-desk-watchlist-v1";
const DEFAULT_WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
let watchlist = loadWatchlist();
if (location.hostname.endsWith("github.io")) {
  document.querySelector(".manual-wrap")?.remove();
}

function formData() {
  const raw = Object.fromEntries(new FormData(form).entries());
  const numeric = [
    "current_price", "account_size", "invalidation_price", "btc_correlation",
    "beta", "rsi", "adx", "atr", "price_change_24h", "funding_rate",
    "oi_change", "liquidation_above", "liquidation_below"
  ];
  numeric.forEach(key => { if (raw[key] === "") raw[key] = null; });
  return raw;
}

const tone = score => score > .15 ? "positive" : score < -.15 ? "negative" : "neutral";
const money = value => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value);
const directionText = direction => ({
  long: "做多",
  short: "做空",
  "delta-neutral": "市場中性",
  observe: "觀望"
})[direction] || direction;
const timeframeText = timeframe => ({
  "15m": "15 分鐘",
  "1h": "1 小時",
  "1H": "1 小時",
  "4h": "4 小時",
  "4H": "4 小時",
  "1d": "日線",
  "Daily": "日線"
})[timeframe] || timeframe;

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(saved) && saved.length ? [...new Set(saved)] : [...DEFAULT_WATCHLIST];
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}

function saveWatchlist() {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
}

function normalizeSymbol(value) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";
  return compact.endsWith("USDT") ? compact : `${compact}USDT`;
}

function syncSymbolOptions(selected = symbolSelect.value) {
  symbolSelect.innerHTML = watchlist
    .map(symbol => `<option${symbol === selected ? " selected" : ""}>${symbol}</option>`)
    .join("");
  if (!watchlist.includes(selected)) symbolSelect.value = watchlist[0];
}

async function renderWatchlist() {
  watchlistNode.innerHTML = watchlist.map(symbol => `
    <button type="button" class="watch-chip${symbol === symbolSelect.value ? " active" : ""}" data-symbol="${symbol}">
      <span>${symbol.replace("USDT", "")}</span><b>讀取中</b>
      <i data-remove="${symbol}" title="從自選移除">×</i>
    </button>`).join("");
  const results = await Promise.allSettled(watchlist.map(symbol => window.AutoDesk.quote(symbol)));
  results.forEach((result, index) => {
    const chip = watchlistNode.querySelector(`[data-symbol="${watchlist[index]}"]`);
    if (!chip) return;
    const value = result.status === "fulfilled" ? result.value : null;
    const detail = chip.querySelector("b");
    if (!value) {
      detail.textContent = "無資料";
      detail.className = "neutral";
      return;
    }
    detail.textContent = `${money(value.price)} · ${value.change24h >= 0 ? "+" : ""}${value.change24h.toFixed(2)}%`;
    detail.className = value.change24h >= 0 ? "positive" : "negative";
  });
}

function render(r) {
  const input = r.input;
  const execution = r.execution;
  const risk = r.risk;
  const signalRows = r.signals.slice(0, 7).map(s => `
    <div class="signal"><div><b>${s.label}</b><br><small>${s.detail}</small></div>
    <strong class="${tone(s.score)}">${s.score > 0 ? "+" : ""}${s.score.toFixed(2)}</strong></div>`).join("");
  const executionHtml = execution ? `
    <section class="bird-card execution-card"><h3>戰術執行</h3>
      <div class="cards compact-cards">
        <div class="card"><span>進場區間</span><b>${execution.entry_zone}</b><small>${execution.entry_style}</small></div>
        <div class="card"><span>硬止損</span><b class="negative">${execution.stop}</b><small>${execution.stop_reason}</small></div>
        <div class="card"><span>風險報酬比</span><b>${execution.rr}:1</b><small>${execution.rr < 2.5 ? "低於門檻，否決" : "通過 1:2.5 門檻"}</small></div>
        <div class="card"><span>第一止盈</span><b>${execution.tp1}</b><small>防守型止盈</small></div>
        <div class="card"><span>第二止盈</span><b>${execution.tp2}</b><small>主要流動性目標</small></div>
        <div class="card"><span>第三止盈</span><b>${execution.tp3}</b><small>移動止損管理</small></div>
      </div>
    </section>` : "";
  reportNode.classList.remove("empty");
  reportNode.innerHTML = `
    <div class="memo-head"><div><div class="eyebrow">📊 機構級交易決策備忘錄</div>
      <h2>${input.asset} · ${timeframeText(input.timeframe)} · ${directionText(input.direction)}</h2>
      <div class="verdict ${r.verdict.toLowerCase()}">${r.verdict_zh}</div></div>
      <div class="probability">模型化勝率估計<b>${r.probability}%</b>完整度 ${r.completeness ?? 100}%</div></div>
    <div class="bird-grid">
      <section class="bird-card verdict-card"><h3>決策摘要</h3><p>${r.summary}</p>
        <div class="risk-strip">
          <div><span>風險預算</span><b>${risk.risk_budget_pct}%</b></div>
          <div><span>名目曝險</span><b>${risk.exposure_pct}%</b></div>
          <div><span>95% 風險值</span><b>$${money(risk.var95)}</b></div>
        </div>
        ${r.missing.length ? `<p class="missing">資料缺口：${r.missing.join("、")}</p>` : ""}
      </section>
      ${executionHtml}
      <section class="bird-card signals-card"><h3>共振訊號</h3>${signalRows}</section>
      <section class="bird-card guard-card"><h3>風險護欄</h3>
        ${r.guardrails.slice(0, 3).map(g => `<div class="warning">${g}</div>`).join("")}
      </section>
    </div>
    <details class="full-analysis"><summary>展開完整多維度說明</summary>
      ${r.breakdown ? `<div class="detail-grid"><div><b>巨鯨與籌碼</b><p>${r.breakdown.whale}</p></div>
      <div><b>量化與結構</b><p>${r.breakdown.quant}</p></div>
      <div><b>宏觀與資金流</b><p>${r.breakdown.macro}</p></div></div>` : ""}
      ${r.guardrails.slice(3).map(g => `<div class="warning">${g}</div>`).join("")}
      <p class="fineprint">${r.disclaimer}</p>
    </details>`;
}

function updateLive(report) {
  const market = report.market;
  if (!market) return;
  document.querySelector("#live-price").textContent = money(market.price);
  document.querySelector("#live-change").textContent = `${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(2)}%／24 小時`;
  document.querySelector("#live-bias").textContent = directionText(report.input.direction);
  document.querySelector("#live-bias").className = report.input.direction === "long" ? "positive" : "negative";
  document.querySelector("#live-score").textContent = `共振分數 ${report.score}`;
  document.querySelector("#live-funding").textContent = `${market.fundingRate.toFixed(4)}%`;
  document.querySelector("#live-oi").textContent = `${market.oiChange >= 0 ? "+" : ""}${market.oiChange.toFixed(2)}%`;
  document.querySelector("#live-oi-value").textContent = `$${money(market.oiValue)}`;
  document.querySelector("#live-rsi-adx").textContent = `${market.rsi.toFixed(1)} / ${market.adx.toFixed(1)}`;
  document.querySelector("#live-regime").textContent = market.adx >= 25 ? "趨勢市場" : "震盪／轉換市場";
  document.querySelector("#live-atr").textContent = money(market.atr);
  document.querySelector("#live-bb").textContent = `布林帶寬度 ${market.bbWidthPct.toFixed(2)}%`;
}

async function runAutomatic() {
  const symbol = symbolSelect.value;
  const interval = document.querySelector("#auto-interval").value;
  const account = +document.querySelector("#auto-account").value || 100000;
  autoButton.disabled = true;
  feedStatus.textContent = `正在取得 ${symbol} ${interval} 市場資料...`;
  try {
    const report = await window.AutoDesk.run(symbol, interval, account);
    updateLive(report);
    render(report);
    renderWatchlist();
    feedStatus.textContent = `${report.market.source} · ${new Date(report.market.fetchedAt).toLocaleString()} · 下次 60 秒自動更新`;
  } catch (error) {
    feedStatus.textContent = `自動資料失敗：${error.message}`;
    reportNode.classList.remove("empty");
    reportNode.innerHTML = `<div class="error"><h2>市場資料不可用</h2><p>${error.message}</p><p>系統沒有用假數值產生交易結論。</p></div>`;
  } finally {
    autoButton.disabled = false;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = "正在計算風險...";
  try {
    const response = await fetch("/api/analyze", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(formData())
    });

    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "分析失敗");
    render(result.report);
  } catch (error) {
    reportNode.classList.remove("empty");
    reportNode.innerHTML = `<div class="error"><h2>輸入無效</h2><p>${error.message}</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = "執行機構級分析";
  }
});

watchlistNode.addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    event.stopPropagation();
    if (watchlist.length <= 1) return;
    const symbol = remove.dataset.remove;
    const removedCurrent = symbolSelect.value === symbol;
    watchlist = watchlist.filter(item => item !== symbol);
    saveWatchlist();
    syncSymbolOptions();
    renderWatchlist();
    if (removedCurrent) runAutomatic();
    return;
  }
  const chip = event.target.closest("[data-symbol]");
  if (!chip) return;
  symbolSelect.value = chip.dataset.symbol;
  runAutomatic();
});

watchlistForm.addEventListener("submit", async event => {
  event.preventDefault();
  const symbol = normalizeSymbol(watchlistInput.value);
  if (!symbol || watchlist.includes(symbol)) {
    watchlistInput.value = "";
    return;
  }
  watchlistInput.disabled = true;
  try {
    await window.AutoDesk.quote(symbol);
    watchlist.push(symbol);
    saveWatchlist();
    syncSymbolOptions(symbol);
    watchlistInput.value = "";
    await renderWatchlist();
    runAutomatic();
  } catch {
    feedStatus.textContent = `${symbol} 不是可用的幣安 U 本位永續合約。`;
  } finally {
    watchlistInput.disabled = false;
  }
});

syncSymbolOptions(watchlist[0]);
renderWatchlist();
autoButton.addEventListener("click", runAutomatic);
symbolSelect.addEventListener("change", runAutomatic);
document.querySelector("#auto-interval").addEventListener("change", runAutomatic);
runAutomatic();
setInterval(runAutomatic, 60_000);
