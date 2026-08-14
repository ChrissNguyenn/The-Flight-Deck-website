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

var SCRIPT_VERSION = 5;

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

/* ============================================================
   GIÁ & THANH TOÁN
   ------------------------------------------------------------
   500.000đ / 1 người / 1 tiếng
   700.000đ / 2 người / 1 tiếng

   Buồng lái có hai ghế, nên NHÓM TỪ 2 NGƯỜI TRỞ LÊN đều tính giá 2
   người (700.000đ/giờ) — người thứ ba trở đi ngồi ngoài xem và thay
   phiên. Nếu quán muốn tính khác (ví dụ cộng thêm cho người thứ 3), sửa
   priceOf_ bên dưới.

   ⚠️ PHẢI KHỚP với PRICING trong config.js — lệch nhau thì khách nhìn
   thấy một giá còn máy chủ ghi vào Sheet một giá khác.
   ============================================================ */
var PRICE_1P = 500000;      // 1 người / 1 tiếng
var PRICE_2P = 700000;      // từ 2 người / 1 tiếng

/* Khách có bằng này phút để chuyển khoản và gửi ảnh qua Zalo. Quá hạn
   thì lượt đó NHẢ CHỖ cho người khác đặt (xem holdsSlot_). */
var PAYMENT_MIN = 45;

/* ============================================================
   MÃ PIN CHO NHÂN VIÊN — trang lich.html
   ------------------------------------------------------------
   PHẢI KHỚP với PIN trong lich.js (hằng số PIN ở đầu file đó).

   ⚠️ HIỂU ĐÚNG MỨC BẢO VỆ CỦA NÓ:
   Chủ quán yêu cầu đặt cứng PIN 20242026 ngay trong trang, nên chuỗi
   này nằm trong mã nguồn mà mọi khách tải về. Nghĩa là PIN chỉ ngăn
   người vô tình bấm nhầm vào trang nhân viên — KHÔNG ngăn được ai chủ
   ý xem mã nguồn rồi gọi thẳng API để lấy danh sách khách (tên, số điện
   thoại, email).

   Muốn khoá thật thì đổi dòng dưới thành một chuỗi dài khó đoán và
   KHÔNG điền nó vào lich.js — nhân viên sẽ phải tự gõ một lần, trang
   nhớ trong máy họ. Lúc đó chuỗi này không xuất hiện ở đâu trong trang.
   ============================================================ */
var ADMIN_KEY = '20242026';

/* ============================================================
   BÁO CÁO LỊCH NGÀY MAI QUA EMAIL
   ============================================================ */
var REPORT_TO = 'theflightdeckcoffee@gmail.com';

/* Ngày mai không có lượt nào thì VẪN GỬI.
   Im lặng khi trống nghĩa là không phân biệt được "mai rảnh" với
   "trigger chết từ tuần trước" — và cái thứ hai chỉ lộ ra khi khách đã
   tới nơi mà không ai biết. */
var REPORT_KHI_TRONG = true;

/* Xem trước lịch tối đa 1 năm. Chặn ở server, không chỉ ở giao diện. */
var MAX_VIEW_DAYS = 365;

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
  { key: 'status',   label: 'Trạng thái',      width: 138 },
  { key: 'source',   label: 'Nguồn',           width: 96 },
  { key: 'sentAt',   label: 'Thời gian gửi',   width: 152 },
  /* Thêm vào CUỐI mảng, không chèn vào giữa — xem chú thích ở trên.
     Các tab đã tạo từ trước sẽ được ensureCols_ nới thêm cột này. */
  { key: 'amount',   label: 'Số tiền (VND)',   width: 118 }
];

var TYPE_BOOK = 'Đặt lịch bay';
var TYPE_EVENT = 'Đăng ký sự kiện';

/* ---------- Trạng thái ----------
   Khách đặt xong là "Chờ thanh toán": lượt đó ĐANG GIỮ CHỖ nhưng chưa
   chắc chắn. Nhân viên đối chiếu ảnh chuyển khoản trên Zalo rồi bấm xác
   nhận trên trang lịch. Quá PAYMENT_MIN phút mà chưa xác nhận thì lượt
   tự nhả chỗ. */
var ST_PENDING = 'Chờ thanh toán';
var ST_OK = 'Đã xác nhận';
var ST_DONE = 'Đã bay';
var ST_CANCEL = 'Đã hủy';
var ST_EXPIRED = 'Quá hạn TT';
var STATUSES = [ST_PENDING, ST_OK, ST_DONE, ST_CANCEL, ST_EXPIRED];

/* Giữ lại tên cũ để các dòng đã ghi bằng bản trước vẫn được hiểu là
   "đang giữ chỗ" thay vì bị coi như đã huỷ. */
var ST_OLD_NEW = 'Mới';

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
    if (p.action === 'bookings') return json_(guard_(p, function () {
      return bookingsBetween_(p.from, p.to);
    }));
    if (p.action === 'search') return json_(guard_(p, function () {
      return searchBookings_(p.q);
    }));
    if (p.action === 'tomorrow') return json_(guard_(p, function () {
      return tomorrowReport_();
    }));
    return json_({
      ok: true,
      version: SCRIPT_VERSION,
      openStart: OPEN_START, openEnd: OPEN_END,
      stepMinutes: STEP_MIN, minHours: MIN_HOURS, maxHours: MAX_HOURS,
      leadMinutes: LEAD_MIN,
      price1: PRICE_1P, price2: PRICE_2P, payMinutes: PAYMENT_MIN,
      maxViewDays: MAX_VIEW_DAYS
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
    if (p.action === 'setStatus') return json_(guard_(p, function () {
      return setStatus_(p.code, p.status);
    }));
    if (p.action === 'adminAdd') return json_(guard_(p, function () {
      return saveBooking_(p);
    }));
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
  sh.getRange(2, cIdx.phone, sh.getMaxRows() - 1, 1).setHorizontalAlignment('center');

  /* Mọi cột chữ đặt kiểu CHỮ THUẦN ngay từ khi tạo tab — xem forceText_
     để biết vì sao. Cột "Số giờ bay" và "Số khách" giữ kiểu số để còn
     cộng/lọc được. */
  textCols_().forEach(function (c) {
    sh.getRange(2, c.n, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });

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
    var data = readRows_(sh);

    /* Chuẩn hoá lại các dòng cũ: những dòng ghi trước khi sửa lỗi đang
       giữ ô "Ngày bay" dưới dạng Date. Ghi thẳng chúng trở lại vào ô đã
       đặt kiểu chữ sẽ ra chuỗi ngày dài loằng ngoằng, nên đổi về
       "yyyy-MM-dd" ngay tại đây. */
    data.forEach(function (r) {
      if (r[cIdx.date - 1] !== '') r[cIdx.date - 1] = dateKeyOf_(r[cIdx.date - 1]);
      r[cIdx.phone - 1] = String(r[cIdx.phone - 1] == null ? '' : r[cIdx.phone - 1]).replace(/^'/, '');
    });

    setupSheet_(sh);
    if (data.length) sh.getRange(2, 1, data.length, COLS.length).setValues(data);
  });
  return 'Đã định dạng lại ' + ss.getSheets().length + ' tab.';
}

/* ============================================================
   ĐỌC LỊCH ĐÃ ĐẶT
   ============================================================ */

/* Đọc các dòng dữ liệu, chịu được tab tạo bằng bản Code.gs CŨ.
   setupSheet_ xoá sạch cột thừa khi tạo tab, nên tab cũ có đúng 14 cột
   thật. Gọi getRange(..., 15) trên đó là ném lỗi và cả trang lịch trắng
   xoá. Đọc theo số cột đang có rồi đệm cho đủ thì tab cũ vẫn dùng được
   ngay, không phải chạy lệnh sửa nào trước. */
function readRows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var w = Math.min(COLS.length, sh.getMaxColumns());
  var rows = sh.getRange(2, 1, last - 1, w).getValues();
  if (w < COLS.length) {
    rows.forEach(function (r) { while (r.length < COLS.length) r.push(''); });
  }
  return rows;
}

/* Nới tab cũ cho đủ số cột hiện tại. Chỉ ghi lại HÀNG TIÊU ĐỀ và định
   dạng phần cột mới — không đụng tới dữ liệu đã có. */
function ensureCols_(sh) {
  var n = COLS.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  var head = sh.getRange(1, 1, 1, n).getValues()[0];
  var thieu = false;
  for (var i = 0; i < n; i++) {
    if (String(head[i]).trim() !== COLS[i].label) { thieu = true; break; }
  }
  if (!thieu) return sh;

  sh.getRange(1, 1, 1, n).setValues([COLS.map(function (c) { return c.label; })])
    .setBackground(C_HEADER_BG).setFontColor(C_HEADER_FG)
    .setFontFamily('Arial').setFontSize(11).setFontWeight('bold')
    .setVerticalAlignment('middle').setHorizontalAlignment('center').setWrap(true);
  COLS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.width); });
  textCols_().forEach(function (c) {
    sh.getRange(2, c.n, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@');
  });
  return sh;
}

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

/* Đưa mọi thứ đọc lên từ ô "Ngày bay" về dạng "yyyy-MM-dd".
   Từ nay forceText_ giữ ô này là chữ, nhưng các dòng ĐÃ GHI TRƯỚC khi
   sửa lỗi đang nằm trong sheet dưới dạng Date — và chị chủ cũng có thể
   gõ tay "16/08/2026" vào một ô. Đọc phòng thủ thì cả ba trường hợp đều
   ra cùng một kết quả, không phải đi sửa dữ liệu cũ. */
function dateKeyOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);          // 16/08/2026
  if (m) return m[3] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[1]);
  /* Chuỗi kiểu "Sun Aug 16 2026 00:00:00 GMT+0700" — thứ mà String(Date)
     sinh ra khi Sheets đã đổi kiểu ô. */
  var d = new Date(s);
  if (s && !isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  return s;
}

/* Lấy hai mốc giờ từ ô "Thời gian bay". Nhận cả "09:00 - 11:00" lẫn
   trường hợp ô bị đổi thành giá trị giờ. */
function rangeOf_(v) {
  if (v instanceof Date) return null;
  var m = String(v == null ? '' : v).match(/(\d{1,2}):(\d{2})/g);
  if (!m || m.length < 2) return null;
  var s = hhmmToMin_(m[0]), e = hhmmToMin_(m[1]);
  if (!isFinite(s) || !isFinite(e) || e <= s) return null;
  return { start: minToHhmm_(s), end: minToHhmm_(e) };
}

function todayKey_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/* ---------- GIÁ ----------
   Một buồng lái, hai ghế: từ 2 khách trở lên tính chung giá 2 người. */
function priceOf_(guests, hours) {
  var g = Math.max(1, Number(guests) || 1);
  var h = Math.max(0, Number(hours) || 0);
  return Math.round((g <= 1 ? PRICE_1P : PRICE_2P) * h);
}

/* Đọc ô "Thời gian gửi" (dd/MM/yyyy HH:mm:ss, giờ Việt Nam) ra mốc ms.
   Ô này có thể là chuỗi hoặc — với dòng ghi bằng bản cũ — là Date. */
function sentAtMs_(v) {
  if (v instanceof Date) return v.getTime();
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v || '').trim());
  if (!m) return NaN;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)) - 7 * 3600000;
}

/* Dòng này còn GIỮ CHỖ trong buồng lái không?
   ------------------------------------------------------------
   "Chờ thanh toán" có giữ chỗ — khách đang đi chuyển khoản, không thể
   để người khác cướp mất trong lúc đó. Nhưng chỉ giữ trong PAYMENT_MIN
   phút: không có hạn thì một người bấm đặt rồi biến mất sẽ khoá khung
   giờ đó vĩnh viễn.

   Hạn được TÍNH LẠI mỗi lần đọc chứ không ghi vào Sheet. Ghi vào thì
   phải có trigger chạy nền để dọn, mà trigger hỏng lặng lẽ là chuyện
   thường — lúc đó lịch nói một đằng, thực tế một nẻo. */
function holdsSlot_(r, cIdx, nowMs) {
  var st = String(r[cIdx.status - 1]).trim();
  if (st === ST_OK || st === ST_DONE) return true;
  if (st !== ST_PENDING && st !== ST_OLD_NEW) return false;   // đã huỷ / quá hạn

  var t = sentAtMs_(r[cIdx.sentAt - 1]);
  if (!isFinite(t)) return true;        // không đọc được giờ gửi thì cứ giữ, an toàn hơn
  return (nowMs - t) < PAYMENT_MIN * 60000;
}

/* Trạng thái để HIỂN THỊ: giống trong Sheet, nhưng "Chờ thanh toán" đã
   quá hạn thì hiện là quá hạn cho khớp với việc nó đã nhả chỗ. */
function shownStatus_(r, cIdx, nowMs) {
  var st = String(r[cIdx.status - 1]).trim();
  if (st === ST_OLD_NEW) st = ST_PENDING;
  if (st === ST_PENDING && !holdsSlot_(r, cIdx, nowMs)) return ST_EXPIRED;
  return st;
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
  var rows = readRows_(sh);
  var nowMs = Date.now();
  var out = [];
  rows.forEach(function (r) {
    if (String(r[cIdx.type - 1]).trim() !== TYPE_BOOK) return;
    if (dateKeyOf_(r[cIdx.date - 1]) !== dateKey) return;
    if (!holdsSlot_(r, cIdx, nowMs)) return;
    var rg = rangeOf_(r[cIdx.timeText - 1]);
    if (rg) out.push(rg);
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
    leadMinutes: LEAD_MIN,
    price1: PRICE_1P, price2: PRICE_2P, payMinutes: PAYMENT_MIN
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

function safeCell_(v) {
  return clean_(v, 500);
}

function rowFrom_(o) {
  return COLS.map(function (c) { return o[c.key] == null ? '' : o[c.key]; });
}

/* Cột nào phải là CHỮ THUẦN. Chỉ 'hours' và 'guests' là số thật. */
function textCols_() {
  return COLS.map(function (c, i) { return { key: c.key, n: i + 1 }; })
    .filter(function (c) { return c.key !== 'hours' && c.key !== 'guests'; });
}

/* Ép kiểu chữ cho MỘT HÀNG trước khi ghi.
   ------------------------------------------------------------
   Google Sheets tự nhận dạng chuỗi trông giống ngày/giờ/số và đổi kiểu
   luôn. "2026-08-16" ghi vào rồi đọc ra thành đối tượng Date, so sánh
   với chuỗi ngày là trượt — hệ quả: bộ lọc "lượt trong ngày này" không
   khớp dòng nào, và hệ thống nhận HAI KHÁCH CHO CÙNG MỘT KHUNG GIỜ.
   Đây là lỗi thật đã xảy ra trên file Sheet của quán.
   Cùng cơ chế đó cũng ăn mất số 0 đầu số điện thoại và biến "=..." ở ô
   ghi chú thành công thức chạy được.
   Định dạng phải đặt TRƯỚC setValues — đặt sau thì giá trị đã bị đổi
   kiểu mất rồi, chỉ còn đổi cách hiển thị. */
function forceText_(sh, row) {
  textCols_().forEach(function (c) {
    sh.getRange(row, c.n).setNumberFormat('@');
  });
}

function appendRow_(sh, values) {
  ensureCols_(sh);
  var r = sh.getLastRow() + 1;
  forceText_(sh, r);
  sh.getRange(r, 1, 1, COLS.length).setValues([values]);
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
    var tien = priceOf_(guests, hours);
    var sh = sheetFor_(date);
    appendRow_(sh, rowFrom_({
      code: code,
      type: TYPE_BOOK,
      date: date,
      timeText: minToHhmm_(s) + ' - ' + minToHhmm_(e),
      hours: hours,
      name: safeCell_(name),
      phone: phone,
      email: safeCell_(email),
      guests: guests,
      event: '',
      note: safeCell_(p.note),
      status: ST_PENDING,
      source: clean_(p.source, 40) || 'website',
      sentAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'),
      amount: tien
    }));

    /* Trả luôn số tiền và nội dung chuyển khoản để trang khách khỏi phải
       tự tính lại. Máy khách tính lại = hai công thức giá ở hai nơi, và
       sớm muộn chúng lệch nhau. */
    return {
      ok: true, code: code, date: date,
      timeText: minToHhmm_(s) + ' - ' + minToHhmm_(e),
      hours: hours, guests: guests, tab: sh.getName(),
      amount: tien,
      status: ST_PENDING,
      payMinutes: PAYMENT_MIN,
      transferNote: 'TFD ' + code
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
    phone: phone,
    email: safeCell_(email),
    guests: guests,
    event: safeCell_(p.event),
    note: safeCell_(p.note),
    status: ST_PENDING,
    source: clean_(p.source, 40) || 'website',
    sentAt: Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss')
  }));

  return { ok: true, code: code, tab: sh.getName() };
}

/* ============================================================
   TRANG LỊCH CỦA QUẢN LÝ
   ============================================================ */

/* Chặn cửa cho các lệnh chỉ quản lý được dùng. Xem chú thích ở ADMIN_KEY
   để biết mức bảo vệ này tới đâu. */
function guard_(p, fn) {
  if (String(p.key || '') !== ADMIN_KEY) return { ok: false, error: 'BAD_KEY' };
  return fn();
}

/* Tên các tab tháng phủ khoảng [from, to].
   Xem tháng thì khung hiển thị thường tràn sang tháng trước và tháng sau
   (ô ngày 27/7 nằm ở đầu lưới tháng 8), nên phải gom nhiều tab chứ không
   chỉ tab của tháng đang xem. */
function tabNamesBetween_(from, to) {
  var a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
  var out = [], y = a.getUTCFullYear(), m = a.getUTCMonth();
  var yEnd = b.getUTCFullYear(), mEnd = b.getUTCMonth();
  var guard = 0;
  while ((y < yEnd || (y === yEnd && m <= mEnd)) && guard++ < 40) {
    out.push((m + 1) + '/' + String(y).slice(2));
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

/* Đọc mọi lượt đặt trong khoảng ngày, kèm mọi thông tin trang lịch cần.
   Trả cả lượt ĐÃ HỦY — quản lý cần nhìn thấy chúng; việc ẩn/hiện để
   giao diện quyết định. */
function bookingsBetween_(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ''))) {
    return { ok: false, error: 'BAD_RANGE' };
  }
  if (to < from) { var t = from; from = to; to = t; }

  /* Chặn xem xa hơn 1 năm NGAY Ở SERVER, không chỉ ở giao diện.
     Giao diện có nút mờ đi thì vẫn có người sửa URL gọi thẳng API — và
     một khoảng ngày dài vô hạn buộc script quét mọi tab trong file. */
  var chotXa = Utilities.formatDate(
    new Date(new Date().getTime() + MAX_VIEW_DAYS * 86400000), TZ, 'yyyy-MM-dd');
  if (from > chotXa) return { ok: false, error: 'TOO_FAR_VIEW', maxDate: chotXa };
  if (to > chotXa) to = chotXa;

  var ss = book_();
  var cIdx = colIndex_();
  var nowMs = Date.now();
  var items = [];

  tabNamesBetween_(from, to).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.getSheetByName(name.replace('/', '-'));
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < 2) return;

    readRows_(sh).forEach(function (r, i) {
      var date = dateKeyOf_(r[cIdx.date - 1]);
      if (!date || date < from || date > to) return;
      var rg = rangeOf_(r[cIdx.timeText - 1]);
      items.push({
        row: i + 2,
        tab: sh.getName(),
        code: String(r[cIdx.code - 1]).trim(),
        type: String(r[cIdx.type - 1]).trim(),
        date: date,
        start: rg ? rg.start : '',
        end: rg ? rg.end : '',
        timeText: String(r[cIdx.timeText - 1] || '').trim(),
        hours: r[cIdx.hours - 1],
        name: String(r[cIdx.name - 1] || ''),
        phone: String(r[cIdx.phone - 1] || '').replace(/^'/, ''),
        email: String(r[cIdx.email - 1] || ''),
        guests: r[cIdx.guests - 1],
        event: String(r[cIdx.event - 1] || ''),
        note: String(r[cIdx.note - 1] || ''),
        status: shownStatus_(r, cIdx, nowMs),
        rawStatus: String(r[cIdx.status - 1] || '').trim(),
        holds: holdsSlot_(r, cIdx, nowMs),
        amount: Number(r[cIdx.amount - 1]) || 0,
        source: String(r[cIdx.source - 1] || ''),
        sentAt: String(r[cIdx.sentAt - 1] || '')
      });
    });
  });

  items.sort(function (a, b) {
    return (a.date + a.start).localeCompare(b.date + b.start);
  });

  return {
    ok: true, version: SCRIPT_VERSION, from: from, to: to,
    today: todayKey_(), now: Utilities.formatDate(new Date(), TZ, 'HH:mm'),
    openStart: OPEN_START, openEnd: OPEN_END,
    statuses: STATUSES,
    items: items
  };
}

/* Đổi trạng thái một lượt. Tìm theo MÃ chứ không theo số dòng: quản lý
   có thể chèn/xoá dòng ngay trong Sheet giữa lúc trang lịch đang mở, lúc
   đó số dòng cũ trỏ sang khách khác — và lệnh "hủy" sẽ hủy nhầm người. */
function setStatus_(code, status) {
  code = clean_(code, 32);
  status = clean_(status, 32);
  if (!code) return { ok: false, error: 'NO_CODE' };
  if (STATUSES.indexOf(status) === -1) return { ok: false, error: 'BAD_STATUS' };

  var ss = book_();
  var cIdx = colIndex_();
  var found = null;

  ss.getSheets().forEach(function (sh) {
    if (found) return;
    if (!/^\d{1,2}[\/\-]\d{2}$/.test(sh.getName())) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    var codes = sh.getRange(2, cIdx.code, last - 1, 1).getValues();
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0]).trim() === code) { found = { sh: sh, row: i + 2 }; return; }
    }
  });

  if (!found) return { ok: false, error: 'NOT_FOUND' };
  found.sh.getRange(found.row, cIdx.status).setValue(status);
  return { ok: true, code: code, status: status, tab: found.sh.getName() };
}

/* ============================================================
   TÌM KIẾM CHO NHÂN VIÊN
   ------------------------------------------------------------
   Khác lookup_ dành cho khách: bên kia khớp TUYỆT ĐỐI (gõ "09" mà ra
   danh sách thì ai cũng duyệt được toàn bộ khách). Bên này là nhân viên
   đã qua cửa PIN, họ cần gõ vài chữ trong tên là ra — nên khớp MỘT PHẦN
   theo tên, và theo chuỗi số trong số điện thoại.
   ============================================================ */
function searchBookings_(q) {
  var s = clean_(q, 60).toLowerCase().trim();
  if (s.length < 2) return { ok: false, error: 'TOO_SHORT' };

  var soChiSo = s.replace(/\D/g, '');
  /* Chỉ đem chuỗi số đi khớp SĐT khi người ta ĐANG GÕ SỐ. Bóc số ra
     khỏi mọi chuỗi rồi khớp thì gõ tên "Vũ 3" cũng lôi về mọi SĐT có
     số 3 — đúng cái bẫy đã gặp ở trang tra cứu trước đây. */
  var laSo = /^[\d\s.+()-]+$/.test(s) && soChiSo.length >= 3;

  var ss = book_();
  var cIdx = colIndex_();
  var nowMs = Date.now();
  var found = [];

  ss.getSheets().forEach(function (sh) {
    if (!/^\d{1,2}[\/\-]\d{2}$/.test(sh.getName())) return;
    readRows_(sh).forEach(function (r) {
      var ten = String(r[cIdx.name - 1] || '').toLowerCase();
      var ph = String(r[cIdx.phone - 1] || '').replace(/\D/g, '');
      var ma = String(r[cIdx.code - 1] || '').toLowerCase();

      var hit = laSo
        ? (ph.indexOf(soChiSo) !== -1)
        : (ten.indexOf(s) !== -1 || ma.indexOf(s) !== -1);
      if (!hit) return;

      var rg = rangeOf_(r[cIdx.timeText - 1]);
      found.push({
        code: String(r[cIdx.code - 1]).trim(),
        tab: sh.getName(),
        type: String(r[cIdx.type - 1]).trim(),
        date: dateKeyOf_(r[cIdx.date - 1]),
        start: rg ? rg.start : '',
        end: rg ? rg.end : '',
        timeText: String(r[cIdx.timeText - 1] || '').trim(),
        hours: r[cIdx.hours - 1],
        name: String(r[cIdx.name - 1] || ''),
        phone: String(r[cIdx.phone - 1] || '').replace(/^'/, ''),
        email: String(r[cIdx.email - 1] || ''),
        guests: r[cIdx.guests - 1],
        note: String(r[cIdx.note - 1] || ''),
        event: String(r[cIdx.event - 1] || ''),
        amount: Number(r[cIdx.amount - 1]) || 0,
        source: String(r[cIdx.source - 1] || ''),
        sentAt: String(r[cIdx.sentAt - 1] || ''),
        status: shownStatus_(r, cIdx, nowMs),
        holds: holdsSlot_(r, cIdx, nowMs)
      });
    });
  });

  /* Lượt SẮP TỚI xếp lên trước — nhân viên tìm khách hầu như luôn là để
     xử lý chuyến sắp bay, không phải chuyến năm ngoái. */
  var hnay = todayKey_();
  found.sort(function (a, b) {
    var aTuong = a.date >= hnay, bTuong = b.date >= hnay;
    if (aTuong !== bTuong) return aTuong ? -1 : 1;
    if (aTuong) return (a.date + a.start).localeCompare(b.date + b.start);
    return (b.date + b.start).localeCompare(a.date + a.start);
  });

  return { ok: true, q: s, today: hnay, items: found.slice(0, 60), total: found.length };
}

/* ============================================================
   LỊCH NGÀY MAI
   ============================================================ */

function tomorrowKey_() {
  return Utilities.formatDate(new Date(new Date().getTime() + 86400000), TZ, 'yyyy-MM-dd');
}

/* Danh sách lượt bay ngày mai, đã bỏ những lượt không còn giữ chỗ. */
function tomorrowReport_() {
  var d = tomorrowKey_();
  var all = bookingsBetween_(d, d);
  if (!all.ok) return all;
  var items = all.items.filter(function (it) {
    return it.type === TYPE_BOOK && it.holds;
  });
  var tongTien = 0, tongGio = 0;
  items.forEach(function (it) {
    tongTien += Number(it.amount) || 0;
    tongGio += Number(it.hours) || 0;
  });
  return {
    ok: true, date: d, today: todayKey_(),
    count: items.length, totalAmount: tongTien, totalHours: tongGio,
    items: items
  };
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
  var nowMs = Date.now();
  var found = [];
  book_().getSheets().forEach(function (sh) {
    if (!/^\d{1,2}[\/\-]\d{2}$/.test(sh.getName())) return;
    var last = sh.getLastRow();
    if (last < 2) return;
    readRows_(sh).forEach(function (r) {
      var code = String(r[cIdx.code - 1]).trim().toLowerCase();
      var ph = String(r[cIdx.phone - 1]).replace(/\D/g, '');
      var hit = laSo ? (ph === digits) : (code === s);
      if (!hit) return;
      found.push({
        code: String(r[cIdx.code - 1]).trim(),
        type: String(r[cIdx.type - 1]),
        date: dateKeyOf_(r[cIdx.date - 1]),
        timeText: String(r[cIdx.timeText - 1]).trim(),
        hours: r[cIdx.hours - 1],
        name: String(r[cIdx.name - 1]),
        guests: r[cIdx.guests - 1],
        event: String(r[cIdx.event - 1]),
        amount: Number(r[cIdx.amount - 1]) || 0,
        status: shownStatus_(r, cIdx, nowMs)
      });
    });
  });

  found.sort(function (a, b) {
    return String(a.date + a.timeText).localeCompare(String(b.date + b.timeText));
  });
  return { ok: true, items: found };
}

/* ============================================================
   EMAIL BÁO CÁO LỊCH NGÀY MAI — chạy tự động 21:00 mỗi tối
   ------------------------------------------------------------
   Đặt lịch chạy: mở trình soạn thảo, chọn hàm TAO_LICH_GUI_21H rồi bấm
   Chạy MỘT LẦN. Hàm đó tự tạo trigger giúp bạn, không phải bấm tay
   trong menu Trigger. Muốn kiểm tra nội dung thư thì chạy
   TEST_guiBaoCaoNgay — nó gửi ngay lập tức.
   ============================================================ */

function fmtVnd_(n) {
  n = Math.round(Number(n) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

function ddmm_(dateKey) {
  var p = String(dateKey || '').split('-');
  return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : dateKey;
}

var DOW_VN_ = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function thuCua_(dateKey) {
  var d = new Date(dateKey + 'T00:00:00Z');
  return DOW_VN_[d.getUTCDay()];
}

/* HÀM ĐƯỢC TRIGGER GỌI. Đừng đổi tên — đổi thì trigger cũ trỏ vào hư
   không và im lặng không chạy nữa. */
function guiBaoCaoNgayMai() {
  var r = tomorrowReport_();
  if (!r.ok) throw new Error('Không đọc được lịch ngày mai: ' + r.error);

  if (!r.count && !REPORT_KHI_TRONG) return 'Ngày mai trống, không gửi (REPORT_KHI_TRONG = false).';

  var ngay = ddmm_(r.date);
  var subject = '[TFD] Lịch bay ngày mai ' + ngay + ' — ' +
    (r.count ? r.count + ' lượt' : 'không có lượt nào');

  var head = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1B2531;' +
    'max-width:640px;margin:0 auto">' +
    '<div style="background:#0D2440;color:#F8F5EE;padding:22px 24px;border-radius:12px 12px 0 0">' +
      '<div style="font-size:11px;letter-spacing:2px;color:#9CC4E4">THE FLIGHT DECK</div>' +
      '<div style="font-size:22px;margin-top:4px">Lịch bay ngày mai</div>' +
      '<div style="font-size:14px;color:#DFC98F;margin-top:2px">' +
        thuCua_(r.date) + ', ' + ngay + '</div>' +
    '</div>' +
    '<div style="border:1px solid #D5CEBE;border-top:0;border-radius:0 0 12px 12px;' +
    'padding:22px 24px;background:#F8F5EE">';

  var body;
  if (!r.count) {
    body = '<p style="margin:0;font-size:15px">Ngày mai <strong>không có lượt bay nào</strong> ' +
      'được đặt trước.</p>' +
      '<p style="margin:14px 0 0;font-size:13px;color:#5E6D7E">' +
      'Thư này vẫn được gửi mỗi tối để bạn biết hệ thống còn chạy. ' +
      'Không nhận được thư nghĩa là có gì đó hỏng, không phải là mai rảnh.</p>';
  } else {
    var rows = r.items.map(function (it, i) {
      var nen = (i % 2) ? '#EDF3F8' : '#FFFFFF';
      return '<tr style="background:' + nen + '">' +
        '<td style="padding:10px 12px;border-bottom:1px solid #E7E0D0;font-weight:bold;' +
          'font-family:monospace;font-size:15px;white-space:nowrap">' +
          escHtml2_(it.start + ' – ' + it.end) + '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #E7E0D0">' +
          '<strong>' + escHtml2_(it.name) + '</strong><br>' +
          '<span style="color:#5E6D7E;font-size:13px">' + escHtml2_(it.phone || 'chưa có SĐT') + '</span>' +
        '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #E7E0D0;text-align:center;white-space:nowrap">' +
          escHtml2_(it.hours || '?') + ' tiếng<br>' +
          '<span style="color:#5E6D7E;font-size:13px">' + escHtml2_(it.guests || 1) + ' khách</span>' +
        '</td>' +
        '<td style="padding:10px 12px;border-bottom:1px solid #E7E0D0;text-align:right;white-space:nowrap">' +
          fmtVnd_(it.amount) + '<br>' +
          '<span style="font-size:12px;color:' +
            (it.status === ST_OK ? '#2E7D5B' : '#A8752A') + '">' +
            escHtml2_(it.status) + '</span>' +
        '</td></tr>';
    }).join('');

    body =
      '<p style="margin:0 0 16px;font-size:15px">Ngày mai có <strong>' + r.count +
        ' lượt bay</strong>, tổng <strong>' + r.totalHours + ' tiếng</strong>, ' +
        'doanh thu dự kiến <strong>' + fmtVnd_(r.totalAmount) + '</strong>.</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;' +
        'border:1px solid #D5CEBE;border-radius:8px;overflow:hidden">' +
        '<tr style="background:#0D2440;color:#F8F5EE;font-size:11px;letter-spacing:1px">' +
          '<th style="padding:9px 12px;text-align:left">GIỜ BAY</th>' +
          '<th style="padding:9px 12px;text-align:left">KHÁCH</th>' +
          '<th style="padding:9px 12px;text-align:center">THỜI LƯỢNG</th>' +
          '<th style="padding:9px 12px;text-align:right">SỐ TIỀN</th>' +
        '</tr>' + rows +
      '</table>';

    var choTT = r.items.filter(function (it) { return it.status === ST_PENDING; });
    if (choTT.length) {
      body += '<p style="margin:16px 0 0;padding:11px 14px;background:#FDF6E9;' +
        'border:1px solid #EBD9B4;border-radius:6px;font-size:14px;color:#A8752A">' +
        '⚠️ Còn <strong>' + choTT.length + ' lượt chưa xác nhận thanh toán</strong>: ' +
        escHtml2_(choTT.map(function (x) { return x.name; }).join(', ')) +
        '. Kiểm tra Zalo rồi xác nhận trên trang lịch giúp nhé.</p>';
    }
  }

  var foot = '<p style="margin:20px 0 0;font-size:12px;color:#5E6D7E;' +
    'border-top:1px solid #E7E0D0;padding-top:14px">' +
    'Thư tự động gửi lúc 21:00 mỗi tối · The Flight Deck · 86 Đặng Văn Ngữ, Phú Nhuận' +
    '</p></div></div>';

  /* MailApp chứ không GmailApp: MailApp chỉ cần quyền gửi thư
     (script.send_mail), GmailApp đòi quyền đọc TOÀN BỘ hộp thư. Xin
     quyền rộng hơn mức cần là thói quen tồi, và ở dự án này nó từng làm
     email im lặng không gửi được vì thiếu quyền. */
  MailApp.sendEmail({
    to: REPORT_TO,
    subject: subject,
    htmlBody: head + body + foot,
    name: 'The Flight Deck'
  });

  var kq = 'Đã gửi báo cáo ' + ngay + ' tới ' + REPORT_TO + ' (' + r.count + ' lượt).';
  Logger.log(kq); console.log(kq);
  return kq;
}

function escHtml2_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------
   TẠO LỊCH CHẠY TỰ ĐỘNG — chạy hàm này MỘT LẦN trong trình soạn thảo
   ------------------------------------------------------------
   Tự xoá trigger cũ của cùng hàm trước khi tạo mới, nên bấm Chạy nhiều
   lần cũng không sinh ra 5 cái trigger gửi 5 email mỗi tối.

   ⚠️ Google chạy trigger theo giờ trong một KHUNG chứ không đúng phút:
   đặt 21:00 thì thư thường tới trong khoảng 21:00–21:15, thỉnh thoảng
   trễ hơn. Đây là giới hạn của Apps Script, không sửa được bằng code.
   ------------------------------------------------------------ */
function TAO_LICH_GUI_21H() {
  var da = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guiBaoCaoNgayMai') {
      ScriptApp.deleteTrigger(t); da++;
    }
  });

  ScriptApp.newTrigger('guiBaoCaoNgayMai')
    .timeBased()
    .atHour(21)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone(TZ)
    .create();

  var kq = 'Đã đặt lịch gửi báo cáo lúc 21:00 mỗi tối (giờ Việt Nam)' +
    (da ? ' — đã xoá ' + da + ' lịch cũ trùng.' : '.') +
    ' Thư gửi tới: ' + REPORT_TO;
  Logger.log(kq); console.log(kq);
  return kq;
}

/* Xoá lịch tự động (nếu muốn tắt) */
function XOA_LICH_GUI() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'guiBaoCaoNgayMai') { ScriptApp.deleteTrigger(t); n++; }
  });
  var kq = 'Đã xoá ' + n + ' lịch gửi báo cáo.';
  Logger.log(kq); console.log(kq);
  return kq;
}

/* Gửi thử NGAY để xem nội dung thư, không phải chờ tới 21:00 */
function TEST_guiBaoCaoNgay() {
  return guiBaoCaoNgayMai();
}

/* Xem đang có lịch tự động nào */
function XEM_LICH_DANG_CO() {
  var ds = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction() + ' (' + t.getEventType() + ')';
  });
  var kq = ds.length ? ds.join('\n') : 'Chưa có lịch tự động nào.';
  Logger.log(kq); console.log(kq);
  return kq;
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

  /* Dọn TRƯỚC và dọn lại trong finally.
     Bản đầu chỉ dọn ở cuối hàm, nên khi phép thử thất bại và ném lỗi thì
     hai dòng KIỂM TRA nằm lại trong sheet của quán — vừa bẩn bảng, vừa
     chiếm mất khung giờ thật. */
  donDongThu_(d, say);
  try {
    var r1 = saveBooking_({ name: 'KIỂM TRA — xóa giúp', phone: '0900000000',
      email: 'test@example.com', date: d, start: '09:00', hours: '2', guests: '2',
      note: 'dòng thử của TEST_tuKiemTra' });
    say('Ghi lượt đặt: ' + JSON.stringify(r1));
    if (!r1.ok) throw new Error('Không ghi được lượt đặt: ' + r1.error);

    /* Kiểm ngay việc ĐỌC LẠI, vì đây chính là chỗ từng hỏng: ghi thì
       được nhưng đọc lên không khớp ngày nên chống chồng giờ tê liệt. */
    var busy = bookingsOn_(d);
    say('Đọc lại lịch ngày ' + d + ': ' + JSON.stringify(busy));
    if (!busy.length) {
      throw new Error('LỖI: vừa ghi xong mà đọc lại không thấy lượt nào — ' +
        'nhiều khả năng ô "Ngày bay" bị Sheets đổi sang kiểu ngày. ' +
        'Hãy chắc chắn bạn đã dán bản Code.gs mới nhất và Triển khai phiên bản mới.');
    }

    var r2 = saveBooking_({ name: 'KIỂM TRA trùng giờ', phone: '0900000001',
      date: d, start: '10:00', hours: '1', guests: '1' });
    say('Ghi lượt CHỒNG GIỜ (phải bị từ chối): ' + JSON.stringify(r2));
    if (r2.ok) throw new Error('LỖI: hệ thống nhận hai lượt chồng giờ nhau!');

    say('Giờ đã kín ngày ' + d + ': ' + JSON.stringify(slotsFor_(d).busy));
    say('✅ Mọi thứ hoạt động.');
  } finally {
    donDongThu_(d, say);
  }
  return log.join('\n');
}

/* Xoá mọi dòng có tên bắt đầu bằng "KIỂM TRA" trong tab của ngày đó. */
function donDongThu_(dateKey, say) {
  var ss = book_();
  var sh = ss.getSheetByName(tabNameFor_(dateKey)) ||
           ss.getSheetByName(tabNameFor_(dateKey).replace('/', '-'));
  if (!sh || sh.getLastRow() < 2) return;
  var cIdx = colIndex_();
  var names = sh.getRange(2, cIdx.name, sh.getLastRow() - 1, 1).getValues();
  var xoa = 0;
  for (var i = names.length - 1; i >= 0; i--) {
    if (String(names[i][0]).indexOf('KIỂM TRA') === 0) { sh.deleteRow(i + 2); xoa++; }
  }
  if (xoa && say) say('Đã xoá ' + xoa + ' dòng thử.');
}
