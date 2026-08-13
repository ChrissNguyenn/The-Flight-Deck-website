/* ============================================================
   THE FLIGHT DECK — Apps Script cho ĐẶT LỊCH & ĐĂNG KÝ SỰ KIỆN
   ============================================================
   Đây là bản MỚI, chạy ĐỘC LẬP với google-apps-script.gs (bản đó phục
   vụ sự kiện Carrot Day và trang quản lý cũ). Hai file KHÔNG dùng chung
   deployment và KHÔNG dùng chung Spreadsheet.

   ---------- CÀI ĐẶT NHANH ----------
   1. Mở file Sheet đích, Tiện ích mở rộng → Apps Script.
   2. Dán TOÀN BỘ file này vào Code.gs, lưu.
   3. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
        Thực thi bằng: Tôi
        Ai có quyền:  Bất kỳ ai
   4. Chép URL .../exec dán vào BOOKING_SCRIPT_URL trong config.js.
   (Hướng dẫn đầy đủ có ảnh: xem README.md, mục "Đặt lịch thường ngày".)

   ⚠️ Chạy thử trong trình soạn thảo thì CHỌN HÀM `TEST_tuKiemTra`.
   Danh sách hàm mặc định là `doGet` — bấm Chạy khi đang chọn `doGet` sẽ
   báo lỗi thiếu tham số `e` chứ không phải script hỏng.
   ============================================================ */

var SCRIPT_VERSION = 1;

/* File Sheet đích. Để trống thì dùng Sheet đang gắn với script này —
   nhưng ghi rõ ID an toàn hơn: script vẫn ghi đúng chỗ kể cả khi bạn
   lỡ mở nó từ một file khác. */
var SHEET_ID = '1HB_6UIptnWt_5JQT_21H5QXewjAIowD441nQ01_Pgxs';

/* Giờ mở cửa. PHẢI KHỚP với BOOKING trong config.js — lệch nhau thì
   khách chọn được giờ mà server từ chối (hoặc ngược lại, tệ hơn). */
var OPEN_START = '09:00';
var OPEN_END = '21:00';
var STEP_MIN = 15;
var MIN_HOURS = 1;
var MAX_HOURS = 4;
var LEAD_MIN = 60;          // phải đặt trước ít nhất 60 phút
var MAX_DAYS_AHEAD = 60;    // không nhận đặt xa hơn 60 ngày

var TZ = 'Asia/Ho_Chi_Minh';

/* ---------- Cột trong bảng ----------
   Sửa ở đây là sửa cả tiêu đề lẫn thứ tự ghi. KHÔNG chèn cột vào GIỮA
   mảng khi đã có dữ liệu thật: các dòng cũ giữ nguyên vị trí cũ nên
   toàn bộ bảng sẽ lệch cột từ chỗ chèn trở đi. Thêm cột thì thêm vào
   CUỐI mảng. */
var COLS = [
  { key: 'code',     label: 'Mã đặt chỗ',      width: 118 },
  { key: 'type',     label: 'Loại',            width: 128 },
  { key: 'date',     label: 'Ngày bay',        width: 104 },
  { key: 'timeText', label: 'Thời gian bay',   width: 132 },
  { key: 'hours',    label: 'Số giờ bay',      width: 92 },
  { key: 'name',     label: 'Tên khách book',  width: 190 },
  { key: 'phone',    label: 'Số điện thoại',   width: 128 },
  { key: 'email',    label: 'Email',           width: 210 },
  { key: 'guests',   label: 'Số khách',        width: 84 },
  { key: 'event',    label: 'Sự kiện',         width: 180 },
  { key: 'note',     label: 'Ghi chú',         width: 260 },
  { key: 'status',   label: 'Trạng thái',      width: 128 },
  { key: 'source',   label: 'Nguồn',           width: 96 },
  { key: 'sentAt',   label: 'Thời gian gửi',   width: 152 }
];

var TYPE_BOOK = 'Đặt lịch bay';
var TYPE_EVENT = 'Đăng ký sự kiện';

var ST_NEW = 'Mới';
var ST_OK = 'Đã xác nhận';
var ST_DONE = 'Đã bay';
var ST_CANCEL = 'Đã hủy';
var STATUSES = [ST_NEW, ST_OK, ST_DONE, ST_CANCEL];

/* Trạng thái vẫn CHIẾM CHỖ trong buồng lái. "Đã hủy" thì nhả giờ ra cho
   người khác đặt. */
var HOLDING = [ST_NEW, ST_OK, ST_DONE];

/* ---------- Màu bảng (đồng bộ với giao diện web) ---------- */
var C_HEADER_BG = '#0D2440';   // navy
var C_HEADER_FG = '#F8F5EE';   // kem
var C_ROW_A = '#FFFFFF';
var C_ROW_B = '#EDF3F8';       // trắng xanh
var C_BORDER = '#C3D5E6';
var C_CANCEL = '#9AA6B4';

/* ============================================================
   ĐIỂM VÀO
   ============================================================ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'slots') return json_(slotsFor_(p.date));
    if (p.action === 'lookup') return json_(lookup_(p.q));
    return json_({
      ok: true,
      version: SCRIPT_VERSION,
      openStart: OPEN_START, openEnd: OPEN_END,
      stepMinutes: STEP_MIN, minHours: MIN_HOURS, maxHours: MAX_HOURS,
      leadMinutes: LEAD_MIN
    });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err && err.message || err) });
  }
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'book') return json_(saveBooking_(p));
    if (p.action === 'event') return json_(saveEvent_(p));
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   TAB THEO THÁNG
   ============================================================
   Tên tab lấy theo NGÀY BAY, không phải ngày khách bấm gửi. Khách đặt
   ngày 30/8 cho chuyến 2/9 thì dòng đó phải nằm ở tab "9/26" — chị chủ
   mở tab tháng 9 là thấy đủ lịch tháng 9. Xếp theo ngày gửi thì lịch
   một tháng bị xé ra nằm ở hai tab.
   Đăng ký sự kiện không có ngày bay thì xếp theo ngày gửi. */

function tabNameFor_(dateKey) {
  var d = dateKey ? new Date(dateKey + 'T00:00:00Z') : nowVn_();
  var m = dateKey ? (d.getUTCMonth() + 1) : (d.getMonth() + 1);
  var y = dateKey ? d.getUTCFullYear() : d.getFullYear();
  return m + '/' + String(y).slice(2);        // 2026-08-… -> "8/26"
}

function book_() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* Lấy tab của tháng, tạo mới + định dạng nếu chưa có. */
function sheetFor_(dateKey) {
  var ss = book_();
  var name = tabNameFor_(dateKey);
  var sh = ss.getSheetByName(name);
  if (sh) return sh;

  /* Google Sheets nhận dấu "/" trong tên tab, nhưng nếu một ngày nào đó
     không nhận thì thà đổi sang "8-26" còn hơn để cả lượt đặt rơi mất. */
  try {
    sh = ss.insertSheet(name);
  } catch (err) {
    name = name.replace('/', '-');
    sh = ss.getSheetByName(name) || ss.insertSheet(name);
  }
  setupSheet_(sh);
  sortTabs_(ss);
  return sh;
}

/* Xếp các tab theo đúng thứ tự thời gian. Không xếp thì tab tháng mới
   luôn bị đẩy về cuối, tháng 1/27 nằm sau 12/26 thì đúng, nhưng khi
   thêm bù một tháng cũ nó lại chen sai chỗ. */
function sortTabs_(ss) {
  var sheets = ss.getSheets().slice();
  var keyed = sheets.map(function (sh, i) {
    var m = /^(\d{1,2})[\/\-](\d{2})$/.exec(sh.getName());
    return {
      sh: sh,
      idx: i,
      rank: m ? (2000 + +m[2]) * 100 + +m[1] : -1   // tab không phải tháng giữ nguyên đầu bảng
    };
  }).filter(function (x) { return x.rank > 0; });

  keyed.sort(function (a, b) { return a.rank - b.rank; });
  var base = sheets.length - keyed.length;
  keyed.forEach(function (x, i) {
    ss.setActiveSheet(x.sh);
    ss.moveActiveSheet(base + i + 1);
  });
}

/* ============================================================
   ĐỊNH DẠNG BẢNG
   ============================================================ */

function setupSheet_(sh) {
  var labels = COLS.map(function (c) { return c.label; });
  var n = labels.length;

  sh.clear();
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);

  /* --- hàng tiêu đề --- */
  var head = sh.getRange(1, 1, 1, n);
  head.setValues([labels])
    .setBackground(C_HEADER_BG)
    .setFontColor(C_HEADER_FG)
    .setFontFamily('Arial')
    .setFontSize(11)
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center')
    .setWrap(true);
  sh.setRowHeight(1, 42);
  sh.setFrozenRows(1);

  /* --- màu xen kẽ các hàng ---
     Dùng banding của Sheets chứ không tô tay từng dòng: banding tự áp
     cho dòng mới thêm, tô tay thì mỗi lần ghi lại phải tô lại và chỉ
     cần một lần lỗi là bảng loang lổ. */
  var body = sh.getRange(1, 1, sh.getMaxRows(), n);
  body.getBandings().forEach(function (b) { b.remove(); });
  var banding = body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor(C_HEADER_BG)
    .setFirstRowColor(C_ROW_A)
    .setSecondRowColor(C_ROW_B);

  /* --- bề rộng cột + canh lề --- */
  COLS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.width); });

  var cIdx = colIndex_();
  sh.getRange(2, cIdx.code, sh.getMaxRows() - 1, 1).setFontFamily('Roboto Mono').setHorizontalAlignment('center');
  sh.getRange(2, cIdx.date, sh.getMaxRows() - 1, 1).setHorizontalAlignment('center');
  sh.getRange(2, cIdx.timeText, sh.getMaxRows() - 1, 1)
    .setFontFamily('Roboto Mono').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, cIdx.hours, sh.getMaxRows() - 1, 1).setHorizontalAlignment('center');
  sh.getRange(2, cIdx.guests, sh.getMaxRows() - 1, 1).setHorizontalAlignment('center');
  sh.getRange(2, cIdx.status, sh.getMaxRows() - 1, 1).setHorizontalAlignment('center');

  /* Số điện thoại phải là CHỮ, không phải số: để kiểu số thì Sheets ăn
     mất số 0 đứng đầu và "0901234567" thành "901234567". */
  sh.getRange(2, cIdx.phone, sh.getMaxRows() - 1, 1)
    .setNumberFormat('@').setHorizontalAlignment('center');

  sh.getRange(1, 1, sh.getMaxRows(), n)
    .setBorder(true, true, true, true, true, true, C_BORDER, SpreadsheetApp.BorderStyle.SOLID);

  /* --- ô chọn Trạng thái --- */
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true)
    .setAllowInvalid(false)
    .setHelpText('Chọn một trạng thái trong danh sách.')
    .build();
  sh.getRange(2, cIdx.status, sh.getMaxRows() - 1, 1).setDataValidation(rule);

  /* --- dòng đã hủy thì làm mờ và gạch ngang --- */
  var all = sh.getRange(2, 1, sh.getMaxRows() - 1, n);
  var stCol = colLetter_(cIdx.status);
  var ruleCancel = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + stCol + '2="' + ST_CANCEL + '"')
    .setFontColor(C_CANCEL)
    .setStrikethrough(true)
    .setRanges([all])
    .build();
  var ruleOk = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + stCol + '2="' + ST_OK + '"')
    .setBackground('#E6F4EC')
    .setRanges([sh.getRange(2, cIdx.status, sh.getMaxRows() - 1, 1)])
    .build();
  sh.setConditionalFormatRules([ruleCancel, ruleOk]);

  return sh;
}

function colIndex_() {
  var m = {};
  COLS.forEach(function (c, i) { m[c.key] = i + 1; });
  return m;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
}

/* Đặt lại định dạng cho MỌI tab đang có. Chạy tay khi bạn lỡ xóa màu
   hoặc muốn áp kiểu mới cho các tab cũ. Hàm này KHÔNG xóa dữ liệu. */
function DINH_DANG_LAI_TAT_CA() {
  var ss = book_();
  var cIdx = colIndex_();
  ss.getSheets().forEach(function (sh) {
    if (!/^\d{1,2}[\/\-]\d{2}$/.test(sh.getName())) return;
    var last = sh.getLastRow();
    var data = last > 1 ? sh.getRange(2, 1, last - 1, COLS.length).getValues() : [];
    setupSheet_(sh);
    if (data.length) {
      sh.getRange(2, 1, data.length, COLS.length).setValues(data);
      sh.getRange(2, cIdx.phone, data.length, 1).setNumberFormat('@');
    }
  });
  return 'Đã định dạng lại ' + ss.getSheets().length + ' tab.';
}

/* ============================================================
   ĐỌC LỊCH ĐÃ ĐẶT
   ============================================================ */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function hhmmToMin_(s) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return NaN;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return NaN;
  return h * 60 + mi;
}

function minToHhmm_(n) {
  n = Math.round(n);
  return pad2_(Math.floor(n / 60)) + ':' + pad2_(n % 60);
}

function nowVn_() {
  return new Date(Utilities.formatDate(new Date(), TZ, "yyyy/MM/dd HH:mm:ss"));
}

function todayKey_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowMinutes_() {
  var d = nowVn_();
  return d.getHours() * 60 + d.getMinutes();
}

/* Ngày nào cũng chỉ nằm trong ĐÚNG MỘT tab (tab của tháng đó), nên chỉ
   cần đọc một tab thay vì quét cả file. */
function bookingsOn_(dateKey) {
  var ss = book_();
  var sh = ss.getSheetByName(tabNameFor_(dateKey)) ||
           ss.getSheetByName(tabNameFor_(dateKey).replace('/', '-'));
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];

  var cIdx = colIndex_();
  var rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  var out = [];
  rows.forEach(function (r) {
    if (String(r[cIdx.type - 1]) !== TYPE_BOOK) return;
    if (String(r[cIdx.date - 1]).trim() !== dateKey) return;
    if (HOLDING.indexOf(String(r[cIdx.status - 1]).trim()) === -1) return;
    var parts = String(r[cIdx.timeText - 1]).split('-');
    var s = hhmmToMin_(parts[0]), e = hhmmToMin_(parts[1]);
    if (isFinite(s) && isFinite(e) && e > s) {
      out.push({ start: minToHhmm_(s), end: minToHhmm_(e) });
    }
  });
  return out;
}

function slotsFor_(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) {
    return { ok: false, error: 'BAD_DATE' };
  }
  return {
    ok: true,
    version: SCRIPT_VERSION,
    date: dateKey,
    busy: bookingsOn_(dateKey),
    openStart: OPEN_START, openEnd: OPEN_END,
    stepMinutes: STEP_MIN, minHours: MIN_HOURS, maxHours: MAX_HOURS,
    leadMinutes: LEAD_MIN
  };
}

/* ============================================================
   GHI LƯỢT ĐẶT
   ============================================================ */

function newCode_() {
  var t = Utilities.formatDate(new Date(), TZ, 'yyMMdd');
  var r = String(Math.floor(Math.random() * 10000));
  while (r.length < 4) r = '0' + r;
  return 'TFD' + t + r;
}

function clean_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim();
  return s.length > (max || 200) ? s.slice(0, max || 200) : s;
}

/* Dấu nháy đơn đầu ô làm Sheets hiểu là chữ; nhưng "=" đầu ô lại thành
   công thức. Khách gõ "=1+1" vào ô ghi chú thì bảng hiện 2 — vô hại,
   nhưng "=IMPORTXML(...)" thì không. Chặn ngay ở đây. */
function safeCell_(v) {
  var s = clean_(v, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function rowFrom_(o) {
  return COLS.map(function (c) { return o[c.key] == null ? '' : o[c.key]; });
}

function appendRow_(sh, values) {
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, COLS.length).setValues([values]);
  /* Ô SĐT phải giữ kiểu chữ ngay cả khi hàng nằm ngoài vùng đã định
     dạng sẵn (bảng dài hơn số hàng mặc định của tab). */
  sh.getRange(r, colIndex_().phone).setNumberFormat('@');
  return r;
}

function saveBooking_(p) {
  var name = clean_(p.name, 120);
  var phone = clean_(p.phone, 24);
  var email = clean_(p.email, 160);
  var date = clean_(p.date, 10);
  var start = clean_(p.start, 5);
  var hours = Number(p.hours);
  var guests = Math.max(1, Math.min(10, Number(p.guests) || 1));

  /* ---- kiểm tra ---- */
  if (!name) return { ok: false, error: 'NO_NAME' };
  if (String(phone).replace(/\D/g, '').length < 9) return { ok: false, error: 'BAD_PHONE' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'BAD_EMAIL' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'BAD_DATE' };
  if (!(hours >= MIN_HOURS && hours <= MAX_HOURS)) return { ok: false, error: 'BAD_HOURS' };

  var s = hhmmToMin_(start);
  var open = hhmmToMin_(OPEN_START), close = hhmmToMin_(OPEN_END);
  var e = s + Math.round(hours * 60);
  if (!isFinite(s)) return { ok: false, error: 'BAD_TIME' };
  if ((s - open) % STEP_MIN !== 0) return { ok: false, error: 'BAD_STEP' };
  if (s < open || e > close) return { ok: false, error: 'OUT_OF_HOURS' };

  /* Không nhận đặt cho ngày đã qua, và ngày hôm nay thì phải trước
     LEAD_MIN phút. Máy khách đã chặn rồi nhưng ai cũng gọi thẳng API
     được — chặn ở server mới là chặn thật. */
  var today = todayKey_();
  if (date < today) return { ok: false, error: 'PAST_DATE' };
  if (date === today && s < nowMinutes_() + LEAD_MIN) return { ok: false, error: 'TOO_SOON' };
  var maxDay = Utilities.formatDate(
    new Date(new Date().getTime() + MAX_DAYS_AHEAD * 86400000), TZ, 'yyyy-MM-dd');
  if (date > maxDay) return { ok: false, error: 'TOO_FAR' };

  /* ---- khoá: chỉ có MỘT buồng lái ----
     Không khoá thì hai người bấm gửi cùng lúc sẽ cùng đọc "giờ còn
     trống" rồi cùng ghi vào — quán nhận hai nhóm khách cho một khung
     giờ và chỉ phát hiện khi họ đã tới nơi. */
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, error: 'BUSY' };
  }

  try {
    var busy = bookingsOn_(date);
    for (var i = 0; i < busy.length; i++) {
      var bs = hhmmToMin_(busy[i].start), be = hhmmToMin_(busy[i].end);
      if (s < be && bs < e) {
        return { ok: false, error: 'SLOT_TAKEN', busy: busy };
      }
    }

    var code = newCode_();
    var sh = sheetFor_(date);
    appendRow_(sh, rowFrom_({
      code: code,
      type: TYPE_BOOK,
      date: date,
      timeText: minToHhmm_(s) + ' - ' + minToHhmm_(e),
      hours: hours,
      name: safeCell_(name),
      phone: "'" + phone,
      email: safeCell_(email),
      guests: guests,
      event: '',
      note: safeCell_(p.note),
      status: ST_NEW,
      source: clean_(p.source, 40) || 'website',
      sentAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss')
    }));

    return {
      ok: true, code: code, date: date,
      timeText: minToHhmm_(s) + ' - ' + minToHhmm_(e),
      hours: hours, tab: sh.getName()
    };
  } finally {
    lock.releaseLock();
  }
}

function saveEvent_(p) {
  var name = clean_(p.name, 120);
  var phone = clean_(p.phone, 24);
  var email = clean_(p.email, 160);
  var guests = Math.max(1, Math.min(50, Number(p.guests) || 1));

  if (!name) return { ok: false, error: 'NO_NAME' };
  if (String(phone).replace(/\D/g, '').length < 9) return { ok: false, error: 'BAD_PHONE' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'BAD_EMAIL' };

  /* Đăng ký sự kiện xếp theo NGÀY SỰ KIỆN nếu có; không có thì theo
     ngày gửi. Cùng một quy tắc với đặt lịch: tab nào là việc của tháng
     nấy. */
  var evDate = /^\d{4}-\d{2}-\d{2}$/.test(clean_(p.eventDate, 10)) ? clean_(p.eventDate, 10) : '';
  var code = newCode_();
  var sh = sheetFor_(evDate || todayKey_());

  appendRow_(sh, rowFrom_({
    code: code,
    type: TYPE_EVENT,
    date: evDate,
    timeText: clean_(p.timeText, 40),
    hours: '',
    name: safeCell_(name),
    phone: "'" + phone,
    email: safeCell_(email),
    guests: guests,
    event: safeCell_(p.event),
    note: safeCell_(p.note),
    status: ST_NEW,
    source: clean_(p.source, 40) || 'website',
    sentAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss')
  }));

  return { ok: true, code: code, tab: sh.getName() };
}

/* ============================================================
   TRA CỨU (khách nhập mã hoặc SĐT)
   ============================================================ */

function lookup_(q) {
  var s = clean_(q, 40).toLowerCase();
  if (s.length < 6) return { ok: false, error: 'TOO_SHORT' };
  var digits = s.replace(/\D/g, '');
  var laSo = /^[\d\s.+()-]+$/.test(s) && digits.length >= 9;

  var cIdx = colIndex_();
  var found = [];
  book_().getSheets().forEach(function (sh) {
    if (!/^\d{1,2}[\/\-]\d{2}$/.test(sh.getName())) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    sh.getRange(2, 1, last - 1, COLS.length).getValues().forEach(function (r) {
      var code = String(r[cIdx.code - 1]).trim().toLowerCase();
      var ph = String(r[cIdx.phone - 1]).replace(/\D/g, '');
      var hit = laSo ? (ph === digits) : (code === s);
      if (!hit) return;
      found.push({
        code: String(r[cIdx.code - 1]).trim(),
        type: String(r[cIdx.type - 1]),
        date: String(r[cIdx.date - 1]).trim(),
        timeText: String(r[cIdx.timeText - 1]).trim(),
        hours: r[cIdx.hours - 1],
        name: String(r[cIdx.name - 1]),
        guests: r[cIdx.guests - 1],
        event: String(r[cIdx.event - 1]),
        status: String(r[cIdx.status - 1]).trim()
      });
    });
  });

  found.sort(function (a, b) {
    return String(a.date + a.timeText).localeCompare(String(b.date + b.timeText));
  });
  return { ok: true, items: found };
}

/* ============================================================
   TỰ KIỂM TRA — chạy hàm này trong trình soạn thảo
   ============================================================
   Ghi 2 dòng thử vào tab của tháng, đọc lại, rồi XÓA đi. Nếu quyền hay
   ID sheet sai thì hàm này báo lỗi ngay thay vì để bạn phát hiện lúc
   khách thật bấm gửi. */
function TEST_tuKiemTra() {
  var log = [];
  function say(s) { log.push(s); Logger.log(s); console.log(s); }

  say('Sheet: ' + book_().getName());
  say('Tab tháng này: ' + tabNameFor_(todayKey_()));

  var d = Utilities.formatDate(new Date(new Date().getTime() + 3 * 86400000), TZ, 'yyyy-MM-dd');
  var r1 = saveBooking_({ name: 'KIỂM TRA — xóa giúp', phone: '0900000000',
    email: 'test@example.com', date: d, start: '09:00', hours: '2', guests: '2',
    note: 'dòng thử của TEST_tuKiemTra' });
  say('Ghi lượt đặt: ' + JSON.stringify(r1));
  if (!r1.ok) throw new Error('Không ghi được lượt đặt: ' + r1.error);

  var r2 = saveBooking_({ name: 'KIỂM TRA trùng giờ', phone: '0900000001',
    date: d, start: '10:00', hours: '1', guests: '1' });
  say('Ghi lượt CHỒNG GIỜ (phải bị từ chối): ' + JSON.stringify(r2));
  if (r2.ok) throw new Error('LỖI: hệ thống nhận hai lượt chồng giờ nhau!');

  var r3 = slotsFor_(d);
  say('Giờ đã kín ngày ' + d + ': ' + JSON.stringify(r3.busy));

  // dọn dòng thử
  var sh = sheetFor_(d);
  var cIdx = colIndex_();
  for (var row = sh.getLastRow(); row >= 2; row--) {
    if (String(sh.getRange(row, cIdx.name).getValue()).indexOf('KIỂM TRA') === 0) {
      sh.deleteRow(row);
    }
  }
  say('✅ Mọi thứ hoạt động. Đã xóa các dòng thử.');
  return log.join('\n');
}
