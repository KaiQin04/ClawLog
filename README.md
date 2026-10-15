# 夾娃娃機遊玩記錄 Web App

此應用為純前端實作，使用 HTML、靜態 Tailwind CSS 與 JavaScript 管理夾娃娃機遊玩紀錄，資料透過 Firebase 儲存並需 Google 登入。部署直接提供靜態檔案，不需執行建置服務。

## 功能
- 新增、編輯與刪除紀錄
- 自動計算當日盈虧：`盈虧 = 得到點數×每點成本 - 花費金額 + 商品價值`
- 調整點數成本並即時更新所有紀錄
- Google 登入後自動同步資料至 Firebase Firestore
- 匯入與匯出 CSV


## 快速開始
1. 在 Firebase 控制台建立專案並啟用 Google 登入與 Cloud Firestore。
2. 於專案設定取得 `firebaseConfig`，核對 `index.html` 內的設定。目前設定指向 `test-project-13138`，即使從 localhost 開啟，登入後仍會存取該遠端 Firebase 專案。
3. 下載或複製本專案
4. 開啟 `index.html` 或在目錄執行：
   ```bash
   /opt/homebrew/bin/uv run --no-project python -m http.server 8000
   ```
   然後於瀏覽器造訪 [http://localhost:8000](http://localhost:8000)
## 檔案
- `index.html`：主頁面
- `script.js`：登入、Firestore、畫面與互動
- `data.js`：共用驗證與 CSV 格式
- `styles.css`：已產生的靜態 CSS
- `tailwind-input.css`：CSS 來源
- `tests/`：Node 資料測試與隔離 Firebase mock 瀏覽器測試
- `LICENSE`：授權資訊

## 使用方式
1. 填寫日期、店名、花費金額、得到點數與商品價值
2. 選擇每點成本後點擊「新增紀錄」
3. 表格可編輯或刪除紀錄
4. 透過「匯出 CSV」下載紀錄或選擇 CSV 檔匯入

## 資料與帳號

應用程式僅在記憶體保留目前帳號的紀錄與成本，不再寫入 `clawRecords` / `clawPointCost`。登出與切換帳號會清空紀錄、表單、編輯狀態、篩選和總計，成本回到 3.5；未登入或載入失敗時禁止資料操作。非同步回應會核對 UID 與登入次序，避免舊帳號回應更新新帳號畫面。Firebase Auth 自身的登入狀態仍由 SDK 管理。

舊版本留下的兩個 localStorage key 沒有擁有者資訊，因此不會自動顯示、上傳或歸入新帳號。存在時會顯示一次性清理提示，由原使用者下載 JSON 原值備份、確認備份可讀，再明確確認清除；其他 localStorage key 不受影響。**在使用者完成清除前，舊資料仍以明文留在此瀏覽器，不能視為已安全清除。** JSON 備份不是 CSV，不會自動上傳。

表單、CSV 與雲端紀錄共用日期、店名及數值驗證。日期須為有效的 `YYYY-MM-DD` 或本地日期時間；店名須為 1 至 200 字；數值必須完整、有限，絕對值不超過 1 兆，允許合法負數，成本須非負。雲端格式錯誤的紀錄會逐筆略過並顯示數量，原資料不會被修改或刪除；讀取時也不再回寫缺少的建立時間。資料以文字節點顯示。

## CSV 格式

新匯出標頭為 `format,date,store,spent,points,value,createdAt,profit`，每筆 `format` 為 `clawlog-v1`。店名一律加一個保護用單引號，以降低試算表公式注入風險；匯入只有在明確的 v1 格式中才移除這一個字元，因此原有單引號、逗號、雙引號與換行均可還原。數值欄保持數字，包括負數；盈虧會依目前帳號的成本重新計算。

匯入依標頭名稱對應，接受上述英文欄名，以及舊版「日期、店名、花費金額、得到點數、商品價值、當日盈虧」和另含「建立時間」的格式，欄位可重排。舊版店名不移除單引號。不明、重複、缺少必要欄位或欄數不符會整份拒絕，不推測錯位資料。舊版未正確引用的逗號、引號或換行無法可靠還原，需先修復來源檔。

CSV 須為 UTF-8、最多 1 MiB / 1000 筆。所有紀錄驗證通過後才循序寫入；期間禁止重複提交，每 25 筆更新進度，結束才重繪表格。失敗會顯示已確認數量與最後一筆可能已寫入的提醒：**保持頁面開啟，重新選同一檔案可用原 ID 安全續傳。** 同次登入最近完成的相同檔案不再重複寫入。續傳狀態僅在記憶體；重新整理或重新登入後必須先核對雲端紀錄，勿直接重匯整檔。

## 開發與驗證

重建靜態 CSS（固定 Tailwind 3.4.17，不在使用者瀏覽器執行 CDN runtime）：

```bash
npm exec --yes --package=tailwindcss@3.4.17 -- tailwindcss --input ./tailwind-input.css --output ./styles.css --content './index.html,./script.js' --minify
```

Firebase compat SDK 固定為 10.12.2，三支官方檔案均附 SHA-384 SRI 與 `crossorigin="anonymous"`；若變更版本，需重新核對內容與雜湊。

不需額外套件的資料測試：

```bash
node --test tests/data.test.cjs
```

瀏覽器測試使用 Playwright 與本機 Google Chrome。可使用既有 Playwright，或將固定版本安裝在暫存目錄，不改專案相依：

```bash
npm install --prefix /tmp/clawlog-test-deps --no-save --package-lock=false playwright@1.62.1
NODE_PATH=/tmp/clawlog-test-deps/node_modules node --test tests/ui.test.cjs
```

測試伺服器只監聽 `127.0.0.1`。mock 頁面移除全部 Firebase SDK 與正式初始化設定，使用合成資料；所有外部請求一律禁止並要求數量為零。涵蓋 CRUD、重新載入、HTML 文字、舊快取備份清理、登出與換帳號、延遲回應、CSV 往返、限制及不確定寫入後續傳。

另可執行 `CLAWLOG_VERIFY_SDK=1 NODE_PATH=/tmp/clawlog-test-deps/node_modules node --test tests/ui.test.cjs`，使用未修改的正式 HTML 驗證三支 SDK 的 SRI / CORS。該測試使用乾淨的未登入 context，僅允許下載指定 SDK；字型 CSS 以空內容替代，OAuth、Firestore 和其他外部後端請求全部禁止。

這些驗證不代表已通過真實 Google OAuth、Firestore Rules 或試算表軟體的端到端測試。此 repo 沒有 Firebase Hosting / Rules 設定，無法由原始碼確認正式存取規則；前端登入檢查不能取代伺服器規則。Excel / LibreOffice 的實際開啟行為仍待實測。

## 技術
- JavaScript
- Tailwind CSS
- Firebase

## 授權
本專案採 MIT License
