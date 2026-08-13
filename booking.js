/* ============================================================
   THE FLIGHT DECK — bộ chọn giờ bay (đặt lịch thường ngày)
   ------------------------------------------------------------
   KHÁC với slots.js: file kia phục vụ sự kiện Carrot Day — mỗi lượt
   đúng 15 phút, hai khách lẻ được ghép chung một chuyến. File này là
   đặt buồng lái theo GIỜ (1–4 tiếng), mỗi lúc chỉ một nhóm khách vì
   quán chỉ có một buồng lái. Hai bài toán khác nhau nên tách hẳn ra,
   không dùng chung: nhét cả hai vào một engine thì mỗi lần sửa luật
   của bên này lại có nguy cơ làm hỏng bên kia.

   ---------- LUẬT ----------
   • Quán mở 09:00–21:00. Mọi lượt bay phải KẾT THÚC trước 21:00, nên
     giờ bắt đầu muộn nhất phụ thuộc số giờ khách chọn: bay 1 tiếng thì
     bắt đầu muộn nhất 20:00, bay 4 tiếng thì 17:00.
   • Giờ bắt đầu nhảy từng 15 phút: 09:00, 09:15, 09:30…
   • Một buồng lái ⇒ hai lượt KHÔNG được chồng giờ nhau.
   • Hôm nay thì chặn các giờ đã qua (và cần đặt trước ít nhất
     leadMinutes phút — mặc định 60).

   Phần tính toán thuần ở dưới không đụng tới DOM để chạy được cả
   trong Node khi kiểm thử.
   ============================================================ */

var TFD_BOOK = (function () {
  'use strict';

  var TZ_OFFSET_MS = 7 * 3600000;      // GMT+7
  var DAY_MS = 86400000;

  var DEFAULTS = {
    openStart: '09:00',
    openEnd: '21:00',
    stepMinutes: 15,
    minHours: 1,
    maxHours: 4,
    leadMinutes: 60,     // phải đặt trước ít nhất 1 tiếng
    daysAhead: 21        // dải ngày cho khách chọn
  };

  /* ---------- thời gian ---------- */

  function hhmmToMin(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return NaN;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return NaN;
    return h * 60 + mi;
  }

  function minToHhmm(n) {
    n = Math.round(n);
    var h = Math.floor(n / 60), m = n % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* Ngày giờ ở Việt Nam, bất kể máy khách đặt múi giờ nào. Khách đặt lịch
     từ nước ngoài (hoặc máy sai múi giờ) mà tính theo giờ máy thì "hôm
     nay" lệch một ngày và lưới giờ mở sai. */
  function vnNow(now) {
    return new Date((now ? now.getTime() : Date.now()) + TZ_OFFSET_MS);
  }

  function todayKey(now) {
    return vnNow(now).toISOString().slice(0, 10);
  }

  function nowMinutes(now) {
    var d = vnNow(now);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }

  function dayKeyAt(offset, now) {
    var base = new Date(vnNow(now).toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    return new Date(base + offset * DAY_MS).toISOString().slice(0, 10);
  }

  var DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  function dayLabel(key) {
    var d = new Date(key + 'T00:00:00Z');
    return {
      key: key,
      dow: DOW[d.getUTCDay()],
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6
    };
  }

  /* "2026-08-14" -> "14/08/2026" */
  function prettyDate(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return key || '';
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function days(cfg, now) {
    var c = conf(cfg), out = [];
    for (var i = 0; i < c.daysAhead; i++) out.push(dayLabel(dayKeyAt(i, now)));
    return out;
  }

  function conf(cfg) {
    var c = {}, k;
    for (k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) c[k] = DEFAULTS[k];
    if (cfg) for (k in cfg) if (cfg.hasOwnProperty(k) && cfg[k] != null) c[k] = cfg[k];
    return c;
  }

  /* ---------- sinh giờ bắt đầu ---------- */

  /* Mọi mốc 15 phút mà lượt bay còn KỊP kết thúc trước giờ đóng cửa. */
  function startTimes(hours, cfg) {
    var c = conf(cfg);
    var open = hhmmToMin(c.openStart);
    var close = hhmmToMin(c.openEnd);
    var need = Math.round(Number(hours) * 60);
    var out = [];
    if (!isFinite(open) || !isFinite(close) || !(need > 0)) return out;
    for (var t = open; t + need <= close; t += c.stepMinutes) out.push(minToHhmm(t));
    return out;
  }

  function endTime(start, hours) {
    var s = hhmmToMin(start);
    if (!isFinite(s)) return '';
    return minToHhmm(s + Math.round(Number(hours) * 60));
  }

  function rangeLabel(start, hours) {
    var e = endTime(start, hours);
    return (start && e) ? start + ' - ' + e : '';
  }

  /* ---------- chồng giờ ---------- */

  /* Hai khoảng [a1,a2) và [b1,b2) có giao nhau không.
     Dùng nửa mở: lượt 09:00–10:00 và lượt 10:00–11:00 KHÔNG chồng nhau,
     khách sau vào đúng lúc khách trước xong. */
  function overlap(a1, a2, b1, b2) {
    return a1 < b2 && b1 < a2;
  }

  function busyToMinutes(busy) {
    return (busy || []).map(function (b) {
      return { s: hhmmToMin(b.start), e: hhmmToMin(b.end) };
    }).filter(function (b) { return isFinite(b.s) && isFinite(b.e) && b.e > b.s; });
  }

  /* Trạng thái từng mốc giờ cho một ngày + số giờ đã chọn.
       free      → chọn được
       busy      → trùng lượt đã có
       past      → đã qua giờ (chỉ với ngày hôm nay) */
  function slotStates(dayKey, hours, busy, cfg, now) {
    var c = conf(cfg);
    var need = Math.round(Number(hours) * 60);
    var taken = busyToMinutes(busy);
    var isToday = dayKey === todayKey(now);
    var cutoff = isToday ? nowMinutes(now) + c.leadMinutes : -1;

    return startTimes(hours, c).map(function (t) {
      var s = hhmmToMin(t), e = s + need, state = 'free';
      if (isToday && s < cutoff) state = 'past';
      else {
        for (var i = 0; i < taken.length; i++) {
          if (overlap(s, e, taken[i].s, taken[i].e)) { state = 'busy'; break; }
        }
      }
      return { time: t, end: minToHhmm(e), state: state, ok: state === 'free' };
    });
  }

  /* Gom theo buổi để lưới giờ đỡ là một khối 45 ô không đầu không cuối */
  function groupByPart(slots) {
    var parts = [
      { key: 'morning', label: 'Buổi sáng', from: 0, to: 12 * 60 },
      { key: 'afternoon', label: 'Buổi chiều', from: 12 * 60, to: 17 * 60 },
      { key: 'evening', label: 'Buổi tối', from: 17 * 60, to: 24 * 60 }
    ];
    return parts.map(function (p) {
      return {
        key: p.key,
        label: p.label,
        slots: slots.filter(function (s) {
          var m = hhmmToMin(s.time);
          return m >= p.from && m < p.to;
        })
      };
    }).filter(function (p) { return p.slots.length; });
  }

  /* ---------- giá ----------
     500.000đ / 1 người / giờ · 700.000đ / từ 2 người / giờ.
     Buồng lái hai ghế nên nhóm đông hơn vẫn tính giá 2 người.

     Máy khách tính để HIỆN cho khách xem trong lúc chọn; con số ghi vào
     Sheet là con số MÁY CHỦ tự tính lại (xem priceOf_ trong Code.gs).
     Tin vào số máy khách gửi lên thì ai cũng sửa được thành 1đ. */
  var PRICE = { perHour1: 500000, perHour2: 700000 };

  function priceOf(guests, hours, cfg) {
    var p = (cfg && cfg.PRICING) || (cfg && cfg.perHour1 ? cfg : PRICE);
    var g = Math.max(1, Number(guests) || 1);
    var h = Math.max(0, Number(hours) || 0);
    var rate = (g <= 1) ? (p.perHour1 || PRICE.perHour1) : (p.perHour2 || PRICE.perHour2);
    return Math.round(rate * h);
  }

  /* "700000" -> "700.000đ" */
  function vnd(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
  }

  /* ---------- kiểm tra trước khi gửi ---------- */

  function validPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.length >= 9 && d.length <= 11;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
  }

  /* Chốt lần cuối phía máy khách. Server VẪN phải kiểm lại — người ta
     gọi thẳng API được, và giữa lúc khách điền form có thể có người khác
     đặt mất khung giờ đó. */
  function checkBooking(data, busy, cfg, now) {
    var c = conf(cfg);
    var errs = {};
    if (!String(data.name || '').trim()) errs.name = 'Vui lòng nhập họ tên.';
    if (!validPhone(data.phone)) errs.phone = 'Số điện thoại chưa đúng (9–11 chữ số).';
    if (data.email && !validEmail(data.email)) errs.email = 'Email chưa đúng định dạng.';
    if (!data.date) errs.date = 'Vui lòng chọn ngày bay.';

    var hours = Number(data.hours);
    if (!(hours >= c.minHours && hours <= c.maxHours)) {
      errs.hours = 'Số giờ bay phải từ ' + c.minHours + ' đến ' + c.maxHours + ' tiếng.';
    }
    if (!data.start) {
      errs.start = 'Vui lòng chọn giờ bắt đầu.';
    } else if (!errs.date && !errs.hours) {
      var found = null;
      slotStates(data.date, hours, busy, c, now).forEach(function (s) {
        if (s.time === data.start) found = s;
      });
      if (!found) errs.start = 'Giờ bắt đầu không nằm trong khung giờ mở cửa.';
      else if (found.state === 'busy') errs.start = 'Khung giờ này vừa có người đặt. Bạn chọn giờ khác giúp nhé.';
      else if (found.state === 'past') errs.start = 'Giờ này đã qua. Bạn chọn giờ khác giúp nhé.';
    }
    return { ok: !Object.keys(errs).length, errors: errs };
  }

  return {
    TZ_OFFSET_MS: TZ_OFFSET_MS,
    DEFAULTS: DEFAULTS,
    conf: conf,
    hhmmToMin: hhmmToMin,
    minToHhmm: minToHhmm,
    todayKey: todayKey,
    nowMinutes: nowMinutes,
    dayKeyAt: dayKeyAt,
    dayLabel: dayLabel,
    prettyDate: prettyDate,
    days: days,
    startTimes: startTimes,
    endTime: endTime,
    rangeLabel: rangeLabel,
    overlap: overlap,
    slotStates: slotStates,
    groupByPart: groupByPart,
    validPhone: validPhone,
    validEmail: validEmail,
    checkBooking: checkBooking,
    PRICE: PRICE,
    priceOf: priceOf,
    vnd: vnd
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TFD_BOOK;
