# KJ 法課堂便利貼牆（測試版）

這是 `tools/kj-affinity-board/`（正式版）的**程式碼副本**，用來開發/測試新功能，不會動到正式版正在使用的網頁。

**注意：**
- 兩邊**共用同一個 Firebase 專案（`kj-affinity-board`）跟同一個 Firestore 資料庫**——資料（班級、議題、便利貼）是互通的，不是分開的兩份資料
- **安全規則（firestore.rules）是資料庫層級、全域共用**，不會因為改的是測試版就只影響測試版；牽涉規則的改動一律先跟使用者確認
- 純網頁介面/前端邏輯的改動可以安心在這裡試，不影響正式版的畫面跟操作
- 正式版：`tools/kj-affinity-board/`（`nicole-hsu.github.io/claude-projects/tools/kj-affinity-board/`，短網址 `kj.html`）
- 測試版網址：`nicole-hsu.github.io/claude-projects/tools/kj-affinity-board-v2/`

驗證穩定後，可以考慮把測試版內容覆蓋回正式版資料夾。
