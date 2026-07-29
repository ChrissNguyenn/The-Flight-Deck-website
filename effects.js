/* ============================================
   The Flight Deck — hiệu ứng chuyển động
   Lấy cảm hứng từ bear.plus (GSAP SplitText, ScrollTrigger,
   custom cursor, marquee, page transitions) nhưng viết thuần
   JS/CSS, không thư viện — nhẹ cho điện thoại tại sự kiện.
   Tự tắt khi người dùng bật "giảm chuyển động".
   ============================================ */

(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var FINE = window.matchMedia("(pointer: fine)").matches;
  var root = document.documentElement;
  root.classList.add("fx");

  /* ---------- 1. Tách chữ tiêu đề hero (kiểu SplitText) ---------- */
  function splitWords(el) {
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeName === "BR") {
        frag.appendChild(document.createElement("br"));
      } else {
        var accent = node.nodeType === 1 && node.classList.contains("accent");
        String(node.textContent).split(/\s+/).forEach(function (word) {
          if (!word) return;
          var outer = document.createElement("span");
          outer.className = "fx-w";
          var inner = document.createElement("span");
          inner.className = "fx-wi" + (accent ? " accent" : "");
          inner.textContent = word;
          outer.appendChild(inner);
          frag.appendChild(outer);
          frag.appendChild(document.createTextNode(" "));
        });
      }
    });
    el.innerHTML = "";
    el.appendChild(frag);
    Array.prototype.forEach.call(el.querySelectorAll(".fx-wi"), function (w, i) {
      w.style.transitionDelay = (0.15 + i * 0.055) + "s";
    });
  }

  var hero = document.querySelector(".hero");
  if (hero) {
    var h1 = hero.querySelector("h1");
    if (h1) splitWords(h1);
    [".kicker", "p.lead", ".btn-row", ".pill-row", ".collab-logos"].forEach(function (sel, i) {
      var el = hero.querySelector(sel);
      if (!el) return;
      el.classList.add("fx-rise");
      el.style.transitionDelay = (0.35 + i * 0.12) + "s";
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { hero.classList.add("fx-in"); });
    });
  }

  /* ---------- 2. Lộ dần khi cuộn (kiểu ScrollTrigger) ---------- */
  var revealSel = ".section-title, .section-sub, .card, .step, " +
    ".feature-list li, .form-card, .contact-strip, .queue-banner, .site-footer";
  var targets = Array.prototype.slice.call(document.querySelectorAll(revealSel));
  var siblingIndex = {};
  targets.forEach(function (el) {
    var key = el.parentNode ? targets.indexOf(el.parentNode) + "-" + el.parentNode.className : "x";
    siblingIndex[key] = (siblingIndex[key] || 0);
    el.classList.add("fx-reveal");
    el.style.transitionDelay = (siblingIndex[key] * 0.09) + "s";
    siblingIndex[key]++;
  });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("fx-in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add("fx-in"); });
  }

  /* ---------- 3. Dải marquee chạy chữ ---------- */
  var mtext = document.body.getAttribute("data-marquee");
  if (mtext && hero) {
    var m = document.createElement("div");
    m.className = "fx-marquee";
    m.setAttribute("aria-hidden", "true");
    var track = document.createElement("div");
    track.className = "fx-marquee-track";
    for (var i = 0; i < 6; i++) {
      var s = document.createElement("span");
      s.textContent = mtext;
      track.appendChild(s);
    }
    m.appendChild(track);
    hero.parentNode.insertBefore(m, hero.nextSibling);
  }

  /* ---------- 4. Parallax hero khi cuộn ----------
     Chỉ chạy trên máy tính. Trên điện thoại/tablet, đổi transform + opacity
     của hero (khối lớn, có nhiều gradient nền) ở mỗi khung hình cuộn buộc
     máy vẽ lại cả vùng đó — đây là nguyên nhân chính gây giật khi khách vuốt
     trang tại gian hàng. Bỏ parallax thì cuộn mượt, giao diện không đổi. */
  if (hero && FINE && window.innerWidth > 820) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY || 0;
        var h = hero.offsetHeight || 1;
        if (y <= h) {
          hero.style.transform = "translate3d(0," + (y * 0.28) + "px,0)";
          hero.style.opacity = Math.max(0, 1 - (y / h) * 1.05);
        }
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- 5. Con trỏ tùy chỉnh: chấm + vòng đuổi theo ---------- */
  if (FINE) {
    var dot = document.createElement("div");
    dot.className = "fxc-dot";
    var ring = document.createElement("div");
    ring.className = "fxc-ring";
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = -100, my = -100, rx = -100, ry = -100, scale = 1, visible = false;
    var running = false, lastScale = 1;

    /* Vòng lặp chỉ chạy khi vòng tròn còn phải đuổi theo chuột. Chuột đứng
       yên (đang đọc trang) mà vẫn quay rAF 60 lần/giây là đốt pin vô ích —
       dừng hẳn khi đã bắt kịp, chuột động lại thì khởi động tiếp. */
    function kick() {
      if (running) return;
      running = true;
      requestAnimationFrame(loop);
    }

    function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = "translate3d(" + (mx - 3) + "px," + (my - 3) + "px,0)";
      ring.style.transform = "translate3d(" + (rx - 19) + "px," + (ry - 19) + "px,0) scale(" + scale + ")";
      var settled = Math.abs(mx - rx) < 0.5 && Math.abs(my - ry) < 0.5 && scale === lastScale;
      lastScale = scale;
      if (settled) { running = false; return; }
      requestAnimationFrame(loop);
    }

    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (!visible) { visible = true; dot.style.opacity = ring.style.opacity = "1"; }
      kick();
    }, { passive: true });
    document.addEventListener("mouseleave", function () {
      visible = false;
      dot.style.opacity = ring.style.opacity = "0";
    });
    document.addEventListener("mouseover", function (e) {
      scale = e.target.closest("a, button, .card, select, input, textarea, label, .qr-card") ? 2.1 : 1;
      kick();
    }, { passive: true });
  }

  /* ---------- 6. Nút "nam châm" hút theo chuột ---------- */
  if (FINE) {
    Array.prototype.forEach.call(document.querySelectorAll(".btn"), function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) * 0.22;
        var dy = (e.clientY - r.top - r.height / 2) * 0.32;
        btn.style.transform = "translate(" + dx + "px," + (dy - 2) + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
  }

  /* ---------- 7. Thẻ nghiêng 3D theo chuột ---------- */
  if (FINE) {
    Array.prototype.forEach.call(document.querySelectorAll(".card, .step"), function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(700px) rotateX(" + (-py * 5) + "deg) rotateY(" +
          (px * 6) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- 8. Chuyển trang mượt (kiểu Barba) ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return;
    var href = a.getAttribute("href");
    // chỉ chặn link nội bộ dạng trang .html (không phải neo #, tel:, mailto:, http…)
    if (!href || !/^[a-zA-Z0-9-]+\.html(#.*)?$/.test(href)) return;
    e.preventDefault();
    root.classList.add("fx-leave");
    setTimeout(function () { window.location.href = href; }, 240);
  });
})();
