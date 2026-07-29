/* ============================================
   The Flight Deck — service worker tối giản
   1) Hiện thông báo hệ thống (registration.showNotification) —
      bắt buộc để iPhone/iPad (đã "Thêm vào MH chính") nhận được
      thông báo kiểu tin nhắn.
   2) Cache ẢNH (và chỉ ảnh) để khách quay lại trang không phải
      tải lại vài MB qua 4G ở gian hàng.

   CỐ Ý KHÔNG cache HTML/CSS/JS: sự kiện đang diễn ra, sửa giá hay
   sửa khung giờ đăng ký phải có hiệu lực ngay ở lần tải kế tiếp.
   Ảnh thì đổi là đổi tên file, nên cache thoải mái.
   ============================================ */

var IMG_CACHE = 'tfd-img-v1';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== IMG_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Cache-first cho ảnh cùng nguồn; mọi thứ khác đi thẳng ra mạng. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (!/\/images\/.+\.(png|jpe?g|webp|svg|gif)$/i.test(url.pathname)) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        // Chỉ lưu phản hồi thành công, đầy đủ (bỏ qua 206/lỗi)
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(IMG_CACHE).then(function (cch) { cch.put(req, copy); });
        }
        return res;
      });
    }).catch(function () { return fetch(req); })
  );
});

/* Bấm vào thông báo → quay lại trang vé của khách */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./experience.html');
    })
  );
});
