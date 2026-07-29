/* ============================================================
   The Flight Deck — sinh slot 15 phút & tính trạng thái ghép đôi

   ⚠️ LOGIC TRONG FILE NÀY PHẢI GIỐNG HỆT phần tương ứng trong
   google-apps-script.gs (mục "SLOT ENGINE"). Máy khách dựng giao diện
   từ đây; server dùng bản của nó để CHỐT LẦN CUỐI khi khách bấm gửi.
   Lệch nhau = khách thấy ô trống nhưng gửi lên bị từ chối.

   ---------- BA TRẠNG THÁI CỦA MỘT SLOT ----------
     EMPTY        chưa ai đặt        → khách 1 người và 2 người đều chọn được
     PENDING_PAIR đã có 1 khách lẻ   → CHỈ khách lẻ khác chọn được (để ghép đôi)
     FULL         đủ 2 chỗ           → không ai chọn được

   Trạng thái KHÔNG được lưu riêng trong sheet — nó luôn được TÍNH LẠI
   từ danh sách booking. Lưu trạng thái riêng sẽ có ngày lệch với dữ
   liệu thật (huỷ tay trong Google Sheet, quá hạn thanh toán…), lúc đó
   khách nhìn thấy một đằng, hệ thống hiểu một nẻo.
   ============================================================ */

var TFD_SLOTS = (function () {
  'use strict';

  var TZ_OFFSET_MS = 7 * 3600000;      // GMT+7
  var DAY_MS = 86400000;

  /* Trạng thái booking vẫn đang GIỮ CHỖ trong slot. PENDING_PAYMENT có
     giữ chỗ: khách đã chọn slot và đang đi chuyển khoản — không thể để
     người khác cướp mất trong lúc đó. Các trạng thái đã kết thúc
     (huỷ / quá hạn / không đến) thì nhả chỗ ra. */
  var HOLDING = ['PENDING_PAYMENT', 'WAITING', 'CALLED', 'PRESENT', 'IN_SESSION', 'DONE'];

  var EMPTY = 'EMPTY';
  var PENDING_PAIR = 'PENDING_PAIR';
  var FULL = 'FULL';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function toHm(mins) { return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60); }

  function sizeOf(item) { return String(item && item.groupSize) === '2' ? 2 : 1; }

  /* 'YYYY-MM-DD' + 'HH:MM' (giờ VN) → timestamp thật (ms UTC) */
  function slotMs(dateKey, hm) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    var t = toMin(hm);
    if (!d || t === null) return NaN;
    return Date.UTC(+d[1], +d[2] - 1, +d[3], 0, 0, 0) - TZ_OFFSET_MS + t * 60000;
  }

  /* timestamp → 'YYYY-MM-DD' theo giờ VN */
  function dateKeyOf(ms) {
    var d = new Date(ms + TZ_OFFSET_MS);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /* timestamp → 'HH:MM' theo giờ VN */
  function hmOf(ms) {
    var d = new Date(ms + TZ_OFFSET_MS);
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  }

  /* Khoá định danh slot: 'YYYY-MM-DDTHH:MM' (giờ VN).
     Dùng chuỗi chứ không dùng timestamp số để đọc thẳng trong Google
     Sheet cũng hiểu được, và so sánh chuỗi là chính xác tuyệt đối. */
  function slotKey(dateKey, hm) { return dateKey + 'T' + hm; }
  function keyFromMs(ms) { return slotKey(dateKeyOf(ms), hmOf(ms)); }

  /* ---------- 1. SINH SLOT ---------- */

  /** Các khung giờ mở của một ngày (rỗng nếu ngày đó không bay) */
  function windowsFor(schedule, dateKey) {
    var groups = (schedule && schedule.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      if ((groups[i].dates || []).indexOf(dateKey) !== -1) {
        return groups[i].windows || [];
      }
    }
    return [];
  }

  function groupLabelFor(schedule, dateKey) {
    var groups = (schedule && schedule.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      if ((groups[i].dates || []).indexOf(dateKey) !== -1) return groups[i].label || '';
    }
    return '';
  }

  /**
   * Cắt các khung giờ của một ngày thành slot 15 phút.
   * Slot cuối phải KẾT THÚC đúng lúc đóng cửa: khung 10:00–13:00 cho ra
   * slot cuối là 12:45 (bay tới 13:00), KHÔNG phải 13:00.
   * → [{ key, date, time, startMs, endMs }]
   */
  function generateSlots(schedule, dateKey) {
    var step = (schedule && schedule.slotMinutes) || 15;
    var out = [];
    windowsFor(schedule, dateKey).forEach(function (w) {
      var s = toMin(w.start), e = toMin(w.end);
      if (s === null || e === null || e <= s) return;
      for (var t = s; t + step <= e; t += step) {
        var hm = toHm(t);
        var startMs = slotMs(dateKey, hm);
        out.push({
          key: slotKey(dateKey, hm),
          date: dateKey,
          time: hm,
          startMs: startMs,
          endMs: startMs + step * 60000
        });
      }
    });
    out.sort(function (a, b) { return a.startMs - b.startMs; });
    return out;
  }

  /** Mọi ngày có mở bay, cũ → mới */
  function allDates(schedule) {
    var days = [];
    ((schedule && schedule.groups) || []).forEach(function (g) {
      (g.dates || []).forEach(function (d) { if (days.indexOf(d) === -1) days.push(d); });
    });
    return days.sort();
  }

  /* ---------- 2. TRẠNG THÁI SLOT ---------- */

  /**
   * Gom booking theo slot — MỘT lượt duyệt danh sách, O(n).
   * Trả về map { slotKey: { seats, hasDuo, solos:[booking], items:[booking] } }
   * Đây chính là "chỉ mục" để tra trạng thái slot trong O(1).
   */
  function indexBookings(items) {
    var map = {};
    (items || []).forEach(function (it) {
      if (!it || HOLDING.indexOf(it.status) === -1) return;
      var key = it.slotKey || (it.eta ? keyFromMs(Date.parse(it.eta)) : '');
      if (!key) return;
      var cell = map[key] || (map[key] = { seats: 0, hasDuo: false, solos: [], items: [] });
      var n = sizeOf(it);
      cell.seats += n;
      cell.items.push(it);
      if (n === 2) cell.hasDuo = true; else cell.solos.push(it);
    });
    return map;
  }

  /** Trạng thái của một slot từ chỉ mục ở trên — O(1) */
  function stateOf(index, key) {
    var cell = index[key];
    if (!cell || cell.seats <= 0) return EMPTY;
    if (cell.seats >= 2) return FULL;
    return PENDING_PAIR;            // đúng 1 khách lẻ đang giữ chỗ
  }

  /**
   * Khách cỡ groupSize có được chọn slot này không?
   * → { ok:true } hoặc { ok:false, reason:'FULL'|'DUO_ON_PENDING'|'PAST'|'TOO_SOON'|'CLOSED' }
   *
   * Luật (theo yêu cầu phần 4):
   *   EMPTY        → 1 người ✅ · 2 người ✅
   *   PENDING_PAIR → 1 người ✅ (ghép đôi) · 2 người ❌
   *   FULL         → ❌
   */
  function canBook(index, slot, groupSize, nowMs, opts) {
    opts = opts || {};
    var leadMs = (opts.minLeadMinutes || 0) * 60000;
    var st = stateOf(index, slot.key);

    if (st === FULL) return { ok: false, reason: 'FULL' };
    if (st === PENDING_PAIR && groupSize === 2) return { ok: false, reason: 'DUO_ON_PENDING' };
    if (slot.startMs <= nowMs) return { ok: false, reason: 'PAST' };
    if (slot.startMs - nowMs < leadMs) return { ok: false, reason: 'TOO_SOON' };
    return { ok: true };
  }

  /**
   * Dựng danh sách slot kèm trạng thái để render giao diện.
   * groupSize quyết định slot nào bấm được (khách 2 người không bấm
   * được ô đang chờ ghép).
   */
  function buildDay(schedule, dateKey, items, groupSize, nowMs, opts) {
    var index = indexBookings(items);
    var slots = generateSlots(schedule, dateKey);
    return slots.map(function (s) {
      var st = stateOf(index, s.key);
      var check = canBook(index, s, groupSize, nowMs, opts);
      var cell = index[s.key];
      return {
        key: s.key,
        date: s.date,
        time: s.time,
        startMs: s.startMs,
        endMs: s.endMs,
        state: st,
        seats: cell ? cell.seats : 0,
        selectable: check.ok,
        reason: check.ok ? '' : check.reason
      };
    });
  }

  return {
    EMPTY: EMPTY,
    PENDING_PAIR: PENDING_PAIR,
    FULL: FULL,
    HOLDING: HOLDING,
    sizeOf: sizeOf,
    slotMs: slotMs,
    dateKeyOf: dateKeyOf,
    hmOf: hmOf,
    slotKey: slotKey,
    keyFromMs: keyFromMs,
    windowsFor: windowsFor,
    groupLabelFor: groupLabelFor,
    generateSlots: generateSlots,
    allDates: allDates,
    indexBookings: indexBookings,
    stateOf: stateOf,
    canBook: canBook,
    buildDay: buildDay
  };
})();

/* Cho phép nạp bằng require() trong test Node, vẫn chạy như <script> trên web */
if (typeof module !== 'undefined' && module.exports) module.exports = TFD_SLOTS;
