/* ============================================================
   The Flight Deck — màn hình chờ đếm số 0 → 100
   ------------------------------------------------------------
   Trình tự xem ở đầu preloader.css. Con số đi theo hai thứ cùng lúc:
     1. nhịp thời gian tối thiểu (~2.4 s, chậm dần về cuối) để hiệu
        ứng luôn đủ "đã" kể cả khi trang đã nằm sẵn trong bộ nhớ đệm;
     2. trang tải thật: chưa xong thì dừng ở 90, xong mới chạy nốt.
   Mạng quá chậm thì sau 7 s vẫn mở trang, không bắt khách chờ mãi.

   Script trong <head> quyết định có chạy hay không (gắn class
   "tfd-intro" lên <html>); file này chỉ làm việc khi class đó có mặt.
   ============================================================ */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("tfd-intro")) return;

  var loader = document.getElementById("tfd-loader");
  var numEl = document.getElementById("tfd-loader-num");
  if (!loader || !numEl) { root.classList.remove("tfd-intro"); return; }

  var MIN_MS = 2400;     // thời gian đếm tối thiểu
  var MAX_MS = 7000;     // quá mức này thì mở trang dù chưa tải xong
  var start = performance.now();
  var loaded = document.readyState === "complete";
  var shown = 0;

  window.addEventListener("load", function () { loaded = true; });

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function frame(now) {
    var elapsed = now - start;
    var timeTarget = 100 * easeOut(Math.min(elapsed / MIN_MS, 1));
    var cap = (loaded || elapsed > MAX_MS) ? 100 : 90;
    var target = Math.min(timeTarget, cap);

    // Đuổi theo mục tiêu mượt, không nhảy cóc
    shown += (target - shown) * 0.12;
    if (target - shown < 0.4) shown = target;

    var n = Math.floor(shown);
    numEl.textContent = String(n);

    if (n >= 100) return finish();
    requestAnimationFrame(frame);
  }

  function finish() {
    try { sessionStorage.setItem("tfd-intro-seen", "1"); } catch (e) {}
    setTimeout(function () {
      root.classList.add("tfd-intro--title");         // số trượt lên, tiêu đề A320 trồi lên
      setTimeout(function () {
        root.classList.add("tfd-intro--out");         // rèm kéo lên, hero hiện ra
        setTimeout(function () {
          loader.parentNode && loader.parentNode.removeChild(loader);
          root.classList.remove("tfd-intro", "tfd-intro--title", "tfd-intro--out");
        }, 2200);
      }, 2000);
    }, 300);
  }

  requestAnimationFrame(frame);
})();
