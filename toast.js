/* ============================================================
   The Flight Deck — thông báo nổi (toast) + trạng thái đang tải

   Vì sao cần: mọi thao tác đều phải đợi Google Apps Script trả lời
   (thường 1–3 giây, mạng gian hàng có khi lâu hơn). Nếu bấm xong mà
   màn hình không có phản hồi gì, khách/nhân viên sẽ bấm lại lần nữa —
   sinh ra đăng ký trùng hoặc lệnh gửi hai lần.

   Dùng:
     TFD_UI.toast('Đã đăng ký!', 'success')
     TFD_UI.toast('Mất mạng', 'error', 6000)
     var stop = TFD_UI.busy(button, 'Đang gửi…');   // khoá nút + spinner
     stop();                                        // trả nút về như cũ
   ============================================================ */

var TFD_UI = (function () {
  'use strict';

  var host = null;

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement('div');
    host.className = 'tfd-toasts';
    host.setAttribute('role', 'status');       // trình đọc màn hình đọc được
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  var ICONS = { success: '✅', error: '⚠️', info: 'ℹ️', loading: '⏳' };

  /**
   * Hiện một thông báo nổi.
   * @param {string} msg  nội dung (chữ thuần, KHÔNG phải HTML)
   * @param {string} kind 'success' | 'error' | 'info' | 'loading'
   * @param {number} ms   tự ẩn sau bao lâu; 0 = giữ nguyên cho tới khi gọi .close()
   * @returns {{close:Function, update:Function}}
   */
  function toast(msg, kind, ms) {
    kind = kind || 'info';
    if (ms == null) ms = (kind === 'error') ? 6000 : 3500;

    var el = document.createElement('div');
    el.className = 'tfd-toast tfd-toast--' + kind;

    var icon = document.createElement('span');
    icon.className = 'tfd-toast__icon';
    icon.textContent = ICONS[kind] || ICONS.info;

    var text = document.createElement('span');
    text.className = 'tfd-toast__text';
    text.textContent = msg;              // textContent: không cho chèn HTML

    el.appendChild(icon);
    el.appendChild(text);
    ensureHost().appendChild(el);

    // Cho trình duyệt vẽ xong rồi mới thêm class chạy hiệu ứng trượt vào
    requestAnimationFrame(function () { el.classList.add('is-in'); });

    var timer = null;
    function close() {
      if (timer) { clearTimeout(timer); timer = null; }
      el.classList.remove('is-in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    if (ms > 0) timer = setTimeout(close, ms);

    return {
      close: close,
      update: function (newMsg, newKind) {
        text.textContent = newMsg;
        if (newKind) {
          el.className = 'tfd-toast tfd-toast--' + newKind + ' is-in';
          icon.textContent = ICONS[newKind] || ICONS.info;
        }
      }
    };
  }

  /**
   * Khoá một nút và hiện spinner trong lúc chờ mạng.
   * Trả về hàm gọi để trả nút về trạng thái cũ (gọi trong .finally()).
   */
  function busy(btn, label) {
    if (!btn) return function () {};
    if (btn.dataset.tfdBusy === '1') return function () {};   // đã đang bận
    var oldHtml = btn.innerHTML;
    var oldDisabled = btn.disabled;
    btn.dataset.tfdBusy = '1';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="tfd-spinner" aria-hidden="true"></span>' +
      '<span>' + String(label || 'Đang xử lý…').replace(/[&<>]/g, '') + '</span>';
    return function restore() {
      delete btn.dataset.tfdBusy;
      btn.disabled = oldDisabled;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = oldHtml;
    };
  }

  return { toast: toast, busy: busy };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TFD_UI;
