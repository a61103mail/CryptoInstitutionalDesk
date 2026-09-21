# Crypto Institutional Desk

獨立的本機加密貨幣交易決策 Web 儀表板。使用者輸入市場、量化、衍生品與
流動性資料後，系統產生結構化交易備忘錄、風險報酬比、分數式勝率估計、
四分之一 Kelly 風險預算及 95% VaR 情境估計。

## 執行

```powershell
.\scripts\setup.ps1
.\scripts\run.ps1
```

開啟：`http://127.0.0.1:8787`

也可以直接雙擊 `Start-Web-Dashboard.cmd`，它會啟動服務並開啟瀏覽器。

## 原則

- 只綁本機 `127.0.0.1`。
- 不需要 API key，也不會將表單資料送往第三方。
- 自動模式直接讀取 Binance USD-M Futures 公開 API：K 線、24H ticker、
  funding 與 OI history；每 60 秒更新。
- 自動計算 EMA20/50/200、RSI14、MACD、ADX14、Bollinger Bands、ATR14、
  CVD proxy、BTC correlation 與 Beta。
- 上下流動性使用近期 swing high/low 代理，明確標示不是清算熱力圖。
- 缺少的資料會明列並降低信心，不會冒充即時行情。
- 勝率、Kelly 與 VaR 是依輸入資料的情境模型，不是經審計的預測。
- 僅供虛擬資金研究，不構成財務建議。

## GitHub Pages

```powershell
.\scripts\build_pages.ps1
```

`docs` 內為不需要後端與 API key 的自動儀表板版本。
