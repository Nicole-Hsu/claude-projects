# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`claude-projects` (GitHub: `Nicole-Hsu/claude-projects`) is a monorepo of self-contained
teaching tools for a school ("瑜庭的工具箱"). Everything is plain HTML/CSS/JS with **no build
step, no framework, no package.json**. The root `index.html` is a launcher page linking to
each tool. Static files are served from GitHub Pages at
`https://nicole-hsu.github.io/claude-projects/`.

Two of the tools have Google Apps Script (GAS) backends, and they use **two fundamentally
different architectures** — this is the main thing to understand before editing.

## The two backend architectures (read this first)

### 1. Sign-in system (`sign-in-system/`) — static pages + external services

Client-only pages on GitHub Pages that talk to two independent backends:

- **Firebase Firestore** (`projectId: signinsystem2026`) stores signature images as base64,
  and a single control doc `config/status` with `{ signInOpen, signOutOpen }`.
- **A standalone GAS web app** (`google-apps-script.gs`, deployed separately, URL in each
  page's `CONFIG.scriptUrl`) writes text fields to a Google Sheet `簽到記錄` and sends the
  sign-out email.

Data flow on sign-in (`index.html`):
1. Signature canvas → `toDataURL()` → `addDoc(collection(db,'signatures'))`, returns `sigDocId`.
2. Text fields + `sigDocId` + a generated `signoutCode` → GAS via an **`new Image().src = scriptUrl + '?' + params`** GET (fire-and-forget, sidesteps CORS).
3. GAS emails a sign-out link (`signout.html?code=...`) to the attendee.

Sign-out (`signout.html`) and lookup use GAS `doGet` actions `lookup` / `signout`.
`admin.html` reads text via `fetch(scriptUrl + '?action=getData')`, reads signatures directly
from Firestore by `sigDocId`, and toggles `config/status` via `setDoc(...,{merge:true})`.
Open/close of sign-in and sign-out is gated by that Firestore doc: the sign-in page refuses to
submit unless `signInOpen === true`.

Non-obvious constraints:
- **`admin.html` must be opened over `http://localhost`, not `file://`** (CORS + Firebase).
  Run `python -m http.server 8766 --directory sign-in-system` or double-click
  `sign-in-system/啟動管理後台.bat`, then open `http://localhost:8766/admin.html`.
- Firebase `apiKey` and the GAS `scriptUrl` are **intentionally embedded in client code** and
  public — this is normal for Firebase web apps and anonymous GAS web apps, not a leak. Real
  secrets are `.gitignore`d.

`sign-in-system/簽到系統實作流程.md` is the authoritative end-to-end setup/deploy guide
(GitHub Pages, Firebase config, GAS deploy, Firestore rules, QR code). Read it before changing
the pipeline.

### 2. KPI system (`KPI/`) — a Google Apps Script HtmlService app

Unlike the sign-in system, KPI is **not served from GitHub Pages**. `KPI/Code.gs`'s `doGet()`
returns `HtmlService.createHtmlOutputFromFile('index')`, so `KPI/index.html` is the GAS-hosted
template and the client calls the server exclusively through **`google.script.run.withSuccessHandler(...)`**
— which only works when the page is served by Apps Script, not from a static host. The root
launcher links KPI to its `script.google.com/.../exec` URL for this reason.

- `KPI/index.html` and `KPI/Code.gs` in this repo are **source mirrors** of the live Apps
  Script project. Editing them here does nothing until the changes are copied into the Apps
  Script editor and redeployed. Keep both in sync manually.
- Data lives in a Google Sheet auto-created/located by `Code.gs` via
  `PropertiesService` (`SPREADSHEET_ID`), across the sheets named in `SHEET_NAMES`
  (WorkItems, KPIs, KPI achievements, Groups, Units, Teachers, Co-orgs, Forms, …). The column
  order in `initSheets()` is the schema — respect it when reading/writing rows.
- The KPI page is password-gated client-side (`3500`); this is UI gating only, not security.

## Other tools

- `tools/coordinate-hunter/index.html` — standalone coordinate-practice game, pure front-end.
- `qrcode.html` — generates a QR to the sign-in page (image API), no backend.

## Working in this repo

- **No build/lint/test tooling exists.** To preview any static tool, open its `index.html` in a
  browser, or serve the folder with `python -m http.server` when a page needs `http://` (Firebase
  / `fetch`). Verify sign-in/admin changes by running the local server flow above.
- To change GAS behavior you must **redeploy the Apps Script web app** (Deploy → New/Manage
  deployment, execute as yourself, access = Anyone) and paste the new `exec` URL into the
  relevant page (`CONFIG.scriptUrl` for sign-in, the launcher link for KPI).
- Git: default branch `master`; `gh-pages` also exists as a deploy branch. This working copy
  may have its files only in git, not checked out on disk — use `git show HEAD:<path>` to read a
  file if the working tree looks empty.

## Conventions

- **De-identify student data** — use only 座號 (seat number) + class code, never real names.
- Commit messages are written in **Traditional Chinese**, stating *what changed and why* (see
  recent history, e.g. "KPI：執行狀況後歸檔的項目排最前 — buildExecBand() 排序前先 .reverse()…").
- `.claude/` is `.gitignore`d and must never be pushed (it can contain tokens/permissions).

## Session workflow (project skills)

Progress notes live in Obsidian: `Obsidian_第二大腦/claude專案/工作筆記.md`.

- Say **「收工」** (or "結束了") → the `shutdown` skill: git commit + push + update the Obsidian
  work log.
- Say **「開工」** (or "上次做到哪") → the `startup` skill: read the Obsidian log, report last
  progress, check git status, suggest next steps.
- Add a new tool: create `tools/<name>/` and update the root launcher `index.html`.

The four "homes": GDrive desktop (`D:\我的雲端硬碟\claude專案\`, cross-machine sync), GitHub
(`Nicole-Hsu/claude-projects`, the web host), Obsidian (the idea log), Firebase
(`my-teaching-tools` / `signinsystem2026`, the data store).
