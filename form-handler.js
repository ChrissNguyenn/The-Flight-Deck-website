/* ============================================
   Hobby Horizon — form handler
   Không có backend nên form sẽ mở email soạn sẵn
   gửi về địa chỉ CONTACT_EMAIL.
   Khi bạn có Google Form / backend riêng, chỉ cần
   thay hàm này bằng fetch() tới endpoint của bạn.
   ============================================ */

var CONTACT_EMAIL = "theflightdeckcoffee@gmail.com"; // ← đổi thành email nhận đăng ký của bạn

function setupMailtoForm(formId, subject) {
  var form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var lines = [];
    var fields = form.querySelectorAll("input, select, textarea");
    var doneCheckboxGroups = {};

    fields.forEach(function (field) {
      if (!field.name) return;

      // Nhóm checkbox: gom các ô đã tick thành một dòng
      if (field.type === "checkbox") {
        if (doneCheckboxGroups[field.name]) return;
        doneCheckboxGroups[field.name] = true;
        var checked = form.querySelectorAll('input[name="' + field.name + '"]:checked');
        var values = [];
        checked.forEach(function (box) { values.push(box.value); });
        if (values.length) {
          var groupLabel = field.getAttribute("data-label") || field.name;
          lines.push(groupLabel + ": " + values.join(", "));
        }
        return;
      }

      var label = form.querySelector('label[for="' + field.id + '"]');
      var labelText = label ? label.textContent.replace(/\s*\*\s*$/, "") : field.name;
      var value = field.value.trim();
      if (value) {
        lines.push(labelText + ": " + value);
      }
    });

    lines.push("");
    lines.push("— Gửi từ website Hobby Horizon (The Flight Deck)");

    var mailto =
      "mailto:" + CONTACT_EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));

    window.location.href = mailto;
  });
}
