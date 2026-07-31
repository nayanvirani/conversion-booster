/* Boostify — announcement bar */
(function () {
  document.querySelectorAll('.cb-bar').forEach(function (bar) {
    var key = 'cb-bar-dismissed-' + bar.id;
    try {
      if (sessionStorage.getItem(key)) { bar.remove(); return; }
    } catch (e) { /* storage blocked — ignore */ }

    // Move bar to correct position — app embeds inject at end of body
    var pos = bar.getAttribute('data-position') || 'top';
    if (pos === 'bottom') {
      document.body.appendChild(bar);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }

    var close = bar.querySelector('.cb-bar__close');
    if (close) {
      close.addEventListener('click', function () {
        bar.remove();
        try { sessionStorage.setItem(key, '1'); } catch (e) {}
      });
    }

    var raw = bar.getAttribute('data-messages') || '';
    var messages = raw.split('|||').filter(Boolean);
    if (messages.length < 2) return;

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var msgEl = bar.querySelector('.cb-bar__msg');
    var i = 0;
    var interval = parseInt(bar.getAttribute('data-interval'), 10) || 5000;

    setInterval(function () {
      i = (i + 1) % messages.length;
      if (reduced) { msgEl.textContent = messages[i]; return; }
      msgEl.classList.add('cb-fade');
      setTimeout(function () {
        msgEl.textContent = messages[i];
        msgEl.classList.remove('cb-fade');
      }, 300);
    }, interval);
  });
})();
