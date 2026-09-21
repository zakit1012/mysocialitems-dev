/**
 * The embeddable widget, served as plain JavaScript.
 *
 * It renders into whatever element carries data-msi-widget, so a customer can
 * drop it anywhere. Styles are scoped under one class and kept deliberately
 * plain, because this runs inside somebody else's stylesheet.
 */
export function widgetScript(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '');

  return `(function () {
  var KEY = ${JSON.stringify(safeKey)};
  var API = ${JSON.stringify('/embed/widgets/')};
  var BASE = (function () {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf('/embed/widget.js') !== -1) { s = all[i]; break; }
      }
    }
    return s ? s.src.split('/embed/widget.js')[0] : '';
  })();

  if (!KEY) { console.error('[my-social-items] Missing widget key.'); return; }

  var CSS = '' +
    '.msi{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#18181b}' +
    '.msi *{box-sizing:border-box}' +
    '.msi-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}' +
    '.msi-score{font-size:26px;font-weight:800;letter-spacing:-.02em}' +
    '.msi-stars{color:#f59e0b;letter-spacing:1px}' +
    '.msi-count{color:#71717a;font-size:13px}' +
    '.msi-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}' +
    '.msi-card{border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#fff}' +
    '.msi-top{display:flex;gap:10px;align-items:center;margin-bottom:8px}' +
    '.msi-av{width:34px;height:34px;border-radius:50%;object-fit:cover;background:#f4f4f5;flex:none}' +
    '.msi-name{font-weight:600;font-size:13.5px;line-height:1.2}' +
    '.msi-when{color:#a1a1aa;font-size:11.5px}' +
    '.msi-text{font-size:13px;color:#3f3f46;white-space:pre-wrap;overflow:hidden;' +
      'display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}' +
    '.msi-pics{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}' +
    '.msi-pics img{width:52px;height:52px;border-radius:7px;object-fit:cover}' +
    '.msi-more{display:inline-block;margin-top:12px;font-size:12.5px;color:#4f46e5;text-decoration:none}' +
    '.msi-err{border:1px dashed #fecaca;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:12px;font-size:13px}';

  function styleOnce() {
    if (document.getElementById('msi-style')) return;
    var el = document.createElement('style');
    el.id = 'msi-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function stars(n) {
    var full = Math.round(Number(n) || 0), out = '';
    for (var i = 1; i <= 5; i++) out += i <= full ? '\\u2605' : '\\u2606';
    return out;
  }

  function render(host, data) {
    var b = data.business || {};
    var list = data.reviews || [];
    var html = '<div class="msi">';

    if (b.name || b.overall_rating != null) {
      html += '<div class="msi-head">' +
        (b.overall_rating != null ? '<span class="msi-score">' + esc(b.overall_rating) + '</span>' : '') +
        '<span class="msi-stars">' + stars(b.overall_rating) + '</span>' +
        (b.total_reviews != null
          ? '<span class="msi-count">' + esc(b.total_reviews) + ' reviews on Google</span>' : '') +
        '</div>';
    }

    html += '<div class="msi-grid">';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var initial = (r.author || '?').trim().charAt(0).toUpperCase();
      html += '<div class="msi-card"><div class="msi-top">' +
        (r.author_photo
          ? '<img class="msi-av" loading="lazy" src="' + esc(r.author_photo) + '" alt="">'
          : '<div class="msi-av" style="display:grid;place-items:center;font-weight:700;color:#71717a">' + esc(initial) + '</div>') +
        '<div><div class="msi-name">' + esc(r.author || 'Google user') + '</div>' +
        '<div class="msi-when"><span class="msi-stars">' + stars(r.rating) + '</span> ' +
        esc(r.published_at_text || '') + '</div></div></div>' +
        '<div class="msi-text">' + esc(r.text) + '</div>';

      if (r.images && r.images.length) {
        html += '<div class="msi-pics">';
        for (var j = 0; j < Math.min(r.images.length, 4); j++) {
          html += '<img loading="lazy" src="' + esc(r.images[j]) + '" alt="">';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    if (data.link) {
      html += '<a class="msi-more" target="_blank" rel="noopener" href="' + esc(data.link) + '">See all reviews on Google</a>';
    }
    host.innerHTML = html + '</div>';
  }

  function mount(host) {
    styleOnce();
    var count = host.getAttribute('data-count') || '6';
    var sort = host.getAttribute('data-sort') || 'mostRelevant';
    host.innerHTML = '<div class="msi"><div class="msi-count">Loading reviews...</div></div>';

    fetch(BASE + API + encodeURIComponent(KEY) + '/reviews?count=' + encodeURIComponent(count) +
          '&sort=' + encodeURIComponent(sort))
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) {
          // The owner needs to see why; a visitor just sees nothing.
          console.error('[my-social-items] ' + (res.body.error || 'Could not load reviews'));
          host.innerHTML = '<div class="msi"><div class="msi-err">' + esc(res.body.error || 'Could not load reviews') + '</div></div>';
          return;
        }
        render(host, res.body);
      })
      .catch(function (err) {
        console.error('[my-social-items]', err);
        host.innerHTML = '';
      });
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-msi-widget]');
    if (!nodes.length) {
      console.warn('[my-social-items] Nothing to mount. Add <div data-msi-widget></div>.');
      return;
    }
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;
}
