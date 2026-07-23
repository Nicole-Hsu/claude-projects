/**********************************************************************
 *  Check-in System — Google Apps Script 後端
 *  （對應 check-in-system/index.html 前端的完整 API 契約）
 *
 *  部署：新增專案 → 貼上本檔 → 部署為「網頁應用程式」
 *        執行身分＝我；存取權＝任何人 → 複製 /exec 網址
 *        → 貼到前端「管理頁 → API 設定」欄位。
 *
 *  所有資料存在一份自動建立的 Google 試算表（ID 記在指令碼屬性）。
 *  前端用 fetch 送 GET(?action=) 與 POST(JSON body)；皆為簡單請求
 *  （text/plain，無 preflight），GAS 回 JSON 即可跨網域讀取。
 **********************************************************************/

// ── 管理通關密語：必須與前端 EVENT.adminKey 一致（index.html 約第 461 行）──
const ADMIN_KEY = 'icope-briefing-2026';

const SHEETS = {
  RECORDS: '簽到記錄',
  CONTROL: '系統控制',
  CONFIG : '活動設定',
  ROSTER : '報名名單',
};

// 簽到記錄的欄位順序（改動請同步 rowToRecord / checkin 寫入）
const REC_HEADERS = ['場次','姓名','服務單位','身分證末4碼','職稱','Email',
                     '參加方式','縣市','機構類型','是否報名','現場報名',
                     '簽到時間','簽退時間','簽名'];

// ════════════════════════════ 路由 ════════════════════════════
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    switch (action) {
      case 'getRoster':  return json(getRoster());
      case 'getControl': return json({ success: true, control: readControl() });
      case 'getRecords': return json({ success: true, records: getRecords() });
      case 'getConfig':  return json({ success: true, config: readConfig() });
      default:           return json({ success: true, message: 'Check-in API OK' });
    }
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json({ success: false, error: 'bad json' }); }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    switch (p.action) {
      case 'checkin':      return json(doCheckin(p));
      case 'checkout':     return json(doCheckout(p));
      case 'setControl':   return json(setControl(p));
      case 'setConfig':    return json(setConfig(p));
      case 'clearRecords': return json(clearRecords(p));
      case 'buildPrint':   return json(buildPrint(p));
      default:             return json({ success: false, error: 'unknown action' });
    }
  } catch (err) {
    return json({ success: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ════════════════════════════ 試算表 ════════════════════════════
function ssFile() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (_) {} }
  const ss = SpreadsheetApp.create('簽到系統資料');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function sheet(name, headers) {
  const ss = ssFile();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length)
        .setBackground('#2d6a50').setFontColor('#fff').setFontWeight('bold');
    }
    const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
    if (def && def.getName() !== name && ss.getSheets().length > 1) {
      try { ss.deleteSheet(def); } catch (_) {}
    }
  }
  return sh;
}

// ════════════════════════════ 控制狀態 ════════════════════════════
function readControl() {
  const sh = sheet(SHEETS.CONTROL);
  const raw = sh.getRange('A1').getValue();
  if (raw) { try { return JSON.parse(raw); } catch (_) {} }
  return { activeSession: 0, ciOpen: true, coOpen: false };
}
function setControl(p) {
  if (p.key !== ADMIN_KEY) return { success: false, error: 'unauthorized' };
  const control = p.control || {};
  sheet(SHEETS.CONTROL).getRange('A1').setValue(JSON.stringify(control));
  return { success: true, control: control };
}

// ════════════════════════════ 活動設定 ════════════════════════════
function readConfig() {
  const sh = sheet(SHEETS.CONFIG);
  const raw = sh.getRange('A1').getValue();
  if (raw) { try { return JSON.parse(raw); } catch (_) {} }
  return null;   // 無自訂 → 前端沿用內建預設
}
function setConfig(p) {
  if (p.key !== ADMIN_KEY) return { success: false, error: 'unauthorized' };
  sheet(SHEETS.CONFIG).getRange('A1').setValue(JSON.stringify(p.config || {}));
  return { success: true };
}

// ════════════════════════════ 簽到 / 簽退 ════════════════════════════
function doCheckin(p) {
  const sh = sheet(SHEETS.RECORDS, REC_HEADERS);
  const idx = findRecordRow(sh, p.session, p.name);
  const sig = safeSig(p.signature);
  const registered = !!p.registered;
  const onsite = (p.onsite != null) ? !!p.onsite : !registered;

  const row = [
    p.session || '', p.name || '', p.unit || '', p.idno || '', p.role || '',
    p.email || '', p.attendType || '實體', p.city || '', p.orgType || '',
    registered, onsite, p.checkinTime || nowTw(), '', sig,
  ];

  if (idx > 0) {                       // 同場同名已存在 → 更新（不重複建列）
    const keepCheckout = sh.getRange(idx, 13).getValue();   // 保留既有簽退時間
    row[12] = keepCheckout;
    sh.getRange(idx, 1, 1, row.length).setValues([row]);
    return { success: true, duplicate: true };
  }
  sh.appendRow(row);
  return { success: true, duplicate: false };
}

function doCheckout(p) {
  const sh = sheet(SHEETS.RECORDS, REC_HEADERS);
  const idx = findRecordRow(sh, p.session, p.name);
  if (idx < 1) return { success: true, updated: false };          // 查無簽到
  const hasCheckin = sh.getRange(idx, 12).getValue();
  if (!hasCheckin) return { success: true, updated: false };
  const already = sh.getRange(idx, 13).getValue();
  if (already) return { success: true, already: true };           // 已簽退過
  sh.getRange(idx, 13).setValue(p.checkoutTime || nowTw());
  return { success: true, updated: true };
}

// 依「場次(short) + 姓名」找列，回傳列號（含表頭起算），找不到回 0
function findRecordRow(sh, session, name) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, 1, last - 1, 2).getValues();   // A:場次 B:姓名
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(session) && String(vals[i][1]) === String(name)) {
      return i + 2;
    }
  }
  return 0;
}

function getRecords() {
  const sh = sheet(SHEETS.RECORDS, REC_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, REC_HEADERS.length).getValues();
  return vals.map(function (r) {
    return {
      session:    r[0],
      name:       r[1],
      unit:       r[2],
      role:       r[4],
      email:      r[5],
      attendType: r[6],
      city:       r[7],
      orgType:    r[8],
      registered: r[9] === true || r[9] === '✅' || r[9] === 'TRUE' || r[9] === '已報名',
      checkin:    r[11],
      checkout:   r[12],
      // 簽名(r[13]) 不回傳前端（僅存檔／列印用），避免流量過大
    };
  });
}

function clearRecords(p) {
  if (p.key !== ADMIN_KEY) return { success: false, error: 'unauthorized' };
  const sh = sheet(SHEETS.RECORDS, REC_HEADERS);
  const last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { success: true };
}

// ════════════════════════════ 報名名單 ════════════════════════════
// rosters 以「場次 key」為鍵（north/east/...）；unit/city/orgType 以「姓名」為鍵。
function getRoster() {
  const cfg = readConfig();
  const shortToKey = {};
  if (cfg && Array.isArray(cfg.sessions)) {
    cfg.sessions.forEach(function (s) { if (s.short && s.key) shortToKey[s.short] = s.key; });
  }
  // 內建預設對照（未自訂設定時）
  ['北部場|north','東部場|east','中部場|central','南部場|south'].forEach(function (kv) {
    const a = kv.split('|'); if (!shortToKey[a[0]]) shortToKey[a[0]] = a[1];
  });

  const rows = readRosterRows(cfg);   // [[場次, 姓名, 服務單位, 縣市, 機構類型], ...]
  const rosters = {}, unitMap = {}, cityMap = {}, orgTypeMap = {};
  rows.forEach(function (r) {
    const sessRaw = String(r[0] || '').trim();
    const key = shortToKey[sessRaw] || sessRaw || 'default';
    const name = String(r[1] || '').trim();
    if (!name) return;
    (rosters[key] = rosters[key] || []).push(name);
    if (r[2]) unitMap[name] = r[2];
    if (r[3]) cityMap[name] = r[3];
    if (r[4]) orgTypeMap[name] = r[4];
  });
  return { success: true, rosters: rosters, unitMap: unitMap, cityMap: cityMap, orgTypeMap: orgTypeMap };
}

// 讀報名名單：若設定了 regSheetUrl 就讀外部試算表首頁，否則讀本檔「報名名單」分頁。
// 名單分頁欄位順序：場次 | 姓名 | 服務單位 | 縣市 | 機構類型（第一列為表頭）。
function readRosterRows(cfg) {
  try {
    let sh;
    if (cfg && cfg.regSheetUrl) {
      sh = SpreadsheetApp.openByUrl(cfg.regSheetUrl).getSheets()[0];
    } else {
      sh = sheet(SHEETS.ROSTER, ['場次','姓名','服務單位','縣市','機構類型']);
    }
    const last = sh.getLastRow();
    if (last < 2) return [];
    return sh.getRange(2, 1, last - 1, 5).getValues();
  } catch (err) {
    return [];   // 名單讀不到不擋簽到（現場報名照常）
  }
}

// ════════════════════════════ 列印（產生可匯出 PDF 的分頁）════════════════════════════
function buildPrint(p) {
  const session = p.printSession || '';
  const type = p.printType === 'simple' ? 'simple' : 'credit';
  const ss = ssFile();
  const tabName = '列印_' + session + '_' + (type === 'simple' ? '核銷版' : '積分版');

  let sh = ss.getSheetByName(tabName);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(tabName);

  const headers = (type === 'simple')
    ? ['序號','姓名','服務單位','職稱','簽名']
    : ['序號','姓名','身分證末4碼','Email','服務單位','職稱','簽到時間','簽退時間'];
  sh.appendRow(headers);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f3ef');

  const rec = sheet(SHEETS.RECORDS, REC_HEADERS);
  const last = rec.getLastRow();
  if (last >= 2) {
    const vals = rec.getRange(2, 1, last - 1, REC_HEADERS.length).getValues();
    let n = 0;
    vals.forEach(function (r) {
      if (String(r[0]) !== String(session)) return;   // 只印該場次
      if (!r[11]) return;                              // 只印已簽到
      n++;
      if (type === 'simple') {
        sh.appendRow([n, r[1], r[2], r[4], '']);       // 簽名欄留白供手寫核對
      } else {
        sh.appendRow([n, r[1], r[3], r[5], r[2], r[4], r[11], r[12]]);
      }
    });
  }
  sh.autoResizeColumns(1, headers.length);
  return { success: true, url: ss.getUrl() + '#gid=' + sh.getSheetId() };
}

// ════════════════════════════ 小工具 ════════════════════════════
function nowTw() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
}
function safeSig(sig) {
  sig = sig || '';
  return sig.length > 48000 ? '(簽名過大未存)' : sig;   // 儲存格上限 50000 字元
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
