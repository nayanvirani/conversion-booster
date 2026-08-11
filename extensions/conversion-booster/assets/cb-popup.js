/* Boostify — social proof popup (real products, no backend) */
(function () {
  var cfg = document.getElementById('cb-pop-config');
  if (!cfg) return;

  var dismissedKey = 'cb-pop-dismissed';
  try { if (sessionStorage.getItem(dismissedKey)) return; } catch (e) {}

  // Fire-and-forget analytics ping
  function _cbTrack(eventType) {
    var shop = cfg.getAttribute('data-shop');
    var url  = cfg.getAttribute('data-track-url');
    if (!shop || !url) return;
    if (eventType === 'view') {
      var k = 'cbt-popup';
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
    }
    var d = new URLSearchParams({ shop: shop, widget: 'popup', event: eventType });
    if (navigator.sendBeacon) { navigator.sendBeacon(url, d); }
    else { fetch(url, { method: 'POST', body: d }).catch(function () {}); }
  }

  var collection = cfg.getAttribute('data-collection') || 'all';
  var url = '/collections/' + encodeURIComponent(collection) + '/products.json?limit=12';

  fetch(url)
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (data) {
      var products = (data.products || []).filter(function (p) {
        return p.images && p.images.length;
      });
      if (!products.length) return;

      // Shuffle
      for (var i = products.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = products[i]; products[i] = products[j]; products[j] = tmp;
      }

      var el = document.createElement('a');
      el.className = 'cb-pop';
      el.innerHTML =
        '<img class="cb-pop__img" alt="" width="52" height="52">' +
        '<span><span class="cb-pop__eyebrow" style="color:' + cfg.getAttribute('data-eyebrow-color') + '"></span>' +
        '<span class="cb-pop__title"></span></span>' +
        '<button class="cb-pop__close" type="button" aria-label="Hide popups">&times;</button>';
      document.body.appendChild(el);

      el.querySelector('.cb-pop__eyebrow').textContent = cfg.getAttribute('data-eyebrow');
      el.querySelector('.cb-pop__close').addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        el.remove();
        try { sessionStorage.setItem(dismissedKey, '1'); } catch (err) {}
      });

      // Track click when the popup link is followed
      el.addEventListener('click', function (e) {
        if (e.target.closest('.cb-pop__close')) return;
        _cbTrack('click');
      });

      var showMs = parseInt(cfg.getAttribute('data-show-ms'), 10) || 5000;
      var gapMs = parseInt(cfg.getAttribute('data-gap'), 10) || 25000;
      var max = parseInt(cfg.getAttribute('data-max'), 10) || 4;
      var shown = 0;

      function showNext() {
        if (!document.body.contains(el) || shown >= max || shown >= products.length) return;
        var p = products[shown];
        el.href = '/products/' + p.handle;
        el.querySelector('.cb-pop__img').src = p.images[0].src + (p.images[0].src.indexOf('?') > -1 ? '&' : '?') + 'width=104';
        el.querySelector('.cb-pop__title').textContent = p.title;
        el.classList.add('cb-pop--visible');
        // Track the first view
        if (shown === 0) { _cbTrack('view'); }
        shown++;
        setTimeout(function () {
          el.classList.remove('cb-pop--visible');
          if (shown < max && shown < products.length) setTimeout(showNext, gapMs);
        }, showMs);
      }

      setTimeout(showNext, parseInt(cfg.getAttribute('data-first-delay'), 10) || 8000);
    })
    .catch(function () { /* collection not found or blocked — fail silently */ });
})();
