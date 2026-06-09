// ============================================================
// KPI 管理系統 — Google Apps Script Backend
// ============================================================

const SHEET_NAMES = {
  WORK_ITEMS : '工作項目',
  KPIS       : 'KPI清單',
  KPI_ACH    : 'KPI達成記錄',
  UNITS      : '責任單位',
  TEACHERS   : '負責教師',
  CO_ORGS    : '協辦人員',
  PLANNED    : '預計工作內容',
  POOL1      : '執行狀況_累積池',
  POOL2      : '執行狀況_本月池',
  POOL_NEXT  : '預計下月工作',
  FORMS      : '表單連結',
  CONFIG     : '系統設定',
  GROUPS     : '分組設定'
};

// Default groups (used for initial seeding and fallback)
const DEFAULT_GROUPS = [
  {id:1, name:'課程、實習&行政&教學組', color:'#4f46e5', icon:'📚', archived:false},
  {id:2, name:'師資培育(教學組簡麗瑜)', color:'#0891b2', icon:'👩‍🏫', archived:false},
  {id:3, name:'產官學(產學組許瑜庭)',   color:'#059669', icon:'💼', archived:false},
  {id:4, name:'國際合作研究交流(研究組&行政教學)', color:'#d97706', icon:'🌏', archived:false},
  {id:5, name:'環境設備(教學&產學組)',   color:'#dc2626', icon:'🔧', archived:false},
  {id:6, name:'其他行政(系院中心)',      color:'#7c3aed', icon:'📋', archived:false}
];

// 匯出目標 Google Drive 資料夾 ID
const EXPORT_FOLDER_ID = '17pL-hrb_WL3kpOZMq7a_i4I2oWxaRDPZ';

// ─── Entry Point ─────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('健康暨高齡照顧研發中心 KPI填報')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Helpers ─────────────────────────────────────────────────
let _ssCache = null; // 同一次 GAS 執行內快取 Spreadsheet 物件
function ss() {
  if (_ssCache) return _ssCache;
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { _ssCache = SpreadsheetApp.openById(id); return _ssCache; } catch(e) {}
  }
  _ssCache = SpreadsheetApp.create('健康暨高齡照顧研發中心_KPI');
  props.setProperty('SPREADSHEET_ID', _ssCache.getId());
  return _ssCache;
}

function getSheet(name) {
  return ss().getSheetByName(name);
}

function uid(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(r => r[0])
    .map(r => { const o={}; headers.forEach((h,i)=>o[h]=r[i]); return o; });
}

function findRowIndex(sheet, id) {
  const vals = sheet.getDataRange().getValues();
  for (let i=1;i<vals.length;i++) if (vals[i][0]===id) return i+1;
  return -1;
}

// ─── Sheet Init ───────────────────────────────────────────────
function initSheets() {
  const defs = [
    [SHEET_NAMES.WORK_ITEMS, ['ID','GroupID','GroupName','ItemNo','Title','Period','CreatedAt','UpdatedAt']],
    [SHEET_NAMES.KPIS,       ['ID','WorkItemID','KPIText','TargetValue','TargetType','IsYearBased','Year','SummaryURL','SummaryCellRef','CreatedAt']],
    [SHEET_NAMES.KPI_ACH,   ['ID','KPIID','WorkItemID','Year','Month','ActualValue','Note','UpdatedAt']],
    [SHEET_NAMES.GROUPS,    ['ID','Name','Color','Icon','SortOrder','Archived','UpdatedAt']],
    [SHEET_NAMES.UNITS,      ['ID','WorkItemID','Unit','Year','CreatedAt']],
    [SHEET_NAMES.TEACHERS,   ['ID','WorkItemID','TeacherName','Year','CreatedAt']],
    [SHEET_NAMES.CO_ORGS,    ['ID','WorkItemID','PersonName','Year','CreatedAt']],
    [SHEET_NAMES.PLANNED,    ['ID','WorkItemID','Content','PlannedDate','Year','CreatedAt']],
    [SHEET_NAMES.POOL1,      ['ID','WorkItemID','Year','Month','Content','TextColor','EntryDate','Source']],
    [SHEET_NAMES.POOL2,      ['ID','WorkItemID','Year','Month','Content','TextColor','EntryDate','EnteredBy']],
    [SHEET_NAMES.POOL_NEXT,  ['ID','WorkItemID','Content','CreatedAt']],
    [SHEET_NAMES.FORMS,      ['ID','WorkItemID','FormName','FormURL','SummaryURL','CreatedAt']],
    [SHEET_NAMES.CONFIG,     ['Key','Value','UpdatedAt']]
  ];
  defs.forEach(([name, headers]) => {
    let sheet = ss().getSheetByName(name);
    if (!sheet) {
      sheet = ss().insertSheet(name);
      sheet.appendRow(headers);
      sheet.getRange(1,1,1,headers.length)
        .setBackground('#4472C4').setFontColor('#fff').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
}

// ─── Work Items ───────────────────────────────────────────────
function getWorkItemsByGroup(groupId) {
  return sheetToObjects(getSheet(SHEET_NAMES.WORK_ITEMS))
    .filter(r => String(r.GroupID) === String(groupId));
}

function getAllWorkItems() {
  const items    = sheetToObjects(getSheet(SHEET_NAMES.WORK_ITEMS));
  const teachers = sheetToObjects(getSheet(SHEET_NAMES.TEACHERS));
  const coOrgs   = sheetToObjects(getSheet(SHEET_NAMES.CO_ORGS));
  const units    = sheetToObjects(getSheet(SHEET_NAMES.UNITS));
  const p1Ids    = new Set(sheetToObjects(getSheet(SHEET_NAMES.POOL1)).map(r=>r.WorkItemID));
  const p2Ids    = new Set(sheetToObjects(getSheet(SHEET_NAMES.POOL2)).map(r=>r.WorkItemID));
  return items.map(wi => {
    wi._teachers = teachers.filter(r=>r.WorkItemID===wi.ID).map(r=>r.TeacherName);
    wi._coOrgs   = coOrgs.filter(r=>r.WorkItemID===wi.ID).map(r=>r.PersonName);
    wi._units    = units.filter(r=>r.WorkItemID===wi.ID).map(r=>r.Unit);
    wi._hasFill  = p1Ids.has(wi.ID) || p2Ids.has(wi.ID);
    return wi;
  });
}

function saveWorkItem(data) {
  const sheet = getSheet(SHEET_NAMES.WORK_ITEMS);
  const now = new Date().toISOString();
  const group = DEFAULT_GROUPS.find(g => g.id == data.GroupID);
  const gName = group ? group.name : '';
  if (data.ID) {
    const ri = findRowIndex(sheet, data.ID);
    if (ri > 0) {
      sheet.getRange(ri,1,1,8).setValues([[
        data.ID, data.GroupID, gName, data.ItemNo||'', data.Title, data.Period||'',
        sheet.getRange(ri,7).getValue(), now
      ]]);
      return {success:true, id:data.ID};
    }
  }
  const id = uid('WI');
  sheet.appendRow([id, data.GroupID, gName, data.ItemNo||'', data.Title, data.Period||'', now, now]);
  return {success:true, id:id};
}

function deleteWorkItem(itemId) {
  const sheet = getSheet(SHEET_NAMES.WORK_ITEMS);
  const ri = findRowIndex(sheet, itemId);
  if (ri < 0) return {success:false};
  sheet.deleteRow(ri);
  [SHEET_NAMES.KPIS, SHEET_NAMES.UNITS, SHEET_NAMES.TEACHERS, SHEET_NAMES.CO_ORGS,
   SHEET_NAMES.PLANNED, SHEET_NAMES.POOL1, SHEET_NAMES.POOL2, SHEET_NAMES.FORMS]
    .forEach(n => {
      const s = getSheet(n); if(!s) return;
      const vals = s.getDataRange().getValues();
      for (let i=vals.length-1;i>=1;i--)
        if (vals[i][1]===itemId) s.deleteRow(i+1);
    });
  return {success:true};
}

// ─── Generic sub-record helpers ───────────────────────────────
function getRelated(sheetName, workItemId) {
  return sheetToObjects(getSheet(sheetName)).filter(r => r.WorkItemID === workItemId);
}

function deleteById(sheetName, id) {
  const sheet = getSheet(sheetName);
  const ri = findRowIndex(sheet, id);
  if (ri > 0) { sheet.deleteRow(ri); return {success:true}; }
  return {success:false};
}

// ─── KPIs ─────────────────────────────────────────────────────
function getKPIs(workItemId)  { return getRelated(SHEET_NAMES.KPIS, workItemId); }
function deleteKPI(id)        { return deleteById(SHEET_NAMES.KPIS, id); }
function saveKPI(data) {
  const sheet = getSheet(SHEET_NAMES.KPIS);
  const now   = new Date().toISOString();
  // TargetType: 'number' | 'milestone' (數字型 or 里程碑型)
  const row   = [data.ID||uid('KPI'), data.WorkItemID, data.KPIText, data.TargetValue||'',
                 data.TargetType||'number',
                 data.IsYearBased||false, data.Year||'', data.SummaryURL||'', data.SummaryCellRef||'', now];
  if (data.ID) {
    const ri = findRowIndex(sheet, data.ID);
    if (ri>0) { row[9]=sheet.getRange(ri,10).getValue(); sheet.getRange(ri,1,1,10).setValues([row]); return {success:true,id:data.ID}; }
  }
  sheet.appendRow(row); return {success:true, id:row[0]};
}

// ─── KPI Achievement Records ───────────────────────────────────
function getKPIAchievements(kpiId) {
  return sheetToObjects(getSheet(SHEET_NAMES.KPI_ACH)).filter(r => r.KPIID === kpiId);
}

function saveKPIAchievement(data) {
  const sheet = getSheet(SHEET_NAMES.KPI_ACH);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('ACH'), data.KPIID, data.WorkItemID, data.Year||'',
                 data.Month||'', data.ActualValue||'', data.Note||'', now];
  if (data.ID) {
    const ri = findRowIndex(sheet, data.ID);
    if (ri>0) { sheet.getRange(ri,1,1,8).setValues([row]); return {success:true,id:data.ID}; }
  }
  sheet.appendRow(row); return {success:true, id:row[0]};
}

function deleteKPIAchievement(id) { return deleteById(SHEET_NAMES.KPI_ACH, id); }

// Compute achievement rate for a KPI given its records
function calcAchievementPct(kpi, achievements) {
  if (!achievements || !achievements.length) return null;
  if (kpi.TargetType === 'milestone') {
    return achievements[achievements.length-1].ActualValue;
  }
  const target = parseFloat(kpi.TargetValue);
  if (!target || isNaN(target)) return null;

  const isYB  = kpi.IsYearBased === true || String(kpi.IsYearBased).toLowerCase() === 'true';
  const kYear = String(kpi.Year || '').trim();

  // 分年度但未指定特定年 → 各年獨立顯示，不合算單一%（由 yearlyAchievements 處理）
  if (isYB && !kYear) return null;

  let filtered = achievements;
  if (isYB && kYear) {
    const allowed = kYear.split(',').map(y => y.trim()).filter(y => y);
    if (allowed.length > 0) {
      filtered = achievements.filter(r => allowed.includes(String(r.Year || '').trim()));
    }
  }

  if (!filtered.length) return null;
  const actual = filtered.reduce((s, r) => s + (parseFloat(r.ActualValue) || 0), 0);
  return Math.min(Math.round(actual / target * 100), 100);
}

// ─── KPI Reorder ──────────────────────────────────────────────
function moveKPI(kpiId, direction) {
  const sheet = getSheet(SHEET_NAMES.KPIS);
  const vals  = sheet.getDataRange().getValues();
  const rowIdx = vals.findIndex((r,i) => i>0 && r[0]===kpiId);
  if (rowIdx <= 0) return {success:false};
  const wiId = vals[rowIdx][1];
  let targetIdx = -1;
  if (direction==='up') {
    for (let i=rowIdx-1;i>=1;i--) if (vals[i][1]===wiId){targetIdx=i;break;}
  } else {
    for (let i=rowIdx+1;i<vals.length;i++) if (vals[i][1]===wiId){targetIdx=i;break;}
  }
  if (targetIdx<0) return {success:false};
  const r1 = sheet.getRange(rowIdx+1,1,1,vals[0].length).getValues();
  const r2 = sheet.getRange(targetIdx+1,1,1,vals[0].length).getValues();
  sheet.getRange(rowIdx+1,1,1,vals[0].length).setValues(r2);
  sheet.getRange(targetIdx+1,1,1,vals[0].length).setValues(r1);
  return {success:true};
}

// ─── Units ────────────────────────────────────────────────────
function getUnits(workItemId)  { return getRelated(SHEET_NAMES.UNITS, workItemId); }
function deleteUnit(id)        { return deleteById(SHEET_NAMES.UNITS, id); }
function saveUnit(data) {
  const sheet = getSheet(SHEET_NAMES.UNITS);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('UN'), data.WorkItemID, data.Unit, data.Year||'', now];
  if (data.ID) { const ri=findRowIndex(sheet,data.ID); if(ri>0){row[4]=sheet.getRange(ri,5).getValue();sheet.getRange(ri,1,1,5).setValues([row]);return{success:true};} }
  sheet.appendRow(row); return {success:true};
}

// ─── Teachers ─────────────────────────────────────────────────
function getTeachers(workItemId) { return getRelated(SHEET_NAMES.TEACHERS, workItemId); }
function deleteTeacher(id)       { return deleteById(SHEET_NAMES.TEACHERS, id); }
function saveTeacher(data) {
  const sheet = getSheet(SHEET_NAMES.TEACHERS);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('T'), data.WorkItemID, data.TeacherName, data.Year||'', now];
  if (data.ID) { const ri=findRowIndex(sheet,data.ID); if(ri>0){row[4]=sheet.getRange(ri,5).getValue();sheet.getRange(ri,1,1,5).setValues([row]);return{success:true};} }
  sheet.appendRow(row); return {success:true};
}

// ─── Co-Organizers ────────────────────────────────────────────
function getCoOrgs(workItemId)  { return getRelated(SHEET_NAMES.CO_ORGS, workItemId); }
function deleteCoOrg(id)        { return deleteById(SHEET_NAMES.CO_ORGS, id); }
function saveCoOrg(data) {
  const sheet = getSheet(SHEET_NAMES.CO_ORGS);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('CO'), data.WorkItemID, data.PersonName, data.Year||'', now];
  if (data.ID) { const ri=findRowIndex(sheet,data.ID); if(ri>0){row[4]=sheet.getRange(ri,5).getValue();sheet.getRange(ri,1,1,5).setValues([row]);return{success:true};} }
  sheet.appendRow(row); return {success:true};
}

// ─── Planned Work ─────────────────────────────────────────────
function getPlanned(workItemId)  { return getRelated(SHEET_NAMES.PLANNED, workItemId); }
function deletePlanned(id)       { return deleteById(SHEET_NAMES.PLANNED, id); }
function savePlanned(data) {
  const sheet = getSheet(SHEET_NAMES.PLANNED);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('PW'), data.WorkItemID, data.Content, data.PlannedDate||'', data.Year||'', now];
  if (data.ID) { const ri=findRowIndex(sheet,data.ID); if(ri>0){row[5]=sheet.getRange(ri,6).getValue();sheet.getRange(ri,1,1,6).setValues([row]);return{success:true};} }
  sheet.appendRow(row); return {success:true};
}

// ─── Form Links ───────────────────────────────────────────────
function getForms(workItemId)   { return getRelated(SHEET_NAMES.FORMS, workItemId); }
function deleteForm(id)         { return deleteById(SHEET_NAMES.FORMS, id); }
function saveForm(data) {
  const sheet = getSheet(SHEET_NAMES.FORMS);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('FL'), data.WorkItemID, data.FormName, data.FormURL||'', data.SummaryURL||'', now];
  if (data.ID) { const ri=findRowIndex(sheet,data.ID); if(ri>0){row[5]=sheet.getRange(ri,6).getValue();sheet.getRange(ri,1,1,6).setValues([row]);return{success:true};} }
  sheet.appendRow(row); return {success:true};
}

// ─── Execution Status Pools ───────────────────────────────────
function getPool1(workItemId) { return getRelated(SHEET_NAMES.POOL1, workItemId); }
function getPool2(workItemId) { return getRelated(SHEET_NAMES.POOL2, workItemId); }

function saveToPool2(data) {
  const sheet = getSheet(SHEET_NAMES.POOL2);
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('P2'), data.WorkItemID, data.Year||'', data.Month||'',
                 data.Content, data.TextColor||'#000000', now, data.EnteredBy||''];
  if (data.ID) {
    const ri = findRowIndex(sheet, data.ID);
    if (ri>0) { row[6]=sheet.getRange(ri,7).getValue(); sheet.getRange(ri,1,1,8).setValues([row]); return {success:true}; }
  }
  sheet.appendRow(row); return {success:true};
}

function deleteFromPool2(id) { return deleteById(SHEET_NAMES.POOL2, id); }

// ─── Next Month Planned ───────────────────────────────────────
function _ensurePoolNext() {
  let sheet = ss().getSheetByName(SHEET_NAMES.POOL_NEXT);
  if (!sheet) {
    sheet = ss().insertSheet(SHEET_NAMES.POOL_NEXT);
    sheet.appendRow(['ID','WorkItemID','Content','CreatedAt']);
    sheet.getRange(1,1,1,4).setBackground('#4472C4').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function getPoolNext(workItemId) {
  const sheet = ss().getSheetByName(SHEET_NAMES.POOL_NEXT);
  if (!sheet) return [];
  return sheetToObjects(sheet).filter(r => r.WorkItemID === workItemId);
}
function deleteFromPoolNext(id) {
  const sheet = ss().getSheetByName(SHEET_NAMES.POOL_NEXT);
  if (!sheet) return {success:false};
  return deleteById(SHEET_NAMES.POOL_NEXT, id);
}
function saveToPoolNext(data) {
  const sheet = _ensurePoolNext();
  const now   = new Date().toISOString();
  const row   = [data.ID||uid('PN'), data.WorkItemID, data.Content, now];
  if (data.ID) {
    const ri = findRowIndex(sheet, data.ID);
    if (ri>0) { row[3]=sheet.getRange(ri,4).getValue(); sheet.getRange(ri,1,1,4).setValues([row]); return {success:true}; }
  }
  sheet.appendRow(row); return {success:true};
}
function updatePoolNext(data) {
  const sheet = ss().getSheetByName(SHEET_NAMES.POOL_NEXT);
  if (!sheet) return {success:false};
  const ri = findRowIndex(sheet, data.ID);
  if (ri < 0) return {success:false};
  sheet.getRange(ri, 3).setValue(data.Content);
  return {success:true};
}
function moveNextToPool2(ids, year, month) {
  const pNext = ss().getSheetByName(SHEET_NAMES.POOL_NEXT);
  if (!pNext) return {success:false};
  const p2  = getSheet(SHEET_NAMES.POOL2);
  const now = new Date().toISOString();
  const vals = pNext.getDataRange().getValues();
  for (let i = vals.length-1; i >= 1; i--) {
    if (ids.indexOf(String(vals[i][0])) >= 0) {
      p2.appendRow([uid('P2'), vals[i][1], year, month, vals[i][2], '#dc2626', now, '從下月計畫轉入']);
      pNext.deleteRow(i+1);
    }
  }
  return {success:true};
}

function moveToPool1(ids) {
  const p2  = getSheet(SHEET_NAMES.POOL2);
  const p1  = getSheet(SHEET_NAMES.POOL1);
  const now = new Date().toISOString();
  const vals= p2.getDataRange().getValues();
  for (let i=vals.length-1;i>=1;i--) {
    if (ids.indexOf(vals[i][0]) >= 0) {
      p1.appendRow([uid('P1'), vals[i][1], vals[i][2], vals[i][3],
                    vals[i][4], '#000000', now, '本月轉入']); // 歸檔統一改為黑色
      p2.deleteRow(i+1);
    }
  }
  return {success:true};
}

// ─── Full Item Detail ─────────────────────────────────────────
function getWorkItemFull(workItemId) {
  // 每張表只讀一次，避免重複 Sheets API 呼叫
  const spreadsheet = ss();
  function readOnce(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    return data.slice(1).filter(r => r[0]).map(r => {
      const o = {}; headers.forEach((h, i) => o[h] = r[i]); return o;
    });
  }

  const item = readOnce(SHEET_NAMES.WORK_ITEMS).find(r => r.ID === workItemId);
  if (!item) return null;

  const kpiRows = readOnce(SHEET_NAMES.KPIS).filter(k => k.WorkItemID === workItemId);
  const allAchs = readOnce(SHEET_NAMES.KPI_ACH); // 讀一次，下面各 KPI 自行篩選

  item.kpis = kpiRows.map(k => {
    const achs = allAchs.filter(a => a.KPIID === k.ID);
    k.achievements = achs;
    k.achievementPct = calcAchievementPct(k, achs);
    const isYB = k.IsYearBased === true || String(k.IsYearBased).toLowerCase() === 'true';
    const kYear = String(k.Year || '').trim();
    if (isYB && !kYear && (k.TargetType||'number') !== 'milestone') {
      const target = parseFloat(k.TargetValue);
      const years = [...new Set(achs.map(a => String(a.Year||'').trim()).filter(y=>y))].sort();
      k.yearlyAchievements = years.map(yr => {
        const yAchs = achs.filter(a => String(a.Year||'').trim() === yr);
        const actual = yAchs.reduce((s,r) => s + (parseFloat(r.ActualValue)||0), 0);
        const pct = (!isNaN(target) && target > 0) ? Math.min(Math.round(actual/target*100),100) : null;
        return {year: yr, actual, pct};
      });
    } else {
      k.yearlyAchievements = null;
    }
    return k;
  });

  item.units    = readOnce(SHEET_NAMES.UNITS).filter(r => r.WorkItemID === workItemId);
  item.teachers = readOnce(SHEET_NAMES.TEACHERS).filter(r => r.WorkItemID === workItemId);
  item.coOrgs   = readOnce(SHEET_NAMES.CO_ORGS).filter(r => r.WorkItemID === workItemId);
  item.planned  = readOnce(SHEET_NAMES.PLANNED).filter(r => r.WorkItemID === workItemId);
  item.pool1     = readOnce(SHEET_NAMES.POOL1).filter(r => r.WorkItemID === workItemId);
  item.pool2     = readOnce(SHEET_NAMES.POOL2).filter(r => r.WorkItemID === workItemId);
  item.pool_next = readOnce(SHEET_NAMES.POOL_NEXT).filter(r => r.WorkItemID === workItemId);
  item.forms     = readOnce(SHEET_NAMES.FORMS).filter(r => r.WorkItemID === workItemId);
  return item;
}

// ─── Batch Full Detail for a Group ───────────────────────────
// 一次讀完所有 sheet，同時建構整組所有工作項目的完整資料
function getGroupItemsFull(groupId) {
  const spreadsheet = ss();
  function readOnce(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    return data.slice(1).filter(r => r[0]).map(r => {
      const o = {}; headers.forEach((h, i) => o[h] = r[i]); return o;
    });
  }

  const groupItems = readOnce(SHEET_NAMES.WORK_ITEMS).filter(r => String(r.GroupID) === String(groupId));
  if (!groupItems.length) return [];
  const groupIds = new Set(groupItems.map(i => i.ID));

  const allKpis  = readOnce(SHEET_NAMES.KPIS).filter(k => groupIds.has(k.WorkItemID));
  const kpiIds   = new Set(allKpis.map(k => k.ID));
  const allAchs  = readOnce(SHEET_NAMES.KPI_ACH).filter(a => kpiIds.has(a.KPIID));
  const allUnits = readOnce(SHEET_NAMES.UNITS).filter(r => groupIds.has(r.WorkItemID));
  const allTeach = readOnce(SHEET_NAMES.TEACHERS).filter(r => groupIds.has(r.WorkItemID));
  const allCoOrg = readOnce(SHEET_NAMES.CO_ORGS).filter(r => groupIds.has(r.WorkItemID));
  const allPlan  = readOnce(SHEET_NAMES.PLANNED).filter(r => groupIds.has(r.WorkItemID));
  const allPool1    = readOnce(SHEET_NAMES.POOL1).filter(r => groupIds.has(r.WorkItemID));
  const allPool2    = readOnce(SHEET_NAMES.POOL2).filter(r => groupIds.has(r.WorkItemID));
  const allPoolNext = readOnce(SHEET_NAMES.POOL_NEXT).filter(r => groupIds.has(r.WorkItemID));
  const allForms    = readOnce(SHEET_NAMES.FORMS).filter(r => groupIds.has(r.WorkItemID));

  return groupItems.map(item => {
    const kpiRows = allKpis.filter(k => k.WorkItemID === item.ID);
    item.kpis = kpiRows.map(k => {
      const achs = allAchs.filter(a => a.KPIID === k.ID);
      k.achievements = achs;
      k.achievementPct = calcAchievementPct(k, achs);
      const isYB = k.IsYearBased === true || String(k.IsYearBased).toLowerCase() === 'true';
      const kYear = String(k.Year || '').trim();
      if (isYB && !kYear && (k.TargetType||'number') !== 'milestone') {
        const target = parseFloat(k.TargetValue);
        const years = [...new Set(achs.map(a => String(a.Year||'').trim()).filter(y=>y))].sort();
        k.yearlyAchievements = years.map(yr => {
          const yAchs = achs.filter(a => String(a.Year||'').trim() === yr);
          const actual = yAchs.reduce((s,r) => s + (parseFloat(r.ActualValue)||0), 0);
          const pct = (!isNaN(target) && target > 0) ? Math.min(Math.round(actual/target*100),100) : null;
          return {year: yr, actual, pct};
        });
      } else {
        k.yearlyAchievements = null;
      }
      return k;
    });
    item.units    = allUnits.filter(r => r.WorkItemID === item.ID);
    item.teachers = allTeach.filter(r => r.WorkItemID === item.ID);
    item.coOrgs   = allCoOrg.filter(r => r.WorkItemID === item.ID);
    item.planned  = allPlan.filter(r => r.WorkItemID === item.ID);
    item.pool1     = allPool1.filter(r => r.WorkItemID === item.ID);
    item.pool2     = allPool2.filter(r => r.WorkItemID === item.ID);
    item.pool_next = allPoolNext.filter(r => r.WorkItemID === item.ID);
    item.forms     = allForms.filter(r => r.WorkItemID === item.ID);
    return item;
  });
}

// ─── Filters ─────────────────────────────────────────────────
function filterByPerson(name) {
  if (!name || !name.trim()) return getAllWorkItems();
  const q = name.trim().toLowerCase();
  const tRows = sheetToObjects(getSheet(SHEET_NAMES.TEACHERS));
  const cRows = sheetToObjects(getSheet(SHEET_NAMES.CO_ORGS));
  const ids = new Set();
  tRows.forEach(r=>{ if(r.TeacherName&&r.TeacherName.toLowerCase().includes(q)) ids.add(r.WorkItemID); });
  cRows.forEach(r=>{ if(r.PersonName &&r.PersonName.toLowerCase().includes(q))  ids.add(r.WorkItemID); });
  return getAllWorkItems().filter(r=>ids.has(r.ID));
}

function filterByYear(year) {
  if (!year) return getAllWorkItems();
  const y = String(year);
  return getAllWorkItems().filter(r=>!r.Period || r.Period.includes(y));
}

function filterByFilled(filled) {
  const p1Ids = new Set(sheetToObjects(getSheet(SHEET_NAMES.POOL1)).map(r=>r.WorkItemID));
  const p2Ids = new Set(sheetToObjects(getSheet(SHEET_NAMES.POOL2)).map(r=>r.WorkItemID));
  const allFilled = new Set([...p1Ids, ...p2Ids]);
  return getAllWorkItems().filter(r=> filled ? allFilled.has(r.ID) : !allFilled.has(r.ID));
}

// ─── Dashboard ────────────────────────────────────────────────
function getDashboard(year, month) {
  const items  = getAllWorkItems();
  const kpis   = sheetToObjects(getSheet(SHEET_NAMES.KPIS));
  const achs   = sheetToObjects(getSheet(SHEET_NAMES.KPI_ACH));
  const p1     = sheetToObjects(getSheet(SHEET_NAMES.POOL1));
  const p2     = sheetToObjects(getSheet(SHEET_NAMES.POOL2));
  const filledIds = new Set();
  [...p1,...p2].forEach(r=>{
    if (!year  || String(r.Year)===String(year))
    if (!month || String(r.Month)===String(month))
      filledIds.add(r.WorkItemID);
  });

  const groupStats = DEFAULT_GROUPS.map(g => {
    const gi = items.filter(i => String(i.GroupID) === String(g.id));
    const gf = gi.filter(i => filledIds.has(i.ID)).length;
    // KPI achievement for this group
    const groupKPIs = kpis.filter(k => gi.some(i => i.ID === k.WorkItemID));
    const kpiDetails = groupKPIs.map(k => {
      const kAchs = achs.filter(a => a.KPIID === k.ID);
      const pct   = calcAchievementPct(k, kAchs);
      return {
        id: k.ID, wiId: k.WorkItemID,
        text: k.KPIText, target: k.TargetValue, targetType: k.TargetType||'number',
        actual: kAchs.length ? kAchs[kAchs.length-1].ActualValue : null,
        pct: pct
      };
    });
    const numericKPIs = kpiDetails.filter(k => k.targetType !== 'milestone' && k.pct !== null);
    const avgPct = numericKPIs.length
      ? Math.round(numericKPIs.reduce((s,k) => s+k.pct, 0) / numericKPIs.length)
      : null;
    return {id:g.id, name:g.name, total:gi.length, filled:gf, unfilled:gi.length-gf,
            kpiDetails, avgKpiPct: avgPct};
  });

  return {
    total: items.length,
    filled: items.filter(i => filledIds.has(i.ID)).length,
    unfilled: items.filter(i => !filledIds.has(i.ID)).length,
    groupStats, year, month
  };
}

// ─── Migration helpers ────────────────────────────────────────
function migrateAddMonthToKPIAch() {
  const sheet = getSheet(SHEET_NAMES.KPI_ACH);
  if (!sheet) return 'KPI_ACH sheet not found';
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  if (headers.includes('Month')) return 'Already migrated';
  const yearIdx = headers.indexOf('Year');
  if (yearIdx < 0) return 'Year column not found';
  sheet.insertColumnAfter(yearIdx + 1);
  sheet.getRange(1, yearIdx + 2).setValue('Month');
  return 'Migration complete';
}

// ─── Export ───────────────────────────────────────────────────
function exportToSheet(workItemId, opts) {
  opts = opts || {};
  const filterYear = String(opts.year || '').trim();
  const sections   = opts.sections || ['kpi','planned','exec'];

  const item = getWorkItemFull(workItemId);
  if (!item) return {success:false};

  const title = ('KPI_'+item.Title).substr(0,40)+'_'+Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd');
  const newSS = SpreadsheetApp.create(title);
  const exp   = newSS.getActiveSheet();
  exp.setName('KPI報表');
  const now = new Date().toLocaleString('zh-TW');
  let r=1;
  const h=(row,col,val,bold,bg)=>{
    const c=exp.getRange(row,col);c.setValue(val);
    if(bold)c.setFontWeight('bold');
    if(bg)c.setBackground(bg);
    return c;
  };
  h(r,1,'工作項目報表',true);exp.getRange(r,1).setFontSize(16);r++;
  h(r,1,'工作項目：'+item.Title);r++;
  h(r,1,'所屬組別：'+item.GroupName);r++;
  h(r,1,'執行期間：'+(item.Period||''));r++;
  if(filterYear){h(r,1,'篩選年度：'+filterYear+'年');r++;}
  h(r,1,'匯出時間：'+now);r+=2;

  const sortYM = arr => [...arr].sort((a,b)=>(Number(a.Year)-Number(b.Year))||(Number(a.Month)-Number(b.Month)));
  const filterYr = arr => filterYear ? arr.filter(x=>String(x.Year||'').trim()===filterYear) : arr;
  const section = (title,color,rows,cols)=>{
    if(!rows||!rows.length)return;
    h(r,1,title,true,color);r++;
    rows.forEach(row=>{cols.forEach((c,i)=>exp.getRange(r,i+1).setValue(row[c]||''));r++;});
    r++;
  };

  if(sections.includes('kpi')){
    section('■ KPI 指標','#D9EAD3',item.kpis,['KPIText','TargetValue','IsYearBased','Year']);
    item.kpis.forEach(k=>{
      const achs = sortYM(filterYr(k.achievements||[]));
      if(!achs.length)return;
      h(r,1,'  達成記錄：'+k.KPIText,true,'#E8F5E9');r++;
      achs.forEach(a=>{
        exp.getRange(r,1).setValue(a.Year||'');
        exp.getRange(r,2).setValue(a.Month||'');
        exp.getRange(r,3).setValue(a.ActualValue||'');
        exp.getRange(r,4).setValue(a.Note||'');
        r++;
      });
      r++;
    });
  }
  if(sections.includes('planned')){
    const pl = filterYr(item.planned||[]).sort((a,b)=>Number(a.Year)-Number(b.Year));
    section('■ 預計工作內容','#FFF2CC',pl,['Content','PlannedDate','Year']);
  }
  if(sections.includes('exec')){
    section('■ 執行狀況（累積池）','#FCE5CD',sortYM(filterYr(item.pool1||[])),['Year','Month','Content']);
    section('■ 執行狀況（本月池）','#EAD1DC',sortYM(filterYr(item.pool2||[])),['Year','Month','Content']);
  }

  exp.autoResizeColumns(1,4);

  // 移至指定 Drive 資料夾
  try {
    const folder = DriveApp.getFolderById(EXPORT_FOLDER_ID);
    DriveApp.getFileById(newSS.getId()).moveTo(folder);
  } catch(e) {
    Logger.log('移動至資料夾失敗（保留在根目錄）：' + e);
  }

  return {success:true, url:newSS.getUrl(), title:title};
}

// ─── All Forms (deduped by FormName) ─────────────────────────
function getAllForms() {
  const rows = sheetToObjects(getSheet(SHEET_NAMES.FORMS));
  const seen = new Set();
  return rows.filter(f => {
    if (!f.FormName || seen.has(f.FormName)) return false;
    seen.add(f.FormName);
    return true;
  });
}

// ─── Groups CRUD ──────────────────────────────────────────────
function getGroups() {
  const sheet = getSheet(SHEET_NAMES.GROUPS);
  if (!sheet) return DEFAULT_GROUPS;
  const rows = sheetToObjects(sheet).filter(r => !r.Archived);
  if (!rows.length) {
    // Seed from defaults
    const now = new Date().toISOString();
    DEFAULT_GROUPS.forEach(g =>
      sheet.appendRow([g.id, g.name, g.color, g.icon, g.id, false, now])
    );
    return DEFAULT_GROUPS.map(g => ({id:g.id, name:g.name, color:g.color, icon:g.icon}));
  }
  return rows.map(r => ({
    id: Number(r.ID), name: String(r.Name), color: r.Color||'#4f46e5', icon: r.Icon||'📋'
  })).sort((a,b) => a.id - b.id);
}

function saveGroup(data) {
  const sheet = getSheet(SHEET_NAMES.GROUPS);
  const now   = new Date().toISOString();
  if (data.ID) {
    const ri = findRowIndex(sheet, String(data.ID));
    if (ri > 0) {
      sheet.getRange(ri,1,1,7).setValues([[data.ID, data.Name, data.Color||'#4f46e5', data.Icon||'📋', data.SortOrder||data.ID, false, now]]);
      return {success:true, id:data.ID};
    }
  }
  // New group: find max id
  const existing = sheetToObjects(sheet);
  const maxId    = existing.reduce((m,r) => Math.max(m, Number(r.ID)||0), 0);
  const newId    = maxId + 1;
  sheet.appendRow([newId, data.Name, data.Color||'#4f46e5', data.Icon||'📋', newId, false, now]);
  return {success:true, id:newId};
}

function archiveGroup(groupId) {
  const sheet = getSheet(SHEET_NAMES.GROUPS);
  const ri    = findRowIndex(sheet, String(groupId));
  if (ri > 0) {
    sheet.getRange(ri, 6).setValue(true);
    return {success:true};
  }
  return {success:false};
}

// ─── Config helpers ───────────────────────────────────────────

function getConfig(key) {
  const rows = sheetToObjects(getSheet(SHEET_NAMES.CONFIG));
  const row  = rows.find(r=>r.Key===key);
  return row ? row.Value : null;
}

// ─── One-time Setup (run once from GAS editor) ────────────────
function setupSystem() {
  initSheets();
  populateInitialData();
  return '系統初始化完成！';
}

// ─── 修正工作項目編號（執行一次即可）────────────────────────────
// ─── 修復 KPI_ACH 欄位錯位（執行一次）──────────────────────────
function fixKPIAchColumns() {
  const sheet = getSheet(SHEET_NAMES.KPI_ACH);
  if (!sheet) return '找不到 KPI達成記錄 工作表';

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('目前欄位：' + JSON.stringify(headers));

  if (headers.includes('Month')) {
    return '月份欄已存在，無需修復';
  }

  // 舊結構：[ID, KPIID, WorkItemID, Year, ActualValue, Note, UpdatedAt]（7欄，無Month）
  // 但儲存時寫的是8值：[ID, KPIID, WorkItemID, Year, Month, ActualValue, Note, UpdatedAt]
  // 導致：Month寫進ActualValue欄，ActualValue寫進Note欄
  const lastRow = sheet.getLastRow();
  const yearCol = headers.indexOf('Year') + 1; // 1-indexed = 4

  // 在Year後插入空白Month欄
  sheet.insertColumnAfter(yearCol);
  sheet.getRange(1, yearCol + 1).setValue('Month');
  // 插入後：col5=Month(空), col6=舊ActualValue欄(存的是Month), col7=舊Note欄(存的是ActualValue)

  if (lastRow > 1) {
    const numCols = sheet.getLastColumn();
    const data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    for (let i = 0; i < data.length; i++) {
      const monthVal = data[i][5]; // col6 = 原本存的月份
      const actVal   = data[i][6]; // col7 = 原本存的達成值
      const row = i + 2;
      sheet.getRange(row, 5).setValue(monthVal); // 還原月份
      sheet.getRange(row, 6).setValue(actVal);   // 還原達成值
      sheet.getRange(row, 7).setValue('');        // 清空備註
    }
  }

  return '修復完成！共處理 ' + Math.max(0, lastRow - 1) + ' 筆記錄';
}

function fixItemNumbers() {
  const sheet = getSheet(SHEET_NAMES.WORK_ITEMS);
  if (!sheet) return '找不到工作項目工作表';
  const vals = sheet.getDataRange().getValues();
  // [title包含字串, GroupID, 新編號]
  const fixes = [
    ['整合臨床資訊與共享平台', '5', '3'],
    ['開發課程教材與教學資源（平台上架教材', '5', '4'],
    ['國際交流師生人次', '4', '4'],
  ];
  let count = 0;
  fixes.forEach(([sub, gid, newNo]) => {
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][1]) === gid && String(vals[i][4]).includes(sub)) {
        sheet.getRange(i + 1, 4).setValue(newNo);
        count++;
      }
    }
  });
  return '已修正 ' + count + ' 筆工作項目編號';
}

function populateInitialData() {
  const wiSheet = getSheet(SHEET_NAMES.WORK_ITEMS);
  if (wiSheet.getLastRow() > 1) return; // 已有資料，跳過

  const now = new Date().toISOString();

  // ─ Work Items ────────────────────────────────────────────────
  const WI = [
    // g=groupId, no=項次, title=工作項目, p=period
    {g:1,no:'1', title:'課程教材創新發展：建置「2基礎×2同步深化」分層課程架構',p:'2026/2-2028/12'},
    {g:1,no:'2', title:'課程教材創新發展：發展AI賦能專業必修與雙軌微學程深化體系',p:'2026/2-2028/12'},
    {g:1,no:'3', title:'推動微學程實施與管理：臨床技能檢定或模擬情境教案建立',p:'2026/2-2028/12'},
    {g:1,no:'4', title:'推動微學程實施與管理：統籌技能檢定辦理',p:'2026/2-2028/12'},
    {g:1,no:'5', title:'學生取得護理師專業相關證照（BLS、ACLS、CPR+AED）',p:''},
    {g:1,no:'6', title:'智慧醫療觀摩見習場次：至長庚醫院參訪智慧醫院、見習觀摩',p:'2026/2-2028/12'},
    {g:1,no:'7', title:'整合臨床資訊與共享平台：業師協同教學',p:'2027/2-2028/12'},
    {g:1,no:'8', title:'開發課程教材與教學資源（CARE Learning Hub 平台）',p:'2026/2-2028/12'},
    {g:1,no:'9', title:'建構人機協作流程與教材模組（SOP/示範影片/NIS案例）',p:'2026/2-2028/12'},
    {g:1,no:'10',title:'促進跨校與跨領域合作：跨校觀摩交流',p:'2026/2-2028/12'},
    {g:1,no:'11',title:'推動微學程實施與管理：參與國內/國際競賽、成果交流發表',p:'2026/2-2028/12'},
    {g:2,no:'1', title:'辦理AI賦能臨床應用種子教師培育與認證課程；建立AI賦能照護能力學生認證制度',p:'2026/2-2028/12'},
    {g:2,no:'2', title:'促進跨校與跨領域合作：產業跨域夥伴辦理教師研習工作坊',p:'2026/2-2028/12'},
    {g:2,no:'3', title:'種子教師回流成果追蹤',p:'2026/2-2028/12'},
    {g:2,no:'4', title:'建置AI智慧照護教學場域觀摩活動',p:'2026/2-2028/12'},
    {g:3,no:'1', title:'產學合作（政府部門）：衛福部國健署＋勞動部/勞動力發展署合作',p:'2026/2-2028/12'},
    {g:3,no:'2', title:'企業委託服務',p:'2026/2-2028/12'},
    {g:3,no:'3', title:'協助企業/機構代訓員工',p:'2026/2-2028/12'},
    {g:3,no:'4', title:'企業捐贈教學設備或材料',p:'2026/2-2028/12'},
    {g:3,no:'5', title:'促進跨校與跨領域合作：辦理研討會',p:'2026/2-2028/12'},
    {g:3,no:'6', title:'促進跨域合作（共編案例手冊/工作坊/產業成果展示）',p:'2026/2-2028/12'},
    {g:4,no:'1', title:'國際合約（正式合作MOU）',p:'2026/2-2028/12'},
    {g:4,no:'2', title:'國際交流（研討交流）',p:'2026/2-2028/12'},
    {g:4,no:'3', title:'國際共同成果發表（論文/教材共構）',p:'2026/2-2028/12'},
    {g:4,no:'5', title:'國際交流：共同教材共構與成果發表',p:'2026/2-2028/12'},
    {g:4,no:'4', title:'國際交流師生人次',p:'2026/2-2028/12'},
    {g:5,no:'1', title:'建置AI智慧照護教學場域（智慧病房＋高齡基地）',p:'2026/2-2027/12'},
    {g:5,no:'2', title:'設備使用率與跨課程共用',p:'2026/2-2028/12'},
    {g:5,no:'4', title:'開發課程教材與教學資源（平台上架教材/使用人次）',p:'2026/2-2028/12'},
    {g:5,no:'3', title:'整合臨床資訊與共享平台（教學用去識別化資料集）',p:'2026/2-2028/12'},
    {g:6,no:'1', title:'計畫人員聘任與管理',p:'2026/2-2028/12'},
    {g:6,no:'2', title:'三級管考管控執行（PDCA/月度儀表板）',p:'2026/2-2028/12'},
    {g:6,no:'3', title:'設施管理運作（設備排程/盤點維護/汰換）',p:'2026/2-2028/12'},
    {g:6,no:'4', title:'校際合作管理委員會運作',p:'2026/2-2028/12'},
    {g:6,no:'5', title:'促進跨校合作：辦理跨校專題成果展示/競賽',p:'2026/2-2028/12'},
    {g:6,no:'6', title:'促進跨校與跨領域合作（共授/共備活動）',p:'2026/2-2028/12'},
    {g:6,no:'7', title:'成果擴散（媒體/社群貼文、新聞報導）',p:'2026/2-2028/12'},
  ];

  const ids = {};
  WI.forEach((w,i) => {
    const id = 'WI_'+String(i+1).padStart(3,'0');
    ids[w.g+'_'+w.no] = id;
    const g = DEFAULT_GROUPS.find(x=>x.id===w.g);
    wiSheet.appendRow([id, w.g, g.name, w.no, w.title, w.p, now, now]);
  });

  // ─ KPIs ──────────────────────────────────────────────────────
  const KS = getSheet(SHEET_NAMES.KPIS);
  const KD = [
    {wi:'1_1',t:'兩個基礎AI素養課程修課人數 ≥ 400人/年',v:'400',y:true,yr:'115,116,117'},
    {wi:'1_2',t:'完成課綱/教案優化 ≥ 10門',v:'10',y:true,yr:'115'},
    {wi:'1_2',t:'微學程招收 ≥ 120人/年',v:'120',y:false,yr:''},
    {wi:'1_3',t:'116年始新增智慧照護情境教案數 ≥ 2案/年',v:'2',y:true,yr:'116,117'},
    {wi:'1_3',t:'教材/臨床技能檢定教案模組產出 ≥ 2件/年',v:'2',y:true,yr:''},
    {wi:'1_4',t:'臨床技能檢定通過率 115年≥85%→116年≥88%→117年≥90%',v:'85',y:true,yr:'115'},
    {wi:'1_5',t:'學生取得護理師專業相關證照人數 117年200人',v:'200',y:true,yr:'117'},
    {wi:'1_6',t:'智慧醫療觀摩見習場次 115年≥2場→116年≥3場→117年≥5場',v:'2',y:true,yr:'115'},
    {wi:'1_6',t:'參與臨床見習人次 學生≥120人次/年',v:'120',y:true,yr:''},
    {wi:'1_6',t:'本校＋夥伴學校參與師生人次累積 ≥ 400人次',v:'400',y:false,yr:''},
    {wi:'1_7',t:'業師共授 ≥1位/學期；116年起≥5位/年→117年≥10位/年',v:'1',y:true,yr:'115'},
    {wi:'1_8',t:'數位教材教學影片上架 ≥ 10支/年',v:'10',y:true,yr:''},
    {wi:'1_8',t:'自編教材 115年≥10套→116年≥20套→117年≥30套',v:'10',y:true,yr:'115'},
    {wi:'1_8',t:'平台新增上架教材/影片/教案模組數 115年≥20項→116年≥25項→117年≥30項',v:'20',y:true,yr:'115'},
    {wi:'1_8',t:'平台使用人次 115學年≥2000→116學年≥3000→117學年≥4000人次',v:'2000',y:true,yr:'115'},
    {wi:'1_9',t:'SOP ≥ 5個/年',v:'5',y:true,yr:''},
    {wi:'1_9',t:'示範影片 ≥ 5支/年',v:'5',y:true,yr:''},
    {wi:'1_9',t:'NIS案例 ≥ 50案（10-15案/年）',v:'50',y:false,yr:''},
    {wi:'1_10',t:'跨校觀摩交流 ≥ 2次/學期',v:'2',y:false,yr:''},
    {wi:'1_11',t:'參與競賽/成果交流發表 115年1件→116年2件→117年2件',v:'1',y:true,yr:'115'},
    {wi:'2_1',t:'AI賦能種子教師認證辦理 3梯次/年',v:'3',y:true,yr:''},
    {wi:'2_1',t:'種子教師通過人數 30人/年，三年達90人',v:'30',y:true,yr:''},
    {wi:'2_1',t:'教師培訓完成率 ≥ 85%',v:'85',y:false,yr:''},
    {wi:'2_1',t:'師生資訊與AI能力相關認證 115年30人→116年30人→117年150人',v:'30',y:true,yr:'115'},
    {wi:'2_2',t:'跨校與跨域教師培訓 ≥ 3場/年',v:'3',y:true,yr:''},
    {wi:'2_2',t:'跨校與跨域教學合作 1案/年',v:'1',y:true,yr:''},
    {wi:'2_2',t:'參與人次 ≥ 50人次/年',v:'50',y:true,yr:''},
    {wi:'2_3',t:'回流成果之比例 116年≥70%→117年≥80%',v:'70',y:true,yr:'116'},
    {wi:'2_4',t:'臨床示範觀摩場次（含長庚智慧病房）≥ 1場/年',v:'1',y:true,yr:''},
    {wi:'3_1',t:'產出合作案之教材模組累積 ≥ 20件',v:'20',y:false,yr:''},
    {wi:'3_1',t:'承接產官學計劃合作案 115年3件→116年4件→117年5件',v:'3',y:true,yr:'115'},
    {wi:'3_1',t:'合作計劃金額（萬元） 115年500→116年800→117年1000',v:'500',y:true,yr:'115'},
    {wi:'3_1',t:'本校教師參與累積 115年10人次→116年20人次→117年20人次',v:'10',y:true,yr:'115'},
    {wi:'3_1',t:'每年服務 ≥ 300名高齡者',v:'300',y:true,yr:''},
    {wi:'3_2',t:'企業委託服務件數 115年3件→116年6件→117年9件',v:'3',y:true,yr:'115'},
    {wi:'3_2',t:'企業委託服務金額（萬元） 115年30→116年60→117年90',v:'30',y:true,yr:'115'},
    {wi:'3_3',t:'培訓場次 ≥ 2場/年',v:'2',y:true,yr:''},
    {wi:'3_3',t:'受訓人次 ≥ 40人次/年',v:'40',y:true,yr:''},
    {wi:'3_3',t:'培訓模組 ≥ 3套（B1/B2/B3各1套）',v:'3',y:false,yr:''},
    {wi:'3_3',t:'課後滿意度調查通過率 ≥ 80%',v:'80',y:false,yr:''},
    {wi:'3_4',t:'企業捐贈件數 116年5件→117年6件',v:'5',y:true,yr:'116'},
    {wi:'3_4',t:'企業捐贈金額（萬元） 116年50→117年100',v:'50',y:true,yr:'116'},
    {wi:'3_5',t:'研討會辦理 ≥ 1場/年',v:'1',y:true,yr:''},
    {wi:'3_6',t:'共編案例操作手冊累積 ≥ 10則',v:'10',y:false,yr:''},
    {wi:'3_6',t:'產業授課/工作坊 ≥ 3場/年，參與人次 ≥ 100人次/年',v:'3',y:true,yr:''},
    {wi:'3_6',t:'產業參與成果發表/展示 1場/2年',v:'1',y:false,yr:''},
    {wi:'4_1',t:'每年1件正式合作紀錄',v:'1',y:true,yr:''},
    {wi:'4_1',t:'國際交流人次 ≥ 5人/年',v:'5',y:true,yr:''},
    {wi:'4_2',t:'研討交流 115年2件→116年3件→117年4件',v:'2',y:true,yr:'115'},
    {wi:'4_3',t:'共同成果 116年2件→117年3件',v:'2',y:true,yr:'116'},
    {wi:'4_3',t:'共同教材共構與成果發表累積 ≥ 6件',v:'6',y:false,yr:''},
    {wi:'4_5',t:'國際共同教材共構與成果發表累積 ≥ 6件',v:'6',y:false,yr:''},
    {wi:'4_6',t:'國際交流師生人次 115年5人→116年5人→117年10人',v:'5',y:true,yr:'115'},
    {wi:'5_1',t:'設備採購金額 3,000萬元',v:'3000',y:false,yr:''},
    {wi:'5_1',t:'採購設備 32項',v:'32',y:false,yr:''},
    {wi:'5_2',t:'設備使用人次 116年≥400→117年≥800人次',v:'400',y:true,yr:'116'},
    {wi:'5_2',t:'設備使用時數 116年900→117年1200小時',v:'900',y:true,yr:'116'},
    {wi:'5_2',t:'實作工作坊 1案/年',v:'1',y:true,yr:''},
    {wi:'5_3',t:'平台新增上架教材/影片/教案模組數 115年≥20項→116年≥25項→117年≥30項',v:'20',y:true,yr:'115'},
    {wi:'5_3',t:'平台使用人次 115學年≥2000→116學年≥3000→117學年≥4000人次',v:'2000',y:true,yr:'115'},
    {wi:'5_4',t:'教學用去識別化資料集 ≥ 10套',v:'10',y:false,yr:''},
    {wi:'6_1',t:'招募並聘任研究助理3名',v:'3',y:false,yr:''},
    {wi:'6_2',t:'月度品管儀表板更新率 100%',v:'100',y:false,yr:''},
    {wi:'6_2',t:'年度KPI達成率 ≥ 80%',v:'80',y:false,yr:''},
    {wi:'6_3',t:'月度使用率儀表板更新率 100%',v:'100',y:false,yr:''},
    {wi:'6_3',t:'設備汰換規則落實率 ≥ 90%',v:'90',y:false,yr:''},
    {wi:'6_4',t:'辦理機制共識會議累積 ≥ 6次（每學年2次）',v:'6',y:false,yr:''},
    {wi:'6_5',t:'辦理專題成果展示/競賽 1場/2年',v:'1',y:false,yr:''},
    {wi:'6_6',t:'跨校共授/共備活動 ≥ 4次/年',v:'4',y:true,yr:''},
    {wi:'6_6',t:'參與工作坊/觀摩（含夥伴學校） 115年≥100→116年≥120→117年≥150人次',v:'100',y:true,yr:'115'},
    {wi:'6_6',t:'PBL專題 ≥ 5組/年',v:'5',y:true,yr:''},
    {wi:'6_7',t:'媒體新聞稿/報導 每年2次',v:'2',y:true,yr:''},
    {wi:'6_7',t:'社群貼文 115年3則→116年10則→117年20則',v:'3',y:true,yr:'115'},
    {wi:'6_7',t:'受眾觸及量 115年500人→116年1000人→117年2000人',v:'500',y:true,yr:'115'},
  ];
  KD.forEach((k,i)=>{
    const wid=ids[k.wi]; if(!wid)return;
    KS.appendRow(['KPI_'+String(i+1).padStart(3,'0'),wid,k.t,k.v,'number',k.y,k.yr,'','',now]);
  });

  // ─ Teachers ──────────────────────────────────────────────────
  const TS = getSheet(SHEET_NAMES.TEACHERS);
  const TD = [
    {wi:'1_1',n:'張怡雅'},{wi:'1_1',n:'林志鴻'},{wi:'1_2',n:'張怡雅'},{wi:'1_2',n:'蔡金杏'},
    {wi:'1_3',n:'張怡雅'},{wi:'1_3',n:'蔡金杏'},{wi:'1_3',n:'簡麗瑜'},{wi:'1_4',n:'簡麗瑜'},
    {wi:'1_5',n:'吳美玲'},{wi:'1_6',n:'吳美玲'},{wi:'1_6',n:'陳妙絹'},{wi:'1_7',n:'張怡雅'},
    {wi:'1_8',n:'蔡金杏'},{wi:'1_8',n:'簡麗瑜'},{wi:'1_8',n:'鄭麗菁'},{wi:'1_9',n:'吳美玲'},
    {wi:'1_9',n:'簡麗瑜'},{wi:'1_10',n:'簡麗瑜'},{wi:'1_11',n:'張怡雅'},{wi:'1_11',n:'蔡金杏'},
    {wi:'2_1',n:'簡麗瑜'},{wi:'2_2',n:'簡麗瑜'},{wi:'2_3',n:'簡麗瑜'},{wi:'2_4',n:'簡麗瑜'},
    {wi:'3_1',n:'許瑜庭'},{wi:'3_2',n:'許瑜庭'},{wi:'3_3',n:'許瑜庭'},{wi:'3_4',n:'許瑜庭'},
    {wi:'3_5',n:'許瑜庭'},{wi:'3_6',n:'許瑜庭'},{wi:'3_6',n:'簡麗瑜'},
    {wi:'4_1',n:'黃惠玲'},{wi:'4_2',n:'黃惠玲'},{wi:'4_3',n:'黃惠玲'},{wi:'4_5',n:'黃惠玲'},
    {wi:'4_6',n:'吳美玲'},{wi:'4_6',n:'簡麗瑜'},
    {wi:'5_1',n:'許瑜庭'},{wi:'5_2',n:'簡麗瑜'},{wi:'5_3',n:'簡麗瑜'},{wi:'5_3',n:'蔡金杏'},
    {wi:'5_3',n:'鄭麗菁'},{wi:'5_4',n:'簡麗瑜'},
    {wi:'6_1',n:'趙莉芬'},{wi:'6_2',n:'院長'},{wi:'6_3',n:'趙莉芬'},{wi:'6_3',n:'簡麗瑜'},
    {wi:'6_4',n:'院長'},{wi:'6_5',n:'院長'},{wi:'6_6',n:'院長'},{wi:'6_7',n:'吳美玲'},{wi:'6_7',n:'許瑜庭'},
  ];
  TD.forEach((t,i)=>{ const wid=ids[t.wi];if(!wid)return; TS.appendRow(['T_'+String(i+1).padStart(3,'0'),wid,t.n,'',now]); });

  // ─ Co-organizers ─────────────────────────────────────────────
  const CS = getSheet(SHEET_NAMES.CO_ORGS);
  const CD = [
    {wi:'1_1',n:'王毅新'},{wi:'1_2',n:'蔡明芬'},{wi:'1_3',n:'蔡明芬'},{wi:'1_5',n:'張翠璊'},
    {wi:'1_7',n:'林淑棻'},{wi:'1_8',n:'羅永桂'},{wi:'1_9',n:'陳偉婷'},{wi:'1_10',n:'陳偉婷'},
    {wi:'1_11',n:'蔡明芬'},{wi:'2_1',n:'楊馥宇'},{wi:'2_1',n:'陳偉婷'},{wi:'2_2',n:'楊馥宇'},
    {wi:'2_3',n:'陳偉婷'},{wi:'2_4',n:'陳偉婷'},{wi:'3_3',n:'林偉民'},{wi:'3_4',n:'林偉民'},
    {wi:'3_5',n:'陳偉婷'},{wi:'3_6',n:'陳偉婷'},{wi:'4_5',n:'張麗娟'},
    {wi:'5_1',n:'羅永桂'},{wi:'5_2',n:'陳偉婷'},{wi:'5_3',n:'羅永桂'},{wi:'5_4',n:'羅永桂'},
    {wi:'6_1',n:'林偉民'},{wi:'6_2',n:'趙莉芬'},{wi:'6_3',n:'陳偉婷'},{wi:'6_4',n:'趙莉芬'},
    {wi:'6_5',n:'趙莉芬'},{wi:'6_6',n:'趙莉芬'},{wi:'6_7',n:'陳偉婷'},
  ];
  CD.forEach((c,i)=>{ const wid=ids[c.wi];if(!wid)return; CS.appendRow(['CO_'+String(i+1).padStart(3,'0'),wid,c.n,'',now]); });

  // ─ Responsible Units ─────────────────────────────────────────
  const US = getSheet(SHEET_NAMES.UNITS);
  const UD = [
    {wi:'1_1',u:'系課程組'},{wi:'1_2',u:'系課程組'},{wi:'1_3',u:'系課程組／微學程專責人員'},
    {wi:'1_4',u:'系課程組／微學程專責人員'},{wi:'1_5',u:'行政組'},{wi:'1_6',u:'行政組/實習組'},
    {wi:'1_7',u:'系課程組'},{wi:'1_8',u:'系課程組'},{wi:'1_9',u:'系行政組'},
    {wi:'1_10',u:'中心教學組計畫責成單位'},{wi:'1_11',u:'系課程組／微學程專責人員'},
    {wi:'2_1',u:'中心教學組計畫責成單位'},{wi:'2_2',u:'中心教學組計畫責成單位'},
    {wi:'2_3',u:'中心教學組計畫責成單位'},{wi:'2_4',u:'中心教學組計畫責成單位'},
    {wi:'3_1',u:'中心計畫責成單位'},{wi:'3_2',u:'中心計畫責成單位'},
    {wi:'3_3',u:'中心產合組計畫責成單位'},{wi:'3_4',u:'中心產合組計畫責成單位'},
    {wi:'3_5',u:'中心產合組計畫責成單位'},{wi:'3_6',u:'中心產合組計畫責成單位'},
    {wi:'4_1',u:'中心計畫責成單位'},{wi:'4_2',u:'中心計畫責成單位'},
    {wi:'4_3',u:'中心計畫責成單位'},{wi:'4_5',u:'中心研發組計畫責成單位'},{wi:'4_6',u:'行政組'},
    {wi:'5_1',u:'中心產合組計畫責成單位'},{wi:'5_2',u:'中心教學組計畫責成單位'},
    {wi:'5_3',u:'中心教學組計畫責成單位'},{wi:'5_4',u:'中心教學組計畫責成單位'},
    {wi:'6_1',u:'中心'},{wi:'6_2',u:'學院'},{wi:'6_3',u:'中心'},{wi:'6_4',u:'學院'},
    {wi:'6_5',u:'學院'},{wi:'6_6',u:'學院'},{wi:'6_7',u:'行政組/中心產合組計畫責成單位'},
  ];
  UD.forEach((u,i)=>{ const wid=ids[u.wi];if(!wid)return; US.appendRow(['UN_'+String(i+1).padStart(3,'0'),wid,u.u,'',now]); });

  // ─ Form Links ─────────────────────────────────────────────────
  const FS = getSheet(SHEET_NAMES.FORMS);
  const FURLS = {
    '教案表單':         {u:'https://docs.google.com/spreadsheets/d/1yT1uHKztGr5zulHwpop_BBIJ8262F44ppeysmWe90Mw/edit?gid=1371491711',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=1198537942'},
    'OSCE表單':         {u:'https://docs.google.com/spreadsheets/d/1zcPB2GKBj6ccW6PlSnz7WSuw5HCyqnmHvmW1kixAO14/edit?gid=1875692736',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=2054390350'},
    '證照表單':         {u:'https://docs.google.com/spreadsheets/d/1KxSpZxW4EukBENBb9tc1Unf4OfJ1uZcF9pmM826JrxY/edit?gid=858324363',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=1539188126'},
    '參訪表單':         {u:'https://docs.google.com/spreadsheets/d/1Uxb94MgWaRRZ0adbGMlpW6bw_8c7VM_648OS0WLhV9k/edit?gid=858324363',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=629883937'},
    '共授_共備表單':    {u:'https://docs.google.com/spreadsheets/d/1pqQ7gQ8lt2hL-VHxAJjlpkLtA5mSr9_xZybxlfdT_O4/edit?gid=858324363',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=1244972477'},
    '情境課程表單':     {u:'https://docs.google.com/spreadsheets/d/1hfrzs7ykQfhGtWV2CU3AawnG7BcugGeIVymTfMMPCXk/edit?gid=1807121673',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=653303229'},
    '數位教材表單':     {u:'https://docs.google.com/spreadsheets/d/1Qghp2VM8qPMzt7tlFlV30U6zMdxWZgQQlZdu-5GR2A8/edit?gid=773955113',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=711207369'},
    '學術活動表單':     {u:'https://docs.google.com/spreadsheets/d/1X2RQduUJwQQMQ20qqRcGKyD42dx4VhV0D5dfuX2cF78/edit?gid=858324363',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=1212461482'},
    '培訓表單':         {u:'https://docs.google.com/spreadsheets/d/1Sw1vbqmtf-cnzYRLe6uWLCBzfMPtzxWVeuYBt_x5VKw/edit?gid=244353658',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=782437317'},
    '回饋成果':         {u:'https://docs.google.com/spreadsheets/d/1LUsBaNgdGMIz2x5aIVe_vLDMj8eqBx8FojvEHG-dZgc/edit?gid=0',s:''},
    '計劃項目表單':     {u:'https://docs.google.com/spreadsheets/d/16hDPxg_-gi6BAS6dHPU05710bLU9HQloPrs11QEHzmw/edit?gid=1200112984',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=1775781535'},
    '文章發表':         {u:'https://docs.google.com/spreadsheets/d/1w3mpU5cgbZe3gwFRxMeqtqBV3Z1W_6sPW9L7qaXZyI4/edit?gid=868273848',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=229951872'},
    '國際合作_國際交流':{u:'https://docs.google.com/spreadsheets/d/1j12w5FgppEJZSiJDt4F4HVZvxpMzJKRSWyBjOxh-8iU/edit?gid=795767275',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=229951872'},
    '研討會投稿發表':   {u:'https://docs.google.com/spreadsheets/d/15cET-d2g42QWrfYdjtdYbwx7sEBEMetRxyzumgzTqic/edit?gid=1741113892',s:'https://docs.google.com/spreadsheets/d/1NCP7Bh0k09GN5R_O8WP2ihFmifnEec7U2OE4pjqjiG0/edit?gid=663765218'},
    '場地/設備使用':    {u:'https://docs.google.com/spreadsheets/d/12WmSlIbPZejpsSf-Bd7UlEpNkcjLEhmh/edit?gid=1785540301',s:''},
  };
  const FLD=[
    {wi:'1_1',fs:['教案表單']},{wi:'1_3',fs:['教案表單']},{wi:'1_4',fs:['OSCE表單']},
    {wi:'1_5',fs:['證照表單']},{wi:'1_6',fs:['參訪表單']},{wi:'1_7',fs:['共授_共備表單']},
    {wi:'1_8',fs:['情境課程表單','數位教材表單','教案表單']},{wi:'1_9',fs:['教案表單']},
    {wi:'1_10',fs:['參訪表單']},{wi:'1_11',fs:['學術活動表單']},
    {wi:'2_1',fs:['培訓表單','證照表單']},{wi:'2_2',fs:['培訓表單']},
    {wi:'2_3',fs:['回饋成果']},{wi:'2_4',fs:['參訪表單']},
    {wi:'3_1',fs:['培訓表單','計劃項目表單']},{wi:'3_2',fs:['培訓表單','計劃項目表單']},
    {wi:'3_3',fs:['培訓表單','計劃項目表單']},{wi:'3_4',fs:['學術活動表單']},
    {wi:'3_5',fs:['學術活動表單']},{wi:'3_6',fs:['教案表單','學術活動表單']},
    {wi:'4_1',fs:['國際合作_國際交流']},{wi:'4_2',fs:['國際合作_國際交流','參訪表單','文章發表']},
    {wi:'4_3',fs:['文章發表','研討會投稿發表']},{wi:'4_5',fs:['國際合作_國際交流']},
    {wi:'4_6',fs:['參訪表單']},{wi:'5_1',fs:['場地/設備使用']},{wi:'5_2',fs:['場地/設備使用']},
    {wi:'5_3',fs:['情境課程表單','數位教材表單','教案表單']},{wi:'5_4',fs:['情境課程表單']},
    {wi:'6_6',fs:['共授_共備表單','學術活動表單']},{wi:'6_7',fs:['學術活動表單']},
  ];
  let fi=0;
  FLD.forEach(fl=>{ const wid=ids[fl.wi];if(!wid)return;
    fl.fs.forEach(fn=>{ const info=FURLS[fn];if(!info)return;
      FS.appendRow(['FL_'+String(++fi).padStart(3,'0'),wid,fn,info.u,info.s,now]); });
  });

  // ─ Existing Actual Status (from Excel, load to Pool 1) ───────
  const P1 = getSheet(SHEET_NAMES.POOL1);
  const EA = [
    {wi:'1_1',yr:'115',mo:'5',c:'2026/05/04召開AI賦能課程發展會議'},
    {wi:'2_1',yr:'115',mo:'3',c:'1.2026年3月11日營昇企業「AI智能臨床模擬訓練」，16位教職員參與。\n2026年：累計1場次，參與人次16人次。'},
    {wi:'2_2',yr:'115',mo:'4',c:'1.2026/3/4 The Smart Care Revolution研討會，61位參與。\n2.2026/3/19 JoVE平台分享，10位參與。\n3.2026/4/7提送教育部申請案（兩梯次，共60人名額）。\n2026年：累計2場次，參與人次71人次。'},
    {wi:'3_1',yr:'115',mo:'5',c:'國健署計畫案：高齡健康數位學習470萬、長者內在能力檢測189萬、糖尿病支持團體446萬、菸害政策分析289萬。\n勞動部：照顧服務員即測即評及發證認證場地申請進行中（5月14日前送第二次備審資料）。'},
    {wi:'3_2',yr:'115',mo:'5',c:'接案2件：長照相關人才培訓認證課程22萬、長照服務產業人才培訓55萬。\n2026年：接案2件，金額77萬（件數達成率67%，金額達成率100%）。'},
    {wi:'3_3',yr:'115',mo:'5',c:'至2026/5月累計4場，共計104人受訓：(1)2026/1/23失智症照顧服務；(2)2026/2/21身心障礙支持服務；(3)2026/4/24長照六合一；(4)2026/5/29長照七合一。'},
    {wi:'3_4',yr:'115',mo:'5',c:'2026/4/7新北市立土城醫院捐贈指針式血壓計，安裝於臨床技能中心試場。\n2026年：累計1件。'},
    {wi:'3_5',yr:'115',mo:'3',c:'2026/3/4舉辦「2026 THE Smart Care Revolution」研討會。\n2026年：累計1場次，參與人次61人次。'},
    {wi:'4_1',yr:'115',mo:'3',c:'2026年3月24日與安娜堡傑盛臺美商會(TACCAA)交流5人。\n2026年累積交流5人次。'},
    {wi:'4_2',yr:'115',mo:'5',c:'2026年5月19日 Binghamton 大學教師參訪共計17人。'},
    {wi:'4_3',yr:'115',mo:'5',c:'1.UHIMA2026 & TLCMA2026研討會徵稿提交3件（2026年7月2-3日）。\n2.台塑關係企業應用技術研討會，13篇海報（2026年6月5日）。'},
    {wi:'4_6',yr:'115',mo:'5',c:'1.2026/4/10 越南E Hospital護理師5人參訪。\n2.2026/5/19 Binghamton大學師生參訪17人。\n2026年：累計2場次，參與人次22人次。'},
    {wi:'5_1',yr:'115',mo:'5',c:'完成採購12項（484.8萬）；進入請購流程18項（1565.2萬）；待報價2項（921.3萬）。\n建築體補強：完成初步場勘，預計進行屋頂防水工程。'},
    {wi:'6_1',yr:'115',mo:'5',c:'1.2026/2/25刊登徵才公告。\n2.2026/4/17再次刊登。\n3.2026/4/17線上面試1位，不適用。\n4.2026/5/26新進人員報到（孫高傑）。'},
    {wi:'6_2',yr:'115',mo:'5',c:'2026/5/26 管考。'},
    {wi:'6_6',yr:'115',mo:'3',c:'2026/3/19本校教師與龍華科技大學陳佳莉副教授討論課程合作，確認114學年度第二學期共同授課。\n2026年：累計1場。'},
    {wi:'6_7',yr:'115',mo:'5',c:'1.2026/3/4 研討會FB & Instagram貼文。\n2.2026/3/24 與長庚科大攜手安娜堡傑盛臺美商會報導。\n3.2026/5/19 Binghamton大學參訪貼文。\n2026年：媒體報導1次、社群貼文4則、受眾觸及33人。'},
  ];
  EA.forEach((a,i)=>{
    const wid=ids[a.wi];if(!wid)return;
    P1.appendRow(['P1_'+String(i+1).padStart(3,'0'),wid,a.yr,a.mo,a.c,'#000000',now,'初始資料匯入']);
  });
}
