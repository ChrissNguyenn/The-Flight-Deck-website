/* ============================================================
   The Flight Deck — sinh mã VietQR (NAPAS 247) ngay trên máy khách

   Vì sao tự sinh thay vì dùng ảnh QR tĩnh chụp từ app ngân hàng:
     • Điền sẵn SỐ TIỀN → khách không gõ nhầm 150.000 thành 15.000.
     • Điền sẵn NỘI DUNG chuyển khoản kèm MÃ ĐĂNG KÝ → nhân viên đối chiếu
       ảnh Zalo với đúng khách trong vài giây, không phải dò tên.
   Không gọi mạng, không phụ thuộc dịch vụ ngoài — mạng gian hàng chập chờn
   vẫn hiện được mã.

   Chuẩn: EMVCo QR + phụ lục VietQR (GUID A000000727, dịch vụ QRIBFTTA
   = chuyển khoản tới SỐ TÀI KHOẢN). Chuỗi kết thúc bằng CRC-16/CCITT-FALSE.
   ============================================================ */

var TFD_VIETQR = (function () {
  'use strict';

  /* Một trường EMV = ID(2) + ĐỘ DÀI(2, có số 0 ở đầu) + GIÁ TRỊ */
  function tlv(id, value) {
    var v = String(value);
    var len = v.length;
    if (len > 99) throw new Error('VietQR: trường ' + id + ' dài quá 99 ký tự');
    return id + (len < 10 ? '0' + len : String(len)) + v;
  }

  /* CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, không đảo bit.
     Đây đúng là biến thể EMVCo quy định — dùng nhầm biến thể khác thì app
     ngân hàng sẽ báo "mã QR không hợp lệ". */
  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) & 0xFF) << 8;
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return hex;
  }

  /* Nội dung chuyển khoản: chỉ chữ/số không dấu + khoảng trắng.
     Ngân hàng thường từ chối dấu tiếng Việt và ký tự lạ trong nội dung CK. */
  /* Bảng bỏ dấu dựng theo NHÓM chứ không phải hai chuỗi dài song song:
     đếm tay hai chuỗi rất dễ lệch một ký tự, và khi lệch thì "đặt" biến
     thành "YAT" mà không ai để ý cho tới lúc khách chuyển khoản. */
  var ACCENTS = {
    a: 'àáạảãâầấậẩẫăằắặẳẵ',
    e: 'èéẹẻẽêềếệểễ',
    i: 'ìíịỉĩ',
    o: 'òóọỏõôồốộổỗơờớợởỡ',
    u: 'ùúụủũưừứựửữ',
    y: 'ỳýỵỷỹ',
    d: 'đ'
  };
  var DEACCENT = {};
  for (var plain in ACCENTS) {
    var group = ACCENTS[plain];
    for (var gi = 0; gi < group.length; gi++) DEACCENT[group.charAt(gi)] = plain;
  }

  function cleanInfo(s) {
    var lower = String(s == null ? '' : s).toLowerCase();
    var res = '';
    for (var i = 0; i < lower.length; i++) {
      var ch = lower.charAt(i);
      res += DEACCENT[ch] || ch;
    }
    return res.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 99);
  }

  /**
   * Sinh chuỗi VietQR.
   * @param {object} o
   *   bin           mã ngân hàng 6 số (Techcombank = 970407)
   *   accountNumber số tài khoản nhận
   *   amount        số tiền VND (bỏ trống = khách tự nhập)
   *   addInfo       nội dung chuyển khoản
   */
  function payload(o) {
    var bin = String(o.bin || '').replace(/\D/g, '');
    var acc = String(o.accountNumber || '').replace(/\s+/g, '');
    if (bin.length !== 6) throw new Error('VietQR: BIN ngân hàng phải đúng 6 chữ số');
    if (!acc) throw new Error('VietQR: thiếu số tài khoản');

    // 38 — thông tin đơn vị thụ hưởng
    var beneficiary = tlv('00', bin) + tlv('01', acc);
    var merchant =
      tlv('00', 'A000000727') +     // GUID của NAPAS/VietQR
      tlv('01', beneficiary) +
      tlv('02', 'QRIBFTTA');        // chuyển khoản đến SỐ TÀI KHOẢN

    var amount = (o.amount == null || o.amount === '') ? '' : String(Math.round(Number(o.amount)));
    var info = cleanInfo(o.addInfo);

    var s =
      tlv('00', '01') +
      // 11 = mã tĩnh (quét nhiều lần) · 12 = mã động, dùng khi ĐÃ có số tiền
      tlv('01', amount ? '12' : '11') +
      tlv('38', merchant) +
      tlv('53', '704') +            // VND
      (amount ? tlv('54', amount) : '') +
      tlv('58', 'VN') +
      (info ? tlv('62', tlv('08', info)) : '');

    // CRC tính trên TOÀN BỘ chuỗi ĐÃ nối sẵn "6304"
    s += '6304';
    return s + crc16(s);
  }

  /* Tách chuỗi EMV thành các trường — dùng để tự kiểm tra */
  function parse(s) {
    var out = {}, i = 0;
    while (i + 4 <= s.length) {
      var id = s.substr(i, 2);
      var len = parseInt(s.substr(i + 2, 2), 10);
      if (isNaN(len)) break;
      out[id] = s.substr(i + 4, len);
      i += 4 + len;
    }
    return out;
  }

  function verify(s) {
    if (s.length < 8) return false;
    var body = s.slice(0, -4);
    return body.slice(-4) === '6304' && crc16(body) === s.slice(-4);
  }

  return { payload: payload, crc16: crc16, parse: parse, verify: verify, cleanInfo: cleanInfo };
})();
