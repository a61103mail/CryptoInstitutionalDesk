const form = document.querySelector("#trade-form");
const reportNode = document.querySelector("#report");
const button = document.querySelector(".analyze");
const autoButton = document.querySelector("#refresh-auto");
const feedStatus = document.querySelector("#feed-status");
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

function render(r) {
  const input = r.input;
  const execution = r.execution;
  const risk = r.risk;
  const signalRows = r.signals.map(s => `
    <div class="signal"><div><b>${s.label}</b><br><small>${s.detail}</small></div>
    <strong class="${tone(s.score)}">${s.score > 0 ? "+" : ""}${s.score.toFixed(2)}</strong></div>`).join("");
  const executionHtml = execution ? `
    <div class="section"><h3>3. 戰術執行面板</h3>
      <p><i>虛擬資金推演，不構成財務建議</i></p>
      <div class="cards">
        <div class="card"><span>進場區間</span><b>${execution.entry_zone}</b><small>${execution.entry_style}</small></div>
        <div class="card"><span>硬止損</span><b class="negative">${execution.stop}</b><small>${execution.stop_reason}</small></div>
        <div class="card"><span>風險報酬比</span><b>${execution.rr}:1</b><small>${execution.rr < 2.5 ? "低於門檻，否決" : "通過 1:2.5 門檻"}</small></div>
        <div class="card"><span>第一止盈</span><b>${execution.tp1}</b><small>防守型止盈</small></div>
        <div class="card"><span>第二止盈</span><b>${execution.tp2}</b><small>主要流動性目標</small></div>
        <div class="card"><span>第三止盈</span><b>${execution.tp3}</b><small>移動止損管理</small></div>
      </div>
      <p>真實波動幅度：${execution.atr}${execution.atr_inferred ? "（缺值，以價格 2% 情境推估）" : ""}</p>
    </div>
    <div class="section"><h3>部位與風險</h3>
      <div class="cards">
        <div class="card"><span>風險預算</span><b>${risk.risk_budget_pct}%</b><small>四分之一凱利公式，硬上限 1%</small></div>
        <div class="card"><span>名目曝險</span><b>${risk.exposure_pct}%</b><small>${risk.classification}</small></div>
        <div class="card"><span>95% 風險值情境</span><b>$${money(risk.var95)}</b><small>貝塔係數 ${risk.beta_used}／真實波幅模型</small></div>
      </div>
    </div>` : "";
  reportNode.classList.remove("empty");
  reportNode.innerHTML = `
    <div class="memo-head"><div><div class="eyebrow">📊 機構級交易決策備忘錄</div>
      <h2>${input.asset} · ${timeframeText(input.timeframe)} · ${directionText(input.direction)}</h2>
      <div class="verdict ${r.verdict.toLowerCase()}">${r.verdict_zh}</div></div>
      <div class="probability">模型化勝率估計<b>${r.probability}%</b>完整度 ${r.completeness ?? 100}%</div></div>
    <div class="section"><h3>1. 執行結論</h3><p>${r.summary}</p>
      ${r.missing.length ? `<p class="missing">缺失資料：${r.missing.join("、")}</p>` : ""}</div>
    <div class="section"><h3>2. 多維度拆解</h3>
      ${r.breakdown ? `<div class="warning"><b>巨鯨與籌碼：</b>${r.breakdown.whale}</div>
      <div class="warning"><b>量化與結構：</b>${r.breakdown.quant}</div>
      <div class="warning"><b>宏觀與資金流：</b>${r.breakdown.macro}</div>` : ""}
      ${signalRows}</div>
    ${executionHtml}
    <div class="section"><h3>4. 交易員心理防護</h3>
      ${r.guardrails.map(g => `<div class="warning">${g}</div>`).join("")}
    </div><p class="fineprint">${r.disclaimer}</p>`;
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
  const symbol = document.querySelector("#auto-symbol").value;
  const interval = document.querySelector("#auto-interval").value;
  const account = +document.querySelector("#auto-account").value || 100000;
  autoButton.disabled = true;
  feedStatus.textContent = `正在取得 ${symbol} ${interval} 市場資料...`;
  try {
    const report = await window.AutoDesk.run(symbol, interval, account);
    updateLive(report);
    render(report);
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

autoButton.addEventListener("click", runAutomatic);
document.querySelector("#auto-symbol").addEventListener("change", runAutomatic);
document.querySelector("#auto-interval").addEventListener("change", runAutomatic);
runAutomatic();
setInterval(runAutomatic, 60_000);
