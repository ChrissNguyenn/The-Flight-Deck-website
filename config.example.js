/* ============================================================
   MẪU CẤU HÌNH — chép file này thành `config.js` rồi điền giá trị thật.

     cp config.example.js config.js      (macOS/Linux)
     copy config.example.js config.js    (Windows)

   `config.js` đã được .gitignore nên giá trị thật KHÔNG bị đẩy lên GitHub.

   ⚠️ Lưu ý về bảo mật: đây là website tĩnh, `config.js` được gửi thẳng tới
   trình duyệt của khách. Nghĩa là SCRIPT_URL và ADMIN_PIN AI XEM MÃ NGUỒN
   TRANG CŨNG THẤY. Việc .gitignore chỉ giúp chúng không bị bot quét GitHub
   tìm ra và không nằm vĩnh viễn trong lịch sử git — KHÔNG biến chúng thành
   bí mật. Muốn thật sự an toàn thì phải kiểm tra quyền ở phía server
   (Apps Script), đừng dựa vào PIN phía trình duyệt.
   ============================================================ */

var TFD_CONFIG = {
  SCRIPT_URL: "",              // ← dán URL Web App của bạn vào đây (xem README)
  ADMIN_PIN: "000000",         // ← ĐỔI THÀNH PIN CỦA BẠN (mở admin.html)
  SESSION_MINUTES: 15,     // mọi lượt bay đều 15 phút (1 người sẽ được ghép với 1 người khác)
  PRICE_PER_PERSON: 150000, // giá tiền — 150K / 1 người bay
  PREP_MINUTES: 5,         // phải có mặt trước 5 phút; quá 5 phút sau khi gọi sẽ tự hủy

  /* Hạn thanh toán — PHẢI BẰNG PAYMENT_MS trong google-apps-script.gs.
     ĐÃ NÂNG 5 → 45 PHÚT cho luồng "chuyển khoản rồi gửi ảnh qua Zalo":
     khách cần thời gian mở app ngân hàng, chuyển tiền, chụp màn hình, gửi
     Zalo; rồi nhân viên mới đọc Zalo và bấm duyệt. Để 5 phút thì gần như
     mọi đăng ký sẽ tự hủy trước khi kịp xác nhận. */
  PAYMENT_MINUTES: 45,

  /* Link Zalo để khách gửi ảnh chụp giao dịch chuyển khoản */
  ZALO_LINK: "https://zalo.me/0919686320",

  /* Thông tin chuyển khoản hiện cho khách sau khi đăng ký.
     bin = mã ngân hàng 6 số theo chuẩn NAPAS/VietQR (tra tại
     https://api.vietqr.io/v2/banks). Techcombank = 970407.
     Website tự sinh mã VietQR từ 3 thông tin này (xem vietqr.js) nên
     KHÔNG cần dán ảnh QR chụp từ app ngân hàng nữa. */
  BANK: {
    accountName: "HO KINH DOANH THE FLIGHT DECK",
    accountNumber: "6886320321",
    bankName: "Techcombank",
    bin: "970407"
  },
  /* ============================================================
     LỊCH BAY THÁNG 8 — NGUỒN SỰ THẬT DUY NHẤT CỦA CẢ HỆ THỐNG
     ============================================================
     Mỗi nhóm ngày có khung giờ riêng. Hệ thống tự cắt các khung này
     thành từng slot 15 phút (10:00, 10:15, 10:30…) cho khách chọn.
     Ngày KHÔNG có trong danh sách = không mở slot nào.

     Sửa lịch = sửa DUY NHẤT ở đây: trang chọn slot, tấm vé trang chủ,
     tab ngày trong admin và chốt chặn phía server đều đọc từ đây.
     PHẢI KHỚP với FLIGHT_SCHEDULE trong google-apps-script.gs.

     Lưu ý về NĂM: đề bài chỉ ghi ngày/tháng (3/8, 8/8…). Chọn 2026 vì
     khi đó nhóm 1 rơi đúng vào các ngày trong tuần (T2–T6) và nhóm 2
     đúng cuối tuần (T7, CN) — khớp với việc cuối tuần mở sớm từ 08:00.
     Nếu sự kiện là năm khác, sửa lại toàn bộ ngày bên dưới. */
  FLIGHT_SCHEDULE: {
    slotMinutes: 15,
    groups: [
      /* ============================================================
         🧪 NGÀY TEST — XOÁ CẢ KHỐI NÀY TRƯỚC KHI SỰ KIỆN BẮT ĐẦU
         ------------------------------------------------------------
         Mở nguyên ngày để sếp/nhân viên tự đặt thử bất cứ lúc nào, không
         phải chờ đúng khung giờ thật.

         test: true  → ngày này KHÔNG hiện trên tấm vé ở trang chủ (khách
         thật không thấy), nhưng VẪN hiện trong lưới chọn giờ và trang
         quản lý để test được.

         Mở tới hết 2/8 (ngay trước ngày bay thật đầu tiên 3/8) và mở
         nguyên 24h — sếp thử lúc nửa đêm cũng được. Trước đây chỉ có đúng
         một ngày 30/7 và đóng lúc 22:00, nên qua 22h là không bấm thử
         được nữa.

         ⚠️ Khung giờ rộng ở đây cũng nới luôn giờ NHẬN ĐĂNG KÝ chung
         (BOOKING_HOURS suy ra từ tất cả các khung bên dưới) thành cả
         ngày. Xoá khối này là mọi thứ trở lại như cũ.
         ============================================================ */
      {
        label: "Ngày test",
        test: true,
        dates: ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"],
        windows: [{ start: "00:00", end: "23:59" }]
      },
      {
        label: "Ngày thường",
        dates: ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10"],
        windows: [
          { start: "10:00", end: "13:00" },
          { start: "17:00", end: "21:00" }
        ]
      },
      {
        label: "Cuối tuần",
        dates: ["2026-08-08", "2026-08-09"],
        windows: [
          { start: "08:00", end: "12:00" },
          { start: "19:00", end: "21:00" }
        ]
      }
    ]
  },

  /* Khách được đặt trước bao nhiêu phút so với giờ bay. Slot cách hiện
     tại ít hơn mức này sẽ bị khoá — tránh đặt lúc 10:14 cho slot 10:15
     rồi không kịp chuyển khoản và tới nơi. */
  MIN_LEAD_MINUTES: 30,

  /* Khách cần có mặt trước giờ bay bao nhiêu phút (dùng trong email +
     lời mời lịch). */
  ARRIVE_EARLY_MINUTES: 15
};

/* ------------------------------------------------------------------
   Suy ra EVENT_DAYS và BOOKING_HOURS từ FLIGHT_SCHEDULE ở trên, để
   phần còn lại của hệ thống (tab ngày admin, chốt giờ nhận đăng ký,
   tấm vé trang chủ) không phải cấu hình lần thứ hai — trước đây hai
   nơi này lệch nhau và không ai phát hiện.
   ------------------------------------------------------------------ */
(function (cfg) {
  var sch = cfg.FLIGHT_SCHEDULE || { groups: [] };

  // Tất cả ngày có mở bay, đã sắp xếp
  var days = [];
  (sch.groups || []).forEach(function (g) {
    (g.dates || []).forEach(function (d) { if (days.indexOf(d) === -1) days.push(d); });
  });
  days.sort();
  cfg.EVENT_DAYS = days;

  /* Khung giờ NHẬN ĐĂNG KÝ mỗi ngày = bao trùm mọi khung bay của mọi
     nhóm (sớm nhất → muộn nhất). Cụ thể ngày nào mở slot nào thì do
     slots.js quyết định; đây chỉ là cổng chặn thô theo giờ trong ngày. */
  function toMin(hm) { var p = String(hm).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function toHm(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  var wins = [];
  (sch.groups || []).forEach(function (g) {
    (g.windows || []).forEach(function (w) {
      wins.push({ s: toMin(w.start), e: toMin(w.end) });
    });
  });
  wins.sort(function (a, b) { return a.s - b.s; });
  var merged = [];
  wins.forEach(function (w) {
    var last = merged[merged.length - 1];
    if (last && w.s <= last.e) { last.e = Math.max(last.e, w.e); }
    else { merged.push({ s: w.s, e: w.e }); }
  });
  cfg.BOOKING_HOURS = merged.map(function (w) {
    return { start: toHm(w.s), end: toHm(w.e) };
  });
})(TFD_CONFIG);
