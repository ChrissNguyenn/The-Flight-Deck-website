# The Flight Deck × Hobby Horizon 2026 (Website)

Website cho gian hàng **The Flight Deck** tại **Hobby Horizon 2026**: trang chủ hiển thị 3 mã QR, hệ thống hàng chờ trải nghiệm bay có kết nối Google Sheet, và trang quản lý cho nhân viên gian hàng.

## Cấu trúc trang

| File | Dùng cho | Mã QR |
|---|---|---|
| `index.html` | Trang chủ — 3 mã QR cho gian hàng | — |
| `experience.html` | **QR 1** — đăng ký lượt bay + theo dõi hàng chờ trực tiếp | **QR 1** |
| `courses.html` | **QR 2** — cá nhân (B2C): ảnh workshop đã qua + khảo sát lịch workshop tiếp theo | **QR 2** |
| `partners.html` | **QR 3** — doanh nghiệp (B2B): form liên hệ theo spec B4 | **QR 3** |
| `admin.html` | Trang quản lý hàng chờ cho nhân viên gian hàng (có PIN) | — |
| `system-check.html` | Kiểm tra tự động kết nối Google Sheet (chạy trước sự kiện) | — |
| `qr-codes.html` | Công cụ nội bộ: tạo & in 3 mã QR | — |
| `qr/` | 3 file PNG mã QR in sẵn (1200×1200) | — |
| `config.js` | Cấu hình: URL Google Apps Script, PIN admin, thông số phiên bay | — |
| `queue.js` | Logic hàng chờ dùng chung (đăng ký + admin) | — |
| `google-apps-script.gs` | Code backend dán vào Google Sheet (xem bên dưới) | — |
| `style.css` | Giao diện chung cho tất cả các trang | — |
| `form-handler.js` | Form B2B/khóa học (mở email soạn sẵn) | — |

## Hệ thống hàng chờ trải nghiệm bay (QR 1)

- Khách quét QR 1 → điền **Họ tên, SĐT, Số người bay (1 hoặc 2)** →
  nhận vị trí trong hàng chờ và **giờ bay do hệ thống tính theo thứ tự đăng ký**,
  được lưu vào Sheet để làm mốc **đếm ngược** (không trôi theo thời gian).
  Điện thoại của khách hiện đồng hồ **đếm ngược đến giờ bay** và **giờ phải
  có mặt (trước 5 phút)**.
- Giá **150K / 1 người bay**. Mỗi slot dài **15 phút**, tối đa 2 khách/slot:
  - Đăng ký **2 người** (đi cùng nhau) → chiếm **trọn một slot riêng**, bay cùng nhau ngay.
  - Đăng ký **1 người** → hệ thống **tự ghép** với 1 người đăng ký 1 mình khác vào
    **chung một slot** để cùng bay. Nếu chưa có ai để ghép, lượt đó giữ một slot
    mới và chờ — người đăng ký 1 mình tiếp theo sẽ tự động ghép vào đúng slot đó.
  Giờ bay của slot sau = giờ bay slot trước + 15 phút — **không có nghỉ giữa ca**,
  khách bay xong là lượt kế tiếp vào buồng lái luôn.
  **1 khách bay → instructor ngồi ghế bên cạnh · 2 khách bay → instructor đứng
  phía sau** — ghi chú này tự hiện trên trang quản lý cho từng slot.
- Khi một lượt bị **hủy tay / hết hạn thanh toán**, hệ thống tự **dồn các
  lượt WAITING phía sau lên sớm hơn** để không bỏ phí chỗ trống — trừ lượt
  đã **CALLED/PRESENT** (đã gọi/đã có mặt) thì giữ nguyên giờ đã báo.
- **Khách tới TRỄ trong 5 phút ân hạn** (sau giờ bay đã chốt): bấm ✅ Có mặt
  là phiên **tự bắt đầu ngay + đồng hồ 15 phút chạy từ lúc đó**, và hệ thống
  **tự tính lại giờ bay của TẤT CẢ khách phía sau** theo giờ kết thúc thật —
  không còn hiệu ứng domino "giờ ảo". Quá 5 phút → tự **NO_SHOW** và các
  khách sau **giữ nguyên giờ đã báo** (slot vắng chết đúng khung giờ của nó).
- **Ưu tiên slot đủ người**: khách 1-người đang chờ ghép KHÔNG chặn nhóm
  2 người đến sau — nhóm đủ người luôn được xếp bay trước (chắc chắn lấp đầy
  buồng lái); khách lẻ chưa hiện giờ bay nên dời ra sau không thất hứa với ai.
  Muốn cho khách lẻ bay 1 mình (chờ lâu quá): bấm **📞 Gọi** — giờ của họ sẽ
  khóa lại và không bị dời nữa.
- **Chịu tải ngày đông**: admin bấm nút là giao diện đổi NGAY (lệnh sync nền,
  ô "🔄 Đang gửi" đếm lệnh chưa xong); backend ghi cả hàng 1 lệnh + cache
  danh sách nên poll từ điện thoại khách gần như không tốn quota; lệnh lỗi
  mạng/nghẽn tự thử lại (an toàn, không tạo đăng ký trùng).
- Khách phải có mặt **trước 5 phút** để chuẩn bị.
- 🔔 **Thông báo tới giờ bay**: khi tới giờ có mặt hoặc khi được gọi, trang của
  khách tự **rung + phát âm thanh + hiện thông báo hệ thống** (kiểu tin nhắn).
  Khách bấm nút "🔔 Bật thông báo" (hoặc cho phép khi đăng ký). Android/máy tính:
  hoạt động khi trang còn mở (kể cả tab nền). **iPhone/iPad**: cần
  **Chia sẻ → Thêm vào MH chính** (iOS 16.4+) rồi mở từ biểu tượng đó — trang tự
  hướng dẫn khách. Web tĩnh không thể đánh thức trình duyệt đã đóng hẳn,
  nên vẫn nên dặn khách giữ trang mở.
- **5 phút trước giờ bay**, trang quản lý tự làm nổi bật tên khách và nhắc
  nhân viên gọi. Nút **"📞 Gọi" là link quay số** — mở admin bằng điện thoại,
  bấm là máy tự gọi SĐT của khách và đồng thời đánh dấu "đã gọi". Sau khi gọi,
  khách có **5 phút** để có mặt — quá hạn, hệ thống **tự hủy lượt** và đẩy
  người kế tiếp lên.
- Trang quản lý: mở `admin.html` — trên Netlify có đường dẫn ngắn
  **`/admin`** (ví dụ `theflightdeck2026.netlify.app/admin`, cấu hình trong file
  `_redirects`; các link ngắn khác: `/qr`, `/check`, `/bay`). Nhập PIN
  (đổi trong `config.js`). Còn có nút "🔐 Quản lý gian hàng" ở chân trang chủ.
  Có thể: gọi khách, xác nhận có mặt, bắt đầu / kết thúc phiên, hủy lượt, thêm khách
  đăng ký tại chỗ, xem lịch sử.
- ⚠️ Các luật tự động (tự hủy, tự kết thúc phiên) chạy khi trang `admin.html`
  **đang mở** — hãy giữ nó mở trên máy/tablet tại gian hàng suốt sự kiện.

## Kết nối Google Sheet (bắt buộc khi chạy thật — 5 phút)

Chưa kết nối thì website chạy ở **chế độ thử nghiệm**: dữ liệu chỉ lưu trên từng thiết bị
(điện thoại khách sẽ không thấy hàng chờ chung). Cách kết nối:

1. Vào <https://sheets.new> — tạo Google Sheet mới, đặt tên ví dụ
   `TFD - Flight Experience Registrations`.
2. Menu **Extensions (Tiện ích mở rộng) → Apps Script**.
3. Xóa code mẫu, mở file `google-apps-script.gs` trong thư mục này, copy **toàn bộ**
   và dán vào, bấm **Save**.
4. Bấm **Deploy → New deployment**, chọn loại **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - Bấm **Deploy**, cấp quyền khi được hỏi, rồi **copy Web app URL**.
5. Mở `config.js`, dán URL đó vào `SCRIPT_URL`. Xong!

Mọi đăng ký sẽ tự ghi vào sheet `Registrations` (tự được tạo, không cần làm gì thêm)
với các cột tiếng Việt: **Tên khách · SĐT · Email · Giờ đăng kí · Giờ bay (lock)**,
kèm các cột hệ thống (Trạng thái, Số khách, Giờ gọi…), các cột thanh toán
(Hình thức TT, Số tiền, Giờ duyệt) và các cột ghép đôi/email (Ghép đôi, Ghép với,
Email đã gửi, Giờ đã báo). Giờ hiển thị theo múi giờ Việt Nam, dạng
`HH:mm:ss dd/MM/yyyy`. Sheet tạo từ phiên bản cũ (bố cục cột khác) sẽ tự được
chuyển sang bố cục mới ở lần truy cập đầu tiên sau khi cập nhật code — **dữ liệu cũ
giữ nguyên**, các cột mới để trống.

Script còn tự tạo thêm 2 sheet nữa:

| Sheet | Nội dung |
|---|---|
| `Payments` | **Sổ thu tiền riêng** — mỗi lần bấm duyệt là 1 dòng: giờ xác nhận, mã đăng ký, khách, số tiền, **hình thức (Chuyển khoản / Quét QR / Tiền mặt)**, ngày bay, STT, giờ bay. Tách khỏi sheet khách để kế toán đối soát. |
| `Log` | Lỗi hệ thống (email gửi hỏng, ghi sổ lỗi…) để truy vết khi có sự cố. |

### Luồng thanh toán & email tự động

1. Khách điền form (có **Email** + chọn **Chuyển khoản / Quét QR**) → trạng thái
   `PENDING_PAYMENT`, website hiện ngay **thông tin chuyển khoản + link Zalo** và
   câu hướng dẫn gửi ảnh chụp giao dịch.
2. Nhân viên mở Zalo, đối chiếu ảnh → vào `admin.html`, chọn đúng hình thức →
   bấm **✅ Xác nhận & gửi email**.
3. Hệ thống tự tính **ngày bay, STT trong ngày, giờ bay**, chạy **ghép đôi**, ghi
   một dòng vào sheet `Payments`, rồi gửi email:

| Trường hợp | Email gửi đi |
|---|---|
| Khách đi **2 người** | 1 email **có giờ bay** + đính kèm lời mời lịch `.ics` + nút "Thêm vào Google Calendar" |
| Khách **lẻ, chưa ghép được** | Email 1: xác nhận đã nhận tiền, **KHÔNG có giờ bay**, báo sẽ gửi giờ sau khi ghép xong |
| Khách lẻ **vừa ghép được đôi** | Email 2: **có giờ bay** + lời mời lịch |
| Giờ đã báo bị **đổi** (bạn bay chung hủy → xếp lại lịch) | Email "CẬP NHẬT giờ bay" + `.ics` mới (cùng UID, `SEQUENCE` tăng → lịch cũ trong máy khách được **ghi đè**, không nhân đôi) |

Mọi email có giờ bay đều kèm câu bắt buộc:
*"Quý khách vui lòng có mặt tại địa điểm tối thiểu 10 phút trước giờ bay."*
và địa điểm **86 Đặng Văn Ngữ, Phú Nhuận, TPHCM**.

> **Chỉnh trước khi chạy thật** — trong `google-apps-script.gs`:
> `VENUE_ADDRESS`, `ARRIVE_EARLY_MIN`, `PRICE_PER_PERSON`, `ZALO_LINK`,
> `SUPPORT_EMAIL`. Đặt `MAIL_ENABLED = false` khi đang test để không bắn email thật.
>
> **Hạn mức email**: Gmail thường **100 email/ngày**, Google Workspace **1.500/ngày**.
> Quá hạn mức, email không gửi được (ghi vào sheet `Log`) nhưng khách **vẫn được xếp
> lịch bình thường** — nhân viên báo giờ qua Zalo là được.
>
> **Lần deploy đầu sau khi thêm email**: Apps Script sẽ hỏi thêm quyền gửi mail —
> phải **Deploy → New deployment** lại và bấm **Authorize** thì email mới chạy.

### Gửi email từ theflightdeckcoffee@gmail.com

Apps Script **luôn gửi bằng tài khoản Google đang sở hữu script** — không thể tự đặt
địa chỉ gửi tùy ý. Chọn một trong hai cách:

| Cách | Làm gì | Kết quả |
|---|---|---|
| **1 — khuyến nghị** | Đăng nhập Google bằng chính `theflightdeckcoffee@gmail.com`, rồi tạo Sheet + Apps Script + Deploy **từ tài khoản đó** | Email tự động đi từ địa chỉ này, không cần cấu hình thêm |
| **2** | Trong Gmail của tài khoản chạy script: **Cài đặt → Tài khoản → Gửi thư bằng địa chỉ khác** → thêm & xác minh `theflightdeckcoffee@gmail.com` | Script tự phát hiện và dùng làm địa chỉ gửi |

Nếu chưa làm cách nào, **email vẫn gửi bình thường** từ tài khoản chủ script, và
`Reply-To` luôn là `theflightdeckcoffee@gmail.com` nên khách bấm "Trả lời" vẫn đến
đúng hộp thư. Trường hợp này script ghi một dòng nhắc vào sheet `Log`.

### Mã QR chuyển khoản (VietQR)

Website **tự sinh mã VietQR ngay trên máy khách** (`vietqr.js`) — không dùng ảnh QR
tĩnh, không gọi dịch vụ ngoài. Ưu điểm: mã đã **điền sẵn số tiền** (khách không gõ
nhầm) và **nội dung chuyển khoản kèm mã đăng ký** (nhân viên đối chiếu ảnh Zalo với
đúng khách trong vài giây).

Đổi tài khoản nhận tiền: sửa `BANK` trong `config.js` —

```js
BANK: {
  accountName: "HO KINH DOANH THE FLIGHT DECK",
  accountNumber: "6886320321",
  bankName: "Techcombank",
  bin: "970407"        // mã 6 số, tra tại https://api.vietqr.io/v2/banks
}
```

> ⚠️ **Quét thử một lần trước sự kiện**: mở `experience.html`, đăng ký một lượt,
> rồi dùng app ngân hàng quét mã hiện ra — kiểm tra đúng tên người nhận, đúng số
> tiền, đúng nội dung. **Đừng chuyển tiền thật**, chỉ xem app điền đúng chưa rồi
> thoát. Nếu mã không quét được, kiểm tra lại `bin` và `accountNumber`.

Thư viện QR (`qrcode.min.js`) đã được **để sẵn trong dự án** thay vì tải từ CDN —
trang thanh toán phải hiện được mã kể cả khi gian hàng mất Internet.

> Lưu ý riêng tư: ai có link website đều có thể gọi API đọc danh sách (tên + SĐT).
> Với sự kiện 3 ngày điều này thường chấp nhận được, nhưng đừng chia sẻ URL script
> ra ngoài, và sau sự kiện hãy **Deploy → Manage deployments → Archive** để tắt.

## ⚙️ Thiết lập sau khi clone (BẮT BUỘC)

Kho này **không chứa `config.js`** (đã .gitignore vì bên trong có `SCRIPT_URL`
và `ADMIN_PIN`). Clone về phải tạo lại thì trang mới chạy:

```bash
cp config.example.js config.js      # macOS / Linux
copy config.example.js config.js    # Windows
```

Rồi mở `config.js` và điền:

| Khoá | Giá trị |
|---|---|
| `SCRIPT_URL` | URL Web App của Google Apps Script (xem mục "Kết nối Google Sheet") |
| `ADMIN_PIN` | Mã PIN mở `admin.html` |
| `BANK` | Số tài khoản nhận tiền |
| `FLIGHT_SCHEDULE` | Ngày + khung giờ bay |

> ⚠️ **Đây KHÔNG phải là bảo mật thật.** Website này là trang tĩnh — `config.js`
> được gửi thẳng tới trình duyệt của khách, nên ai bấm "Xem mã nguồn trang" cũng
> đọc được `SCRIPT_URL` và `ADMIN_PIN`. Việc .gitignore chỉ để hai giá trị đó
> không bị bot quét GitHub nhặt được và không nằm vĩnh viễn trong lịch sử git.
>
> Muốn an toàn thật thì phải kiểm tra quyền ở **phía server** (trong
> `google-apps-script.gs`), không dựa vào PIN phía trình duyệt.

> 📦 **Nếu deploy bằng cách nối thẳng GitHub với Netlify/Vercel**: `config.js`
> không có trong kho nên bản deploy sẽ thiếu file này và trang sẽ chạy ở chế độ
> thử nghiệm. Cách xử lý: hoặc kéo–thả cả thư mục lên Netlify (thư mục trên máy
> vẫn có `config.js`), hoặc thêm bước build sinh `config.js` từ biến môi trường.

## Cách xem thử ngay

Nhấp đúp vào `index.html` — trang sẽ mở trong trình duyệt. Không cần cài đặt gì.

## ✅ CHECKLIST ĐƯA VÀO HOẠT ĐỘNG (làm theo thứ tự)

1. **Kết nối Google Sheet** (5 phút — xem mục bên dưới) → dán Web app URL vào
   `SCRIPT_URL` trong `config.js`. Đổi luôn `ADMIN_PIN`.
2. **Đưa web lên mạng**: vào <https://app.netlify.com/drop> (đăng nhập miễn phí),
   kéo thả **cả thư mục này** vào. Sau đó vào *Site configuration → Change site name*,
   đặt tên **`theflightdeck2026`** → địa chỉ thành `https://theflightdeck2026.netlify.app`
   (3 mã QR trong thư mục `qr/` đã trỏ sẵn về địa chỉ này — nếu đặt tên khác, cần tạo lại QR).
3. **Chạy kiểm tra tự động**: mở `https://theflightdeck2026.netlify.app/system-check.html`
   → bấm **▶ Chạy kiểm tra**. Trang sẽ tự chạy đủ vòng đời: đăng ký → gọi → có mặt →
   bay → hoàn thành, và báo ✅/❌ từng bước. Xong, mở Google Sheet thấy dòng TEST là
   dữ liệu đã vào sheet thật. Xóa các dòng TEST trước sự kiện.
4. **Diễn tập như thật (nên làm)**: điện thoại quét QR 1 → đăng ký; máy tính mở
   `admin.html` → thấy tên hiện ra ngay, bấm 📞 Đã gọi / ✅ Có mặt / ▶ Bắt đầu phiên,
   và xem trạng thái đổi trực tiếp trên điện thoại. Thử cả tình huống "không có mặt":
   bấm Đã gọi rồi chờ 5 phút — lượt sẽ tự hủy.
5. **In 3 mã QR**: dùng 3 file PNG in sẵn trong thư mục `qr/` (1200×1200, sắc nét khi in),
   hoặc mở `qr-codes.html` để in bản có nhãn tên.
6. **Trong sự kiện**: giữ `admin.html` mở trên máy/tablet tại gian hàng (luật tự động
   chạy ở trang này). Nếu sau này sửa file, chỉ cần kéo thả lại thư mục vào Netlify.

## Cách tạo 3 mã QR (làm lại nếu đổi địa chỉ web)

- Cách nhanh: mở `qr-codes.html`, nhập địa chỉ web, nhấn **Tạo mã QR** rồi **In trang này**.
- 3 file PNG trong thư mục `qr/` được tạo sẵn cho `https://theflightdeck2026.netlify.app`:
  `QR1-trai-nghiem-bay.png` · `QR2-khoa-hoc-workshop.png` · `QR3-doanh-nghiep.png`.

## Những chỗ cần thay trước khi dùng thật

- **`config.js`** — dán `SCRIPT_URL` (bước trên) và đổi `ADMIN_PIN`.
- **`QR_FALLBACK_BASE`** ở cuối `index.html` — đổi thành địa chỉ thật của website.
- **Email nhận form B2B/khảo sát workshop**: sửa `CONTACT_EMAIL` ở đầu `form-handler.js` (hiện là `theflightdeckcoffee@gmail.com`).

### Thông tin liên hệ đã điền thật (không còn là mẫu)

Ba trang `courses.html`, `experience.html`, `partners.html` dùng chung một dải
liên hệ ở cuối trang — sửa thì phải sửa cả ba cho khớp:

- **Email**: `theflightdeckcoffee@gmail.com`
- **Facebook**: `https://www.facebook.com/theflightdeckofficial/`
- **Zalo**: `https://zalo.me/0919686320` (theo số đặt chỗ 0919 686 320 trong `courses.html`)
