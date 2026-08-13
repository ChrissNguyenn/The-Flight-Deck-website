/* ============================================================
   TRANG LỊCH CỦA QUẢN LÝ
   ------------------------------------------------------------
   Đọc lượt đặt từ Code.gs rồi vẽ thành khối thời gian, ba chế độ xem
   Ngày / Tuần / Tháng.

   Cần config.js (TFD_CONFIG.BOOKING_SCRIPT_URL) nạp trước.
   ============================================================ */

(function () {
  'use strict';

  var CFG = (typeof TFD_CONFIG !== 'undefined' && TFD_CONFIG) ? TFD_CONFIG : {};
  var API = String(CFG.BOOKING_SCRIPT_URL || '').trim();
  var LIVE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/.test(API);

  var KEY_STORE = 'tfd.lich.key';
  var VIEW_STORE = 'tfd.lich.view';

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ============================================================
     NGÀY THÁNG
     ------------------------------------------------------------
     Mọi phép tính chạy trên khoá "YYYY-MM-DD" và mốc 12:00 UTC. Dùng
     nửa đêm thì cộng/trừ ngày quanh mốc đổi giờ có thể nhảy sai một
     ngày; giữa trưa thì luôn an toàn. */
  var DAY_MS = 86400000;
  var DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  var DOW_FULL = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

  function dObj(key) { return new Date(key + 'T12:00:00Z'); }
  function keyOf(d) { return d.toISOString().slice(0, 10); }
  function dAdd(key, n) { return keyOf(new Date(dObj(key).getTime() + n * DAY_MS)); }
  function dow(key) { return dObj(key).getUTCDay(); }          // 0 = Chủ nhật
  function dayNum(key) { return dObj(key).getUTCDate(); }
  function monthOf(key) { return +key.slice(5, 7); }
  function yearOf(key) { return +key.slice(0, 4); }

  /* Tuần bắt đầu THỨ HAI — lịch làm việc ở Việt Nam đọc theo T2…CN. */
  function mondayOf(key) {
    var d = dow(key);
    return dAdd(key, -((d + 6) % 7));
  }

  function prettyDate(key) {
    return dayNum(key) + '/' + monthOf(key) + '/' + yearOf(key);
  }

  /* Giờ Việt Nam của MÁY CHỦ, không phải của máy đang mở trang. Nhân
     viên mở lịch trên máy đặt sai múi giờ vẫn phải thấy đúng "hôm nay". */
  var SERVER = { today: '', now: '' };

  function todayKey() {
    if (SERVER.today) return SERVER.today;
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  }

  function hhmmToMin(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    return m ? (+m[1]) * 60 + (+m[2]) : NaN;
  }
  function minToHhmm(n) {
    var h = Math.floor(n / 60), m = n % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* ============================================================
     TRẠNG THÁI TRANG
     ============================================================ */
  var S = {
    view: localStorage.getItem(VIEW_STORE) || 'week',
    anchor: '',          // ngày neo, quyết định kỳ đang xem
    key: localStorage.getItem(KEY_STORE) || '',
    items: [],
    open: { start: 9 * 60, end: 21 * 60 },
    loading: false,
    seq: 0               // chống kết quả về trễ đè lên kỳ mới hơn
  };

  var ST = {
    'Mới':         { cls: 'ev--new',    chip: 'st-new',    dot: '#1a73e8' },
    'Đã xác nhận': { cls: 'ev--ok',     chip: 'st-ok',     dot: '#188038' },
    'Đã bay':      { cls: 'ev--done',   chip: 'st-done',   dot: '#5f6368' },
    'Đã hủy':      { cls: 'ev--cancel', chip: 'st-cancel', dot: '#9aa0a6' }
  };
  function stOf(it) { return ST[it.status] || ST['Mới']; }

  /* ============================================================
     KHOẢNG NGÀY CỦA TỪNG CHẾ ĐỘ XEM
     ============================================================ */
  function rangeOf() {
    var a = S.anchor;
    if (S.view === 'day') return { from: a, to: a, days: [a] };

    if (S.view === 'week') {
      var mon = mondayOf(a), days = [];
      for (var i = 0; i < 7; i++) days.push(dAdd(mon, i));
      return { from: days[0], to: days[6], days: days };
    }

    /* Tháng: lưới bắt đầu từ thứ Hai của tuần chứa ngày 1, và kéo đủ số
       tuần để chứa hết tháng (5 hoặc 6 hàng). Phải nạp cả ngày của tháng
       trước/sau lọt vào lưới, nếu không các ô rìa luôn trống. */
    var first = a.slice(0, 8) + '01';
    var gridStart = mondayOf(first);
    var last = dAdd(dAdd(first, 32).slice(0, 8) + '01', -1);   // ngày cuối tháng
    var cells = Math.ceil((Math.round((dObj(last) - dObj(gridStart)) / DAY_MS) + 1) / 7) * 7;
    var ds = [];
    for (var j = 0; j < cells; j++) ds.push(dAdd(gridStart, j));
    return { from: ds[0], to: ds[ds.length - 1], days: ds, monthOf: monthOf(a) };
  }

  function periodLabel() {
    var r = rangeOf();
    if (S.view === 'day') {
      return DOW_FULL[dow(S.anchor)] + ', ' + dayNum(S.anchor) + ' tháng ' +
        monthOf(S.anchor) + ', ' + yearOf(S.anchor);
    }
    if (S.view === 'week') {
      var a = r.from, b = r.to;
      if (monthOf(a) === monthOf(b)) {
        return dayNum(a) + ' – ' + dayNum(b) + ' tháng ' + monthOf(a) + ', ' + yearOf(a);
      }
      if (yearOf(a) === yearOf(b)) {
        return dayNum(a) + ' thg ' + monthOf(a) + ' – ' + dayNum(b) + ' thg ' + monthOf(b) + ', ' + yearOf(b);
      }
      return prettyDate(a) + ' – ' + prettyDate(b);
    }
    return 'Tháng ' + monthOf(S.anchor) + ', ' + yearOf(S.anchor);
  }

  function step(dir) {
    if (S.view === 'day') S.anchor = dAdd(S.anchor, dir);
    else if (S.view === 'week') S.anchor = dAdd(S.anchor, dir * 7);
    else {
      var y = yearOf(S.anchor), m = monthOf(S.anchor) + dir;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      S.anchor = y + '-' + (m < 10 ? '0' : '') + m + '-01';
    }
    load();
  }

  /* ============================================================
     GỌI MÁY CHỦ
     ============================================================ */
  function banner(msg) {
    var el = $('banner');
    el.textContent = msg || '';
    el.classList.toggle('is-on', !!msg);
  }

  function busy(on) {
    S.loading = on;
    $('loading').classList.toggle('is-on', !!on);
  }

  function api(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(API + '?' + q + '&t=' + Date.now(), { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (timer) clearTimeout(timer); return d; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function post(params) {
    params.key = S.key;
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(API, { method: 'POST', body: new URLSearchParams(params),
      signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (timer) clearTimeout(timer); return d; })
      .catch(function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  function load() {
    render();                       // vẽ khung ngay, dữ liệu điền sau
    if (!LIVE) {
      banner('Chưa nối Google Sheet — mở config.js và điền BOOKING_SCRIPT_URL.');
      return;
    }
    var r = rangeOf();
    var mine = ++S.seq;
    busy(true);
    api({ action: 'bookings', from: r.from, to: r.to, key: S.key })
      .then(function (d) {
        if (mine !== S.seq) return;         // đã chuyển sang kỳ khác
        busy(false);
        if (d && d.error === 'BAD_KEY') { logout('Mã quản lý không đúng.'); return; }
        if (!d || !d.ok) {
          banner('Không đọc được lịch — ' + ((d && (d.message || d.error)) || 'lỗi không rõ'));
          return;
        }
        banner('');
        S.items = d.items || [];
        SERVER.today = d.today || SERVER.today;
        SERVER.now = d.now || SERVER.now;
        var os = hhmmToMin(d.openStart), oe = hhmmToMin(d.openEnd);
        if (isFinite(os) && isFinite(oe)) S.open = { start: os, end: oe };
        render();
      })
      .catch(function () {
        if (mine !== S.seq) return;
        busy(false);
        banner('Mất kết nối tới máy chủ. Bấm ⟳ để thử lại.');
      });
  }

  /* ============================================================
     VẼ
     ============================================================ */
  function render() {
    $('period').textContent = periodLabel();
    Array.prototype.forEach.call(document.querySelectorAll('.tb-views button'), function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === S.view);
    });

    var r = rangeOf();
    var shown = S.items.filter(function (it) { return it.date >= r.from && it.date <= r.to; });
    var song = shown.filter(function (it) { return it.status !== 'Đã hủy'; });
    $('chip-count').innerHTML = '<b>' + song.length + '</b> lượt' +
      (shown.length > song.length ? ' · ' + (shown.length - song.length) + ' đã hủy' : '');

    var cal = $('cal');
    var keepTop = cal.scrollTop;
    var loading = $('loading');
    cal.innerHTML = '';
    cal.appendChild(loading);
    cal.appendChild(S.view === 'month' ? monthView(r) : timeView(r));
    cal.scrollTop = keepTop;
  }

  function byDay(days) {
    var map = {};
    days.forEach(function (d) { map[d] = []; });
    S.items.forEach(function (it) { if (map[it.date]) map[it.date].push(it); });
    return map;
  }

  /* ---------- Ngày / Tuần ---------- */
  function timeView(r) {
    var map = byDay(r.days);

    /* Khung giờ hiển thị: mặc định theo giờ mở cửa, nhưng nếu có lượt
       nằm ngoài (quản lý thêm tay) thì nới ra cho đủ. Không nới thì khối
       đó biến mất khỏi lịch mà không ai biết. */
    var lo = S.open.start, hi = S.open.end;
    r.days.forEach(function (d) {
      map[d].forEach(function (it) {
        var s = hhmmToMin(it.start), e = hhmmToMin(it.end);
        if (isFinite(s)) lo = Math.min(lo, s);
        if (isFinite(e)) hi = Math.max(hi, e);
      });
    });
    lo = Math.floor(lo / 60) * 60;
    hi = Math.ceil(hi / 60) * 60;
    if (hi <= lo) hi = lo + 60;
    var hours = (hi - lo) / 60;

    var hourH = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--hour-h')) || 54;

    var cols = 'var(--gutter) repeat(' + r.days.length + ', minmax(0, 1fr))';
    var wrap = document.createElement('div');

    /* --- hàng tiêu đề ngày --- */
    var head = document.createElement('div');
    head.className = 'grid-head';
    head.style.gridTemplateColumns = cols;
    var html = '<div class="gh-corner"></div>';
    r.days.forEach(function (d) {
      var n = map[d].filter(function (x) { return x.status !== 'Đã hủy'; }).length;
      html += '<div class="gh-day' + (d === todayKey() ? ' is-today' : '') + '">' +
        '<div class="gh-dow">' + DOW_VN[dow(d)] + '</div>' +
        '<div class="gh-num">' + dayNum(d) + '</div>' +
        '<div class="gh-count">' + (n ? n + ' lượt' : '') + '</div>' +
        '</div>';
    });
    head.innerHTML = html;
    wrap.appendChild(head);

    /* --- lượt không có giờ (đăng ký sự kiện) --- */
    var noTime = r.days.some(function (d) {
      return map[d].some(function (it) { return !hhmmToMin(it.start); });
    });
    if (noTime) {
      var band = document.createElement('div');
      band.className = 'grid-head';
      band.style.cssText = 'position:static;grid-template-columns:' + cols +
        ';border-bottom:1px solid var(--g-line)';
      var bh = '<div class="gh-corner" style="font-size:10px;color:var(--g-grey-2);' +
        'display:grid;place-items:center">Cả ngày</div>';
      r.days.forEach(function (d) {
        var list = map[d].filter(function (it) { return !hhmmToMin(it.start); });
        bh += '<div style="padding:3px 4px;min-height:26px;border-right:1px solid var(--g-line-2)">' +
          list.map(function (it) {
            return '<button class="ev ev--event" data-code="' + esc(it.code) + '" ' +
              'style="position:static;margin-bottom:2px;width:100%">' +
              '<b>' + esc(it.name) + '</b></button>';
          }).join('') + '</div>';
      });
      band.innerHTML = bh;
      wrap.appendChild(band);
    }

    /* --- lưới giờ --- */
    var body = document.createElement('div');
    body.className = 'grid-body';
    body.style.gridTemplateColumns = cols;

    var g = '<div class="gb-gutter">';
    for (var h = 0; h < hours; h++) {
      g += '<div class="gb-hour"><span>' + minToHhmm(lo + h * 60) + '</span></div>';
    }
    g += '</div>';

    r.days.forEach(function (d) {
      var weekend = dow(d) === 0 || dow(d) === 6;
      g += '<div class="gb-col' + (weekend ? ' is-weekend' : '') + '" data-day="' + d + '">';
      for (var k = 0; k < hours; k++) g += '<div class="gb-slot"></div>';
      g += layoutDay(map[d], lo, hourH);
      if (d === todayKey() && SERVER.now) {
        var nm = hhmmToMin(SERVER.now);
        if (isFinite(nm) && nm >= lo && nm <= hi) {
          g += '<div class="nowline" style="top:' + ((nm - lo) / 60 * hourH) + 'px"></div>';
        }
      }
      g += '</div>';
    });

    body.innerHTML = g;
    wrap.appendChild(body);
    return wrap;
  }

  /* Xếp các khối trong MỘT ngày.
     Quán chỉ có một buồng lái nên bình thường không có lượt nào chồng
     nhau — nhưng lượt đã hủy vẫn hiện, và quản lý có thể sửa tay trong
     Sheet. Chồng nhau mà vẽ đè lên nhau thì mất hẳn một khối, nên chia
     đôi bề ngang giống Google Calendar. */
  function layoutDay(list, lo, hourH) {
    var evs = list.filter(function (it) { return isFinite(hhmmToMin(it.start)); })
      .map(function (it) {
        return { it: it, s: hhmmToMin(it.start), e: hhmmToMin(it.end) || (hhmmToMin(it.start) + 60) };
      })
      .sort(function (a, b) { return a.s - b.s || a.e - b.e; });

    /* Gom thành cụm giao nhau, mỗi cụm chia cột riêng */
    var out = '', i = 0;
    while (i < evs.length) {
      var cluster = [evs[i]], end = evs[i].e, j = i + 1;
      while (j < evs.length && evs[j].s < end) { cluster.push(evs[j]); end = Math.max(end, evs[j].e); j++; }

      var colEnd = [];
      cluster.forEach(function (x) {
        var c = 0;
        while (c < colEnd.length && colEnd[c] > x.s) c++;
        x.col = c;
        colEnd[c] = x.e;
      });
      var nCols = colEnd.length;

      cluster.forEach(function (x) {
        var top = (x.s - lo) / 60 * hourH;
        var hgt = Math.max(16, (x.e - x.s) / 60 * hourH - 2);
        var w = 100 / nCols;
        var st = stOf(x.it);
        var short = hgt < 34;
        out += '<button class="ev ' + st.cls + (short ? ' is-short' : '') + '" ' +
          'data-code="' + esc(x.it.code) + '" ' +
          'style="top:' + top.toFixed(1) + 'px;height:' + hgt.toFixed(1) + 'px;' +
          'left:calc(' + (x.col * w).toFixed(4) + '% + 2px);' +
          'width:calc(' + w.toFixed(4) + '% - 4px)" ' +
          'title="' + esc(x.it.start + ' - ' + x.it.end + ' · ' + x.it.name +
            ' · ' + x.it.phone + ' · ' + x.it.status) + '">' +
          '<b>' + esc(x.it.name) + '</b>' +
          '<small>' + esc(x.it.start + ' – ' + x.it.end) + '</small>' +
          '</button>';
      });
      i = j;
    }
    return out;
  }

  /* ---------- Tháng ---------- */
  function monthView(r) {
    var map = byDay(r.days);
    var wrap = document.createElement('div');
    wrap.className = 'month';

    var head = '<div class="month-head">' +
      ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(function (d) {
        return '<div>' + d + '</div>';
      }).join('') + '</div>';

    var body = '<div class="month-body">';
    r.days.forEach(function (d) {
      var out = monthOf(d) !== r.monthOf;
      var list = map[d].slice().sort(function (a, b) {
        return String(a.start).localeCompare(String(b.start));
      });
      var show = list.slice(0, 3);
      body += '<div class="mcell' + (out ? ' is-out' : '') +
        (d === todayKey() ? ' is-today' : '') + '">' +
        '<div class="mcell__num">' + dayNum(d) + '</div>' +
        show.map(function (it) {
          var st = stOf(it);
          return '<button class="mchip' + (it.status === 'Đã hủy' ? ' is-cancel' : '') + '" ' +
            'data-code="' + esc(it.code) + '" title="' + esc(it.name + ' · ' + it.phone) + '">' +
            '<i style="background:' + st.dot + '"></i>' +
            '<time>' + esc(it.start || '—') + '</time>' +
            '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(it.name) + '</span>' +
            '</button>';
        }).join('') +
        (list.length > 3
          ? '<button class="mmore" data-goday="' + d + '">+' + (list.length - 3) + ' lượt khác</button>'
          : '') +
        '</div>';
    });
    body += '</div>';

    wrap.innerHTML = head + body;
    return wrap;
  }

  /* ============================================================
     THẺ CHI TIẾT
     ============================================================ */
  function closePop() {
    var p = document.querySelector('.pop'), b = document.querySelector('.pop-back');
    if (p) p.remove();
    if (b) b.remove();
  }

  function openPop(code, anchorEl) {
    closePop();
    var it = null;
    S.items.forEach(function (x) { if (x.code === code) it = x; });
    if (!it) return;
    var st = stOf(it);

    var rows = [];
    rows.push(['🕑', it.start
      ? DOW_FULL[dow(it.date)] + ', ' + prettyDate(it.date) + ' · ' + it.start + ' – ' + it.end +
        (it.hours ? ' (' + it.hours + ' tiếng)' : '')
      : (it.date ? prettyDate(it.date) : 'Chưa có ngày giờ')]);
    if (it.phone) rows.push(['📞', '<a href="tel:' + esc(it.phone) + '">' + esc(it.phone) + '</a>']);
    if (it.email) rows.push(['✉️', '<a href="mailto:' + esc(it.email) + '">' + esc(it.email) + '</a>']);
    rows.push(['👥', esc(it.guests || 1) + ' khách']);
    if (it.event) rows.push(['🎟️', esc(it.event)]);
    if (it.note) rows.push(['📝', esc(it.note)]);
    rows.push(['🔖', '<code>' + esc(it.code) + '</code> · ' + esc(it.source || '—') +
      (it.sentAt ? ' · ' + esc(it.sentAt) : '')]);
    rows.push(['✔️', '<span class="pop__state ' + st.chip + '">' + esc(it.status) + '</span>']);

    var acts = [
      { s: 'Đã xác nhận', t: 'Xác nhận' },
      { s: 'Đã bay', t: 'Đã bay' },
      { s: 'Đã hủy', t: 'Hủy lượt', danger: true }
    ].filter(function (a) { return a.s !== it.status; });

    var pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML =
      '<div class="pop__top">' +
        '<span class="pop__dot" style="background:' + st.dot + '"></span>' +
        '<div class="pop__ttl"><h2>' + esc(it.name) + '</h2>' +
          '<p>' + esc(it.type || 'Đặt lịch bay') + ' · tab ' + esc(it.tab) + '</p></div>' +
        '<button class="pop__x" id="pop-x" aria-label="Đóng">✕</button>' +
      '</div>' +
      '<div class="pop__rows">' +
        rows.map(function (r) {
          return '<div class="pop__row"><i>' + r[0] + '</i><span>' + r[1] + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="pop__acts">' +
        acts.map(function (a) {
          return '<button class="pop-btn' + (a.danger ? ' pop-btn--danger' : '') +
            '" data-set="' + esc(a.s) + '">' + a.t + '</button>';
        }).join('') +
      '</div>';

    var back = document.createElement('div');
    back.className = 'pop-back';
    document.body.appendChild(back);
    document.body.appendChild(pop);

    /* Đặt thẻ cạnh khối vừa bấm, nhưng không để nó thò ra ngoài màn hình */
    var b = anchorEl.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(Math.max(8, b.right + 8), window.innerWidth - pw - 8);
    if (b.right + 8 + pw > window.innerWidth) left = Math.max(8, b.left - pw - 8);
    var top = Math.min(Math.max(8, b.top - 10), window.innerHeight - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';

    back.addEventListener('click', closePop);
    $('pop-x').addEventListener('click', closePop);
    pop.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-set]');
      if (!btn) return;
      setStatus(it.code, btn.getAttribute('data-set'), pop);
    });
  }

  function setStatus(code, status, pop) {
    if (status === 'Đã hủy' &&
        !confirm('Hủy lượt bay này? Khung giờ sẽ được mở lại cho khách khác đặt.')) return;
    Array.prototype.forEach.call(pop.querySelectorAll('.pop-btn'), function (b) { b.disabled = true; });
    busy(true);
    post({ action: 'setStatus', code: code, status: status })
      .then(function (d) {
        busy(false);
        if (d && d.ok) { closePop(); load(); return; }
        if (d && d.error === 'BAD_KEY') { logout('Mã quản lý không đúng.'); return; }
        banner('Không đổi được trạng thái — ' + ((d && (d.message || d.error)) || 'lỗi không rõ'));
        Array.prototype.forEach.call(pop.querySelectorAll('.pop-btn'), function (b) { b.disabled = false; });
      })
      .catch(function () {
        busy(false);
        banner('Mất kết nối — chưa đổi được trạng thái.');
        Array.prototype.forEach.call(pop.querySelectorAll('.pop-btn'), function (b) { b.disabled = false; });
      });
  }

  /* ============================================================
     CỬA VÀO
     ============================================================ */
  function showGate(msg) {
    $('gate').hidden = false;
    $('app').hidden = true;
    var e = $('gate-err');
    e.textContent = msg || '';
    e.classList.toggle('is-on', !!msg);
    $('gate-key').focus();
  }

  function enter() {
    $('gate').hidden = true;
    $('app').hidden = false;
    S.anchor = S.anchor || todayKey();
    load();
  }

  function logout(msg) {
    localStorage.removeItem(KEY_STORE);
    S.key = '';
    S.items = [];
    showGate(msg || '');
  }

  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('gate-key').value.trim();
    if (!v) return;
    S.key = v;
    localStorage.setItem(KEY_STORE, v);
    enter();
  });

  /* ============================================================
     NÚT BẤM & PHÍM TẮT
     ============================================================ */
  $('btn-today').addEventListener('click', function () { S.anchor = todayKey(); load(); });
  $('btn-prev').addEventListener('click', function () { step(-1); });
  $('btn-next').addEventListener('click', function () { step(1); });
  $('btn-reload').addEventListener('click', load);
  $('btn-out').addEventListener('click', function () { logout(); });

  document.querySelector('.tb-views').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    S.view = b.getAttribute('data-view');
    localStorage.setItem(VIEW_STORE, S.view);
    load();
  });

  $('cal').addEventListener('click', function (e) {
    var more = e.target.closest('[data-goday]');
    if (more) {
      S.anchor = more.getAttribute('data-goday');
      S.view = 'day';
      localStorage.setItem(VIEW_STORE, S.view);
      load();
      return;
    }
    var ev = e.target.closest('[data-code]');
    if (ev) { e.stopPropagation(); openPop(ev.getAttribute('data-code'), ev); }
  });

  /* Phím tắt giống Google Calendar */
  document.addEventListener('keydown', function (e) {
    if ($('app').hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (e.key === 'Escape') { closePop(); return; }
    var k = e.key.toLowerCase();
    if (k === 'd') { S.view = 'day'; localStorage.setItem(VIEW_STORE, 'day'); load(); }
    else if (k === 'w') { S.view = 'week'; localStorage.setItem(VIEW_STORE, 'week'); load(); }
    else if (k === 'm') { S.view = 'month'; localStorage.setItem(VIEW_STORE, 'month'); load(); }
    else if (k === 't') { S.anchor = todayKey(); load(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  window.addEventListener('resize', closePop);

  /* ============================================================
     KHỞI ĐỘNG
     ============================================================ */
  S.anchor = todayKey();
  if (S.key) enter(); else showGate('');

  /* Cho bài kiểm thử soi vào trạng thái mà không phải đoán qua DOM */
  window.__lich = S;
})();
