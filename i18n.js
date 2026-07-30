/* ============================================================
   The Flight Deck — chuyển ngôn ngữ Tiếng Việt / English.

   Tiếng Việt là bản gốc nằm sẵn trong HTML nên KHÔNG cần từ điển vi —
   chỉ cần từ điển EN. Muốn thêm chữ mới: viết tiếng Việt trong HTML như
   bình thường rồi gắn data-i18n="khoá" và thêm khoá đó vào EN bên dưới.

   Dùng trong HTML:
     <p data-i18n="courses.lead">Tiếng Việt…</p>      -> đổi innerHTML
     <input data-i18n-placeholder="form.namePh">      -> đổi placeholder
     <meta data-i18n-content="courses.desc">          -> đổi content
   Dùng trong JS:
     TFD_T('workshop.pofBrief', 'chuỗi tiếng Việt mặc định')

   Đổi ngôn ngữ = lưu localStorage rồi reload trang. Reload cho chắc:
   effects.js tách <h1> thành từng từ ngay lúc tải, workshop-intro.js
   dựng danh sách workshop bằng JS — nếu thay chữ tại chỗ thì hai thứ đó
   sẽ giữ nguyên ngôn ngữ cũ. Tải lại thì mọi thứ dựng lại đúng một lần.

   File này phải nạp TRƯỚC effects.js / workshop-intro.js.
   ============================================================ */
(function () {
  var KEY = "tfd-lang";

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { stored = null; }
  var lang = stored === "en" ? "en" : "vi";
  window.TFD_LANG = lang;

  var EN = {
    /* ---------- trang chủ (index.html) ---------- */
    "home.pageTitle": "The Flight Deck × Flight to Carrot Day 2026",
    "home.desc": "The Flight Deck × Flight to Carrot Day 2026: scan a QR code at our booth to book a flight experience, browse past workshops & help shape the next one, or get in touch about a partnership.",
    "home.kicker": "Aviation experience booth",
    "home.card1Title": "Flight simulator experience",
    "home.card1Body": "Book a flight right at the booth — any age, no experience needed.",
    "home.card1Hint": "📱 Scan to book a flight",
    "home.card2Title": "Past workshops &amp; Survey",
    "home.card2Body": "Look back at the workshops The Flight Deck has run, and tell us what you want the next one to be about.",
    "home.card2Hint": "📱 Scan to browse workshops &amp; take the survey",
    "home.card3Title": "Business partnerships",
    "home.card3Body": "Team building, event booths, STEM programmes for schools, and brand collaborations.",
    "home.card3Hint": "📱 Scan to send a partnership request",
    "home.adminLink": "🔐 Booth admin",

    /* ---------- navbar dùng chung ---------- */
    "nav.tagline": "Jun Pham Airways · 2026",
    "nav.home": "Home",
    "nav.experience": "Book a flight",
    "nav.courses": "Workshops",
    "nav.partners": "Partnerships",

    /* ---------- hero Carrot Day (index.html) ---------- */
    "home.titlePre": "FLIGHT TO",
    "home.titleSub": "The Flight Deck × Jun Pham · Special flight 2026",
    "home.bpTag": "Boarding Pass",
    "home.bpFrom": "Ho Chi Minh City",
    "home.bpTo": "HA NOI",
    "home.bpDateLabel": "Date",
    "home.bpTimeLabel": "Booking hours",
    "home.bpClassLabel": "Class",
    "home.bpFlightLabel": "Flight no.",
    "home.bpSeatLabel": "Seat",
    "home.bpVenue": "📍 The Flight Deck · 86 Dang Van Ngu",
    "home.ctaBook": "Book a flight",
    "home.ctaWorkshop": "Browse workshops",

    /* ---------- trang trải nghiệm bay (experience.html) ---------- */
    "experience.pageTitle": "Flight simulator experience | Hobby Horizon — The Flight Deck",
    "experience.desc": "Book a simulated cockpit flight experience at The Flight Deck booth at Hobby Horizon.",
    "experience.h1": "Your first time <span class=\"accent\">at the controls</span><br>starts here",
    "experience.lead": "Take the captain's seat, put your hands on the controls, and fly your first flight on a realistic simulator — right at The Flight Deck booth.",
    "experience.btnRegister": "🛫 Book a flight",
    "experience.pillDuration": "⏱️ 15 minutes / flight",
    "experience.pillPrice": "💰 150K / person flying",
    "experience.pillAge": "👨‍👩‍👧 Ages 8 and up",
    "experience.pillNoExp": "🎮 No experience needed",
    "experience.bannerTitle": "Flight Simulator Experience",
    "experience.whatTitle": "What's included in your experience?",
    "experience.step1": "🧑‍✈️ Cockpit briefing",
    "experience.step2": "🛫 Take off",
    "experience.step3": "🔄 Fly a closed loop",
    "experience.step4": "🛬 Land",
    "experience.regTitle": "Book your flight",
    "experience.regFacts": "<li><b>Price:</b> 150K / person (flight time: 15 minutes).</li><li><b>Flying solo:</b> we automatically pair you with another passenger.</li><li><b>Flying as 2:</b> you fly together, no pairing needed.</li><li class=\"reg-facts__note\"><b>Please note:</b> arrive 15 minutes before your flight time to check in. If you are more than 5 minutes late once your turn comes up, your booking is automatically released to another guest.</li>",
    "experience.bannerLoading": "⏳ Loading queue status…",
    "experience.demoNote": "⚠️ Test mode: not connected to Google Sheets yet — bookings are only saved on this device (see README).",
    "experience.formName": "Participant's full name *",
    "experience.formNamePh": "Nguyen Van A",
    "experience.formPhone": "Phone number *",
    "experience.formPhoneNote": "Staff will call this number when it's your turn to fly.",
    "experience.formSize": "How many of you are flying? *",
    "experience.size1Title": "Flying solo — 150K",
    "experience.size1Desc": "You'll be <strong>paired with another solo flyer</strong> who also booked alone.",
    "experience.size2Title": "Flying as 2 — 300K",
    "experience.size2Desc": "<strong>You'll both fly together</strong>, no pairing needed.",
    "experience.btnSubmit": "Book a flight 🛫",
    "experience.keepOpenNote": "After booking, keep this page open to track your flight.",

    "experience.bannerLoadError": "⚠️ Couldn't load the queue — check your connection and try again.",
    "experience.notifyEnable": "🔔 Turn on flight-time alerts (vibration / sound)",
    "experience.notifyOn": "🔔 Alerts are on — you'll get a message-style alert when it's time.",
    "experience.notifyBlocked": "🔕 Alerts are blocked — turn them back on in your browser settings to get notified.",
    "experience.notifyIos": "📲 iPhone/iPad: tap <strong>Share → Add to Home Screen</strong>, then open it from there to get message-style alerts.",
    "experience.bannerEmpty": "🟢 <strong>Queue is empty</strong> — book now and you can fly right away!",
    "experience.bannerEmptyClosed": "🟢 <strong>Queue is empty</strong> — please come back during the booking hours shown below.",

    /* ---------- chọn slot 15 phút ---------- */
    "experience.formSlot": "Pick your flight time *",
    "experience.slotLegendFree": "Available",
    "experience.slotLegendPending": "Waiting for 1 more",
    "experience.slotLegendFull": "Fully booked",
    "experience.slotWaitingOne": "Waiting for 1",
    "experience.slotHintSolo": "Flying solo: pick any available time, or an orange one to share the cockpit with someone already booked.",
    "experience.slotHintDuo": "Flying as 2: pick any available time — you'll fly together.",
    "experience.slotPicked": "✅ Selected: <strong>{time}</strong> on {date}",
    "experience.slotRequired": "Please pick a flight time before booking.",
    "experience.slotNoSchedule": "No flight schedule has been configured yet.",
    "experience.slotNoneToday": "No flights on this day.",
    "experience.slotTaken": "Sorry, that time was just taken. Please pick another one.",
    "experience.slotNeedsSolo": "That time is holding a seat for a solo flyer, so a group of 2 can't take it. Please pick an available time.",
    "experience.slotBad": "That flight time isn't valid — please pick again.",
    "experience.slotPast": "That time has already passed — please pick another.",
    "experience.toastSending": "Sending your booking…",
    "experience.toastBooked": "Seat held for {time}! Transfer the fee and send the screenshot on Zalo.",
    "experience.toastBookedNoTime": "Booking received!",
    "experience.slotTooSoon": "That time is too soon. Please pick a time at least 30 minutes from now.",

    /* ---------- email / hình thức thanh toán trên form ---------- */
    "experience.formEmail": "Email *",
    "experience.formEmailNote": "We'll email your confirmed flight time and a calendar invite to this address.",
    "experience.badEmailError": "That email doesn't look right — please check it so we can send your flight time.",
    "experience.formPay": "Payment method *",
    "experience.payBankTitle": "Bank transfer",
    "experience.payBankDesc": "Transfer from your banking app.",
    "experience.payQrTitle": "Scan QR code",
    "experience.payQrDesc": "Pay by scanning the bank QR code.",

    /* ---------- bảng thanh toán + Zalo sau khi đăng ký ---------- */
    "experience.payTitle": "✅ Booking received — one step left",
    "experience.payLead": "Please transfer <strong>{amount}</strong> ({size}) then send us a screenshot of the transaction on Zalo so we can confirm your flight.",
    "experience.paySize1": "1 person",
    "experience.paySize2": "2 people",
    "experience.payBank": "Bank",
    "experience.payAccName": "Account name",
    "experience.payAccNo": "Account number",
    "experience.payAmount": "Amount",
    "experience.payNote": "Transfer note",
    "experience.payZaloInstruct": "Please take a screenshot of your bank transfer confirmation and send it via the Zalo link below so we can confirm your flight schedule.",
    "experience.payZaloBtn": "💬 Send transfer screenshot on Zalo",
    "experience.payFoot": "Your booking code: <strong>{id}</strong> — include it in your Zalo message so staff can find you faster.",
    "experience.bannerSoloOpen": "👤 Flying solo — someone's already waiting to pair, fly right at {time} (~{min} min left)",
    "experience.bannerSoloWait": "👤 Flying solo — fly at {time} (~{min} min left), unless someone else books solo to pair sooner",
    "experience.bannerWaiting": "🧑‍✈️ Waiting: <strong>{count} bookings ({people} people)</strong>",
    "experience.bannerDuo": "👥 Flying as 2 — fly at {time} (~{min} min left)",
    "experience.bannerLockedNote": "Your flight time locks in for the countdown as soon as you finish paying.",
    "experience.statusPay": "💳 Please pay",
    "experience.statusMine": "🎫 Your flight",
    "experience.sizeDuo": "👥 2 people — flying together, 15 minutes",
    "experience.sizeSolo": "👤 1 person — 15-minute flight",
    "experience.pairWaitAlert": "⏳ WAITING TO BE PAIRED",
    "experience.pairWaitLine1": "You booked a solo flight — the system will automatically pair you with the next solo flyer (in registration order).",
    "experience.pairWaitLine2": "Your flight time will appear here as soon as you're paired — keep this page open and stay near the booth.",
    "experience.pairMatched": "🧑‍🤝‍🧑 Paired — you'll fly together with another guest who also booked solo.",
    "experience.alertPaidBodyWait": "Your spot is confirmed! Waiting to be paired — we'll announce your flight time as soon as you're matched.",
    "experience.payAlert": "💳 NOT CONFIRMED — PAYMENT NEEDED",
    "experience.payLine1": "Please transfer using the details below, then <strong>send us a screenshot of the transaction on Zalo</strong> so staff can confirm it.",
    "experience.payLine2": "{countdown} left before this booking is automatically cancelled.",
    "experience.payLine3": "As soon as staff confirm your payment, your position and flight time will appear right here.",
    "experience.waitingPos": "Position in queue",
    "experience.waitingSlot": "🎟 Flight session <strong>#{n}</strong> from now",
    "experience.waitingSlotNext": "you're up next!",
    "experience.flyTime": "🛫 Flight time (locked in): <strong>{time}</strong> — {countdown} left",
    "experience.arriveBy": "📍 Arrive at the booth by: <strong>{time}</strong> — {countdown}",
    "experience.arriveLeftValue": "<strong class='countdown'>{countdown}</strong> left",
    "experience.arriveNow": "RIGHT NOW!",
    "experience.flyNow": "📣 <strong>It's your flight time — please come to the booth right now!</strong>",
    "experience.calledAlert": "📣 YOU'VE BEEN CALLED!",
    "experience.calledLine": "Please come to the booth now — your booking will auto-cancel in <strong>{countdown}</strong>.",
    "experience.presentAlert": "✅ Checked in",
    "experience.presentLine": "You're here — waiting for the instructor to invite you into the cockpit.",
    "experience.sessionAlert": "🛫 Flying now!",
    "experience.sessionLine": "Your session ends at <strong>{time}</strong>. Enjoy your flight!",
    "experience.doneAlert": "🏁 Complete",
    "experience.doneLine": "Thanks for flying with The Flight Deck! Pick up your \"Trainee Pilot\" certificate at the counter.",
    "experience.btnNewReg": "Book another flight",
    "experience.expiredAlert": "⌛ Payment expired",
    "experience.expiredLine": "We didn't receive payment confirmation within the time limit, so this booking was automatically cancelled. You can book again.",
    "experience.btnRetryReg": "Book again",
    "experience.noshowAlert": "⌛ Flight cancelled",
    "experience.noshowLine": "You didn't arrive within 5 minutes of being called, so the system passed your slot to the next person.",
    "experience.cancelledAlert": "❌ Flight cancelled",
    "experience.regFailed": "Couldn't complete booking ({error}). Please try again or ask staff at the booth.",
    "experience.busyError": "system is busy due to high demand — wait a few seconds and try again",
    "experience.netError": "Connection error — please try again, or ask staff at the booth.",
    "experience.bookingOpen": "🟢 Booking is open — closes at <strong>{close}</strong> · Daily hours: <strong>{hours}</strong>",
    "experience.bookingClosed": "⏰ Booking is closed right now. Opens at <strong>{open}</strong>{day} — in <strong class='countdown'>{countdown}</strong><br>Daily booking hours: <strong>{hours}</strong>",
    "experience.bookingTomorrow": "tomorrow",
    "experience.bookingClosedShort": "Outside booking hours",
    "experience.bookingClosedError": "Outside booking hours ({hours}). Booking reopens at {open}.",
    "experience.bookingClosedNow": "Outside booking hours. Daily hours: {hours}.",
    "experience.registering": "Booking…",
    "experience.alertPaidTitle": "💳 The Flight Deck — payment confirmed!",
    "experience.alertPaidBody": "Position #{pos} in the queue — flying at {time}.",
    "experience.alertCalledTitle": "📣 The Flight Deck — you've been called!",
    "experience.alertCalledBody": "Come to the booth within 5 minutes, or your flight will auto-cancel.",
    "experience.alertArriveTitle": "🛫 The Flight Deck — time to arrive!",
    "experience.alertArriveBody": "You fly at {time} — please come to the booth now.",

    /* ---------- queue.js (dùng chung experience.html + admin.html) ---------- */
    "queue.instructor1": "👨‍✈️ 1 flying — instructor sits BESIDE you",
    "queue.instructor2": "👨‍✈️ 2 flying — instructor stands BEHIND you",

    /* ---------- trang workshop / khảo sát (courses.html) ---------- */
    "courses.pageTitle": "Past workshops & next-session survey | The Flight Deck",
    "courses.desc": "Browse the aviation workshops The Flight Deck has run, and fill in a short survey so we can schedule the next one around what you actually want.",
    "courses.h1": "Look back at our past workshops<br><span class=\"accent\">and tell us what you want next</span>",
    "courses.lead": "The Flight Deck has explored aviation with plenty of young people through hands-on workshops. Have a look at the photos below, then fill in a short survey so we can schedule the next workshop around what you actually want.",
    "courses.btnGallery": "📸 See past workshops",
    "courses.btnSurvey": "📝 Take the survey",

    "courses.addr": "Address: 86 Dang Van Ngu, Phu Nhuan Ward, Ho Chi Minh City",
    "courses.hours": "Opening hours: 9am – 9pm daily",
    "courses.contactLabel": "Bookings:",
    "courses.btnMaps": "📍 View on Google Maps",

    "courses.cockpitCaption": "A real A320 simulator cockpit at The Flight Deck",

    "courses.fwHeading": "Workshops we have run",
    "courses.btnTiktok": "🎵 Follow us on TikTok",

    "courses.surveyTitle": "📝 What should the next workshop be about?",
    "courses.surveySub": "Just a few quick questions — we use your answers to pick the topic and timing for the next workshop.",

    /* ---------- biểu mẫu khảo sát ---------- */
    "form.name": "Full name *",
    "form.namePh": "Nguyen Van A",
    "form.phone": "Phone number *",
    "form.email": "Email (optional)",
    "form.emailPh": "you@email.com",
    "form.audience": "You are *",
    "form.choose": "Choose one",
    "form.audStudent": "School student",
    "form.audUni": "University student",
    "form.audWorking": "Working",
    "form.audOther": "Other",
    "form.scheduleType": "Are you free on weekdays or weekends? *",
    "form.schedWeekday": "Weekdays",
    "form.schedWeekend": "Weekends (Sat – Sun)",
    "form.period": "Which part of the year? *",
    "form.periodEnd": "End of the year",
    "form.periodMid": "July – August – September",
    "form.timeOfDay": "Which time of day? *",
    "form.todMorning": "Morning (9am – 12pm)",
    "form.todAfternoon": "Afternoon (4pm – 7pm)",
    "form.todEvening": "Evening (after 8pm)",
    "form.topics": "Which topics would you like a workshop on? *",
    "form.topicPhraseology": "✈️ Aviation Phraseology — radio calls in aviation",
    "form.topicPof": "📐 Principles of Flight — how aircraft actually fly",
    "form.topicMeteo": "🌦️ Meteorology — weather",
    "form.topicOther": "Another topic (if any)",
    "form.topicOtherPh": "Tell us what you'd like…",
    "form.submit": "Send survey 📝",
    "form.demoNote": "⚠️ Test mode: not connected to Google Sheets yet — pressing send will open your email app instead.",
    "form.successTitle": "🎉 Thanks for filling in the survey!",
    "form.successBody": "Your answers help us pick the topic and timing for the next workshop.",
    "form.errNoTopic": "Please pick or write at least one topic you're interested in.",
    "form.errSend": "Couldn't send",
    "form.errNet": "Connection error — please try again, or message us on Zalo/Facebook.",
    "form.sending": "Sending…",

    /* ---------- nội dung do JS sinh ra (workshop-intro.js) ---------- */
    "workshop.phraseologyBrief": "The standard language between pilots and air traffic control (ICAO phraseology).",
    "workshop.pofBrief": "The four forces acting on an aircraft, and how a wing makes lift — the basics of flight.",
    "workshop.vatsimBrief": "Practise controlling offline, then fly for real on the VATSIM network.",

    /* ---------- chân trang ---------- */
    "footer.tagline": "Bringing the dream of flight closer to you. © 2026 The Flight Deck."
  };

  /* Lấy chuỗi theo khoá. Tiếng Việt luôn trả về fallback (chính là chữ
     gốc trong HTML/JS), nên không bao giờ thiếu chuỗi khi ở bản vi. */
  window.TFD_T = function (key, fallback) {
    if (window.TFD_LANG === "en" && EN[key] != null) return EN[key];
    return fallback;
  };

  function setLang(next) {
    try { localStorage.setItem(KEY, next); } catch (e) { /* chế độ riêng tư */ }
    location.reload();
  }

  function applyTranslations() {
    if (lang !== "en") return;
    document.documentElement.lang = "en";

    Array.prototype.forEach.call(
      document.querySelectorAll("[data-i18n]"),
      function (el) {
        var v = EN[el.getAttribute("data-i18n")];
        if (v != null) el.innerHTML = v;
      }
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-i18n-placeholder]"),
      function (el) {
        var v = EN[el.getAttribute("data-i18n-placeholder")];
        if (v != null) el.setAttribute("placeholder", v);
      }
    );
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-i18n-content]"),
      function (el) {
        var v = EN[el.getAttribute("data-i18n-content")];
        if (v != null) el.setAttribute("content", v);
      }
    );
    var t = document.querySelector("title[data-i18n-title]");
    if (t) {
      var tv = EN[t.getAttribute("data-i18n-title")];
      if (tv != null) t.textContent = tv;
    }
  }

  function buildToggle() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-toggle";
    /* Nút hiện ngôn ngữ sẽ chuyển SANG, không phải ngôn ngữ đang xem —
       đang xem tiếng Việt thì nút ghi "EN" để bấm sang tiếng Anh. */
    btn.textContent = lang === "en" ? "VI" : "EN";
    btn.setAttribute(
      "aria-label",
      lang === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"
    );
    btn.title = btn.getAttribute("aria-label");
    btn.addEventListener("click", function () {
      setLang(lang === "en" ? "vi" : "en");
    });
    document.body.appendChild(btn);
  }

  function init() {
    applyTranslations();
    buildToggle();
  }

  /* Chạy NGAY, KHÔNG đợi DOMContentLoaded. File này nằm cuối <body> nên phần
     HTML phía trên đã dựng xong. Quan trọng: effects.js (nạp ngay sau) tách
     <h1> thành từng từ ngay lúc chạy — nếu đợi DOMContentLoaded thì thứ tự sẽ
     là tách chữ trước, đổi ngôn ngữ sau, và việc ghi đè innerHTML sẽ xoá sạch
     các span đã tách => bản tiếng Anh mất hiệu ứng chữ trồi lên. */
  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
