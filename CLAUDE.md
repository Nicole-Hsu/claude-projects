# 2026database — 我的班級工具總專案

## 對話開始時請先讀
1. **先讀 `PROGRESS.md`**（這個 repo 裡）——不管是雲端 Claude 還是桌機 Claude，這份都讀得到，是跨裝置/跨 session 進度同步的主要依據
2. 想看更完整的想法、細節、內部資訊，才去 Obsidian：`Obsidian_第二大腦/claude專案/工作筆記.md`

## 工作模式
- **加新工具**：對 Claude 說「我想做一個 XXX 工具」→ Claude 會建 `tools/<工具名>/` 子資料夾、引導我跟著 EP10 影片做
- **結束工作**：對 Claude 說「**收工**」→ 自動 commit + push（含更新 `PROGRESS.md`）+ 提醒我手動同步 Obsidian 摘要
- **接續工作**：對 Claude 說「讀進度、告訴我上次做到哪」→ Claude 讀 `PROGRESS.md`

## 進度紀錄：以 PROGRESS.md 為準，避免雙寫漂移
- **`PROGRESS.md`（git repo 裡）是唯一真相來源**：任何 Claude（雲端或桌機）記錄/查詢進度都以這份為準，逐字更新，不要兩邊各寫一份完整記錄
- **Obsidian 工作筆記是我自己的想法駕駛艙**，可以放連結指向 `PROGRESS.md`、放比較長的思考脈絡，但不必逐字跟 `PROGRESS.md` 同步
- ⚠️ **`PROGRESS.md` 在公開 repo 裡，絕對不能寫密碼、學生個資、內部行政機密**（例如 GAS 部署密碼、監評/試務內部資料）——這類東西只能留在 Obsidian 或本機，不進 git

## 工作桌 + 三個家
- 📋 GDrive 工作桌：`D:\我的雲端硬碟\claude專案\`（自動跨電腦同步）
- 🐙 GitHub repo：`Nicole-Hsu/claude-projects`（公開，網頁的家）
- 📘 Obsidian 駕駛艙：`Obsidian_第二大腦/claude專案/工作筆記.md`（想法的家）
- 🔥 Firebase 專案：`kj-affinity-board`（KJ 法課堂便利貼牆專用；其他工具各自用 GAS/Sheets，不共用這個專案）

## 工具清單
（之後加新工具時會自動更新）
- [座標獵人](tools/coordinate-hunter/index.html)：直角座標練習遊戲，11×11 格點、60 秒倒數、10 個隱藏目標
- [KJ 法課堂便利貼牆](tools/kj-affinity-board/)：老師發問（QR code 加入）、學生發匿名座號便利貼、全班歸類分類。**已正式上線**，白名單登入管控，短網址 `kj.html`。詳細進度見 `PROGRESS.md`
  - [測試版](tools/kj-affinity-board-v2/)：程式碼副本，用來開發新功能不影響正式版；**跟正式版共用同一個 Firestore 資料庫與規則**，規則層級改動仍會影響正式版，見 `tools/kj-affinity-board-v2/README.md`

## 工作注意事項
- 學生資料一律去識別化（只用座號 + 班級代號）
- commit 訊息要寫清楚做了什麼 + 為什麼
- 收工前說「收工」讓 Claude 同步三方
- 進度紀錄寫 `PROGRESS.md`，不要寫密碼/個資/內部機密進去（見上方「進度紀錄」規則）
