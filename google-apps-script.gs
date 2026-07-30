/** ============================================================
 * The Flight Deck × Hobby Horizon 2026 — backend hàng chờ
 * ============================================================
 * CÁCH CÀI ĐẶT (5 phút, xem thêm README.md):
 *  1. Vào https://sheets.new để tạo Google Sheet mới,
 *     đặt tên ví dụ "TFD - Flight Experience Registrations".
 *  2. Menu Extensions (Tiện ích mở rộng) → Apps Script.
 *  3. Xóa code mẫu, dán TOÀN BỘ file này vào, bấm Save.
 *  4. Bấm Deploy → New deployment → chọn loại "Web app":
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     → Deploy → Authorize (cho phép quyền) → copy "Web app URL".
 *  5. Mở file config.js của website, dán URL đó vào SCRIPT_URL.
 * Sheet "Registrations" sẽ tự được tạo khi có đăng ký đầu tiên.
 * ============================================================ */

/* ============================================================
   TÊN CÁC TAB (sheet) BÊN TRONG FILE GOOGLE SHEET
   ------------------------------------------------------------
   Script này chạy TRONG file Google Sheet mà bạn dán nó vào
   (SpreadsheetApp.getActiveSpreadsheet). Dán vào file "hobby horizon"
   thì mọi tab dưới đây sẽ được tạo trong chính file đó.

   Tab nào chưa có sẽ được TỰ TẠO ở lần chạy đầu tiên — không cần tạo tay.

   Tên có tiền tố "Jun Pham" để không đụng các tab sẵn có trong file
   "hobby horizon" (một file dùng chung rất dễ đã có tab tên "Payments"
   hay "Log" — trùng tên là ghi đè lên dữ liệu cũ của bạn).
   ============================================================ */
var SHEET_NAME = 'Jun Pham';               // đăng ký lượt bay (tab chính)
var LOG_SHEET_NAME = 'Jun Pham log';       // nhật ký lỗi (email hỏng…)

/* Số phiên bản của FILE NÀY. Website đọc giá trị này để biết bản Apps
   Script đang chạy có mới không.
   ⚠️ TĂNG SỐ NÀY mỗi lần sửa file rồi deploy lại — nhờ nó mà lỗi "đã sửa
   code rồi mà chạy vẫn như cũ" (do quên bấm Deploy) hiện ra ngay thay vì
   phải mò. */
var SCRIPT_VERSION = 3;
/* Thứ tự cột trong sheet — các cột đầu là thông tin khách (tiếng Việt),
   các cột sau để hệ thống hàng chờ vận hành. HEADERS là khóa nội bộ
   (khớp JSON trả về website), HEADER_LABELS là tiêu đề hiển thị.
   SĐT dùng cho nút "📞 Gọi" trên trang quản lý (bấm là tự quay số).

   THÊM CỘT MỚI: cứ nối vào CUỐI hai mảng này (cùng thứ tự). Sheet cũ sẽ
   tự được migrate_() nâng cấp ở lần chạy kế tiếp, dữ liệu cũ giữ nguyên,
   cột mới để trống. Không được đổi thứ tự cột cũ. */
var HEADERS = [
  'name', 'phone', 'email', 'createdAt', 'eta', 'status', 'groupSize',
  'calledAt', 'sessionStart', 'updatedAt', 'id',
  /* --- thanh toán --- */
  'payMethod', 'amount', 'payRef', 'approvedAt',
  /* --- lịch bay đã chốt khi duyệt --- */
  'flightDate', 'seq',
  /* Slot 15 phút khách tự chọn, dạng 'YYYY-MM-DDTHH:MM' (giờ VN).
     Đây là KHOÁ TRA CỨU chính cho giao diện 3 trạng thái. */
  'slotKey',
  /* --- ghép đôi & email --- */
  'pairState', 'pairWith', 'emailStage',
  /* Giờ bay ĐÃ BÁO trong email gần nhất + số lần đã gửi lịch.
     Dùng để phát hiện "giờ đã báo cho khách nay đã đổi" (bạn bay chung hủy
     → xếp lại lịch) và gửi email cập nhật; mailSeq đi vào SEQUENCE của file
     .ics để lịch cũ trong máy khách được GHI ĐÈ chứ không tạo sự kiện thứ hai. */
  'emailedEta', 'mailSeq'
];
var HEADER_LABELS = [
  'Tên khách', 'SĐT', 'Email', 'Giờ đăng kí', 'Giờ bay (lock)', 'Trạng thái', 'Số khách',
  'Giờ gọi', 'Giờ vào bay', 'Cập nhật lúc', 'Mã',
  'Hình thức TT', 'Số tiền', 'Mã/Ghi chú CK', 'Giờ duyệt',
  'Ngày bay', 'STT trong ngày',
  'Slot đã chọn',
  'Ghép đôi', 'Ghép với', 'Email đã gửi', 'Giờ đã báo', 'Số lần gửi lịch'
];
/* Các cột giờ: lưu trong sheet dạng dễ đọc theo giờ Việt Nam,
   đọc ra sẽ đổi lại ISO để website và logic xếp lịch dùng như cũ */
var TIME_FIELDS = ['createdAt', 'eta', 'calledAt', 'sessionStart', 'updatedAt', 'approvedAt', 'emailedEta'];
var TIMEZONE = 'GMT+7';

/* Tiêu đề của các phiên bản sheet cũ → khóa nội bộ (dùng khi tự chuyển đổi) */
var LABEL_TO_KEY = {
  'Tên khách': 'name', 'SĐT': 'phone', 'Email': 'email',
  'Giờ đăng kí': 'createdAt', 'Giờ bay (lock)': 'eta', 'Trạng thái': 'status',
  'Số khách': 'groupSize', 'Giờ gọi': 'calledAt', 'Giờ vào bay': 'sessionStart',
  'Cập nhật lúc': 'updatedAt', 'Mã': 'id',
  'Hình thức TT': 'payMethod', 'Số tiền': 'amount', 'Mã/Ghi chú CK': 'payRef',
  'Giờ duyệt': 'approvedAt', 'Ngày bay': 'flightDate', 'STT trong ngày': 'seq',
  'Slot đã chọn': 'slotKey',
  'Ghép đôi': 'pairState', 'Ghép với': 'pairWith', 'Email đã gửi': 'emailStage',
  'Giờ đã báo': 'emailedEta', 'Số lần gửi lịch': 'mailSeq'
};

/* ============================================================
 * TRẠNG THÁI GHÉP ĐÔI (pairState) — nguồn sự thật cho phần 4 & 5
 *   ''             chưa duyệt (còn PENDING_PAYMENT)
 *   'DUO'          khách đăng ký 2 người — tự đủ cặp, có giờ bay ngay
 *   'SOLO_WAITING' khách lẻ đã trả tiền, ĐANG CHỜ ghép — CHƯA có giờ bay
 *   'SOLO_PAIRED'  khách lẻ đã ghép được với 1 khách lẻ khác — đã có giờ
 *
 * TRẠNG THÁI EMAIL (emailStage) — chống gửi trùng, mỗi mốc gửi đúng 1 lần
 *   ''           chưa gửi gì
 *   'HELD'       đã gửi Email 1 (giữ chỗ, KHÔNG có giờ bay) — kịch bản A
 *   'SCHEDULED'  đã gửi email có GIỜ BAY + lời mời lịch — kịch bản B
 *
 * Luồng: DUO      → duyệt → SCHEDULED (1 email duy nhất)
 *        SOLO     → duyệt → HELD → (khi ghép được) → SCHEDULED
 * ============================================================ */
var PAIR_SOLO_WAITING = 'SOLO_WAITING';
var PAIR_SOLO_PAIRED = 'SOLO_PAIRED';
var PAIR_DUO = 'DUO';
var MAIL_HELD = 'HELD';
var MAIL_SCHEDULED = 'SCHEDULED';

/* Phải khớp với config.js của website */
var SESSION_MS = 15 * 60000;  // mọi slot đều dài 15 phút
var PREP_MS = 5 * 60000;      // có mặt trước 5 phút

/* Hạn thanh toán (PAYMENT_MINUTES bên config.js — HAI NƠI PHẢI BẰNG NHAU).
   ĐÃ NÂNG 5 → 45 PHÚT khi chuyển sang luồng "chuyển khoản + gửi ảnh qua
   Zalo": khách phải mở app ngân hàng, chuyển tiền, chụp màn hình, gửi Zalo,
   rồi nhân viên mới mở Zalo đọc và bấm duyệt. Để 5 phút thì gần như MỌI
   đăng ký sẽ tự hủy trước khi kịp duyệt. */
var PAYMENT_MS = 45 * 60000;

/* ============================================================
 * THÔNG TIN DÙNG CHO EMAIL & LỜI MỜI LỊCH (phần 5)
 * Sửa ở đây là đổi trong mọi email — không rải rác trong code.
 * ============================================================ */
var VENUE_NAME = 'The Flight Deck';
var VENUE_ADDRESS = '86 Đặng Văn Ngữ, Phú Nhuận, TPHCM';
var ARRIVE_EARLY_MIN = 15;         // khách phải tới trước giờ bay 15 phút
/* Câu dặn dò BẮT BUỘC xuất hiện trong MỌI email/thông báo có giờ bay.
   Sửa ở đây là đổi ở mọi nơi (email, tệp .ics, link thêm vào lịch). */
var ARRIVE_NOTE =
  'Bạn ơi nhớ đến trước lịch hẹn 15p để tham gia các hoạt động check in tại quán ' +
  'và làm thủ tục trước khi vào buồng lái. The Flight Deck chỉ có một buồng lái ' +
  'để trải nghiệm nên các bạn đến đúng hẹn để tránh mất lượt nhé';
var PRICE_PER_PERSON = 150000;     // khớp PRICE_PER_PERSON trong config.js
var ZALO_LINK = 'https://zalo.me/0919686320';
var SUPPORT_EMAIL = 'theflightdeckcoffee@gmail.com';
var MAIL_SENDER_NAME = 'The Flight Deck';

/* ĐỊA CHỈ GỬI EMAIL — đọc kỹ, đây là chỗ dễ hiểu nhầm nhất:
   Apps Script LUÔN gửi bằng tài khoản Google đang SỞ HỮU script này. Không
   có cách nào gửi từ một địa chỉ bất kỳ.

   Muốn email đến từ theflightdeckcoffee@gmail.com thì chọn MỘT trong hai:

   CÁCH 1 (khuyến nghị, chắc chắn đúng):
     Đăng nhập Google bằng chính theflightdeckcoffee@gmail.com rồi tạo
     Google Sheet + Apps Script + Deploy từ tài khoản đó. Xong — mọi email
     tự động đi từ địa chỉ này, không cần cấu hình gì thêm.

   CÁCH 2 (khi script phải chạy dưới tài khoản khác):
     Vào Gmail của tài khoản chạy script → Cài đặt → Tài khoản → "Gửi thư
     bằng địa chỉ khác" → thêm và xác minh theflightdeckcoffee@gmail.com.
     Sau khi xác minh xong, script sẽ tự dùng nó làm địa chỉ gửi.

   Nếu cả hai đều chưa có, email vẫn GỬI BÌNH THƯỜNG từ tài khoản chủ
   script, và Reply-To luôn trỏ về địa chỉ dưới đây nên khách bấm "Trả lời"
   vẫn đến đúng hộp thư của TFD. */
var MAIL_FROM = 'theflightdeckcoffee@gmail.com';

/* Bật/tắt toàn bộ việc gửi email. Đặt false khi đang thử nghiệm để không
   bắn email thật cho khách trong lúc test luồng duyệt. */
var MAIL_ENABLED = true;

/* Khung giờ nhận đăng ký mỗi ngày (giờ VN, 24h) — PHẢI KHỚP BOOKING_HOURS
   trong config.js. Website đã khóa nút ngoài giờ; chốt chặn ở đây phòng
   trường hợp đồng hồ máy khách sai hoặc có người gọi thẳng vào API.
   Để trống ([]) = nhận đăng ký cả ngày. */
/* SUY RA từ FLIGHT_SCHEDULE, không ghi cứng nữa — xem bookingHours_().

   Trước đây đây là một mảng gõ tay và nó ĐÃ LỆCH: thêm ngày test mở
   08:00–22:00 làm website cho đăng ký lúc 14:00, còn máy chủ vẫn giữ
   08:00–13:00 + 17:00–21:00 nên từ chối thẳng. Khách/sếp bấm được nút
   nhưng nhận lỗi "ngoài giờ nhận đăng ký" — kiểu lỗi không ai ngờ tới.
   Suy ra từ một nguồn duy nhất thì không thể lệch được nữa. */

/* ============================================================
 * SLOT ENGINE — PHẢI GIỐNG HỆT slots.js của website
 * ------------------------------------------------------------
 * Khách chọn slot 15 phút trên web; server dùng đúng luật này để
 * CHỐT LẦN CUỐI lúc nhận đăng ký. doPost đã chạy trong LockService
 * nên việc kiểm tra + ghi là NGUYÊN TỬ: hai khách bấm cùng một ô ở
 * cùng một giây thì người sau chắc chắn bị từ chối, không thể có
 * chuyện 3 người cùng một slot.
 * ============================================================ */

/* PHẢI KHỚP FLIGHT_SCHEDULE trong config.js */
var FLIGHT_SCHEDULE = {
  slotMinutes: 15,
  groups: [
    /* 🧪 NGÀY TEST — XOÁ CẢ KHỐI NÀY TRƯỚC KHI SỰ KIỆN BẮT ĐẦU.
       Phải khớp với khối cùng tên trong config.js, nếu không máy khách
       cho chọn mà server lại từ chối (BAD_SLOT). */
    {
      label: 'Ngày test',
      test: true,
      dates: ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'],
      windows: [{ start: '00:00', end: '23:59' }]
    },
    {
      label: 'Ngày thường',
      dates: ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10'],
      windows: [{ start: '10:00', end: '13:00' }, { start: '17:00', end: '21:00' }]
    },
    {
      label: 'Cuối tuần',
      dates: ['2026-08-08', '2026-08-09'],
      windows: [{ start: '08:00', end: '12:00' }, { start: '19:00', end: '21:00' }]
    }
  ]
};

/* Khách phải đặt trước ít nhất bao nhiêu phút — khớp MIN_LEAD_MINUTES */
var MIN_LEAD_MS = 30 * 60000;

/* Trạng thái còn GIỮ CHỖ trong slot (khớp HOLDING của slots.js) */
var SLOT_HOLDING_ = ['PENDING_PAYMENT', 'WAITING', 'CALLED', 'PRESENT', 'IN_SESSION', 'DONE'];

var TZ_MS_ = 7 * 3600000;

function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function toMin_(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function toHm_(mins) { return pad2_(Math.floor(mins / 60)) + ':' + pad2_(mins % 60); }

/* 'YYYY-MM-DD' + 'HH:MM' (giờ VN) → timestamp ms */
function slotMs_(dateKey, hm) {
  var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  var t = toMin_(hm);
  if (!d || t === null) return NaN;
  return Date.UTC(+d[1], +d[2] - 1, +d[3], 0, 0, 0) - TZ_MS_ + t * 60000;
}

/* 'YYYY-MM-DDTHH:MM' → timestamp ms (NaN nếu sai định dạng) */
function slotKeyToMs_(key) {
  var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(key || '').trim());
  return m ? slotMs_(m[1], m[2]) : NaN;
}

function msToSlotKey_(ms) {
  var d = new Date(ms + TZ_MS_);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate()) +
    'T' + pad2_(d.getUTCHours()) + ':' + pad2_(d.getUTCMinutes());
}

/* Khung giờ mở của một ngày ('' nếu ngày đó không bay) */
function windowsFor_(dateKey) {
  var groups = FLIGHT_SCHEDULE.groups || [];
  for (var i = 0; i < groups.length; i++) {
    if ((groups[i].dates || []).indexOf(dateKey) !== -1) return groups[i].windows || [];
  }
  return [];
}

/* Slot này có thật trong lịch không? (chặn khách tự chế slotKey gửi lên) */
function isRealSlot_(key) {
  var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(key || '').trim());
  if (!m) return false;
  var step = FLIGHT_SCHEDULE.slotMinutes || 15;
  var t = toMin_(m[2]);
  var wins = windowsFor_(m[1]);
  for (var i = 0; i < wins.length; i++) {
    var s = toMin_(wins[i].start), e = toMin_(wins[i].end);
    if (s === null || e === null) continue;
    // phải rơi đúng vào mốc bội số của step VÀ slot kết thúc trước giờ đóng
    if (t >= s && t + step <= e && (t - s) % step === 0) return true;
  }
  return false;
}

/* Gom booking theo slot — O(n), một lượt duyệt.
   { slotKey: { seats, hasDuo } } */
function indexBookings_(items) {
  var map = {};
  (items || []).forEach(function (it) {
    if (!it || SLOT_HOLDING_.indexOf(it.status) === -1) return;
    var key = it.slotKey || (it.eta ? msToSlotKey_(Date.parse(it.eta)) : '');
    if (!key) return;
    var cell = map[key] || (map[key] = { seats: 0, hasDuo: false });
    var n = sizeOf_(it);
    cell.seats += n;
    if (n === 2) cell.hasDuo = true;
  });
  return map;
}

function slotStateOf_(index, key) {
  var cell = index[key];
  if (!cell || cell.seats <= 0) return 'EMPTY';
  if (cell.seats >= 2) return 'FULL';
  return 'PENDING_PAIR';
}

/* Chốt chặn cuối cùng khi khách gửi đăng ký.
   → '' nếu hợp lệ, hoặc mã lỗi để website hiển thị. */
function validateSlot_(index, key, groupSize, nowMs) {
  if (!isRealSlot_(key)) return 'BAD_SLOT';
  var startMs = slotKeyToMs_(key);
  if (isNaN(startMs)) return 'BAD_SLOT';
  if (startMs <= nowMs) return 'PAST';
  if (startMs - nowMs < MIN_LEAD_MS) return 'TOO_SOON';
  var st = slotStateOf_(index, key);
  if (st === 'FULL') return 'SLOT_TAKEN';
  if (st === 'PENDING_PAIR' && groupSize === 2) return 'SLOT_NEEDS_SOLO';
  return '';
}

/** Đang trong khung giờ nhận đăng ký? (tính theo giờ VN của server) */
/* Khung giờ nhận đăng ký = bao trùm mọi khung bay của mọi nhóm ngày, đã
   gộp các khoảng chồng nhau. Giống hệt đoạn suy diễn cuối config.js nên
   hai bên không thể lệch. Tính một lần rồi nhớ luôn. */
var BOOKING_HOURS_ = null;
function bookingHours_() {
  if (BOOKING_HOURS_) return BOOKING_HOURS_;
  var wins = [];
  (FLIGHT_SCHEDULE.groups || []).forEach(function (g) {
    (g.windows || []).forEach(function (w) {
      wins.push({ s: toMin_(w.start), e: toMin_(w.end) });
    });
  });
  wins.sort(function (a, b) { return a.s - b.s; });
  var merged = [];
  wins.forEach(function (w) {
    var last = merged[merged.length - 1];
    if (last && w.s <= last.e) last.e = Math.max(last.e, w.e);
    else merged.push({ s: w.s, e: w.e });
  });
  BOOKING_HOURS_ = merged.map(function (w) {
    return { start: toHm_(w.s), end: toHm_(w.e) };
  });
  return BOOKING_HOURS_;
}

function isBookingOpen_(now) {
  var hours = bookingHours_();
  if (!hours.length) return true;
  var d = now || new Date();
  // Giờ VN bất kể múi giờ của project Apps Script
  var hm = Utilities.formatDate(d, TIMEZONE, 'HH:mm').split(':');
  var mod = (+hm[0]) * 60 + (+hm[1]);
  for (var i = 0; i < hours.length; i++) {
    var start = toMin_(hours[i].start);
    var end = toMin_(hours[i].end);
    if (mod >= start && mod < end) return true;
  }
  return false;
}

/** "08:00-13:00, 17:00-21:00" — dùng trong thông báo lỗi */
function bookingHoursText_() {
  return bookingHours_().map(function (w) { return w.start + '-' + w.end; }).join(', ');
}
var QUEUE_STATUSES_ = ['WAITING', 'CALLED', 'PRESENT'];

/* Thời lượng slot — như nhau cho mọi lượt, bất kể 1 hay 2 khách */
function durMs_(it) {
  return SESSION_MS;
}

function sizeOf_(it) {
  return String(it.groupSize) === '2' ? 2 : 1;
}

/* Slot đang "mở" sớm nhất: đã có 1 khách đăng ký 1 mình giữ chỗ, còn
   trống 1 chỗ để ghép. Trả về giờ bay (ms) của slot đó, hoặc null nếu
   không có slot nào đang mở. */
function openSlotEta_(items) {
  var bySlot = {};
  items.forEach(function (it) {
    if (QUEUE_STATUSES_.indexOf(it.status) === -1 || !it.eta) return;
    var t = Date.parse(it.eta);
    bySlot[t] = (bySlot[t] || 0) + sizeOf_(it);
  });
  var openEta = null;
  Object.keys(bySlot).forEach(function (k) {
    if (bySlot[k] < 2) {
      var t = Number(k);
      if (openEta === null || t < openEta) openEta = t;
    }
  });
  return openEta;
}

/* ISO → chuỗi giờ Việt Nam dễ đọc để ghi vào sheet */
function toDisplayTime_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return Utilities.formatDate(d, TIMEZONE, 'HH:mm:ss dd/MM/yyyy');
}

/* Chuỗi giờ trong sheet → ISO (chấp nhận cả dữ liệu ISO của bản cũ) */
function toIso_(text) {
  var s = String(text || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[6], +m[5] - 1, +m[4], +m[1] - 7, +m[2], +m[3])).toISOString();
  var t = Date.parse(s);
  return isNaN(t) ? '' : new Date(t).toISOString();
}

/* Đặt định dạng CHỮ cho vùng ô — để Sheets không cắt số 0 đầu SĐT hay
   đổi kiểu ngày giờ. NUỐT LỖI nếu sheet đã bị chuyển thành "Bảng" (Table,
   cột có kiểu): setNumberFormat trên cột có kiểu sẽ ném lỗi
   "You can't set the number format of cells in a typed column" — lỗi này
   từng làm CHẾT MỌI LỆNH GHI (không xác nhận thanh toán / tự hủy được).
   Bỏ định dạng vẫn ghi được dữ liệu — quan trọng hơn nhiều. */
function trySetTextFormat_(range) {
  try { range.setNumberFormat('@'); } catch (err) {}
}

/* Vùng "toàn bộ các cột hệ thống dùng" — trước đây ghi cứng 'A:K' (11 cột).
   Bảng giờ có nhiều cột hơn nên phải tính theo HEADERS, nếu không các cột
   mới (Số tiền, STT…) sẽ bị Sheets tự đoán kiểu số/ngày và làm hỏng dữ liệu. */
function allCols_(sheet) {
  return sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    trySetTextFormat_(allCols_(sheet));
    sheet.getRange(1, 1, 1, HEADER_LABELS.length).setValues([HEADER_LABELS]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var row1 = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADER_LABELS.length)).getValues()[0].map(String);
  var matches = HEADER_LABELS.every(function (l, i) { return row1[i] === l; });
  if (!matches) migrate_(sheet, row1);
  return sheet;
}

/* Chuyển sheet phiên bản cũ (tiêu đề tiếng Anh / bố cục khác)
   sang bố cục hiện tại, giữ nguyên dữ liệu, giờ dạng GMT+7 */
function migrate_(sheet, row1) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var keys = row1.slice(0, lastCol).map(function (label) {
    return LABEL_TO_KEY[label] || label; // bản cũ nhất dùng thẳng khóa tiếng Anh
  });
  var items = [];
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).getValues().forEach(function (row) {
      var it = {};
      keys.forEach(function (k, c) { it[k] = String(row[c] || ''); });
      items.push(it);
    });
  }
  sheet.clearContents();
  trySetTextFormat_(allCols_(sheet));
  sheet.getRange(1, 1, 1, HEADER_LABELS.length).setValues([HEADER_LABELS]);
  sheet.setFrozenRows(1);
  if (items.length) {
    var rows = items.map(function (it) {
      return HEADERS.map(function (h) {
        var v = it[h] || '';
        return TIME_FIELDS.indexOf(h) !== -1 ? toDisplayTime_(toIso_(v)) : v;
      });
    });
    sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  }
}

/* slotKey phải luôn ở dạng 'YYYY-MM-DDTHH:MM'.
   Chuỗi đó trông y hệt một mốc thời gian ISO nên Google Sheets rất hay TỰ
   ĐỔI nó thành kiểu Ngày giờ (nhất là khi tab đã bị chuyển thành "Bảng"
   khiến trySetTextFormat_ không đặt được định dạng chữ). Lúc đọc ra ta
   nhận về một đối tượng Date → chuỗi kiểu "Mon Aug 03 2026 10:00:00
   GMT+0700" → không khớp slot nào, giao diện 3 trạng thái hỏng hoàn toàn.
   Hàm này đưa mọi biến thể về đúng một dạng chuẩn. */
function normSlotKey_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s;      // đã đúng dạng
  var t = Date.parse(s);                                         // chuỗi ngày kiểu khác
  if (!isNaN(t)) return Utilities.formatDate(new Date(t), TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  return '';
}

function readAll_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(function (row, i) {
    var item = { row: i + 2 };
    HEADERS.forEach(function (h, c) {
      if (h === 'slotKey') { item[h] = normSlotKey_(row[c]); return; }
      var v = String(row[c] || '');
      item[h] = TIME_FIELDS.indexOf(h) !== -1 ? toIso_(v) : v;
    });
    /* Dữ liệu cũ (đăng ký trước khi có tính năng chọn slot) không có
       slotKey — suy ra từ giờ bay để giao diện vẫn xếp đúng nhóm. */
    if (!item.slotKey && item.eta) {
      var ms = Date.parse(item.eta);
      if (!isNaN(ms)) item.slotKey = msToSlotKey_(ms);
    }
    return item;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Ghi TRỌN một hàng bằng MỘT lệnh setValues — nhanh hơn hẳn ghi từng ô
   (mỗi setValue là một vòng gọi Sheets riêng ~0.2–0.5s; xác nhận thanh
   toán kiểu cũ tốn 3 vòng, giờ chỉ 1).
   CHỐT AN TOÀN: trước khi ghi phải kiểm tra Mã (id) tại hàng đích. Nếu có
   người xóa hàng / sort trực tiếp trong Google Sheet lúc hệ thống đang
   chạy, số hàng đã DỊCH — ghi bừa theo số hàng cũ sẽ đè dữ liệu cũ lên
   nhầm khách (trạng thái quay ngược, "người chơi cũ hồi sinh"). Sai id
   thì tìm lại hàng theo id; id không còn trong sheet (bị xóa tay) thì
   BỎ QUA, không ghi bừa. */
function writeRow_(sheet, item) {
  var idCol = HEADERS.indexOf('id') + 1;
  var last = sheet.getLastRow();
  var idAtRow = (item.row >= 2 && item.row <= last)
    ? String(sheet.getRange(item.row, idCol).getValue() || '')
    : '';
  if (idAtRow !== String(item.id || '')) {
    var found = 0;
    if (last >= 2) {
      var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '') === String(item.id)) { found = i + 2; break; }
      }
    }
    if (found) {
      item.row = found;               // hàng đã dịch — ghi đúng chỗ mới
    } else if (idAtRow === '') {
      item.row = Math.max(item.row, last + 1); // hàng MỚI (đăng ký) — ghi xuống cuối
    } else {
      return;                          // hàng bị xóa tay — tôn trọng, không ghi lại
    }
  }
  var range = sheet.getRange(item.row, 1, 1, HEADERS.length);
  trySetTextFormat_(range);
  range.setValues([HEADERS.map(function (h) {
    return TIME_FIELDS.indexOf(h) !== -1 ? toDisplayTime_(item[h]) : (item[h] || '');
  })]);
}

/* ============ Cache danh sách (chống nghẽn khi rất đông) ============
   Điện thoại của MỌI khách đang mở trang đều poll doGet 15 giây/lần —
   lúc đông là hàng chục request/phút cùng đọc cả sheet. Thay vào đó:
   sau MỖI lần ghi, server tự bỏ danh sách mới nhất vào cache; doGet trả
   thẳng JSON từ cache — không đụng Sheet, nhanh gấp nhiều lần, không
   tốn quota. Cache chỉ sống 10 giây để tự làm mới khi nhàn rỗi. */
var CACHE_KEY = 'tfd_list_v1';
var CACHE_TTL_SEC = 10;

function cachePut_(items) {
  try {
    var slim = items.map(function (it) {
      var o = {};
      HEADERS.forEach(function (h) { o[h] = it[h] || ''; });
      return o;
    });
    var s = JSON.stringify({ ok: true, version: SCRIPT_VERSION, items: slim });
    var cache = CacheService.getScriptCache();
    if (s.length < 95000) cache.put(CACHE_KEY, s, CACHE_TTL_SEC);
    else cache.remove(CACHE_KEY); // quá lớn cho cache — doGet đọc thẳng sheet
  } catch (err) {}
}

/* Giờ bay cho lượt đăng ký MỚI — được hệ thống tính lúc xác nhận thanh
   toán rồi LƯU LẠI để đếm ngược.
   - 1 người: ghép vào slot đang mở sớm nhất nếu có (khách đăng ký 1
     mình khác đang giữ chỗ, còn trống 1 chỗ) — bay CHUNG slot đó.
   - 2 người: luôn giữ một slot mới, xếp sau slot cuối của hàng chờ
     (giờ đã chốt + 15 phút) và sau lượt đang bay. Không có nghỉ giữa
     ca — buồng lái rảnh là bay được ngay. */
function computeEta_(items, groupSize) {
  if (groupSize === 1) {
    var openEta = openSlotEta_(items);
    if (openEta !== null) return openEta;
  }
  var now = Date.now();
  var free = now;
  items.forEach(function (it) {
    if (it.status === 'IN_SESSION' && it.sessionStart) {
      var end = Date.parse(it.sessionStart) + durMs_(it);
      if (end > free) free = end;
    } else if (QUEUE_STATUSES_.indexOf(it.status) !== -1 && it.eta) {
      var end2 = Date.parse(it.eta) + durMs_(it);
      if (end2 > free) free = end2;
    }
  });
  return free;
}

/* ============================================================
 * PHẦN 2 — SHEET THANH TOÁN RIÊNG ("Payments")
 * Tách khỏi sheet khách hàng chung để kế toán đối soát: mỗi lần nhân
 * viên bấm duyệt là một dòng thu tiền, phân biệt rõ CHUYỂN KHOẢN
 * thường và QUÉT QR.
 * ============================================================ */
var PAY_SHEET_NAME = 'Jun Pham payments';   // sổ thu tiền riêng
var PAY_HEADERS = ['paidAt', 'id', 'name', 'phone', 'email', 'groupSize', 'amount', 'payMethod', 'payMethodLabel', 'payRef', 'flightDate', 'seq', 'eta', 'pairState'];
var PAY_HEADER_LABELS = ['Giờ xác nhận', 'Mã đăng ký', 'Tên khách', 'SĐT', 'Email', 'Số khách', 'Số tiền (VND)', 'Hình thức', 'Hình thức (mô tả)', 'Mã/Ghi chú CK', 'Ngày bay', 'STT trong ngày', 'Giờ bay', 'Ghép đôi'];

/* Mã hình thức thanh toán → nhãn tiếng Việt cho sheet/email */
var PAY_METHOD_LABELS = {
  BANK: 'Chuyển khoản ngân hàng',
  QR: 'Quét mã QR',
  CASH: 'Tiền mặt tại quầy'
};

function payMethodLabel_(code) {
  return PAY_METHOD_LABELS[String(code || '').toUpperCase()] || 'Không rõ';
}

/* Chuẩn hóa mã hình thức thanh toán gửi lên từ website/admin */
function normPayMethod_(v) {
  var s = String(v || '').trim().toUpperCase();
  return PAY_METHOD_LABELS[s] ? s : '';
}

function getPaySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PAY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PAY_SHEET_NAME);
    trySetTextFormat_(sheet.getRange(1, 1, sheet.getMaxRows(), PAY_HEADER_LABELS.length));
    sheet.getRange(1, 1, 1, PAY_HEADER_LABELS.length).setValues([PAY_HEADER_LABELS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* Ghi một dòng thu tiền. CHỐNG TRÙNG: nhân viên bấm duyệt hai lần (mạng
   chậm nên tưởng chưa ăn) không được tạo hai dòng doanh thu — kiểm tra mã
   đăng ký đã có trong sheet chưa. */
function logPayment_(item) {
  try {
    var sheet = getPaySheet_();
    var last = sheet.getLastRow();
    if (last >= 2) {
      var idCol = PAY_HEADERS.indexOf('id') + 1;
      var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '') === String(item.id)) return; // đã ghi rồi
      }
    }
    var row = PAY_HEADERS.map(function (h) {
      if (h === 'paidAt') return toDisplayTime_(item.approvedAt || new Date().toISOString());
      if (h === 'eta') return item.eta ? toDisplayTime_(item.eta) : '(chờ ghép đôi)';
      if (h === 'payMethodLabel') return payMethodLabel_(item.payMethod);
      return item[h] == null ? '' : String(item[h]);
    });
    var range = sheet.getRange(last + 1, 1, 1, PAY_HEADERS.length);
    trySetTextFormat_(range);
    range.setValues([row]);
  } catch (err) {
    // Không để lỗi ghi sổ thu tiền làm hỏng việc duyệt khách
    logError_('logPayment_', err);
  }
}

/* ============================================================
 * PHẦN 5 — EMAIL TỰ ĐỘNG + LỜI MỜI GOOGLE CALENDAR
 * ============================================================ */

/* Ghi lỗi ra sheet "Log" thay vì nuốt im — nhân viên/kỹ thuật cần biết
   email nào không gửi được, khách nào chưa nhận lịch. */
function logError_(where, err) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.getRange(1, 1, 1, 3).setValues([['Thời gian', 'Vị trí', 'Lỗi']]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([toDisplayTime_(new Date().toISOString()), where, String(err && err.message || err)]);
  } catch (e) {}
}

function isEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

function fmtVnd_(n) {
  var s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

/* "10:00 – thứ Bảy, 15/08/2026" cho email */
function fmtFlightWhen_(iso) {
  var d = new Date(iso);
  var time = Utilities.formatDate(d, TIMEZONE, 'HH:mm');
  var date = Utilities.formatDate(d, TIMEZONE, 'dd/MM/yyyy');
  return { time: time, date: date, full: time + ' ngày ' + date };
}

/* Giờ UTC dạng ICS: 20260815T030000Z */
function icsStamp_(ms) {
  return Utilities.formatDate(new Date(ms), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
}

function icsEscape_(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/* Lời mời lịch (.ics). METHOD:REQUEST để Gmail/Outlook hiện thẳng nút
   "Thêm vào lịch" ngay trong email thay vì coi là tệp đính kèm thường.
   Giờ nhắc: đúng ARRIVE_EARLY_MIN phút trước giờ bay, khớp câu dặn dò. */
function buildIcs_(item) {
  var startMs = Date.parse(item.eta);
  var endMs = startMs + SESSION_MS;
  var when = fmtFlightWhen_(item.eta);
  var title = 'Trải nghiệm buồng lái ' + VENUE_NAME + ' — ' + when.time;
  var desc = 'Lượt bay mô phỏng 15 phút tại ' + VENUE_NAME + '.\n' +
    'Mã đăng ký: ' + item.id + '\n' +
    'Số khách: ' + sizeOf_(item) + '\n' +
    ARRIVE_NOTE + '.';

  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Flight Deck//Booking//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:tfd-' + item.id + '@theflightdeck',
    'DTSTAMP:' + icsStamp_(Date.now()),
    'DTSTART:' + icsStamp_(startMs),
    'DTEND:' + icsStamp_(endMs),
    'SUMMARY:' + icsEscape_(title),
    'DESCRIPTION:' + icsEscape_(desc),
    'LOCATION:' + icsEscape_(VENUE_NAME + ', ' + VENUE_ADDRESS),
    'STATUS:CONFIRMED',
    // Cùng UID + SEQUENCE lớn hơn = lịch cũ trong máy khách được CẬP NHẬT,
    // không sinh ra sự kiện thứ hai khi giờ bay bị đổi.
    'SEQUENCE:' + (Number(item.mailSeq) || 0),
    'BEGIN:VALARM',
    'TRIGGER:-PT' + ARRIVE_EARLY_MIN + 'M',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + icsEscape_('Sắp tới giờ bay tại ' + VENUE_NAME),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.join('\r\n');
}

/* Link "Thêm vào Google Calendar" — dự phòng cho khách dùng điện thoại
   không mở được tệp .ics đính kèm. */
function gcalLink_(item) {
  var startMs = Date.parse(item.eta);
  var when = fmtFlightWhen_(item.eta);
  var params = {
    action: 'TEMPLATE',
    text: 'Trải nghiệm buồng lái ' + VENUE_NAME + ' — ' + when.time,
    dates: icsStamp_(startMs) + '/' + icsStamp_(startMs + SESSION_MS),
    details: 'Mã đăng ký: ' + item.id + '\n' + ARRIVE_NOTE + '.',
    location: VENUE_NAME + ', ' + VENUE_ADDRESS
  };
  var q = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return 'https://calendar.google.com/calendar/render?' + q;
}

/* Khung HTML chung của email — giữ đơn giản để hiển thị tốt trên Gmail
   điện thoại (không dùng CSS ngoài, không ảnh nền). */
function mailShell_(heading, bodyHtml) {
  return '' +
    '<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#12233d;max-width:560px">' +
    '<div style="background:#00205b;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">' +
    '<div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">' + VENUE_NAME + '</div>' +
    '<div style="font-size:20px;font-weight:800;margin-top:2px">' + heading + '</div>' +
    '</div>' +
    '<div style="border:1px solid #dbe6f5;border-top:none;border-radius:0 0 12px 12px;padding:22px">' +
    bodyHtml +
    '<hr style="border:none;border-top:1px solid #e6eefa;margin:22px 0 14px">' +
    '<div style="font-size:13px;color:#5a6b83">' +
    'Cần hỗ trợ? Nhắn Zalo <a href="' + ZALO_LINK + '" style="color:#f77600">' + ZALO_LINK + '</a>' +
    ' hoặc email <a href="mailto:' + SUPPORT_EMAIL + '" style="color:#f77600">' + SUPPORT_EMAIL + '</a>.' +
    '</div></div></div>';
}

function rowHtml_(label, value) {
  return '<tr>' +
    '<td style="padding:6px 14px 6px 0;color:#5a6b83;white-space:nowrap">' + label + '</td>' +
    '<td style="padding:6px 0;font-weight:700">' + value + '</td></tr>';
}

/* Câu dặn dò BẮT BUỘC có trong mọi email đã có giờ bay (yêu cầu phần 5) */
function arriveNoteHtml_() {
  return '<p style="background:#fff3e6;border-left:4px solid #f77600;padding:12px 14px;margin:18px 0;border-radius:6px">' +
    '<strong>' + escHtml_(ARRIVE_NOTE) + '.</strong></p>';
}

/* ---------- KỊCH BẢN A: khách lẻ chưa ghép được đôi ----------
   TUYỆT ĐỐI KHÔNG ghi giờ bay ở đây. Khách lẻ chỉ được xếp chỗ tạm; giờ
   thật chỉ chốt khi có khách lẻ thứ hai. Ghi giờ tạm rồi sau đổi là thất
   hứa với khách — đúng thứ yêu cầu đã dặn phải tránh. */
function sendHeldEmail_(item) {
  var subject = '[The Flight Deck] Đã nhận thanh toán — đang ghép đôi lượt bay của bạn';
  var body =
    '<p>Xin chào <strong>' + escHtml_(item.name) + '</strong>,</p>' +
    '<p>The Flight Deck đã <strong>nhận được thanh toán</strong> và giữ chỗ cho bạn. Cảm ơn bạn rất nhiều!</p>' +
    '<table style="border-collapse:collapse;margin:16px 0">' +
    rowHtml_('Mã đăng ký', escHtml_(item.id)) +
    rowHtml_('Số khách', '1 người (đăng ký lẻ)') +
    rowHtml_('Số tiền đã nhận', fmtVnd_(item.amount)) +
    rowHtml_('Hình thức', escHtml_(payMethodLabel_(item.payMethod))) +
    rowHtml_('Địa điểm', escHtml_(VENUE_NAME + ' — ' + VENUE_ADDRESS)) +
    '</table>' +
    '<p style="background:#eef6ff;border-left:4px solid #00205b;padding:12px 14px;border-radius:6px">' +
    '⏳ <strong>Lượt bay của bạn đang chờ ghép đôi.</strong><br>' +
    'Mỗi lượt bay gồm 2 người. Vì bạn đăng ký đi một mình, hệ thống sẽ ghép bạn với một khách lẻ khác. ' +
    '<strong>Chúng tôi sẽ gửi email thứ hai kèm giờ bay cụ thể và lời mời lịch ngay khi ghép đôi thành công.</strong></p>' +
    '<p>Bạn chưa cần đến địa điểm cho tới khi nhận được email xác nhận giờ bay.</p>';
  return sendMail_(item, subject, mailShell_('Đã nhận thanh toán', body), null);
}

/* ---------- KỊCH BẢN B: đã có giờ bay (khách 2 người, hoặc lẻ đã ghép) ----------
   Bắt buộc: giờ bay cụ thể + lời mời lịch + câu dặn có mặt trước 10 phút. */
function sendScheduledEmail_(item, kind) {
  var when = fmtFlightWhen_(item.eta);
  var size = sizeOf_(item);
  var isPairedFollowUp = (kind === 'paired');
  var isReschedule = (kind === 'moved');
  var subject = (isReschedule ? '[The Flight Deck] CẬP NHẬT giờ bay — ' : '[The Flight Deck] Xác nhận giờ bay ') +
    when.time + ' ngày ' + when.date;

  var lead;
  if (isReschedule) {
    lead = '<p>Xin chào <strong>' + escHtml_(item.name) + '</strong>,</p>' +
      '<p>⚠️ <strong>Giờ bay của bạn vừa được cập nhật.</strong> Do có thay đổi trong hàng chờ, ' +
      'lượt bay của bạn được xếp lại sang giờ mới bên dưới. Rất mong bạn thông cảm — ' +
      'lời mời lịch đính kèm sẽ tự cập nhật sự kiện cũ trong lịch của bạn.</p>';
  } else if (isPairedFollowUp) {
    lead = '<p>Xin chào <strong>' + escHtml_(item.name) + '</strong>,</p>' +
      '<p>🎉 <strong>Đã ghép đôi thành công!</strong> Lượt bay của bạn đã có giờ cụ thể như bên dưới.</p>';
  } else {
    lead = '<p>Xin chào <strong>' + escHtml_(item.name) + '</strong>,</p>' +
      '<p>The Flight Deck đã <strong>nhận được thanh toán</strong> và xác nhận lượt bay của bạn. Cảm ơn bạn rất nhiều!</p>';
  }

  var body = lead +
    '<table style="border-collapse:collapse;margin:16px 0">' +
    rowHtml_('Mã đăng ký', escHtml_(item.id)) +
    rowHtml_('Ngày bay', escHtml_(when.date)) +
    rowHtml_('Giờ bay', '<span style="color:#f77600;font-size:18px">' + escHtml_(when.time) + '</span>') +
    rowHtml_('STT trong ngày', escHtml_(String(item.seq || '—'))) +
    rowHtml_('Thời lượng', '15 phút') +
    rowHtml_('Số khách', size === 2 ? '2 người (bay cùng nhau)' : '1 người (đã ghép đôi)') +
    rowHtml_('Số tiền đã nhận', fmtVnd_(item.amount)) +
    rowHtml_('Địa điểm', escHtml_(VENUE_NAME + ' — ' + VENUE_ADDRESS)) +
    '</table>' +
    arriveNoteHtml_() +
    '<p style="margin:18px 0">' +
    '<a href="' + gcalLink_(item) + '" style="background:#f77600;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block">📅 Thêm vào Google Calendar</a>' +
    '</p>' +
    '<p style="font-size:13px;color:#5a6b83">Email này có đính kèm lời mời lịch (<code>.ics</code>) — bạn cũng có thể mở tệp đó để thêm vào Apple Calendar / Outlook.</p>';

  // Tăng SEQUENCE trước khi dựng .ics — lịch cũ được ghi đè thay vì nhân đôi
  item.mailSeq = String((Number(item.mailSeq) || 0) + 1);
  var ics = Utilities.newBlob(buildIcs_(item), 'text/calendar; charset=UTF-8; method=REQUEST', 'the-flight-deck-' + item.id + '.ics');
  var ok = sendMail_(item, subject, mailShell_(isReschedule ? 'Cập nhật giờ bay' : 'Xác nhận giờ bay', body), [ics]);
  // Ghi lại giờ ĐÃ BÁO để lần sau biết giờ có đổi hay không
  if (ok) item.emailedEta = item.eta;
  else item.mailSeq = String(Math.max(0, (Number(item.mailSeq) || 1) - 1));
  return ok;
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* Gửi thật. Trả true nếu đã gửi được — nơi gọi dựa vào đó để đánh dấu
   emailStage, tránh đánh dấu "đã gửi" khi thật ra gửi hỏng. */
/* Địa chỉ MAIL_FROM có dùng làm "gửi thư bằng địa chỉ khác" được không?
   Hỏi Gmail một lần rồi nhớ luôn — getAliases() là một vòng gọi API, không
   nên lặp lại cho từng email khi đang duyệt hàng loạt khách. */
var aliasChecked_ = false;
var aliasUsable_ = false;
function fromAddress_() {
  if (!MAIL_FROM) return '';
  if (aliasChecked_) return aliasUsable_ ? MAIL_FROM : '';
  aliasChecked_ = true;
  try {
    // Chính chủ tài khoản chạy script → dùng thẳng, không cần alias
    if (Session.getEffectiveUser().getEmail().toLowerCase() === MAIL_FROM.toLowerCase()) {
      aliasUsable_ = false;      // đằng nào cũng gửi từ địa chỉ này rồi
      return '';
    }
    var aliases = GmailApp.getAliases() || [];
    for (var i = 0; i < aliases.length; i++) {
      if (String(aliases[i]).toLowerCase() === MAIL_FROM.toLowerCase()) {
        aliasUsable_ = true;
        return MAIL_FROM;
      }
    }
    logError_('fromAddress_', 'Chưa xác minh "gửi thư bằng địa chỉ khác" cho ' +
      MAIL_FROM + ' — email sẽ đi từ ' + Session.getEffectiveUser().getEmail() +
      ', Reply-To vẫn là ' + SUPPORT_EMAIL + '.');
  } catch (err) {
    logError_('fromAddress_', err);
  }
  return '';
}

/* Bản chữ thuần cho ứng dụng mail không đọc HTML (và tốt cho khả năng vào
   Inbox thay vì Spam). Rút từ chính HTML để không phải viết nội dung 2 lần. */
function htmlToText_(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Lý do KHÔNG gửi được của lần gửi gần nhất — confirmPayment_ trả về cho
   trang quản lý để nhân viên biết ngay, thay vì email lặng lẽ không đi. */
var LAST_MAIL_ERROR = '';

/**
 * Gửi email cho khách.
 *
 * Thử GmailApp trước (hỗ trợ đặt địa chỉ gửi = alias), NHƯNG nếu hỏng thì
 * lùi về MailApp.
 *
 * Vì sao phải có bước lùi: hai API này xin QUYỀN KHÁC NHAU —
 *   MailApp  → script.send_mail   (hẹp)
 *   GmailApp → mail.google.com    (toàn quyền Gmail)
 * Bản deploy nào được cấp quyền từ trước khi code đổi sang GmailApp sẽ
 * KHÔNG có quyền rộng đó, GmailApp ném lỗi và email im lặng không đi.
 * MailApp gần như luôn còn quyền, nên vẫn gửi được — mất tính năng đổi
 * địa chỉ gửi, nhưng khách VẪN nhận được thư, đó mới là điều quan trọng.
 */
function sendMail_(item, subject, htmlBody, attachments) {
  LAST_MAIL_ERROR = '';
  if (!MAIL_ENABLED) { LAST_MAIL_ERROR = 'MAIL_ENABLED=false'; return false; }
  if (!isEmail_(item.email)) { LAST_MAIL_ERROR = 'khách không có email hợp lệ'; return false; }

  var to = String(item.email).trim();
  var plain = htmlToText_(htmlBody);
  var opts = {
    htmlBody: htmlBody,
    name: MAIL_SENDER_NAME,
    // Khách bấm "Trả lời" phải đến hộp thư TFD, kể cả khi script đang
    // chạy dưới một tài khoản Google khác.
    replyTo: SUPPORT_EMAIL
  };
  if (attachments && attachments.length) opts.attachments = attachments;

  // 1) GmailApp — cho phép đặt địa chỉ gửi nếu đã xác minh alias
  try {
    var from = fromAddress_();
    var gOpts = opts;
    if (from) { gOpts = {}; for (var k in opts) gOpts[k] = opts[k]; gOpts.from = from; }
    GmailApp.sendEmail(to, subject, plain, gOpts);
    return true;
  } catch (errGmail) {
    logError_('sendMail_/GmailApp ' + item.id, errGmail);
    LAST_MAIL_ERROR = 'GmailApp: ' + (errGmail && errGmail.message || errGmail);
  }

  // 2) MailApp — quyền hẹp hơn, thường vẫn còn hiệu lực
  try {
    MailApp.sendEmail({
      to: to, subject: subject, htmlBody: htmlBody, body: plain,
      name: MAIL_SENDER_NAME, replyTo: SUPPORT_EMAIL,
      attachments: (attachments && attachments.length) ? attachments : undefined
    });
    LAST_MAIL_ERROR = '';       // gửi được rồi thì không còn là lỗi
    return true;
  } catch (errMail) {
    logError_('sendMail_/MailApp ' + item.id, errMail);
    LAST_MAIL_ERROR += ' | MailApp: ' + (errMail && errMail.message || errMail);
    return false;
  }
}

/* Còn gửi được bao nhiêu email hôm nay (Gmail thường 100/ngày).
   Hết quota là một nguyên nhân rất hay gặp khiến email im lặng không đi. */
function mailQuotaLeft_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (err) { return -1; }
}

/* ============================================================
 * GỬI THỬ EMAIL — CHẠY THẲNG TRONG APPS SCRIPT EDITOR
 * ============================================================
 * Cách dùng: mở Apps Script → chọn hàm TEST_guiEmailThu ở ô hàm phía trên
 * → bấm ▶ Run → cấp quyền khi Google hỏi → mở Thực thi (Executions) xem
 * nhật ký. Không cần deploy, không đụng vào dữ liệu khách.
 *
 * Đây là cách DUY NHẤT để biết chắc email đi từ địa chỉ nào: máy chủ Gmail
 * quyết định điều đó, không phải đoạn mã này. Nhật ký sẽ in ra địa chỉ thật.
 *
 * Gửi 2 thư — đúng 2 kịch bản khách thật sẽ nhận:
 *   1. Khách lẻ chưa ghép đôi — KHÔNG có giờ bay
 *   2. Khách 2 người — CÓ giờ bay + tệp lịch .ics đính kèm
 */
var TEST_EMAIL_TO = 'theduc4a@gmail.com';   // đổi thành email của bạn nếu cần

function TEST_guiEmailThu() {
  var owner = '(không đọc được)';
  try { owner = Session.getEffectiveUser().getEmail(); } catch (err) {}

  var alias = fromAddress_();
  Logger.log('Tài khoản đang chạy script : ' + owner);
  Logger.log('MAIL_FROM mong muốn        : ' + MAIL_FROM);
  Logger.log('Alias "gửi bằng địa chỉ khác" dùng được? ' + (alias ? 'CÓ → ' + alias : 'KHÔNG'));
  Logger.log('→ Khách sẽ thấy thư đến từ : ' + (alias || owner));
  Logger.log('Reply-To (khách bấm Trả lời): ' + SUPPORT_EMAIL);
  Logger.log('Còn gửi được hôm nay        : ' + mailQuotaLeft_() + ' email');
  Logger.log('Đang gửi 2 thư thử tới      : ' + TEST_EMAIL_TO);

  // Giờ bay giả: slot 15 phút gần nhất của ngày mai, cho .ics ra ngày hợp lệ
  var etaMs = Math.ceil((Date.now() + 86400000) / 900000) * 900000;

  var mau = {
    id: 'THUTHU01',
    name: 'Khách Gửi Thử',
    phone: '0900000000',
    email: TEST_EMAIL_TO,
    amount: String(PRICE_PER_PERSON),
    payMethod: 'BANK',
    groupSize: '1',
    eta: new Date(etaMs).toISOString(),
    seq: '1',
    mailSeq: '0'
  };

  var ok1 = sendHeldEmail_(mau);
  Logger.log('1. Thư "đang chờ ghép đôi" (không có giờ bay) : ' +
    (ok1 ? 'ĐÃ GỬI' : 'HỎNG — ' + LAST_MAIL_ERROR));

  var mau2 = {};
  for (var k in mau) mau2[k] = mau[k];
  mau2.id = 'THUTHU02';
  mau2.groupSize = '2';
  mau2.amount = String(PRICE_PER_PERSON * 2);
  var ok2 = sendScheduledEmail_(mau2, 'new');
  Logger.log('2. Thư "xác nhận giờ bay" (kèm lịch .ics)     : ' +
    (ok2 ? 'ĐÃ GỬI' : 'HỎNG — ' + LAST_MAIL_ERROR));

  if (ok1 && ok2) {
    Logger.log('XONG — kiểm tra hộp thư ' + TEST_EMAIL_TO + ' (ngó cả mục Spam).');
  } else {
    Logger.log('CÓ THƯ GỬI HỎNG — xem lý do ở trên và tab "' + LOG_SHEET_NAME + '".');
  }
  return { owner: owner, seenAs: alias || owner, held: ok1, scheduled: ok2,
    error: LAST_MAIL_ERROR, quotaLeft: mailQuotaLeft_() };
}

/* ============================================================
 * PHẦN 4 — TRẠNG THÁI GHÉP ĐÔI + KÍCH HOẠT EMAIL
 * ============================================================ */

/* Đếm số người đang giữ mỗi slot (theo giờ bay). Slot đủ 2 người = đã
   ghép xong. Chỉ tính các trạng thái còn nằm trong hàng chờ. */
function slotHeadcount_(items) {
  var by = {};
  items.forEach(function (it) {
    if (QUEUE_STATUSES_.indexOf(it.status) === -1 || !it.eta) return;
    var t = Date.parse(it.eta);
    by[t] = (by[t] || 0) + sizeOf_(it);
  });
  return by;
}

/* Tên bạn bay cùng slot (để nhân viên biết ai ghép với ai) */
function partnerOf_(items, target) {
  var t = Date.parse(target.eta);
  var names = [];
  items.forEach(function (it) {
    if (it.id === target.id) return;
    if (QUEUE_STATUSES_.indexOf(it.status) === -1 || !it.eta) return;
    if (Date.parse(it.eta) === t) names.push(it.name);
  });
  return names.join(', ');
}

/* Tính lại pairState cho mọi lượt đang trong hàng chờ, rồi gửi email cho
   những khách lẻ VỪA ghép được đôi (HELD → SCHEDULED).
   Gọi hàm này SAU MỌI thao tác có thể làm đổi việc ghép đôi: duyệt thanh
   toán, hủy, hết hạn, repair. Chỉ ghi lại những hàng thật sự đổi. */
function syncPairing_(sheet, items) {
  var counts = slotHeadcount_(items);
  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();

  items.forEach(function (it) {
    if (QUEUE_STATUSES_.indexOf(it.status) === -1) return;

    var before = {
      pairState: it.pairState, pairWith: it.pairWith,
      emailStage: it.emailStage, emailedEta: it.emailedEta
    };
    var size = sizeOf_(it);
    var full = it.eta && counts[Date.parse(it.eta)] >= 2;

    if (size === 2) {
      it.pairState = PAIR_DUO;
      it.pairWith = '';
    } else {
      it.pairState = full ? PAIR_SOLO_PAIRED : PAIR_SOLO_WAITING;
      it.pairWith = full ? partnerOf_(items, it) : '';
    }

    // Khách lẻ vừa ghép xong mà mới chỉ nhận Email 1 → gửi Email 2 (có giờ)
    if (it.pairState === PAIR_SOLO_PAIRED && it.emailStage === MAIL_HELD) {
      if (sendScheduledEmail_(it, 'paired')) it.emailStage = MAIL_SCHEDULED;
    } else if (it.emailStage === MAIL_SCHEDULED && it.eta && it.emailedEta && it.eta !== it.emailedEta) {
      /* Đã báo giờ cho khách rồi mà giờ đó NAY ĐÃ ĐỔI (bạn bay chung hủy →
         xếp lại lịch). Im lặng là để khách tới sai giờ và giữ một sự kiện
         sai trong lịch điện thoại — phải gửi email cập nhật kèm .ics mới. */
      sendScheduledEmail_(it, 'moved');
    }

    if (before.pairState !== it.pairState || before.pairWith !== it.pairWith ||
        before.emailStage !== it.emailStage || before.emailedEta !== it.emailedEta) {
      it.updatedAt = now;
      writeRow_(sheet, it);
    }
  });
}

/* STT trong ngày: đếm số lượt ĐÃ DUYỆT trong cùng ngày bay rồi +1.
   Cấp một lần lúc duyệt và giữ nguyên — kể cả khi giờ bay bị xếp lại,
   vì số này đã đi vào email của khách. */
function nextSeqForDay_(items, dayKey) {
  var n = 0;
  items.forEach(function (it) {
    if (it.flightDate === dayKey && it.seq) n++;
  });
  return n + 1;
}

/* 'YYYY-MM-DD' theo giờ VN */
function dayKeyVn_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), TIMEZONE, 'yyyy-MM-dd');
}

/* action=diag — trả về tình trạng thật của bản Apps Script đang chạy.
   Dùng để trả lời ngay câu "code sửa rồi mà sao chạy vẫn sai?": nếu
   version ở đây khác version trong file trên máy thì bản deploy đã cũ,
   phải Deploy → Manage deployments → Edit → New version. */
function diag_(sheet) {
  var head = [];
  try {
    var lastCol = Math.max(sheet.getLastColumn(), HEADER_LABELS.length);
    head = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  } catch (err) {}

  var items = readAll_(sheet);
  var withSlot = 0, badSlot = [];
  items.forEach(function (it) {
    if (it.slotKey && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(it.slotKey)) withSlot++;
    else if (it.status && ['CANCELLED', 'PAYMENT_EXPIRED', 'NO_SHOW'].indexOf(it.status) === -1) {
      if (badSlot.length < 5) badSlot.push({ id: it.id, slotKey: it.slotKey || '(trống)', eta: it.eta || '' });
    }
  });

  return json_({
    ok: true,
    version: SCRIPT_VERSION,
    sheetName: SHEET_NAME,
    sheetExists: !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME),
    headerOk: HEADER_LABELS.every(function (l, i) { return head[i] === l; }),
    hasSlotColumn: head.indexOf('Slot đã chọn') !== -1,
    slotColumnIndex: head.indexOf('Slot đã chọn'),
    headers: head,
    rows: items.length,
    rowsWithValidSlot: withSlot,
    rowsWithBadSlot: badSlot,
    scheduleDays: (FLIGHT_SCHEDULE.groups || []).reduce(function (n, g) { return n + (g.dates || []).length; }, 0),
    timezone: TIMEZONE
  });
}

function doGet(e) {
  // Trả từ cache nếu có — không đụng Sheet, chịu tải cao
  try {
    var hit = CacheService.getScriptCache().get(CACHE_KEY);
    if (hit) {
      return ContentService.createTextOutput(hit)
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {}
  var items = readAll_(getSheet_());
  cachePut_(items);
  items = items.map(function (it) { delete it.row; return it; });
  return json_({ ok: true, version: SCRIPT_VERSION, items: items });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Chờ khoá lâu hơn (20s) khi quá đông; hết kiên nhẫn thì trả BUSY
  // gọn gàng để máy khách tự thử lại — không văng trang lỗi HTML.
  try {
    lock.waitLock(20000);
  } catch (errLock) {
    return json_({ ok: false, error: 'BUSY' });
  }
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'registerCourse') return registerCourse_(p);
    var sheet = getSheet_();
    if (p.action === 'register') return register_(sheet, p);
    if (p.action === 'update') return update_(sheet, p);
    if (p.action === 'confirmPayment') return confirmPayment_(sheet, p);
    if (p.action === 'repair') return repair_(sheet);
    if (p.action === 'diag') return diag_(sheet);
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * QR2 — Khảo sát workshop đã qua / workshop tiếp theo (courses.html)
 * Không phải đăng ký khóa học — TFD không có khóa học nào. Đây chỉ là
 * khảo sát để lên lịch & chọn chủ đề cho workshop tiếp theo.
 * Sheet riêng "CourseRegistrations", không liên quan tới hàng chờ bay.
 * ============================================================ */
var COURSE_SHEET_NAME = 'Jun Pham workshop survey';
var COURSE_HEADER_LABELS = ['Thời gian gửi', 'Họ và tên', 'SĐT', 'Email', 'Bạn là', 'Trong tuần / cuối tuần', 'Khoảng thời gian', 'Khung giờ', 'Chủ đề workshop quan tâm'];
var COURSE_HEADERS = ['createdAt', 'name', 'phone', 'email', 'audience', 'scheduleType', 'period', 'timeOfDay', 'topics'];

function getCourseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(COURSE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COURSE_SHEET_NAME);
    trySetTextFormat_(sheet.getRange(1, 1, 1, COURSE_HEADER_LABELS.length));
    sheet.getRange(1, 1, 1, COURSE_HEADER_LABELS.length).setValues([COURSE_HEADER_LABELS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function registerCourse_(p) {
  var name = (p.name || '').trim();
  var phone = (p.phone || '').replace(/\s+/g, '');
  var email = (p.email || '').trim();
  var audience = (p.audience || '').trim();
  var scheduleType = (p.scheduleType || '').trim();
  var period = (p.period || '').trim();
  var timeOfDay = (p.timeOfDay || '').trim();
  var topics = (p.topics || '').trim(); // chủ đề đã chọn, nối bằng "; " từ phía website
  if (!name || !phone || !audience || !scheduleType || !period || !timeOfDay || !topics) {
    return json_({ ok: false, error: 'MISSING_FIELDS' });
  }

  var sheet = getCourseSheet_();
  var now = toDisplayTime_(new Date(Math.floor(Date.now() / 1000) * 1000).toISOString());
  var rowIndex = sheet.getLastRow() + 1;
  var range = sheet.getRange(rowIndex, 1, 1, COURSE_HEADERS.length);
  trySetTextFormat_(range);
  range.setValues([[now, name, phone, email, audience, scheduleType, period, timeOfDay, topics]]);
  return json_({ ok: true });
}

/* LƯỚI AN TOÀN phía server: đăng ký quá hạn thanh toán (5 phút + 60 giây
   dung sai) tự chuyển PAYMENT_EXPIRED ngay trên sheet. Bình thường trang
   admin tự hủy đúng hạn; sweep này chỉ đỡ khi trang admin đứng hình / mất
   mạng — khách "kẹt ở 0:00" không tồn tại mãi trong danh sách chờ nữa.
   PENDING_PAYMENT chưa có eta (chưa chiếm slot) nên đổi trạng thái là đủ,
   không cần reflow. exceptId: chừa lượt đang được xác nhận thanh toán —
   admin đã cầm tiền rồi thì dù bấm trễ vẫn phải nhận. */
function expireOverduePending_(sheet, items, exceptId) {
  var cutoff = Date.now() - PAYMENT_MS - 60000;
  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  items.forEach(function (it) {
    if (it.status !== 'PENDING_PAYMENT' || it.id === exceptId) return;
    var t = Date.parse(it.createdAt);
    if (isNaN(t) || t > cutoff) return;
    it.status = 'PAYMENT_EXPIRED';
    it.updatedAt = now;
    writeRow_(sheet, it);
  });
}

function register_(sheet, p) {
  var name = (p.name || '').trim();

  var phone = (p.phone || '').replace(/\s+/g, '');
  var email = (p.email || '').trim();
  if (!name) return json_({ ok: false, error: 'MISSING_FIELDS' });
  // Email là kênh gửi giờ bay + lời mời lịch — sai định dạng thì chặn ngay
  // tại đây, đừng để tới lúc duyệt mới phát hiện không gửi được cho ai.
  if (!email || !isEmail_(email)) return json_({ ok: false, error: 'BAD_EMAIL' });

  // Ngoài khung giờ nhận đăng ký → từ chối (chốt chặn cuối cùng)
  if (!isBookingOpen_()) {
    return json_({ ok: false, error: 'CLOSED', hours: bookingHoursText_() });
  }

  var items = readAll_(sheet);
  expireOverduePending_(sheet, items);

  // id do máy khách sinh (cid) — nếu lệnh bị GỬI LẠI do lỗi mạng/BUSY,
  // server thấy trùng id thì trả bản đã có, KHÔNG tạo hàng trùng lặp.
  var cid = String(p.cid || '');
  var id = /^[a-z0-9]{6,12}$/i.test(cid) ? cid : Utilities.getUuid().slice(0, 8);
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      var existing = items[i];
      cachePut_(items);
      delete existing.row;
      return json_({ ok: true, item: existing });
    }
  }

  var size = p.groupSize === '2' ? 2 : 1;

  /* ---------- CHỐT SLOT (chống tranh chỗ) ----------
     doPost đang giữ LockService nên đoạn kiểm-tra-rồi-ghi này là NGUYÊN
     TỬ: hai khách cùng bấm một ô trong cùng một giây thì người sau chắc
     chắn nhận lỗi SLOT_TAKEN thay vì cùng chen vào một slot.
     Cũng chặn luôn slotKey do khách tự chế (isRealSlot_). */
  var slotKey = String(p.slotKey || '').trim();
  if (!slotKey) return json_({ ok: false, error: 'NO_SLOT' });
  var slotErr = validateSlot_(indexBookings_(items), slotKey, size, Date.now());
  if (slotErr) {
    return json_({ ok: false, error: slotErr, slotKey: slotKey });
  }
  var slotStartMs = slotKeyToMs_(slotKey);
  // Làm tròn xuống giây — sheet lưu giờ chính xác tới giây, giữ cho
  // giá trị trả về website trùng khớp với giá trị đọc lại từ sheet
  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  // Giờ bay = slot khách vừa chọn (đã kiểm tra ở trên). Khách vẫn phải
  // chuyển khoản trong PAYMENT_MINUTES; quá hạn thì PAYMENT_EXPIRED và
  // slot được nhả ra cho người khác (xem SLOT_HOLDING_).
  var item = {
    id: id,
    createdAt: now,
    name: name,
    phone: phone,
    email: email,
    status: 'PENDING_PAYMENT',
    calledAt: '',
    sessionStart: '',
    updatedAt: now,
    groupSize: String(size),
    /* Giờ bay CHÍNH LÀ slot khách vừa chọn — chốt ngay từ lúc đăng ký,
       không tính lại lúc duyệt. Khách đã nhìn thấy giờ này trên màn hình
       nên tuyệt đối không được đổi sau lưng họ. */
    slotKey: slotKey,
    eta: new Date(slotStartMs).toISOString(),
    flightDate: slotKey.slice(0, 10),
    // Khách tự chọn sẽ chuyển khoản hay quét QR; nhân viên có thể sửa lại
    // lúc duyệt nếu thực tế khác. Số tiền chốt theo số người ngay từ đầu.
    payMethod: normPayMethod_(p.payMethod),
    amount: String(PRICE_PER_PERSON * size),
    payRef: '',
    approvedAt: '',
    seq: '',
    pairState: '',
    pairWith: '',
    emailStage: '',
    row: sheet.getLastRow() + 1
  };
  writeRow_(sheet, item);
  items.push(item);
  cachePut_(items);
  delete item.row;
  return json_({ ok: true, item: item });
}

/* Tự sửa lịch hàng chờ (PHẢI GIỐNG queue.js). Các bước:
   1) GHÉP CẶP: khách 1-người WAITING đang lẻ ở slot sau được chuyển vào
      slot lẻ SỚM NHẤT còn trống chỗ — chữa cả dữ liệu lệch khi hai khách
      1-người từng nhận hai slot riêng.
   2) ƯU TIÊN ĐỦ NGƯỜI + NÉN SLOT: slot đủ người đứng trước, slot lẻ ra
      sau cùng; slot trống hẳn biến mất, slot sau dồn sớm lên. Slot có
      người CALLED/PRESENT giữ nguyên giờ; WAITING không bị đẩy trễ hơn.
   CHẾ ĐỘ allowPush=true (khi PHIÊN BAY VỪA BẮT ĐẦU — có thể trễ vì khách
   tới muộn trong 5 phút ân hạn): được phép đẩy giờ các slot sau RA TRỄ,
   tính lại toàn bộ từ giờ kết thúc THẬT của phiên — chặn domino giờ ảo.
   Trả về [{id, eta}] — chỉ những lượt có giờ THAY ĐỔI. */
function reflowWaiting_(items, now, allowPush) {
  now = now || Date.now();

  var boothFree = now;
  items.forEach(function (it) {
    if (it.status === 'IN_SESSION' && it.sessionStart) {
      var end = Date.parse(it.sessionStart) + SESSION_MS;
      if (end > boothFree) boothFree = end;
    }
  });

  var active = items.filter(function (it) {
    return QUEUE_STATUSES_.indexOf(it.status) !== -1 && it.eta;
  });
  var etaOf = {};
  active.forEach(function (it) { etaOf[it.id] = Date.parse(it.eta); });

  function slotList() {
    var bySlot = {};
    active.forEach(function (it) {
      var t = etaOf[it.id];
      (bySlot[t] = bySlot[t] || []).push(it);
    });
    return Object.keys(bySlot).map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (t) {
        var members = bySlot[t];
        var people = 0;
        members.forEach(function (m) { people += sizeOf_(m); });
        return { time: t, members: members, people: people };
      });
  }

  // 1) ghép cặp khách 1-người đang lẻ
  var moved = true;
  while (moved) {
    moved = false;
    var open = slotList().filter(function (s) { return s.people < 2; });
    for (var i = 0; i < open.length && !moved; i++) {
      for (var j = i + 1; j < open.length && !moved; j++) {
        var mover = null;
        open[j].members.forEach(function (m) {
          if (!mover && m.status === 'WAITING' && sizeOf_(m) === 1) mover = m;
        });
        if (mover) { etaOf[mover.id] = open[i].time; moved = true; }
      }
    }
  }

  // 2) xếp thứ tự ưu tiên + nén: slot ĐỦ NGƯỜI (và slot đã khoá) đứng
  //    trước — nhóm đủ người chắc chắn lấp đầy buồng lái nên bay trước;
  //    slot lẻ đang chờ ghép (khách không thấy giờ) dời ra SAU CÙNG.
  var cursor = boothFree;
  var loneSlots = [];
  slotList().forEach(function (s) {
    // Slot đang LÊN BUỒNG LÁI (giờ đã tới, mọi thành viên còn lại đều
    // PRESENT — bạn bay chung vừa chuyển IN_SESSION): bỏ qua, khung giờ
    // phiên hiện tại đã bao trùm slot này.
    if (allowPush && s.time <= now && s.members.every(function (m) { return m.status === 'PRESENT'; })) return;
    var locked = s.members.some(function (it) { return it.status === 'CALLED' || it.status === 'PRESENT'; });
    if (!locked && s.people < 2) { loneSlots.push(s); return; }
    var slotStart;
    if (locked) {
      slotStart = allowPush ? Math.max(cursor, s.time) : s.time;
    } else {
      slotStart = allowPush ? cursor : Math.min(cursor, s.time);
    }
    if (slotStart !== s.time) s.members.forEach(function (it) { etaOf[it.id] = slotStart; });
    cursor = Math.max(cursor, slotStart + SESSION_MS);
  });
  loneSlots.forEach(function (s) {
    s.members.forEach(function (it) { etaOf[it.id] = cursor; });
    cursor += SESSION_MS;
  });

  var changes = [];
  active.forEach(function (it) {
    if (Date.parse(it.eta) !== etaOf[it.id]) {
      changes.push({ id: it.id, eta: new Date(etaOf[it.id]).toISOString() });
    }
  });
  return changes;
}

/* Ghi các thay đổi giờ bay của reflowWaiting_ vào sheet (1 lệnh/hàng)
   và cập nhật luôn bản trong bộ nhớ để write-through cache */
function applyReflow_(sheet, items, changes) {
  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  changes.forEach(function (ch) {
    for (var j = 0; j < items.length; j++) {
      if (items[j].id !== ch. id) continue;
      items[j].eta = ch.eta;
      items[j].updatedAt = now;
      writeRow_(sheet, items[j]);
      break;
    }
  });
}

/* action=repair — trang admin gọi khi phát hiện lịch lệch (khách lẻ chưa
   ghép, sai thứ tự ưu tiên, hoặc "giờ ảo" khi phiên bắt đầu trễ) để tự
   sửa ngay trên sheet. allowPush để đẩy được giờ ảo ra sau phiên thật. */
/* action=repair — quét lại dữ liệu cho khớp.
   KHÔNG còn xếp lại giờ bay (reflow): khách tự chọn slot nên không có
   "lịch lệch" để sửa nữa. Việc còn lại là dọn đăng ký quá hạn thanh toán
   (nhả slot) và tính lại trạng thái ghép đôi + gửi email còn thiếu. */
function repair_(sheet) {
  var items = readAll_(sheet);
  expireOverduePending_(sheet, items);
  syncPairing_(sheet, items);
  cachePut_(items);
  return json_({ ok: true, changed: 0 });
}

function update_(sheet, p) {
  var items = readAll_(sheet);
  expireOverduePending_(sheet, items, p.id);
  var target = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === p.id) { target = items[i]; break; }
  }
  if (!target) return json_({ ok: false, error: 'NOT_FOUND' });

  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  target.status = p.status;
  target.updatedAt = now;
  if (p.status === 'CALLED' && !target.calledAt) target.calledAt = now;
  if (p.status === 'IN_SESSION' && !target.sessionStart) target.sessionStart = now;
  writeRow_(sheet, target);

  /* KHÔNG xếp lại lịch nữa.
     Trước đây hệ thống là hàng chờ: giờ bay do máy tính ra nên huỷ một
     người thì dồn cả hàng lên cho kín. Giờ khách TỰ CHỌN slot 15 phút và
     đã nhìn thấy giờ đó trên màn hình — dồn lịch sẽ kéo họ sang giờ khác
     mà họ không hề chọn. Huỷ một booking chỉ đơn giản là NHẢ SLOT đó ra
     (SLOT_HOLDING_ không tính trạng thái đã kết thúc), slot lập tức hiện
     lại là "còn trống" cho người sau. */

  /* Bất kỳ thay đổi trạng thái nào cũng có thể phá vỡ hoặc tạo ra một cặp:
     một người trong cặp bị hủy thì người còn lại quay về "đang chờ ghép",
     và khi ghép lại được sẽ nhận Email 2. */
  syncPairing_(sheet, items);

  cachePut_(items);
  delete target.row;
  return json_({ ok: true, item: target });
}

/* Bàn admin xác nhận đã nhận thanh toán (chuyển khoản / QR / tiền mặt).
   GIỜ BAY KHÔNG ĐƯỢC TÍNH Ở ĐÂY — nó chính là slot khách đã tự chọn lúc
   đăng ký và đã nhìn thấy trên màn hình. Bước này chỉ: đổi trạng thái
   sang WAITING, cấp số thứ tự trong ngày, xác định đã ghép đôi hay chưa,
   ghi sổ thu tiền và gửi email. Bấm hai lần không gửi email hai lần. */
function confirmPayment_(sheet, p) {
  var items = readAll_(sheet);
  expireOverduePending_(sheet, items, p.id);
  var target = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === p.id) { target = items[i]; break; }
  }
  if (!target) return json_({ ok: false, error: 'NOT_FOUND' });
  if (target.status !== 'PENDING_PAYMENT') {
    delete target.row;
    return json_({ ok: true, item: target });
  }

  var now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  /* Giữ nguyên giờ bay khách đã chọn. Chỉ dữ liệu cũ (đăng ký từ trước
     khi có tính năng chọn slot) mới chưa có eta — khi đó mới tính giúp. */
  if (!target.eta) {
    var eta = Math.floor(computeEta_(items, sizeOf_(target)) / 1000) * 1000;
    target.eta = new Date(eta).toISOString();
  }
  if (!target.slotKey && target.eta) target.slotKey = msToSlotKey_(Date.parse(target.eta));
  target.status = 'WAITING';
  target.updatedAt = now;
  target.approvedAt = now;

  // Nhân viên có thể sửa/điền hình thức thanh toán ngay lúc bấm duyệt
  // (khách nhắn Zalo "em chuyển khoản rồi" → nhân viên chọn Chuyển khoản).
  var pm = normPayMethod_(p.payMethod);
  if (pm) target.payMethod = pm;
  if (p.payRef != null && String(p.payRef).trim()) target.payRef = String(p.payRef).trim();
  if (!target.amount) target.amount = String(PRICE_PER_PERSON * sizeOf_(target));

  /* KHÔNG xếp lại lịch: xem ghi chú trong update_. Khách chọn slot nào
     thì bay đúng slot đó; duyệt thanh toán không được dời giờ của ai. */

  /* --- PHẦN 4: chốt ngày bay + STT trong ngày cho khách vừa duyệt --- */
  target.flightDate = dayKeyVn_(target.eta);
  if (!target.seq) target.seq = String(nextSeqForDay_(items, target.flightDate));

  /* --- PHẦN 5: chọn kịch bản email ---
     Khách 2 người: tự đủ cặp → gửi luôn email CÓ giờ bay + lời mời lịch.
     Khách lẻ: chỉ gửi email CÓ giờ nếu slot đã đủ 2 người ngay lúc này
     (tức là vừa ghép được vào chỗ của một khách lẻ đang chờ). Chưa đủ thì
     gửi Email 1 KHÔNG có giờ, và syncPairing_ sẽ gửi Email 2 sau. */
  var counts = slotHeadcount_(items);
  var pairedNow = target.eta && counts[Date.parse(target.eta)] >= 2;

  if (sizeOf_(target) === 2) {
    target.pairState = PAIR_DUO;
    if (sendScheduledEmail_(target, 'new')) target.emailStage = MAIL_SCHEDULED;
  } else if (pairedNow) {
    target.pairState = PAIR_SOLO_PAIRED;
    target.pairWith = partnerOf_(items, target);
    if (sendScheduledEmail_(target, 'new')) target.emailStage = MAIL_SCHEDULED;
  } else {
    target.pairState = PAIR_SOLO_WAITING;
    if (sendHeldEmail_(target)) target.emailStage = MAIL_HELD;
  }

  writeRow_(sheet, target);

  /* Bạn bay cùng có thể vừa chuyển từ "đang chờ ghép" sang "đã ghép" —
     syncPairing_ sẽ gửi Email 2 cho người đó. */
  syncPairing_(sheet, items);

  /* --- PHẦN 2: ghi sổ thu tiền sang sheet Payments riêng --- */
  logPayment_(target);

  cachePut_(items);
  delete target.row;

  /* Báo về trang quản lý email đã đi hay chưa. Trước đây gửi hỏng chỉ ghi
     vào sheet Log — nhân viên bấm duyệt thấy "thành công" và tưởng khách
     đã nhận thư, trong khi thực tế không có email nào cả. */
  return json_({
    ok: true,
    item: target,
    emailSent: (target.emailStage === MAIL_HELD || target.emailStage === MAIL_SCHEDULED),
    emailError: LAST_MAIL_ERROR || '',
    mailQuotaLeft: mailQuotaLeft_()
  });
}
