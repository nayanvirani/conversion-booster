/* Conversion Booster — countdown timer */
(function () {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  document.querySelectorAll('.cb-count').forEach(function (el) {
    var mode = el.getAttribute('data-mode');
    var endMs;

    if (mode === 'evergreen') {
      var minutes = parseInt(el.getAttribute('data-evergreen-minutes'), 10) || 30;
      var key = 'cb-evergreen-' + el.id;
      try {
        endMs = parseInt(localStorage.getItem(key), 10);
        if (!endMs || endMs < Date.now()) {
          endMs = Date.now() + minutes * 60000;
          localStorage.setItem(key, String(endMs));
        }
      } catch (e) {
        endMs = Date.now() + minutes * 60000;
      }
    } else {
      var parsed = new Date(el.getAttribute('data-end'));
      endMs = isNaN(parsed) ? 0 : parsed.getTime();
    }

    var nums = {
      d: el.querySelector('[data-u="d"]'),
      h: el.querySelector('[data-u="h"]'),
      m: el.querySelector('[data-u="m"]'),
      s: el.querySelector('[data-u="s"]')
    };

    function expire() {
      clearInterval(t);
      if (el.getAttribute('data-expired-action') === 'message') {
        el.innerHTML = '<span class="cb-count__label">' +
          (el.getAttribute('data-expired-text') || 'Offer has ended') + '</span>';
      } else {
        el.remove();
      }
    }

    function tick() {
      var diff = endMs - Date.now();
      if (diff <= 0) { expire(); return; }
      var s = Math.floor(diff / 1000);
      nums.d.textContent = pad(Math.floor(s / 86400));
      nums.h.textContent = pad(Math.floor((s % 86400) / 3600));
      nums.m.textContent = pad(Math.floor((s % 3600) / 60));
      nums.s.textContent = pad(s % 60);
    }

    var t = setInterval(tick, 1000);
    tick();
  });
})();
