/* ============================================================
   courses.html — hiệu ứng cho khối giới thiệu:
   richtext reveal, ảnh cockpit reveal, câu chuyển tiếp có máy bay
   quét ngang (swipe), và máy bay bay thẳng lên đồng bộ với
   danh sách/ảnh workshop.
   Lấy cảm hứng từ cargokite.com — xem chi tiết trong lịch sử chat.
   ============================================================ */

(function () {
  /* Lấy chuỗi theo ngôn ngữ. i18n.js nạp trước file này; nếu vì lý do gì đó
     chưa có thì rơi về đúng chữ tiếng Việt truyền vào — không vỡ trang. */
  var T = window.TFD_T || function (key, fallback) { return fallback; };

  /* Chia đều 1 quãng cuộn cho N phần tử: mỗi phần tử mờ dần vào (fade-in)
     → giữ rõ (hold) → mờ dần ra (fade-out) hết cỡ về 0 TRƯỚC KHI phần tử
     kế tiếp bắt đầu mờ vào — không có khoảnh khắc nào 2 nội dung cùng
     hiện rõ cùng lúc. Dùng chung cho khối swipe (2 câu) và workshop (3 mục). */
  function segmentOpacity(progress, index, total) {
    var seg = 1 / total;
    var start = index * seg;
    var end = start + seg;
    var fade = seg * 0.18;
    if (progress <= start || progress >= end) return 0;
    if (progress < start + fade) return (progress - start) / fade;
    if (progress > end - fade) return (end - progress) / fade;
    return 1;
  }

  function revealOnScroll(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); }
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      io.observe(el);
    } else {
      el.classList.add('in-view');
    }
  }
  revealOnScroll('richtext-grid');
  revealOnScroll('cockpit-shot');

  var reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- câu 1 luôn hiện trên màn hình → máy bay quét ngang phải-sang-trái
     ngay qua giữa câu chữ → đúng lúc máy bay ở chính giữa, chữ đổi thành câu 2
     (đổi ngay lúc đó nên bị máy bay che, không thấy chỗ "chuyển cảnh") →
     máy bay đi tiếp sang nửa trái, để lộ câu 2 phía sau ---------- */
  (function () {
    var section = document.getElementById('swipe-section');
    var textEl = document.getElementById('swipe-text');
    var plane = document.getElementById('swipe-plane');
    if (!section || !textEl || !plane) return;

    var TEXT_1 = 'We are not a normal cafe like others';
    var TEXT_2_HTML = 'We have a 1:1 replica of the <span class="swipe-accent">AIRBUS A320 FAMILY COCKPIT</span>';
    var showingSecond = false;

    var reduceMotion = reduceMotionMQ.matches;
    var ticking = false;

    function updateSwipe() {
      ticking = false;
      var rect = section.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;

      /* máy bay quét suốt toàn bộ quãng cuộn: vào từ phải (+200%, ngoài
         khung) → giữa màn hình (0%) đúng lúc progress=0.5 → ra hết bên
         trái (-200%, ngoài khung). SVG vẽ sẵn mũi hướng trái nên không
         cần xoay. */
      var xPercent = 200 - progress * 400;
      /* -74.5% Y: sau khi cắt bóng, dải thân máy bay nằm ở ~74.5% chiều cao
         ảnh A32FNEO.png (phần trên là đuôi đứng) — dịch ảnh lên để dải thân
         che đúng giữa khối chữ lúc đổi nội dung */
      plane.style.transform = 'translate(-50%, -74.5%) translateX(' + xPercent + '%)';
      plane.style.opacity = progress > 0.03 && progress < 0.97 ? '1' : '0';

      /* chữ luôn hiện rõ trong suốt quãng cuộn — không mờ ở hai đầu;
         nội dung đổi ngay khi máy bay bay qua chính giữa */
      textEl.style.opacity = '1';

      var shouldShowSecond = progress >= 0.5;
      if (shouldShowSecond !== showingSecond) {
        showingSecond = shouldShowSecond;
        textEl.innerHTML = showingSecond ? TEXT_2_HTML : TEXT_1;
      }
    }

    if (!reduceMotion) {
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(updateSwipe); }
      }, { passive: true });
      window.addEventListener('resize', updateSwipe);
      updateSwipe();
    } else {
      textEl.textContent = TEXT_1;
      textEl.style.opacity = '1';
      plane.style.opacity = '0';
    }
  })();

  /* ---------- danh sách workshop — text/ảnh mờ vào/ra, đồng bộ với máy bay bay thẳng lên ---------- */
  (function () {
    var WORKSHOPS = [
      {
        /* tên workshop giữ nguyên tiếng Anh ở cả 2 bản (thuật ngữ ngành) */
        title: 'Aviation Phraseology',
        short: T('workshop.phraseologyBrief',
          'Ngôn ngữ chuẩn giữa phi công và kiểm soát không lưu (ICAO phraseology).'),
        images: [
          'images/aviation-comm1.jpg',
          'images/aviation-comm2.jpg',
          'images/aviation-comm3.jpg'
        ]
      },
      {
        title: 'Principles of Flight',
        short: T('workshop.pofBrief',
          'Bốn lực tác động lên máy bay và cách cánh tạo lực nâng — nguyên lý bay cơ bản.'),
        images: [
          'images/principle-flight1.jpg',
          'images/principle-flight2.jpg',
          'images/principle-flight3.jpg'
        ]
      },
      {
        title: 'Offline Controlling & Flying on VATSIM',
        short: T('workshop.vatsimBrief',
          'Luyện điều khiển không lưu offline, rồi bay thật trên mạng lưới VATSIM.'),
        images: [
          'images/vatsim1.jpg',
          'images/vatsim2.jpg'
        ]
      }
    ];

    var textTrack = document.getElementById('fw-text-track');
    var imageTrack = document.getElementById('fw-image-track');
    var stepDots = document.querySelectorAll('#fw-steps .fw-step-dot');
    var flySection = document.getElementById('workshop');
    var plane = document.getElementById('fly-plane');
    if (!textTrack || !imageTrack || !flySection || !plane) return;

    textTrack.innerHTML = WORKSHOPS.map(function (w) {
      return '<div class="fw-slot fw-slot--text">' +
        '<h3 class="fw-active__title">' + w.title + '</h3>' +
        '<p class="fw-active__brief">' + w.short + '</p>' +
        '</div>';
    }).join('');
    imageTrack.innerHTML = WORKSHOPS.map(function (w) {
      if (w.images && w.images.length) {
        return '<div class="fw-slot fw-slot--image">' +
          '<div class="fw-image-stack' + (w.images.length === 2 ? ' fw-image-stack--pair' : '') + '">' +
          w.images.map(function (src, i) {
            return '<div class="fw-image-stack__item"><img src="' + src + '" alt="' + w.title + ' ' + (i + 1) + '" loading="lazy"></div>';
          }).join('') +
          '</div></div>';
      }
      return '<div class="fw-slot fw-slot--image">' +
        '<div class="fw-image-box"><span>🖼️</span><strong>' + w.title + '</strong>Ảnh sẽ được chèn sau</div>' +
        '</div>';
    }).join('');

    var ticking = false;
    var textSlots = textTrack.children;
    var imageSlots = imageTrack.children;

    /* Phải khớp ĐÚNG với media query trong style.css. Ở hai trường hợp này
       khối không còn được ghim giữa màn hình, nên cách hiện dần theo cuộn
       không dùng được nữa (xem chú thích dài trong style.css). */
    var stackedMQ = window.matchMedia('(max-width: 820px), (prefers-reduced-motion: reduce)');

    /* Chữ nằm ở cột trái, ảnh ở cột phải. Khi xếp dọc trên điện thoại mà cứ
       để nguyên thì sẽ thành: 3 tiêu đề liền nhau rồi mới tới 3 cụm ảnh —
       ảnh không còn dính với đúng workshop của nó. Nên chuyển hẳn node ảnh
       vào trong cụm chữ (chuyển chứ không nhân bản -> ảnh không tải lại). */
    function syncLayout() {
      var stacked = stackedMQ.matches;
      for (var i = 0; i < WORKSHOPS.length; i++) {
        var from = stacked ? imageSlots[i] : textSlots[i];
        var to = stacked ? textSlots[i] : imageSlots[i];
        if (!from || !to) continue;
        var stack = from.querySelector('.fw-image-stack');
        if (stack) to.appendChild(stack);
      }
      if (stacked) {
        /* xoá style inline do updateFly() ghi, trả quyền lại cho CSS */
        for (var j = 0; j < WORKSHOPS.length; j++) {
          if (textSlots[j]) textSlots[j].style.opacity = '';
          if (imageSlots[j]) imageSlots[j].style.opacity = '';
        }
        plane.style.opacity = '';
        plane.style.transform = '';
        Array.prototype.forEach.call(stepDots, function (d) { d.classList.remove('is-active'); });
      } else {
        updateFly();
      }
    }

    /* máy bay bay thẳng lên, lệch sang phải một chút (không lệch trái/phải
       theo hình sin, không xoay) — progress là tỉ lệ đã cuộn qua
       fly-workshop-section (cao, có pin sticky bên trong). */
    function updateFly() {
      ticking = false;
      if (stackedMQ.matches) return;
      var rect = flySection.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      var vh = window.innerHeight;
      var y = -(vh * 0.08 + progress * (vh * 0.78));
      plane.style.transform = 'translate(-50%, 0) translateY(' + y + 'px)';
      plane.style.opacity = progress > 0.02 && progress < 0.98 ? '1' : '0';

      for (var i = 0; i < WORKSHOPS.length; i++) {
        var op = segmentOpacity(progress, i, WORKSHOPS.length);
        if (textSlots[i]) textSlots[i].style.opacity = op;
        if (imageSlots[i]) imageSlots[i].style.opacity = op;
      }
      var dotIndex = Math.min(2, Math.max(0, Math.floor(progress * 3)));
      Array.prototype.forEach.call(stepDots, function (d, i) { d.classList.toggle('is-active', i === dotIndex); });
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(updateFly); }
    }, { passive: true });
    window.addEventListener('resize', syncLayout);
    /* xoay ngang/dọc có thể vượt qua mốc 820px -> dựng lại bố cục cho đúng */
    if (stackedMQ.addEventListener) stackedMQ.addEventListener('change', syncLayout);
    else if (stackedMQ.addListener) stackedMQ.addListener(syncLayout);
    syncLayout();
  })();
})();
