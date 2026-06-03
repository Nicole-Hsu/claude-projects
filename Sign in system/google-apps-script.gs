// ══════════════════════════════════════════════════════════
//  照顧服務員術科培訓研討會 — 簽到系統 Google Apps Script
//  文字資料 via GET → Sheets
//  簽名圖片 via Firestore（前端直接上傳）
// ══════════════════════════════════════════════════════════

const SHEET_NAME = '簽到記錄';

function doGet(e) {
  if (e.parameter.action === 'getData') return getSheetData();
  if (e.parameter && e.parameter.name) {
    try { saveRecord(e.parameter); } catch(err) { console.error(err); }
  }
  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}

function saveRecord(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['#','簽到時間','姓名','服務單位','職稱','聯絡電話','身分證後4碼','活動名稱','簽名DocId']);
    sheet.setFrozenRows(1);
    const hdr = sheet.getRange(1,1,1,9);
    hdr.setBackground('#2d6a50');
    hdr.setFontColor('#ffffff');
    hdr.setFontWeight('bold');
  }
  sheet.appendRow([
    sheet.getLastRow(),
    p.time || new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),
    p.name||'', p.org||'', p.jobTitle||'',
    p.phone||'', p.idLast4||'', p.event||'',
    p.sigDocId||'',
  ]);
}

function getSheetData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h,i) => { obj[h] = row[i]; });
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}
