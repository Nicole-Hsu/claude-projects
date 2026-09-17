# KJ 法課堂便利貼牆

班級用的數位 KJ 法（親和圖）工具：老師發問，學生發便利貼，全班一起（或老師）拖曳歸類。規格討論過程見 repo 根目錄的 `PROGRESS.md`（2026-09-17 那次）。

## 目前狀態：程式碼寫好了，還沒能真的連上 Firebase

`index.html`（學生端）和 `teacher.html`（老師端）都是完整可動作的程式碼，但 `firebaseConfig` 還是佔位的 `YOUR_API_KEY` / `YOUR_PROJECT_ID` —— **因為這個工具原本設定要用的 Firebase 專案 `my-teaching-tools` 在目前登入的帳號（nicolehsu2004@gmail.com）底下查不到，不存在。**

目前這個帳號底下有的 Firebase 專案：
- `signinsystem2026`（簽到系統在用）
- `qmethod-classroom`
- `codex2026-2180c`

**需要你決定：**
1. 開一個新的 Firebase 專案給這個工具用（例如叫 `kj-affinity-board`），或
2. 沿用 `qmethod-classroom`（如果那個專案本來就是留給教室工具用的？我不確定它的用途，需要你確認）

決定之後，跑：
```
firebase apps:sdkconfig web
```
或用 Firebase Console → 專案設定 → 新增網頁應用程式，把拿到的設定貼到 `index.html` 和 `teacher.html` 裡的 `firebaseConfig`。

## 部署 Firestore 安全規則

```
firebase deploy --only firestore:rules --project <你的專案ID>
```
（`firestore.rules` 已經寫好在這個資料夾裡，對應 PROGRESS.md 裡定案的規則邏輯。）

還需要在 Firebase Console 開啟 **Google 登入**（Authentication → Sign-in method → Google），老師後台 (`teacher.html`) 才能登入。

## 已知限制（MVP 範圍內的取捨，之後可以再補）

- **拖曳分類改成「點選」**：手機瀏覽器對原生拖放（HTML5 drag-and-drop）支援不穩定，尤其是觸控裝置。因為這個工具主要靠手機掃 QR code 使用，改成「點一下便利貼選取、再點一下欄位放進去」，體驗更可靠。如果你們主要用平板/電腦滑鼠操作，之後可以加回真的拖曳。
- **每人發文則數上限**用 Firestore transaction + 安全規則做，理論上有極小機率被惡意繞過 App 直接呼叫 Firestore 而超發 1 則（因為 rules 沒辦法完全避免同一交易內的競爭條件）。課堂內部工具、風險低，先接受。
- **鎖定／還原、發散收斂狀態機**：還沒做，按 PROGRESS.md 排在 MVP 之後。
- **老師只能刪除便利貼做基本管理**，還沒做「基本髒話黑名單」的 client 端過濾（PROGRESS.md 有定案但程式碼還沒寫）。
- **吉祥物插畫**：沒做，只有便利貼本身的卡通感（不對稱圓角、彈跳動畫、折角）。

## 部署位置（照 repo 慣例）

會是 `nicole-hsu.github.io/claude-projects/tools/kj-affinity-board/`（跟 `tools/coordinate-hunter/` 同一層級）。GitHub Pages 沒有額外設定要做，push 上 `master` 就會自動生效。
