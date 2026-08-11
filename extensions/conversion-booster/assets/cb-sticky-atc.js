/* Boostify — sticky add to cart */
(function () {
  var bar = document.querySelector('.cb-satc');
  if (!bar) return;

  // Fire-and-forget analytics ping
  function _cbTrack(eventType) {
    var shop = bar.getAttribute('data-shop');
    var url  = bar.getAttribute('data-track-url');
    if (!shop || !url) return;
    if (eventType === 'view') {
      var k = 'cbt-satc';
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) {}
    }
    var d = new URLSearchParams({ shop: shop, widget: 'satc', event: eventType });
    if (navigator.sendBeacon) { navigator.sendBeacon(url, d); }
    else { fetch(url, { method: 'POST', body: d }).catch(function () {}); }
  }

  var mainForm = document.querySelector('form[action*="/cart/add"]');
  var trigger = mainForm || document.querySelector('main') || document.body;
  var viewTracked = false;

  // Show the bar once the main buy area scrolls out of view
  if ('IntersectionObserver' in window && mainForm) {
    var io = new IntersectionObserver(function (entries) {
      var visible = entries[0].isIntersecting;
      bar.classList.toggle('cb-satc--visible', !visible);
      bar.setAttribute('aria-hidden', visible ? 'true' : 'false');
      // Track first time the sticky bar becomes visible
      if (!visible && !viewTracked) { viewTracked = true; _cbTrack('view'); }
    }, { threshold: 0 });
    io.observe(trigger);
  } else {
    // Fallback: show after scrolling 60% of a viewport
    var onScroll = function () {
      var show = window.scrollY > window.innerHeight * 0.6;
      bar.classList.toggle('cb-satc--visible', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (show && !viewTracked) { viewTracked = true; _cbTrack('view'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Variant select — update price display
  var variants = bar.querySelector('[data-cb-variants]');
  var priceEl = bar.querySelector('[data-cb-price]');
  if (variants && variants.tagName === 'SELECT' && priceEl) {
    variants.addEventListener('change', function () {
      var opt = variants.options[variants.selectedIndex];
      if (opt && opt.getAttribute('data-price')) priceEl.textContent = opt.getAttribute('data-price');
    });
  }

  // Add to cart via AJAX
  var btn = bar.querySelector('[data-cb-add]');
  var originalText = btn ? btn.textContent : '';

  if (btn) {
    btn.addEventListener('click', function () {
      var id = variants ? variants.value : null;
      if (!id) return;
      btn.disabled = true;
      btn.textContent = 'Adding…';

      // Track the click
      _cbTrack('click');

      fetch(window.Shopify && window.Shopify.routes ? window.Shopify.routes.root + 'cart/add.js' : '/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(id, 10), quantity: 1 }] })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('add failed');
          return r.json();
        })
        .then(function () {
          btn.textContent = 'Added ✓';
          document.dispatchEvent(new CustomEvent('cb:cart:added'));
          // Refresh cart count bubbles used by most themes
          fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
            document.querySelectorAll('.cart-count-bubble, [data-cart-count]').forEach(function (el) {
              el.textContent = cart.item_count;
            });
          }).catch(function () {});
          setTimeout(function () {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 2000);
        })
        .catch(function () {
          btn.textContent = 'Try again';
          btn.disabled = false;
        });
    });
  }
})();
