/* ============================================================
   THE FLIGHT DECK — trang chủ: sự kiện + đặt lịch bay
   ------------------------------------------------------------
   Cần: config.js (TFD_CONFIG) và booking.js (TFD_BOOK) nạp trước.
   ============================================================ */

(function () {
  'use strict';

  var CFG = (typeof TFD_CONFIG !== 'undefined' && TFD_CONFIG) ? TFD_CONFIG : {};
  var BK = (CFG.BOOKING && typeof CFG.BOOKING === 'object') ? CFG.BOOKING : {};
  var API = String(CFG.BOOKING_SCRIPT_URL || '').trim();

  /* Chưa dán URL Web App = chế độ thử nghiệm. KHÔNG được báo "đặt thành
     công" trong chế độ này: khách sẽ tưởng đã có chỗ trong khi không có
     dòng nào vào Google Sheet. */
  var LIVE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/.test(API);

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ============================================================
     ĐẦU TRANG & HIỆU ỨNG
     ============================================================ */

  (function header() {
    var head = $('site-header');
    var toggle = $('nav-toggle');
    var links = $('nav-links');
    if (!head) return;

    var onScroll = function () {
      head.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
      });
      /* Bấm một mục xong thì đóng menu — trên điện thoại menu che mất
         chính chỗ vừa nhảy tới. */
      links.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          links.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  })();

  (function reveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    /* Chỉ ẩn khi CHẮC CHẮN có thể hiện lại. Không có IntersectionObserver
       thì để nguyên, thà không có hiệu ứng còn hơn trang trắng. */
    if (!('IntersectionObserver' in window)) return;

    document.documentElement.classList.add('reveal-on');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .06 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  })();

  /* ============================================================
     KHỐI SỰ KIỆN
     ============================================================
     TFD_CONFIG.EVENT = null  → giữ nguyên bảng "chưa có sự kiện"
     TFD_CONFIG.EVENT = {...} → hiện thông tin + form đăng ký      */

  (function eventBlock() {
    var ev = CFG.EVENT;
    var live = $('event-live'), none = $('event-none');
    if (!live || !none) return;
    if (!ev || !ev.name) return;                 // mặc định đã đúng rồi

    /* Sự kiện đã qua ngày cuối thì coi như không còn — quên tắt tay
       trong config là chuyện chắc chắn xảy ra, để trang tự biết thì hơn. */
    if (ev.endDate && ev.endDate < TFD_BOOK.todayKey()) return;

    none.classList.add('hidden');
    live.classList.remove('hidden');

    $('ev-name').textContent = ev.name;
    $('ev-desc').textContent = ev.desc || '';
    if (ev.badge) $('ev-badge').textContent = ev.badge;

    var facts = [
      ['Thời gian', ev.when],
      ['Địa điểm', ev.where || '86 Đặng Văn Ngữ, Phú Nhuận, TP.HCM'],
      ['Chi phí', ev.price]
    ].filter(function (f) { return f[1]; });

    $('ev-facts').innerHTML = facts.map(function (f) {
      return '<li><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></li>';
    }).join('');

    if (ev.ctaHref && ev.ctaText) {
      $('ev-cta-row').innerHTML =
        '<a class="btn btn-primary" href="' + esc(ev.ctaHref) + '">' + esc(ev.ctaText) + '</a>';
    }
  })();

  /* ============================================================
     BỘ CHỌN GIỜ BAY
     ============================================================ */

  var state = {
    date: '',
    hours: 1,
    start: '',
    busy: [],
    loading: false
  };

  var railEl = $('day-rail');
  var slotEl = $('slot-wrap');

  /* --- dải ngày --- */
  function renderDays() {
    if (!railEl) return;
    var list = TFD_BOOK.days(BK);
    railEl.innerHTML = list.map(function (d, i) {
      var label = i === 0 ? 'Hôm nay' : (i === 1 ? 'Mai' : d.dow);
      return '<button type="button" class="day-chip" data-day="' + d.key + '" ' +
        'aria-pressed="false">' +
        '<span class="day-chip__dow">' + esc(label) + '</span>' +
        '<span class="day-chip__num">' + d.day + '</span>' +
        '<span class="day-chip__mon">tháng ' + d.month + '</span>' +
        '</button>';
    }).join('');
  }

  function pickDay(key) {
    state.date = key;
    state.start = '';
    Array.prototype.forEach.call(railEl.querySelectorAll('.day-chip'), function (b) {
      var on = b.getAttribute('data-day') === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    clearErr('date');
    loadBusy(key);
  }

  /* --- lấy giờ đã kín từ máy chủ --- */
  function loadBusy(dateKey) {
    if (!LIVE) { state.busy = []; renderSlots(); return; }
    state.loading = true;
    renderSlots();

    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 12000);

    fetch(API + '?action=slots&date=' + encodeURIComponent(dateKey) + '&t=' + Date.now(),
      { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        if (dateKey !== state.date) return;      // khách đã đổi ngày trong lúc chờ
        state.busy = (data && data.ok && data.busy) ? data.busy : [];
        state.loading = false;
        renderSlots();
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        if (dateKey !== state.date) return;
        /* Mất mạng thì vẫn cho chọn giờ — server sẽ chốt lại lúc gửi.
           Chặn hết mọi ô vì một lần mạng chập chờn là mất khách. */
        state.busy = [];
        state.loading = false;
        renderSlots();
      });
  }

  /* --- lưới giờ bắt đầu --- */
  function renderSlots() {
    if (!slotEl) return;

    if (!state.date) {
      slotEl.innerHTML = '<p class="slot-empty">Chọn ngày bay để xem các giờ còn trống.</p>';
      return;
    }
    if (state.loading) {
      slotEl.innerHTML = '<p class="slot-empty">Đang xem lịch trống…</p>';
      return;
    }

    var slots = TFD_BOOK.slotStates(state.date, state.hours, state.busy, BK);
    var free = slots.filter(function (s) { return s.ok; }).length;

    if (!free) {
      slotEl.innerHTML = '<p class="slot-empty">Ngày này đã kín lịch cho chuyến ' +
        state.hours + ' tiếng.<br>Bạn thử chọn ngày khác hoặc rút ngắn thời lượng nhé.</p>';
      return;
    }

    slotEl.innerHTML = TFD_BOOK.groupByPart(slots).map(function (g) {
      return '<div class="slot-group">' +
        '<p class="slot-group__title">' + esc(g.label) + '</p>' +
        '<div class="slot-grid">' +
        g.slots.map(function (s) {
          var title = s.state === 'busy' ? 'Đã có người đặt'
            : (s.state === 'past' ? 'Đã qua giờ này' : s.time + ' - ' + s.end);
          return '<button type="button" class="slot' + (s.time === state.start ? ' is-on' : '') + '"' +
            ' data-slot="' + s.time + '"' + (s.ok ? '' : ' disabled') +
            ' title="' + esc(title) + '">' + s.time + '</button>';
        }).join('') +
        '</div></div>';
    }).join('');
  }

  function pickSlot(t) {
    state.start = t;
    Array.prototype.forEach.call(slotEl.querySelectorAll('.slot'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-slot') === t);
    });
    clearErr('start');
    renderSummary();
  }

  /* --- bảng tóm tắt --- */
  function renderSummary() {
    var box = $('sum-time'), range = $('sum-range'), sub = $('sum-date');
    $('sum-dur').textContent = state.hours + ' tiếng';
    $('sum-day').textContent = state.date ? TFD_BOOK.prettyDate(state.date) : '—';

    if (state.date && state.start) {
      box.classList.remove('is-empty');
      range.innerHTML = esc(state.start) + '<span class="arrow">→</span>' +
        esc(TFD_BOOK.endTime(state.start, state.hours));
      sub.textContent = 'Ngày ' + TFD_BOOK.prettyDate(state.date);
    } else {
      box.classList.add('is-empty');
      range.textContent = state.date
        ? 'Chọn giờ bắt đầu ở bên trái'
        : 'Chọn ngày và giờ bay';
      sub.textContent = '';
    }
  }

  if (railEl) {
    renderDays();
    railEl.addEventListener('click', function (e) {
      var b = e.target.closest('.day-chip');
      if (b) pickDay(b.getAttribute('data-day'));
    });
  }

  if (slotEl) {
    slotEl.addEventListener('click', function (e) {
      var b = e.target.closest('.slot');
      if (b && !b.disabled) pickSlot(b.getAttribute('data-slot'));
    });
  }

  var durRow = $('dur-row');
  if (durRow) {
    durRow.addEventListener('change', function (e) {
      if (!e.target.name || e.target.name !== 'hours') return;
      state.hours = Number(e.target.value);
      /* Đổi thời lượng có thể làm giờ đang chọn không còn hợp lệ (bay 4
         tiếng thì không thể bắt đầu 20:00). Bỏ chọn rồi vẽ lại để khách
         không gửi đi một khung giờ đã hết hiệu lực. */
      state.start = '';
      renderSlots();
      renderSummary();
    });
  }

  renderSummary();
  renderSlots();

  /* ============================================================
     GỬI FORM
     ============================================================ */

  function showErr(key, msg) {
    var el = $('err-' + key);
    if (el) { el.textContent = msg; el.classList.add('is-on'); }
    var input = document.querySelector('#book-form [name="' + key + '"], #bk-' + key);
    if (input) input.classList.add('is-bad');
  }

  function clearErr(key) {
    var el = $('err-' + key);
    if (el) { el.textContent = ''; el.classList.remove('is-on'); }
    var input = document.querySelector('#book-form [name="' + key + '"], #bk-' + key);
    if (input) input.classList.remove('is-bad');
  }

  function clearAllErr(prefix, keys) {
    keys.forEach(function (k) {
      var el = $('err-' + prefix + k);
      if (el) { el.textContent = ''; el.classList.remove('is-on'); }
    });
  }

  function result(boxId, kind, html) {
    var box = $(boxId);
    if (!box) return;
    box.className = 'form-result is-on ' + kind;
    box.innerHTML = html;
  }

  function busyBtn(btn, label) {
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    return function () { btn.disabled = false; btn.textContent = old; };
  }

  function send(params) {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(API, {
      method: 'POST',
      body: new URLSearchParams(params),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); })
      .then(function (d) { if (timer) clearTimeout(timer); return d; })
      .catch(function (err) { if (timer) clearTimeout(timer); throw err; });
  }

  var SERVER_MSG = {
    SLOT_TAKEN: 'Rất tiếc, khung giờ này vừa có người đặt trước. Bạn chọn giờ khác giúp nhé.',
    TOO_SOON: 'Vui lòng đặt trước giờ bay ít nhất 1 tiếng.',
    PAST_DATE: 'Ngày bạn chọn đã qua.',
    TOO_FAR: 'Hiện chỉ nhận đặt lịch trong vòng 60 ngày tới.',
    OUT_OF_HOURS: 'Khung giờ này nằm ngoài giờ mở cửa (9:00 – 21:00).',
    BAD_PHONE: 'Số điện thoại chưa đúng.',
    BAD_EMAIL: 'Email chưa đúng định dạng.',
    NO_NAME: 'Vui lòng nhập họ tên.',
    BUSY: 'Hệ thống đang bận. Bạn thử lại sau vài giây nhé.'
  };

  function serverMsg(d) {
    return (d && SERVER_MSG[d.error]) || 'Chưa gửi được. Bạn thử lại hoặc gọi 0919 686 320 giúp nhé.';
  }

  var NOT_LIVE =
    '<strong>Chưa nối Google Sheet</strong>' +
    'Trang đang chạy ở chế độ thử nghiệm nên yêu cầu này <b>chưa được gửi đi</b>. ' +
    'Bạn vui lòng gọi <a href="tel:0919686320">0919 686 320</a> để đặt lịch.';

  /* ---------- form đặt lịch ---------- */
  var bookForm = $('book-form');
  if (bookForm) {
    bookForm.addEventListener('submit', function (e) {
      e.preventDefault();
      ['name', 'phone', 'email', 'date', 'start'].forEach(clearErr);
      $('bk-result').className = 'form-result';

      var data = {
        name: $('bk-hoten').value.trim(),
        phone: $('bk-sdt').value.trim(),
        email: $('bk-email').value.trim(),
        guests: $('bk-sokhach').value,
        note: $('bk-ghichu').value.trim(),
        date: state.date,
        start: state.start,
        hours: state.hours
      };

      var check = TFD_BOOK.checkBooking(data, state.busy, BK);
      if (!check.ok) {
        Object.keys(check.errors).forEach(function (k) { showErr(k, check.errors[k]); });
        var first = document.querySelector('#book-form .is-bad, #book-form .err-msg.is-on');
        if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }

      if (!LIVE) { result('bk-result', 'bad', NOT_LIVE); return; }

      var done = busyBtn($('bk-submit'), 'Đang gửi…');
      send({
        action: 'book',
        name: data.name, phone: data.phone, email: data.email,
        guests: data.guests, note: data.note,
        date: data.date, start: data.start, hours: data.hours,
        source: 'website'
      }).then(function (d) {
        if (d && d.ok) {
          result('bk-result', 'ok',
            '<strong>Đã nhận yêu cầu đặt lịch!</strong>' +
            'Chuyến bay <b>' + esc(d.timeText) + '</b> ngày <b>' +
            esc(TFD_BOOK.prettyDate(d.date)) + '</b>.<br>' +
            'Mã đặt chỗ của bạn: <code>' + esc(d.code) + '</code><br>' +
            'Chúng tôi sẽ gọi lại để xác nhận trong thời gian sớm nhất.');
          bookForm.querySelectorAll('input, textarea').forEach(function (i) { i.value = ''; });
          state.start = '';
          loadBusy(state.date);          // giờ vừa đặt phải chuyển sang kín ngay
          renderSummary();
        } else {
          result('bk-result', 'bad', '<strong>Chưa đặt được</strong>' + serverMsg(d));
          if (d && d.error === 'SLOT_TAKEN') { state.start = ''; loadBusy(state.date); renderSummary(); }
        }
      }).catch(function () {
        result('bk-result', 'bad',
          '<strong>Không kết nối được</strong>' +
          'Bạn kiểm tra mạng rồi thử lại, hoặc gọi <a href="tel:0919686320">0919 686 320</a>.');
      }).then(done);
    });
  }

  /* ---------- form sự kiện ---------- */
  var evForm = $('event-form');
  if (evForm) {
    evForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearAllErr('ev-', ['name', 'phone', 'email']);
      $('ev-result').className = 'form-result';

      var name = $('ev-hoten').value.trim();
      var phone = $('ev-sdt').value.trim();
      var email = $('ev-email').value.trim();
      var bad = false;

      function evErr(k, msg) {
        var el = $('err-ev-' + k);
        if (el) { el.textContent = msg; el.classList.add('is-on'); }
        bad = true;
      }
      if (!name) evErr('name', 'Vui lòng nhập họ tên.');
      if (!TFD_BOOK.validPhone(phone)) evErr('phone', 'Số điện thoại chưa đúng (9–11 chữ số).');
      if (email && !TFD_BOOK.validEmail(email)) evErr('email', 'Email chưa đúng định dạng.');
      if (bad) return;

      if (!LIVE) { result('ev-result', 'bad', NOT_LIVE); return; }

      var ev = CFG.EVENT || {};
      var done = busyBtn($('ev-submit'), 'Đang gửi…');
      send({
        action: 'event',
        name: name, phone: phone, email: email,
        guests: $('ev-sokhach').value,
        note: $('ev-ghichu').value.trim(),
        event: ev.name || '',
        eventDate: ev.startDate || '',
        timeText: ev.when || '',
        source: 'website'
      }).then(function (d) {
        if (d && d.ok) {
          result('ev-result', 'ok',
            '<strong>Đã nhận đăng ký!</strong>' +
            'Mã của bạn: <code>' + esc(d.code) + '</code><br>' +
            'Chúng tôi sẽ liên hệ xác nhận trong thời gian sớm nhất.');
          evForm.querySelectorAll('input, textarea').forEach(function (i) { i.value = ''; });
        } else {
          result('ev-result', 'bad', '<strong>Chưa gửi được</strong>' + serverMsg(d));
        }
      }).catch(function () {
        result('ev-result', 'bad',
          '<strong>Không kết nối được</strong>' +
          'Bạn kiểm tra mạng rồi thử lại, hoặc gọi <a href="tel:0919686320">0919 686 320</a>.');
      }).then(done);
    });
  }

  /* Chọn sẵn ngày hôm nay để khách thấy ngay lưới giờ, không phải đoán
     là còn phải bấm gì nữa. */
  if (railEl) pickDay(TFD_BOOK.todayKey());

})();
