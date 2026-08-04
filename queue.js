/* ============================================
   The Flight Deck — logic hàng chờ dùng chung
   (experience.html + admin.html)

   Nguồn dữ liệu:
   - Có TFD_CONFIG.SCRIPT_URL  → Google Sheet (qua Apps Script)
   - Không có                  → localStorage (chế độ thử nghiệm,
                                 chỉ hoạt động trên một thiết bị)

   Lịch bay: mỗi slot dài 15 phút, tối đa 2 khách/slot.
   - Đăng ký 2 người (đi cùng nhau) → chiếm TRỌN một slot riêng.
   - Đăng ký 1 người → GHÉP với 1 người đăng ký 1 mình khác vào
     CHUNG một slot (bay cùng nhau). Nếu chưa có ai để ghép, lượt
     đó "giữ" một slot mới và chờ — người đăng ký 1 mình tiếp theo
     sẽ tự động ghép vào đúng slot (giờ bay) đó.
   Giờ bay được hệ thống tính tại thời điểm xác nhận thanh toán
   (slot ghép được nếu còn chỗ, slot mới nếu không) và lưu lại để
   đếm ngược.

   Trạng thái một đăng ký:
   PENDING_PAYMENT → WAITING → CALLED → PRESENT → IN_SESSION → DONE
   (hoặc PAYMENT_EXPIRED khi quá PAYMENT_MINUTES chưa thanh toán tại bàn
    admin, NO_SHOW khi quá 5 phút sau khi gọi, CANCELLED khi hủy tay)

   Thanh toán: khách đăng ký xong ở trạng thái PENDING_PAYMENT — CHƯA có
   giờ bay, CHƯA chiếm slot trong hàng chờ. Phải đến bàn admin thanh toán
   (QR hoặc tiền mặt, ngoài website) trong PAYMENT_MINUTES; admin bấm xác
   nhận (confirmPayment) mới tính giờ bay và chuyển sang WAITING. Quá hạn
   chưa thanh toán sẽ tự chuyển PAYMENT_EXPIRED và không giữ chỗ cho ai.
   ============================================ */

/* Phiên bản Apps Script mà server báo về (null = bản cũ, chưa có trường
   version). Trang admin đọc biến này để cảnh báo deploy cũ. */
var TFDQ_SERVER_VERSION;

var TFDQ = (function () {
  var CFG = window.TFD_CONFIG || {};
  var SESSION_MS = (CFG.SESSION_MINUTES || 15) * 60000;  // mọi slot đều dài như nhau
  /* PREP_MS và ARRIVE_MS là HAI thứ khác nhau, đừng dùng lẫn:
       PREP_MS   (5p)  — việc của nhân viên: gọi khách trước giờ bay 5 phút,
                         gọi rồi quá 5 phút chưa tới thì huỷ lượt.
       ARRIVE_MS (15p) — lời dặn cho KHÁCH: có mặt trước giờ bay 15 phút để
                         check-in và làm thủ tục.
     Trước đây web tính "có mặt trước" bằng PREP_MS nên hiện 17:40, còn
     email và lời mời lịch ghi 17:30 — cùng một lượt bay mà khách nhận hai
     mốc giờ khác nhau. */
  var PREP_MS = (CFG.PREP_MINUTES || 5) * 60000;
  var ARRIVE_MS = (CFG.ARRIVE_EARLY_MINUTES || 15) * 60000;
  var PAYMENT_MS = (CFG.PAYMENT_MINUTES || 5) * 60000;
  var LOCAL_KEY = 'tfd_queue_v1';
  var QUEUE_STATUSES = ['WAITING', 'CALLED', 'PRESENT'];

  function isRemote() {
    return !!(CFG.SCRIPT_URL && CFG.SCRIPT_URL.indexOf('http') === 0);
  }

  /* ---------- lưu trữ ---------- */

  function localRead() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
    catch (err) { return []; }
  }

  function localWrite(items) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
  }

  /* Gửi lệnh lên Apps Script. Mạng sự kiện đông người rất chập chờn nên:
     - mỗi lần gửi có thời hạn 12 giây (tự huỷ nếu treo),
     - tự thử lại tối đa 2 lần (chờ 0.8–2s ngẫu nhiên) khi lỗi mạng hoặc
       server báo BUSY (nghẽn khoá ghi lúc quá đông).
     Thử lại AN TOÀN vì mọi lệnh đều idempotent: register gửi kèm id do
     máy khách tự sinh (cid) — server nhận trùng id sẽ trả bản đã có. */
  function post(params, attempt) {
    attempt = attempt || 0;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 12000);
    return fetch(CFG.SCRIPT_URL, {
      method: 'POST',
      body: new URLSearchParams(params),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (timer) clearTimeout(timer);
      if (data && data.error === 'BUSY' && attempt < 2) return retryLater();
      return data;
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (attempt < 2) return retryLater();
      throw err;
    });
    function retryLater() {
      return new Promise(function (resolve) {
        setTimeout(resolve, 800 + Math.floor(Math.random() * 1200));
      }).then(function () { return post(params, attempt + 1); });
    }
  }

  function list() {
    if (!isRemote()) return Promise.resolve(localRead());
    return listFetch_(0);
  }

  /* GET danh sách — cũng có thời hạn 12 giây + tự thử lại 2 lần như post().
     Không có thời hạn thì một fetch treo (mạng sự kiện chập chờn) giữ cờ
     "đang tải" mãi mãi → trang admin đứng hình với dữ liệu cũ vô thời hạn. */
  function listFetch_(attempt) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 12000);
    return fetch(CFG.SCRIPT_URL + '?action=list&t=' + Date.now(), {
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (timer) clearTimeout(timer);
      // Ghi nhớ phiên bản Apps Script đang chạy để trang quản lý cảnh báo
      // khi bản deploy đã cũ hơn code trong dự án.
      TFDQ_SERVER_VERSION = (data && data.version != null) ? data.version : null;
      return data.items || [];
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (attempt >= 2) throw err;
      return new Promise(function (resolve) {
        setTimeout(resolve, 800 + Math.floor(Math.random() * 1200));
      }).then(function () { return listFetch_(attempt + 1); });
    });
  }

  function register(data) {
    var phone = (data.phone || '').replace(/\s+/g, '');
    var email = (data.email || '').trim();
    var payMethod = String(data.payMethod || '').toUpperCase();
    var slotKey = String(data.slotKey || '').trim();
    if (['BANK', 'QR', 'CASH'].indexOf(payMethod) === -1) payMethod = 'BANK';
    if (!isRemote()) {
      var items = localRead();
      var size = String(data.groupSize) === '2' ? 2 : 1;
      var now = new Date().toISOString();
      // Chưa tính giờ bay — phải thanh toán (confirmPayment) trong
      // PAYMENT_MINUTES thì mới được xếp vào hàng chờ.
      var item = {
        id: Math.random().toString(36).slice(2, 10),
        createdAt: now,
        name: (data.name || '').trim(),
        phone: phone,
        email: email,
        status: 'PENDING_PAYMENT',
        calledAt: '',
        sessionStart: '',
        updatedAt: now,
        groupSize: String(size),
        slotKey: slotKey,
        eta: slotKey ? new Date(TFD_SLOTS.slotMs(slotKey.slice(0,10), slotKey.slice(11))).toISOString() : '',
        payMethod: payMethod,
        amount: String((CFG.PRICE_PER_PERSON || 150000) * size),
        payRef: '',
        approvedAt: '',
        flightDate: '',
        seq: '',
        pairState: '',
        pairWith: '',
        emailStage: ''
      };
      items.push(item);
      localWrite(items);
      return Promise.resolve({ ok: true, item: item });
    }
    return post({
      action: 'register', name: data.name,
      phone: phone, email: email, payMethod: payMethod, slotKey: slotKey,
      groupSize: String(data.groupSize) === '2' ? '2' : '1',
      // id sinh tại máy khách — lệnh gửi lại (retry) không tạo hàng trùng
      cid: Math.random().toString(36).slice(2, 10)
    });
  }

  function update(id, status) {
    if (!isRemote()) {
      var items = localRead();
      var found = null;
      var now = new Date().toISOString();
      items.forEach(function (it) {
        if (it.id !== id) return;
        it.status = status;
        it.updatedAt = now;
        if (status === 'CALLED' && !it.calledAt) it.calledAt = now;
        if (status === 'IN_SESSION' && !it.sessionStart) it.sessionStart = now;
        found = it;
      });
      var changes = null;
      if (found && status === 'IN_SESSION') {
        // Phiên vừa bắt đầu — có thể TRỄ hơn giờ dự kiến (khách tới muộn
        // trong 5 phút ân hạn). Tính lại giờ bay của TẤT CẢ khách phía sau
        // theo giờ kết thúc THẬT của phiên (allowPush) — chặn domino lệch giờ.
        changes = reflowWaiting_(items, Date.now(), true);
      } else if (found && ['CANCELLED', 'PAYMENT_EXPIRED'].indexOf(status) !== -1) {
        // Huỷ tay / hết hạn thanh toán → dồn chỗ trống như cũ.
        // RIÊNG NO_SHOW (quá 5 phút ân hạn): KHÔNG reflow — slot vắng chết
        // đúng trong khung giờ của nó, các khách sau GIỮ NGUYÊN giờ đã báo.
        changes = reflowWaiting_(items, Date.now());
      }
      if (changes) {
        changes.forEach(function (ch) {
          items.forEach(function (it) {
            if (it.id === ch.id) { it.eta = ch.eta; it.updatedAt = now; }
          });
        });
      }
      localWrite(items);
      return Promise.resolve({ ok: !!found, item: found });
    }
    return post({ action: 'update', id: id, status: status });
  }

  /* Bàn admin xác nhận đã nhận thanh toán. Giờ bay CHỈ tính và khóa lại
     tại đây (không phải lúc đăng ký) nên khách chưa trả tiền không chiếm
     chỗ của người khác. Idempotent — bấm trễ/bấm lại không tính lại giờ. */
  /* Nhân viên xác nhận đã nhận tiền → server tính giờ bay, ghép đôi và
     GỬI EMAIL cho khách (xem confirmPayment_ trong google-apps-script.gs).
     opts: { payMethod: 'BANK'|'QR'|'CASH', payRef: 'mã/ghi chú CK' } —
     nhân viên có thể chỉnh lại hình thức thật khi đối chiếu ảnh Zalo. */
  function confirmPayment(id, opts) {
    opts = opts || {};
    if (!isRemote()) {
      var items = localRead();
      var found = null;
      var now = new Date().toISOString();
      items.forEach(function (it) {
        if (it.id === id) found = it;
      });
      if (found && found.status === 'PENDING_PAYMENT') {
        if (opts.payMethod) found.payMethod = String(opts.payMethod).toUpperCase();
        if (opts.payRef) found.payRef = String(opts.payRef);
        found.approvedAt = now;
        // Đặt tạm: 1 người → ghép vào slot đang mở sớm nhất nếu có;
        // còn lại đặt cuối hàng…
        found.status = 'WAITING';
        found.eta = new Date(placeEta_(items, sizeOf(found))).toISOString();
        found.updatedAt = now;
        // …rồi xếp lại NGAY: slot đủ người được ưu tiên lên trước,
        // slot lẻ đang chờ ghép dời ra sau (khách lẻ chưa thấy giờ nào
        // nên không thất hứa với ai).
        var changes = reflowWaiting_(items, Date.now());
        changes.forEach(function (ch) {
          items.forEach(function (it) {
            if (it.id === ch.id) { it.eta = ch.eta; it.updatedAt = now; }
          });
        });
      }
      localWrite(items);
      return Promise.resolve({ ok: !!found, item: found });
    }
    return post({
      action: 'confirmPayment', id: id,
      payMethod: opts.payMethod || '', payRef: opts.payRef || ''
    });
  }

  /* Chế độ thử nghiệm: đồng bộ giữa các tab trên cùng thiết bị */
  function onExternalChange(cb) {
    if (isRemote()) return;
    window.addEventListener('storage', function (e) {
      if (e.key === LOCAL_KEY) cb();
    });
  }

  /* ---------- tính lịch & hàng chờ ---------- */

  /* Số người của một lượt đăng ký (1 hoặc 2) */
  function sizeOf(it) {
    return String(it.groupSize) === '2' ? 2 : 1;
  }

  /* Thời lượng slot — như nhau cho mọi lượt, bất kể 1 hay 2 khách */
  function durMs(it) {
    return SESSION_MS;
  }

  /* Thời điểm sớm nhất một slot MỚI có thể bắt đầu: ngay khi buồng lái
     rảnh — khách bay xong là lượt kế tiếp vào luôn, không nghỉ giữa ca */
  function boothFree_(items, now) {
    var free = now;
    items.forEach(function (it) {
      if (it.status === 'IN_SESSION') {
        var end = Date.parse(it.sessionStart || it.updatedAt) + durMs(it);
        if (end > free) free = end;
      }
    });
    return free;
  }

  /* Slot đang "mở" sớm nhất: đã có 1 khách đăng ký 1 mình giữ chỗ, còn
     trống 1 chỗ để ghép. Trả về giờ bay (ms) của slot đó, hoặc null nếu
     không có slot nào đang mở (mọi slot đều trống hoặc đã đủ 2 khách). */
  function openSlotEta_(items) {
    var bySlot = {};
    items.forEach(function (it) {
      if (QUEUE_STATUSES.indexOf(it.status) === -1 || !it.eta) return;
      var t = Date.parse(it.eta);
      bySlot[t] = (bySlot[t] || 0) + sizeOf(it);
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

  /* Chỗ đặt TẠM cho lượt vừa xác nhận thanh toán: solo ghép vào slot mở
     nếu có, còn lại đặt ở cuối hàng — NGAY SAU ĐÓ reflowWaiting_ sẽ xếp
     lại thứ tự ưu tiên (slot đủ người lên trước, slot lẻ ra sau). */
  function placeEta_(items, groupSize, now) {
    now = now || Date.now();
    if (groupSize === 1) {
      var openEta = openSlotEta_(items);
      if (openEta !== null) return openEta;
    }
    var lockedEnd = boothFree_(items, now);
    items.forEach(function (it) {
      if (QUEUE_STATUSES.indexOf(it.status) === -1 || !it.eta) return;
      var end = Date.parse(it.eta) + durMs(it);
      if (end > lockedEnd) lockedEnd = end;
    });
    return lockedEnd;
  }

  /* DỰ ĐOÁN giờ bay CUỐI CÙNG (sau khi xếp ưu tiên) cho một lượt mới —
     dùng cho banner trang khách + optimistic UI trên admin:
     - 1 người: slot mở sớm nhất nếu có; không thì như nhóm 2 người.
     - 2 người: ngay sau slot ĐỦ NGƯỜI / ĐÃ KHOÁ cuối cùng. Slot lẻ đang
       chờ ghép KHÔNG tính — nhóm đủ người luôn được ưu tiên bay trước
       (chắc chắn lấp đầy buồng lái), slot lẻ sẽ bị dời ra sau. */
  function nextEtaFor_(items, groupSize, now) {
    now = now || Date.now();
    if (groupSize === 1) {
      var openEta = openSlotEta_(items);
      if (openEta !== null) return openEta;
    }
    var bySlot = {};
    items.forEach(function (it) {
      if (QUEUE_STATUSES.indexOf(it.status) === -1 || !it.eta) return;
      var t = Date.parse(it.eta);
      (bySlot[t] = bySlot[t] || []).push(it);
    });
    var cursor = boothFree_(items, now);
    Object.keys(bySlot).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (t) {
        var members = bySlot[t];
        var locked = members.some(function (it) { return it.status === 'CALLED' || it.status === 'PRESENT'; });
        var people = 0;
        members.forEach(function (m) { people += sizeOf(m); });
        if (!locked && people < 2) return; // slot lẻ sẽ bị dời ra sau lượt mới
        var slotStart = locked ? t : Math.min(cursor, t);
        cursor = Math.max(cursor, slotStart + SESSION_MS);
      });
    return cursor;
  }

  /* Trả về:
     - inSession:      lượt đang trong buồng lái (kèm giờ kết thúc, 15 phút)
     - entries:         hàng chờ theo giờ bay đã chốt; mỗi entry biết cả
                         slotPeople/waitingForPair/partners (ghép cặp 1-1)
     - nextUp:           lượt thuộc slot kế tiếp (slot 0)
     - pendingPayments: lượt PENDING_PAYMENT, cũ→mới, kèm hạn thanh toán
                         (KHÔNG chiếm slot, không nằm trong entries)
     - history:         DONE / NO_SHOW / PAYMENT_EXPIRED / CANCELLED, mới nhất trước */
  function compute(items, now) {
    now = now || Date.now();
    var sorted = items.slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? -1 : (a.createdAt > b.createdAt ? 1 : 0);
    });

    var inSession = sorted
      .filter(function (it) { return it.status === 'IN_SESSION'; })
      .map(function (it) {
        var start = Date.parse(it.sessionStart || it.updatedAt);
        return { item: it, start: start, end: start + durMs(it) };
      });

    var sessionPeople = 0;
    inSession.forEach(function (s) { sessionPeople += sizeOf(s.item); });

    var boothFree = boothFree_(sorted, now);
    var queueItems = sorted.filter(function (it) {
      return QUEUE_STATUSES.indexOf(it.status) !== -1;
    });

    // Giờ bay đã chốt khi đăng ký là nguồn chuẩn cho đếm ngược.
    // Lượt cũ chưa có giờ chốt (dữ liệu phiên bản trước) xếp vào cuối.
    var lockedEnd = boothFree;
    queueItems.forEach(function (it) {
      if (it.eta) {
        var end = Date.parse(it.eta) + durMs(it);
        if (end > lockedEnd) lockedEnd = end;
      }
    });
    var resolved = queueItems.map(function (it) {
      var t;
      if (it.eta) {
        t = Date.parse(it.eta);
      } else {
        t = lockedEnd;
        lockedEnd += durMs(it);
      }
      return { item: it, etaMs: t };
    });
    resolved.sort(function (a, b) {
      return a.etaMs - b.etaMs || (a.item.createdAt < b.item.createdAt ? -1 : (a.item.createdAt > b.item.createdAt ? 1 : 0));
    });

    var distinctTimes = [];
    resolved.forEach(function (r) {
      if (distinctTimes.indexOf(r.etaMs) === -1) distinctTimes.push(r.etaMs);
    });

    var entries = resolved.map(function (r, i) {
      var it = r.item;
      var callDeadline = it.calledAt ? Date.parse(it.calledAt) + PREP_MS : null;
      return {
        item: it,
        position: i + 1,
        size: sizeOf(it),
        slotIndex: distinctTimes.indexOf(r.etaMs),
        eta: r.etaMs,
        mustArriveBy: r.etaMs - ARRIVE_MS,   // PHẢI khớp email + lời mời lịch
        waitMin: Math.max(0, Math.round((r.etaMs - now) / 60000)),
        // Còn ≤ 5 phút đến giờ bay đã chốt mà chưa gọi → nhắc gọi ngay
        needsCall: it.status === 'WAITING' && (r.etaMs - now) <= PREP_MS,
        callDeadline: callDeadline,
        // Đã gọi quá 5 phút mà chưa có mặt → sẽ tự hủy
        overdue: it.status === 'CALLED' && callDeadline !== null && now > callDeadline
      };
    });

    // Ghép cặp: gom theo slotIndex để biết slot đã đủ 2 khách chưa và
    // (nếu là 1 người) đang/sẽ bay chung slot với ai.
    var slotTotals = {};
    entries.forEach(function (en) { slotTotals[en.slotIndex] = (slotTotals[en.slotIndex] || 0) + en.size; });
    entries.forEach(function (en) {
      en.slotPeople = slotTotals[en.slotIndex];
      en.waitingForPair = en.size === 1 && en.slotPeople < 2;
      en.partners = entries
        .filter(function (o) { return o.slotIndex === en.slotIndex && o.item.id !== en.item.id; })
        .map(function (o) { return o.item.name; });
    });

    var waitingPeople = 0;
    entries.forEach(function (en) { waitingPeople += en.size; });

    var nextUp = entries.filter(function (en) { return en.slotIndex === 0; });
    var nextUpPeople = 0;
    nextUp.forEach(function (en) { nextUpPeople += en.size; });

    var history = sorted
      .filter(function (it) {
        return ['DONE', 'NO_SHOW', 'PAYMENT_EXPIRED', 'CANCELLED'].indexOf(it.status) !== -1;
      })
      .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });

    // Lượt đang chờ thanh toán tại bàn admin — chưa có giờ bay, chưa
    // chiếm slot nào; quá PAYMENT_MS kể từ lúc đăng ký thì tự hủy.
    var pendingPayments = sorted
      .filter(function (it) { return it.status === 'PENDING_PAYMENT'; })
      .map(function (it) {
        var deadline = Date.parse(it.createdAt) + PAYMENT_MS;
        return { item: it, deadline: deadline, overdue: now > deadline };
      });

    // Giờ bay ước tính cho người đăng ký MỚI (theo luật ưu tiên đủ người:
    // slot lẻ đang chờ ghép không chặn nhóm 2 người phía sau):
    // - duo (2 người): sau slot đủ người/đã khoá cuối cùng.
    // - solo (1 người): ghép vào slot đang mở sớm nhất nếu có.
    var duoEta = nextEtaFor_(sorted, 2, now);
    var openEta = openSlotEta_(sorted);
    var soloEta = openEta !== null ? openEta : nextEtaFor_(sorted, 1, now);

    return {
      now: now,
      boothFree: boothFree,
      inSession: inSession,
      sessionPeople: sessionPeople,
      entries: entries,
      nextUp: nextUp,
      nextUpPeople: nextUpPeople,
      pendingPayments: pendingPayments,
      history: history,
      waitingCount: entries.length,
      waitingPeople: waitingPeople,
      newcomerEta: duoEta,
      newcomerWaitMin: Math.max(0, Math.round((duoEta - now) / 60000)),
      soloEta: soloEta,
      soloWaitMin: Math.max(0, Math.round((soloEta - now) / 60000)),
      soloHasOpenSlot: openEta !== null,
      duoEta: duoEta,
      duoWaitMin: Math.max(0, Math.round((duoEta - now) / 60000))
    };
  }

  /* Tự sửa lịch hàng chờ — bộ xếp lịch CHUẨN duy nhất. Chạy sau mỗi lần
     xác nhận thanh toán, sau CANCELLED/NO_SHOW/PAYMENT_EXPIRED, và khi
     phát hiện dữ liệu lệch (needsPairing). Ba bước:
     1) GHÉP CẶP: khách 1-người WAITING đang lẻ ở slot sau được chuyển vào
        slot lẻ SỚM NHẤT còn trống chỗ (người đến trước được ghép trước).
     2) ƯU TIÊN ĐỦ NGƯỜI: slot đủ 2 khách (nhóm 2 người hoặc cặp đã ghép)
        luôn đứng TRƯỚC slot lẻ đang chờ ghép — nhóm đủ người chắc chắn
        lấp đầy buồng lái nên bay trước; khách lẻ chưa được hiện giờ bay
        nên dời ra sau không thất hứa với ai.
     3) NÉN SLOT: slot trống hẳn biến mất, slot sau dồn sớm lên. Slot có
        người CALLED/PRESENT giữ nguyên giờ; slot đủ người không bao giờ
        bị đẩy TRỄ hơn giờ đã báo.
     CHẾ ĐỘ allowPush=true (dùng khi PHIÊN BAY VỪA BẮT ĐẦU — có thể trễ
     hơn dự kiến vì khách tới muộn trong 5 phút ân hạn): được phép đẩy
     giờ các slot sau RA TRỄ HƠN, tính lại toàn bộ từ giờ kết thúc THẬT
     của phiên — chặn hiệu ứng domino "giờ ảo" cho mọi ca bay sau.
     Trả về [{id, eta}] — chỉ những lượt có giờ THAY ĐỔI. */
  function reflowWaiting_(items, now, allowPush) {
    now = now || Date.now();
    var boothFree = boothFree_(items, now);

    var active = items.filter(function (it) {
      return QUEUE_STATUSES.indexOf(it.status) !== -1 && it.eta;
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
          members.forEach(function (m) { people += sizeOf(m); });
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
            if (!mover && m.status === 'WAITING' && sizeOf(m) === 1) mover = m;
          });
          if (mover) { etaOf[mover.id] = open[i].time; moved = true; }
        }
      }
    }

    // 2) xếp thứ tự ưu tiên + nén: slot ĐỦ NGƯỜI (và slot đã khoá) đứng
    //    trước — nhóm đủ người chắc chắn lấp đầy buồng lái nên luôn được
    //    ưu tiên bay trước; slot lẻ đang chờ ghép dời ra SAU CÙNG (khách
    //    lẻ không được hiện giờ bay nên dời không thất hứa với ai).
    var cursor = boothFree;
    var loneSlots = [];
    slotList().forEach(function (s) {
      // Slot đang LÊN BUỒNG LÁI (giờ đã tới, mọi thành viên còn lại đều
      // PRESENT — bạn bay chung của họ vừa được chuyển IN_SESSION): bỏ
      // qua, khung giờ phiên hiện tại đã bao trùm slot này; đẩy giờ chỉ
      // gây nhiễu hiển thị trong tích tắc chuyển trạng thái.
      if (allowPush && s.time <= now && s.members.every(function (m) { return m.status === 'PRESENT'; })) return;
      var locked = s.members.some(function (it) { return it.status === 'CALLED' || it.status === 'PRESENT'; });
      if (!locked && s.people < 2) { loneSlots.push(s); return; }
      var slotStart;
      if (locked) {
        // Bình thường: giữ nguyên giờ đã báo. allowPush: được đẩy TRỄ khi
        // buồng lái thật sự bận quá giờ đó (không bao giờ kéo SỚM hơn).
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

  /* Lịch đang cần sửa? Trả về true khi:
     - có khách 1-người WAITING đang lẻ trong khi còn slot lẻ sớm hơn để
       ghép vào (hai khách lẻ nhận hai slot riêng — lỗi từng xảy ra), HOẶC
     - slot lẻ chưa khoá đứng TRƯỚC một slot đủ người/đã khoá — sai luật
       ưu tiên đủ người, cần dời slot lẻ ra sau, HOẶC
     - GIỜ ẢO: phiên đang bay (bắt đầu trễ) chiếm buồng lái QUA giờ bay
       đã báo của khách phía sau — giờ đó không thể bay được, cần tính lại. */
  function needsPairing(items) {
    // Giờ ảo: eta rơi vào TRONG khung phiên đang chạy (chừa 10s dung sai;
    // bỏ qua khách PRESENT — họ đang lên buồng lái cùng phiên đó)
    var busyUntil = 0;
    items.forEach(function (it) {
      if (it.status === 'IN_SESSION') {
        var end = Date.parse(it.sessionStart || it.updatedAt) + SESSION_MS;
        if (end > busyUntil) busyUntil = end;
      }
    });
    if (busyUntil) {
      for (var q = 0; q < items.length; q++) {
        var itq = items[q];
        if ((itq.status === 'WAITING' || itq.status === 'CALLED') && itq.eta &&
            Date.parse(itq.eta) < busyUntil - 10000) return true;
      }
    }

    var bySlot = {};
    items.forEach(function (it) {
      if (QUEUE_STATUSES.indexOf(it.status) === -1 || !it.eta) return;
      var t = Date.parse(it.eta);
      (bySlot[t] = bySlot[t] || []).push(it);
    });
    var slots = Object.keys(bySlot).map(Number).sort(function (a, b) { return a - b; })
      .map(function (t) {
        var members = bySlot[t];
        var people = 0;
        members.forEach(function (m) { people += sizeOf(m); });
        var locked = members.some(function (m) { return m.status === 'CALLED' || m.status === 'PRESENT'; });
        return { members: members, people: people, locked: locked };
      });

    // sai thứ tự ưu tiên: slot lẻ chưa khoá đứng trước slot đủ người/đã khoá
    var sawLone = false;
    for (var k = 0; k < slots.length; k++) {
      var lone = !slots[k].locked && slots[k].people < 2;
      if (lone) { sawLone = true; continue; }
      if (sawLone) return true;
    }

    // còn cặp lẻ ghép được với nhau
    var open = slots.filter(function (s) { return s.people < 2; });
    for (var i = 0; i < open.length; i++) {
      for (var j = i + 1; j < open.length; j++) {
        var hasMover = open[j].members.some(function (m) { return m.status === 'WAITING' && sizeOf(m) === 1; });
        if (hasMover) return true;
      }
    }
    return false;
  }

  /* Chạy tự sửa lịch (ghép cặp + ưu tiên + nén/đẩy slot) và LƯU kết quả.
     Trang admin gọi khi needsPairing() = true. Dùng allowPush để sửa được
     cả "giờ ảo" khi phiên bay bắt đầu trễ. */
  function repair() {
    if (!isRemote()) {
      var items = localRead();
      var changes = reflowWaiting_(items, Date.now(), true);
      if (changes.length) {
        var now = new Date().toISOString();
        changes.forEach(function (ch) {
          items.forEach(function (it) {
            if (it.id === ch.id) { it.eta = ch.eta; it.updatedAt = now; }
          });
        });
        localWrite(items);
      }
      return Promise.resolve({ ok: true, changed: changes.length });
    }
    return post({ action: 'repair' });
  }

  /* ---------- KHOÁ / MỞ SLOT THỦ CÔNG (trang quản lý) ----------
     Khoá một ô 15 phút cho khách vãng lai — ô đó lập tức thành "Kín chỗ"
     ngoài trang khách. Chỗ khoá được ghi vào CHÍNH sheet đăng ký dưới
     trạng thái BLOCKED, nên trạng thái slot vẫn chỉ tính từ một nguồn.
     Chế độ thử nghiệm (chưa nối Google Sheet) làm y hệt trên localStorage
     để test được luồng mà không cần mạng. */
  var BLOCK_NAME = '[LOCKED / KHÁCH NGOÀI]';

  function blockSlot(slotKey, reason) {
    reason = String(reason || '').trim() || 'Khách ngoài';
    if (!isRemote()) {
      var items = localRead();
      for (var i = 0; i < items.length; i++) {
        if (items[i].status === 'BLOCKED' && items[i].slotKey === slotKey) {
          return Promise.resolve({ ok: true, item: items[i], already: true });
        }
      }
      var now = new Date().toISOString();
      var item = {
        id: 'blk' + Math.random().toString(36).slice(2, 7),
        createdAt: now, updatedAt: now,
        name: BLOCK_NAME, phone: '', email: '',
        status: 'BLOCKED', groupSize: '2',
        slotKey: slotKey, flightDate: String(slotKey).slice(0, 10),
        eta: new Date(TFD_SLOTS.slotMs(String(slotKey).slice(0, 10), String(slotKey).slice(11, 16))).toISOString(),
        amount: '0', payRef: reason
      };
      items.push(item);
      localWrite(items);
      return Promise.resolve({ ok: true, item: item });
    }
    return post({ action: 'blockSlot', slotKey: slotKey, reason: reason });
  }

  function unblockSlot(slotKey) {
    if (!isRemote()) {
      var items = localRead();
      /* Chỉ xoá hàng BLOCKED — tuyệt đối không đụng booking của khách thật */
      var left = items.filter(function (it) {
        return !(it.status === 'BLOCKED' && it.slotKey === slotKey);
      });
      if (left.length === items.length) {
        return Promise.resolve({ ok: false, error: 'NOT_BLOCKED' });
      }
      localWrite(left);
      return Promise.resolve({ ok: true, slotKey: slotKey });
    }
    return post({ action: 'unblockSlot', slotKey: slotKey });
  }

  /* Các lượt slot kế tiếp cần TỰ ĐỘNG vào buồng lái: khách đã CÓ MẶT,
     đã tới giờ bay, buồng lái trống, và không còn ai cùng slot đang trong
     thời gian ân hạn (WAITING chưa gọi hoặc CALLED chưa quá 5 phút) —
     người ân hạn hết hạn sẽ bị NO_SHOW rồi phiên tự bắt đầu ở nhịp sau. */
  function autoStartReady(computed) {
    if (computed.inSession.length || !computed.nextUp.length) return [];
    if (computed.now < computed.nextUp[0].eta) return [];
    var blocked = computed.nextUp.some(function (en) {
      return en.item.status === 'WAITING' ||
        (en.item.status === 'CALLED' && !en.overdue);
    });
    if (blocked) return [];
    return computed.nextUp.filter(function (en) { return en.item.status === 'PRESENT'; });
  }

  /* Luật tự động — gọi từ trang admin mỗi nhịp đồng hồ:
     1) Quá PAYMENT_MINUTES chưa thanh toán → PAYMENT_EXPIRED
     2) Gọi rồi mà quá 5 phút chưa có mặt → NO_SHOW (đẩy người sau lên)
     3) Khách đã có mặt + tới giờ bay + buồng lái trống → TỰ vào phiên bay
        (đồng hồ đếm ngược thời gian bay tự chạy)
     4) Lượt bay đủ 15 phút → DONE                                     */
  function autoTick(computed) {
    var actions = [];
    computed.pendingPayments.forEach(function (en) {
      if (en.overdue) actions.push({ id: en.item.id, status: 'PAYMENT_EXPIRED', name: en.item.name });
    });
    computed.entries.forEach(function (en) {
      if (en.overdue) actions.push({ id: en.item.id, status: 'NO_SHOW', name: en.item.name });
    });
    autoStartReady(computed).forEach(function (en) {
      actions.push({ id: en.item.id, status: 'IN_SESSION', name: en.item.name });
    });
    computed.inSession.forEach(function (s) {
      if (computed.now >= s.end) actions.push({ id: s.item.id, status: 'DONE', name: s.item.name });
    });
    if (!actions.length) return Promise.resolve([]);
    return Promise.all(actions.map(function (a) {
      return update(a.id, a.status);
    })).then(function () { return actions; });
  }

  /* ---------- định dạng ---------- */

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtCountdown(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h) return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + sec).slice(-2);
    return m + ':' + ('0' + sec).slice(-2);
  }

  /* ---------- lọc theo ngày (sự kiện nhiều ngày) ----------
     Sự kiện kéo dài 3 ngày — mỗi ngày cần hàng chờ riêng,
     không lẫn dữ liệu ngày trước. Dùng múi giờ Việt Nam (GMT+7). */

  var TZ_OFFSET_MS = 7 * 3600000; // GMT+7

  /** Trả về 'YYYY-MM-DD' theo giờ Việt Nam từ ISO string hoặc ms */
  function dateKeyVN(isoOrMs) {
    var ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
    if (isNaN(ms)) return '';
    var d = new Date(ms + TZ_OFFSET_MS);
    var y = d.getUTCFullYear();
    var m = ('0' + (d.getUTCMonth() + 1)).slice(-2);
    var day = ('0' + d.getUTCDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }

  /** Ngày hôm nay theo giờ Việt Nam */
  function todayVN() {
    return dateKeyVN(Date.now());
  }

  /** NGÀY BAY của một lượt đăng ký — KHÔNG phải ngày khách bấm đăng ký.
      Ưu tiên slot khách tự chọn, rồi giờ bay đã chốt, rồi cột ngày bay;
      hết cách mới lấy ngày đăng ký (chỉ còn dữ liệu rất cũ mới rơi vào). */
  function flightDayOf(it) {
    if (!it) return '';
    if (it.slotKey) {
      var s = String(it.slotKey).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
    if (it.flightDate && /^\d{4}-\d{2}-\d{2}$/.test(String(it.flightDate))) {
      return String(it.flightDate);
    }
    if (it.eta) {
      var k = dateKeyVN(it.eta);
      if (k) return k;
    }
    return dateKeyVN(it.createdAt);
  }

  /** Lọc items theo NGÀY BAY (mặc định = hôm nay).

      Trước đây hàm này lọc theo createdAt — ngày khách BẤM ĐĂNG KÝ. Các
      tab trong trang quản lý lại là NGÀY BAY (03/08…10/08). Khách đặt
      ngày 31/07 cho chuyến 03/08 có createdAt = 31/07, mà 31/07 không hề
      có tab nào → lượt đó KHÔNG hiện ở bất kỳ tab nào, nhân viên không
      thấy để bấm duyệt, 45 phút sau tự huỷ dù khách đã chuyển tiền. */
  function filterByDay(items, dayKey) {
    var key = dayKey || todayVN();
    return items.filter(function (it) { return flightDayOf(it) === key; });
  }

  /** Trả về danh sách ngày (YYYY-MM-DD) có trong dữ liệu, cũ → mới */
  function daysInData(items) {
    var seen = {};
    var days = [];
    items.forEach(function (it) {
      var k = dateKeyVN(it.createdAt);
      if (k && !seen[k]) { seen[k] = true; days.push(k); }
    });
    days.sort();
    return days;
  }

  /** Format ngày dạng DD/MM cho hiển thị */
  function fmtDayLabel(dayKey) {
    if (!dayKey) return '';
    var parts = dayKey.split('-');
    return parts[2] + '/' + parts[1];
  }

  /* ---------- khung giờ nhận đăng ký (BOOKING_HOURS) ----------
     Tất cả tính theo giờ Việt Nam (GMT+7) chứ không theo đồng hồ máy khách,
     để khách đặt sai múi giờ vẫn thấy đúng khung giờ của gian hàng. */

  var DAY_MS = 86400000;

  /** Mốc 00:00 giờ VN của ngày chứa thời điểm ms (trả về timestamp thật) */
  function vnMidnightMs(ms) {
    return Math.floor((ms + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
  }

  /** "HH:MM" → số phút từ 00:00; trả null nếu sai định dạng */
  function parseHM(str) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
    if (!m) return null;
    var h = +m[1], min = +m[2];
    if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
    return h * 60 + min;
  }

  function pad2(n) { return ('0' + n).slice(-2); }

  /** số phút → "HH:MM" (24h) */
  function fmtHM(mins) {
    return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);
  }

  /** Danh sách khung giờ đã chuẩn hóa + sắp xếp; bỏ qua khung sai/rỗng */
  function bookingWindows() {
    var raw = (typeof TFD_CONFIG !== 'undefined' && TFD_CONFIG.BOOKING_HOURS) || [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var s = parseHM(raw[i] && raw[i].start);
      var e = parseHM(raw[i] && raw[i].end);
      if (s === null || e === null || e <= s) continue;
      out.push({ startMin: s, endMin: e, start: fmtHM(s), end: fmtHM(e) });
    }
    out.sort(function (a, b) { return a.startMin - b.startMin; });
    return out;
  }

  /** "10:00–13:00 · 18:00–21:00" */
  function bookingHoursText() {
    return bookingWindows().map(function (w) {
      return w.start + '–' + w.end;
    }).join(' · ');
  }

  /**
   * Trạng thái nhận đăng ký tại thời điểm now.
   * → { open, windows, current, closesAt }            khi đang mở
   * → { open:false, windows, next, opensAt }          khi đang đóng
   * Không cấu hình khung giờ = luôn mở.
   */
  function bookingStatus(nowMs) {
    var now = (nowMs == null) ? Date.now() : nowMs;
    var wins = bookingWindows();

    /* CÔNG TẮC TỔNG — REGISTRATION_OPEN: false trong config.js.
       Đóng ở đây là đóng hẳn, không cần biết mấy giờ, ngày nào. Dùng cho
       lúc website đã lên nhưng CHƯA tới giờ mở bán. Chốt chặn thật nằm ở
       máy chủ (google-apps-script.gs) — chỗ này chỉ để khách nhìn thấy. */
    if (typeof TFD_CONFIG !== 'undefined' && TFD_CONFIG.REGISTRATION_OPEN === false) {
      return { open: false, windows: wins, locked: true };
    }

    if (!wins.length) return { open: true, windows: wins, always: true };

    var mid = vnMidnightMs(now);
    var mod = Math.floor((now - mid) / 60000); // phút trong ngày, giờ VN

    for (var i = 0; i < wins.length; i++) {
      if (mod >= wins[i].startMin && mod < wins[i].endMin) {
        return {
          open: true, windows: wins, current: wins[i],
          closesAt: mid + wins[i].endMin * 60000
        };
      }
    }
    for (var j = 0; j < wins.length; j++) {
      if (mod < wins[j].startMin) {
        return {
          open: false, windows: wins, next: wins[j],
          opensAt: mid + wins[j].startMin * 60000
        };
      }
    }
    // đã qua khung cuối trong ngày → khung đầu tiên của ngày mai
    return {
      open: false, windows: wins, next: wins[0], tomorrow: true,
      opensAt: mid + DAY_MS + wins[0].startMin * 60000
    };
  }

  function isBookingOpen(nowMs) {
    return bookingStatus(nowMs).open;
  }

  return {
    isRemote: isRemote,
    list: list,
    register: register,
    update: update,
    confirmPayment: confirmPayment,
    compute: compute,
    autoTick: autoTick,
    autoStartReady: autoStartReady,
    needsPairing: needsPairing,
    repair: repair,
    blockSlot: blockSlot,
    unblockSlot: unblockSlot,
    BLOCK_NAME: BLOCK_NAME,
    nextEtaFor: nextEtaFor_,
    onExternalChange: onExternalChange,
    fmtTime: fmtTime,
    fmtCountdown: fmtCountdown,
    sizeOf: sizeOf,
    durMs: durMs,
    dateKeyVN: dateKeyVN,
    todayVN: todayVN,
    filterByDay: filterByDay,
    flightDayOf: flightDayOf,
    daysInData: daysInData,
    fmtDayLabel: fmtDayLabel,
    bookingWindows: bookingWindows,
    bookingHoursText: bookingHoursText,
    bookingStatus: bookingStatus,
    isBookingOpen: isBookingOpen,
    SESSION_MS: SESSION_MS,
    PREP_MS: PREP_MS,
    ARRIVE_MS: ARRIVE_MS,
    PAYMENT_MS: PAYMENT_MS
  };
})();
