// ══════════════════════════════════════════════════════════
//  照顧服務員術科培訓研討會 — 簽到系統 Google Apps Script
//  文字資料 via GET → Sheets + 寄簽退 Email
//  簽名圖片 via Firestore（前端直接上傳）
// ══════════════════════════════════════════════════════════

const SHEET_NAME = '簽到記錄';
const SIGNOUT_URL = 'https://nicole-hsu.github.io/claude-projects/sign-in-system/signout.html';

function doGet(e) {
  const p = e.parameter || {};

  if (p.action === 'getData')    return getSheetData();
  if (p.action === 'lookup')     return lookupCode(p.code);
  if (p.action === 'signout')    return recordSignout(p.code);
  if (p.name)                    { try { saveRecord(p); } catch(err) { console.error(err); } }

  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

// ── 取得或建立工作表，並補齊新欄位 ──
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  const HEADERS = ['#','簽到時間','姓名','服務單位','職稱','聯絡電話','Email','身分證後4碼','活動名稱','簽名DocId','簽退碼','簽退時間'];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    const hdr = sheet.getRange(1, 1, 1, HEADERS.length);
    hdr.setBackground('#2d6a50');
    hdr.setFontColor('#ffffff');
    hdr.setFontWeight('bold');
  } else {
    // 補上舊格式缺少的欄位
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    HEADERS.forEach((h, i) => {
      if (existing[i] !== h) {
        sheet.getRange(1, i + 1).setValue(h);
      }
    });
    if (sheet.getLastColumn() < HEADERS.length) {
      const hdr = sheet.getRange(1, 1, 1, HEADERS.length);
      hdr.setBackground('#2d6a50');
      hdr.setFontColor('#ffffff');
      hdr.setFontWeight('bold');
    }
  }
  return sheet;
}

// ── 儲存簽到記錄 + 寄 Email ──
function saveRecord(p) {
  const sheet = getSheet();
  sheet.appendRow([
    sheet.getLastRow(),
    p.time      || new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
    p.name      || '',
    p.org       || '',
    p.jobTitle  || '',
    p.phone     || '',
    p.email     || '',
    p.idLast4   || '',
    p.event     || '',
    p.sigDocId  || '',
    p.signoutCode || '',
    '',
  ]);

  if (p.email && p.signoutCode) {
    sendSignoutEmail(p.email, p.name, p.signoutCode, p.event);
  }
}

// ── 寄簽退 Email ──
function sendSignoutEmail(email, name, code, eventName) {
  const signoutLink = SIGNOUT_URL + '?code=' + code;
  const subject = '【' + (eventName || '活動') + '】您的簽退連結';
  const body = [
    name + ' 您好，',
    '',
    '感謝您參與「' + (eventName || '活動') + '」。',
    '',
    '請在活動結束後點擊以下連結完成簽退：',
    signoutLink,
    '',
    '或輸入簽退碼：' + code,
    '',
    '（若您非本活動參與者，請忽略此郵件）',
  ].join('\n');

  MailApp.sendEmail({ to: email, subject: subject, body: body });
}

// ── 查詢簽退碼 → 回傳姓名 ──
function lookupCode(code) {
  if (!code) return json({ found: false });
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][10]).trim() === code.trim()) {
      return json({ found: true, name: data[i][2], signedin: data[i][1], row: i + 1 });
    }
  }
  return json({ found: false });
}

// ── 記錄簽退時間 ──
function recordSignout(code) {
  if (!code) return json({ ok: false, msg: '未提供簽退碼' });
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][10]).trim() === code.trim()) {
      if (data[i][11]) return json({ ok: false, msg: '此簽退碼已使用' });
      const signoutTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      sheet.getRange(i + 1, 12).setValue(signoutTime);
      return json({ ok: true, name: data[i][2], time: signoutTime });
    }
  }
  return json({ ok: false, msg: '找不到此簽退碼' });
}

// ── 取得全部資料（管理後台用）──
function getSheetData() {
  const sheet = getSheet();
  if (sheet.getLastRow() <= 1) return json([]);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return json(rows);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
