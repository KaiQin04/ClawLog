# 夾娃娃機遊玩記錄 Web App

此應用為純前端實作，使用 HTML、Tailwind CSS 與 JavaScript 管理夾娃娃機遊玩紀錄，資料透過 Firebase 儲存並需 Google 登入。

## 功能
- 新增、編輯與刪除紀錄
- 自動計算當日盈虧：`盈虧 = 得到點數×每點成本 - 花費金額 + 商品價值`
- 調整點數成本並即時更新所有紀錄
- Google 登入後自動同步資料至 Firebase Firestore
- 匯入與匯出 CSV


## 快速開始
1. 在 Firebase 控制台建立專案並啟用 Google 登入與 Cloud Firestore。
2. 於專案設定取得 `firebaseConfig`，替換 `index.html` 內的範例設定。
3. 下載或複製本專案
4. 開啟 `index.html` 或在目錄執行：
   ```bash
   python3 -m http.server 8000
   ```
   然後於瀏覽器造訪 [http://localhost:8000](http://localhost:8000)
## 檔案
- `index.html`：主頁面
- `script.js`：前端邏輯
- `LICENSE`：授權資訊

## 使用方式
1. 填寫日期、店名、花費金額、得到點數與商品價值
2. 選擇每點成本後點擊「新增紀錄」
3. 表格可編輯或刪除紀錄
4. 透過「匯出 CSV」下載紀錄或選擇 CSV 檔匯入

## 技術
- JavaScript
- Tailwind CSS
- Firebase

## 授權
本專案採 MIT License
