# KJ 法課堂便利貼牆

班級用的數位 KJ 法（親和圖）工具：老師發問，學生發便利貼，全班一起（或老師）拖曳歸類。規格討論過程見 repo 根目錄的 `PROGRESS.md`（2026-09-17 那次）。

## 目前狀態：已接上 Firebase，還沒有真人走過一次完整流程

- Firebase 專案：**`kj-affinity-board`**（新開的，帳號 nicolehsu2004@gmail.com 底下）
- Firestore 安全規則、Google 登入 provider：已部署（`firebase deploy --only firestore,auth`）
- `firebaseConfig` 已經填進 `index.html` / `teacher.html`，不是佔位值了
- 已測試：`index.html` 查詢一個不存在的房間代碼，正確連到真的 Firestore 並回報「找不到」——代表資料庫串接沒問題

**還沒測過的部分（沒辦法在無頭瀏覽器環境完整驗證，需要你實際操作一次）：**
1. `teacher.html` 的 Google 登入彈窗（OAuth 互動式登入，且要注意 GitHub Pages 網域要被列在 Firebase Console → Authentication → Settings → 授權網域）
2. 完整跑一輪：老師登入→建班級→貼名單→開房間→拿到 QR→學生端掃碼加入→發便利貼→點選歸類
3. 部署到 GitHub Pages 之後（`nicole-hsu.github.io/...`）用真手機掃 QR 測試

## 部署 Firestore 安全規則（之後改規則要重新部署時用）

```
firebase deploy --only firestore:rules --project kj-affinity-board
```
（`firestore.rules` 已經寫好在這個資料夾裡，對應 PROGRESS.md 裡定案的規則邏輯。）

## 已知限制（MVP 範圍內的取捨，之後可以再補）

- **拖曳分類改成「點選」**：手機瀏覽器對原生拖放（HTML5 drag-and-drop）支援不穩定，尤其是觸控裝置。因為這個工具主要靠手機掃 QR code 使用，改成「點一下便利貼選取、再點一下欄位放進去」，體驗更可靠。如果你們主要用平板/電腦滑鼠操作，之後可以加回真的拖曳。
- **每人發文則數上限**用 Firestore transaction + 安全規則做，理論上有極小機率被惡意繞過 App 直接呼叫 Firestore 而超發 1 則（因為 rules 沒辦法完全避免同一交易內的競爭條件）。課堂內部工具、風險低，先接受。
- **鎖定／還原、發散收斂狀態機**：還沒做，按 PROGRESS.md 排在 MVP 之後。
- **老師只能刪除便利貼做基本管理**，還沒做「基本髒話黑名單」的 client 端過濾（PROGRESS.md 有定案但程式碼還沒寫）。
- **吉祥物插畫**：沒做，只有便利貼本身的卡通感（不對稱圓角、彈跳動畫、折角）。

## 部署位置（照 repo 慣例）

會是 `nicole-hsu.github.io/claude-projects/tools/kj-affinity-board/`（跟 `tools/coordinate-hunter/` 同一層級）。GitHub Pages 沒有額外設定要做，push 上 `master` 就會自動生效。
