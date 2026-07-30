#!/usr/bin/env node
/* ============================================================
   Sinh `config.js` từ `config.example.js` + biến môi trường.

   Vì sao cần: `config.js` bị .gitignore (chứa SCRIPT_URL + ADMIN_PIN)
   nên bản deploy từ GitHub sẽ THIẾU file này → trang chạy ở chế độ thử
   nghiệm: không có lịch bay, không có ô chọn slot, đăng ký không tới
   Google Sheet. Script này chạy trong GitHub Actions để dựng lại file
   đó từ Secrets ngay trước khi deploy.

   Dùng:
     TFD_SCRIPT_URL=... TFD_ADMIN_PIN=... node tools/build-config.js

   ⚠️ NHẮC LẠI: đây KHÔNG phải bảo mật. Trang tĩnh gửi thẳng `config.js`
   tới trình duyệt khách, nên hai giá trị này ai xem mã nguồn cũng thấy.
   Dùng Secrets chỉ để chúng không nằm trong kho GitHub và lịch sử git.
   Muốn an toàn thật thì phải kiểm tra quyền phía server (Apps Script).
   ============================================================ */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'config.example.js');
var OUT = path.join(ROOT, 'config.js');

var scriptUrl = process.env.TFD_SCRIPT_URL || '';
var adminPin = process.env.TFD_ADMIN_PIN || '';

function die(msg) {
  console.error('\n✖ build-config: ' + msg + '\n');
  process.exit(1);
}

if (!fs.existsSync(SRC)) die('không tìm thấy config.example.js');

/* Thiếu SCRIPT_URL thì DỪNG HẲN, không deploy.
   Deploy một trang "trông thì chạy" nhưng đăng ký rơi vào localStorage
   của từng máy khách còn tệ hơn là không deploy: nhân viên không thấy
   khách nào trong sheet, mà khách vẫn tưởng đã đặt chỗ xong. */
if (!scriptUrl) {
  die('thiếu TFD_SCRIPT_URL.\n' +
      '  Thêm vào GitHub → Settings → Secrets and variables → Actions:\n' +
      '    TFD_SCRIPT_URL = URL Web App của Google Apps Script\n' +
      '    TFD_ADMIN_PIN  = mã PIN mở admin.html');
}
if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/.test(scriptUrl)) {
  die('TFD_SCRIPT_URL không giống URL Web App của Apps Script:\n  ' + scriptUrl);
}
if (!adminPin) die('thiếu TFD_ADMIN_PIN.');

var src = fs.readFileSync(SRC, 'utf8');

/* Thay đúng hai dòng placeholder. Nếu không khớp thì báo lỗi thay vì ghi
   ra file thiếu giá trị — im lặng ở đây nghĩa là deploy hỏng lúc chạy thật. */
function replaceOnce(text, re, replacement, label) {
  var hits = text.match(re);
  if (!hits || hits.length !== 1) {
    die('không tìm thấy đúng một dòng ' + label + ' trong config.example.js ' +
        '(tìm thấy ' + (hits ? hits.length : 0) + '). ' +
        'Có thể file mẫu đã đổi — cập nhật lại tools/build-config.js.');
  }
  return text.replace(re, replacement);
}

var out = src;
out = replaceOnce(out, /SCRIPT_URL:\s*""/, 'SCRIPT_URL: ' + JSON.stringify(scriptUrl), 'SCRIPT_URL');
out = replaceOnce(out, /ADMIN_PIN:\s*"000000"/, 'ADMIN_PIN: ' + JSON.stringify(adminPin), 'ADMIN_PIN');

out = '/* ⚠️ FILE NÀY ĐƯỢC SINH TỰ ĐỘNG khi deploy — đừng sửa tay.\n' +
      '   Sửa `config.example.js` (cấu hình chung) hoặc GitHub Secrets\n' +
      '   (TFD_SCRIPT_URL / TFD_ADMIN_PIN). */\n' + out;

fs.writeFileSync(OUT, out, 'utf8');

// Không in giá trị thật ra log Actions (log của repo public ai cũng đọc được)
console.log('✔ đã sinh config.js  (SCRIPT_URL ' + scriptUrl.length + ' ký tự, PIN ' +
            adminPin.length + ' ký tự)');
