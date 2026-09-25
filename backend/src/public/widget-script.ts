/**
 * The embeddable widget, served as plain JavaScript.
 *
 * It renders into whatever element carries data-msi-widget, so a customer can
 * drop it anywhere. Styles are scoped under one class and kept deliberately
 * plain, because this runs inside somebody else's stylesheet.
 *
 * The renderer is also exposed as window.MySocialItems.render, and the
 * dashboard's live preview calls it (widget.js?preview=1), so what the owner
 * sees while editing is exactly what their visitors get.
 *
 * Settings arrive already normalized by the API (see widget-settings.ts):
 * colors are hex, everything else is from a fixed list.
 */
export function widgetScript(key: string, preview = false): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '');

  return `(function () {
  var KEY = ${JSON.stringify(safeKey)};
  var PREVIEW = ${preview ? 'true' : 'false'};
  var API = '/embed/widgets/';
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

  var CSS = '' +
    '.msi{--bg:transparent;--head:#111827;--text:#374151;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--star:#f59e0b;--btn:#f43f5e;--btn-text:#fff;--r:14px;' +
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--head);background:var(--bg);border-radius:calc(var(--r) + 4px);text-align:left}' +
    '.msi.msi-dark{--bg:#111827;--head:#f9fafb;--text:#d1d5db;--muted:#9ca3af;--card:#1f2937;--line:#374151}' +
    '.msi.msi-r-none{--r:4px}.msi.msi-r-lg{--r:22px}' +
    '.msi.msi-pad{padding:20px}' +
    '.msi *{box-sizing:border-box}' +
    '.msi-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
    '.msi-head.msi-sep{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:14px}' +
    '.msi-biz{font-size:20px;font-weight:800;letter-spacing:-.01em;margin:0 0 4px;color:var(--head);line-height:1.25}' +
    '.msi-sum{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.msi-score{font-size:15px;font-weight:700;color:var(--head)}' +
    '.msi-count{color:var(--muted);font-size:13px}' +
    '.msi-stars{position:relative;display:inline-block;color:var(--star);letter-spacing:1px;white-space:nowrap}' +
    '.msi-stars i{font-style:normal;opacity:.28}' +
    '.msi-stars b{position:absolute;top:0;left:0;overflow:hidden;font-weight:inherit}' +
    '.msi-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:13.5px;font-weight:600;color:var(--btn-text);background:var(--btn);text-decoration:none;padding:9px 16px;border-radius:min(var(--r),999px);transition:opacity .2s;border:0;cursor:pointer;line-height:1.2}' +
    '.msi-btn:hover{opacity:.9}' +
    '.msi-btn svg{width:16px;height:16px;flex:none}' +
    '.msi-gbadge{display:inline-grid;place-items:center;width:22px;height:22px;margin-left:-5px;border-radius:50%;background:#fff;flex:none;box-shadow:0 1px 2px rgba(0,0,0,.18)}' +
    '.msi-btn .msi-gbadge svg{width:14px;height:14px}' +
    '.msi-items{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}' +
    '.msi-list .msi-items{grid-template-columns:1fr}' +
    '.msi-masonry .msi-items{display:block;columns:240px var(--cols,3);column-gap:12px}' +
    '.msi-masonry .msi-card{break-inside:avoid;margin-bottom:12px}' +
    '.msi-quotes .msi-items{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}' +
    '.msi-quotes .msi-card{display:flex;flex-direction:column;padding:20px 18px 16px}' +
    '.msi-quotes .msi-card:before{content:"“";display:block;font:44px/0.7 Georgia,"Iowan Old Style",serif;color:var(--star);margin:0 0 10px}' +
    '.msi-quotes .msi-text{font-size:15px;line-height:1.55}' +
    '.msi-quotes .msi-top{order:2;margin:14px 0 0}' +
    '.msi-quotes .msi-pics{order:3}' +
    '.msi-showcase .msi-items{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;align-items:stretch}' +
    '.msi-showcase .msi-card{display:flex;flex-direction:column;height:100%;padding:18px 16px 14px}' +
    '.msi-showcase .msi-text{flex:1}' +
    '.msi-card{position:relative;border:1px solid var(--line);border-radius:var(--r);padding:14px;background:var(--card)}' +
    '.msi-g{position:absolute;top:13px;right:13px;width:16px;height:16px;line-height:0}' +
    '.msi-g svg{width:16px;height:16px}' +
    '.msi-gi .msi-top{padding-right:22px}' +
    '.msi-noborder .msi-card{border-color:transparent}' +
    '.msi-shadow .msi-card{box-shadow:0 4px 12px -2px rgba(0,0,0,.12)}' +
    '.msi-top{display:flex;gap:10px;align-items:center;margin-bottom:8px}' +
    '.msi-av{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;display:grid;place-items:center;font-weight:700;color:#fff;background:var(--star)}' +
    '.msi-who{min-width:0}' +
    '.msi-name{font-weight:600;font-size:13.5px;line-height:1.25;color:var(--author,var(--head));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.msi-when{color:var(--date,var(--muted));font-size:11.5px}' +
    '.msi-text{margin:0;font-size:13px;color:var(--text);white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}' +
    '.msi-lines-3 .msi-text{-webkit-line-clamp:3}' +
    '.msi-lines-all .msi-text{display:block;-webkit-line-clamp:unset}' +
    '.msi-italic .msi-text{font-style:italic}' +
    '.msi-bold .msi-text{font-weight:700}' +
    '.msi-pics{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}' +
    '.msi-pics img{width:52px;height:52px;border-radius:min(var(--r),8px);object-fit:cover;cursor:zoom-in}' +
    '.msi-more-btn{display:inline-block;background:none;border:0;padding:0;margin-top:6px;color:var(--btn);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}' +
    '.msi-more-btn:hover{text-decoration:underline}' +
    '.msi-open .msi-text{display:block;-webkit-line-clamp:unset}' +
    '.msi-brand{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px}' +
    '.msi-brand svg{width:18px;height:18px;flex:none}' +
    '.msi-lb{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.85);display:grid;place-items:center;padding:20px;cursor:zoom-out}' +
    '.msi-lb img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
    '.msi-foot{margin-top:16px;display:flex;justify-content:var(--btn-pos,center)}' +
    '.msi-full .msi-foot .msi-btn{width:100%}' +
    '.msi-empty{color:var(--muted);font-size:13px;padding:8px 0}' +
    '.msi-err{border:1px dashed #fecaca;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:12px;font-size:13px}';

  var CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  var GOOGLE = '<svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';

  /** A button's icon. The colored Google logo sits on a white badge so it stays visible on any button color. */
  function buttonIcon(choice) {
    if (choice === 'google') return '<span class="msi-gbadge">' + GOOGLE + '</span>';
    return { chat: CHAT, star: STAR }[choice] || '';
  }

  function styleOnce() {
    if (document.getElementById('msi-style')) return;
    var el = document.createElement('style');
    el.id = 'msi-style';
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Only http(s) links are rendered; anything else becomes a dead link. */
  function url(u) {
    return /^https?:\\/\\//i.test(String(u || '')) ? esc(u) : '#';
  }

  /** Colors are validated server side; this is a second fence. */
  function hex(c) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '';
  }

  /** A faded row of five, with the colored row cut to the exact rating on top: 4.8 fills 96%. */
  function stars(n) {
    var value = Math.max(0, Math.min(5, Number(n) || 0));
    var row = '\\u2605\\u2605\\u2605\\u2605\\u2605';
    return '<span class="msi-stars" aria-label="' + esc(n) + ' out of 5">' +
      '<i>' + row + '</i><b style="width:' + value * 20 + '%">' + row + '</b></span>';
  }

  function card(r, s) {
    var initial = (r.author || '?').trim().charAt(0).toUpperCase();
    var html = '<div class="msi-card">' +
      (s.showGoogleIcon !== false ? '<span class="msi-g" title="Posted on Google">' + GOOGLE + '</span>' : '') +
      '<div class="msi-top">';
    if (s.showReviewerPhoto !== false) {
      html += r.author_photo
        ? '<img class="msi-av" loading="lazy" referrerpolicy="no-referrer" src="' + url(r.author_photo) + '" alt="">'
        : '<div class="msi-av">' + esc(initial) + '</div>';
    }
    html += '<div class="msi-who"><div class="msi-name">' + esc(r.author || 'Google user') + '</div>' +
      '<div class="msi-when">' + stars(r.rating) +
      (s.showReviewDate !== false && r.published_at_text ? ' ' + esc(r.published_at_text) : '') +
      '</div></div></div>' +
      '<p class="msi-text">' + esc(r.text) + '</p>';
    if (s.showReviewPhotos !== false && r.images && r.images.length) {
      html += '<div class="msi-pics">';
      for (var j = 0; j < Math.min(r.images.length, 4); j++) {
        html += '<img loading="lazy" referrerpolicy="no-referrer" src="' + url(r.images[j]) + '" alt="Photo from the review">';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  /** "Read more" only where the clamp actually hid something. */
  function addReadMore(host, s) {
    if (s.readMore === false) return;
    var cards = host.querySelectorAll('.msi-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.querySelector('.msi-more-btn')) continue;
      var t = c.querySelector('.msi-text');
      var clipped = t && t.scrollHeight > t.clientHeight + 2;
      if (!clipped || !t) continue;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'msi-more-btn';
      b.textContent = 'Read more';
      b.onclick = (function (cardEl, btn) {
        return function () {
          var open = cardEl.classList.toggle('msi-open');
          btn.textContent = open ? 'Show less' : 'Read more';
        };
      })(c, b);
      t.parentNode.insertBefore(b, t.nextSibling);
    }
  }

  function lightbox(src) {
    var box = document.createElement('div');
    box.className = 'msi-lb';
    box.innerHTML = '<img src="' + url(src) + '" alt="" referrerpolicy="no-referrer">';
    function close() {
      if (box.parentNode) box.parentNode.removeChild(box);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    box.onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
  }

  /** 5-star reviews only, then how many: data-count on the snippet, else the widget setting. */
  function visible(host, list, s) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if ((Number(list[i].rating) || 0) >= 5) out.push(list[i]);
    }
    var want = Number(host.getAttribute('data-count')) || Number(s.reviewCount) || 0;
    return want > 0 ? out.slice(0, want) : out;
  }

  function render(host, data) {
    styleOnce();
    data = data || {};
    var b = data.business || {};
    var w = data.widget || {};
    var s = w.settings || {};
    var list = visible(host, data.reviews || [], s);
    var layout = s.layout || 'grid';
    if (layout === 'carousel') layout = 'showcase';
    if (layout === 'compact') layout = 'quotes';

    var classes = ['msi', 'msi-' + layout];
    if (s.theme === 'dark') classes.push('msi-dark', 'msi-pad');
    if (hex(s.backgroundColor)) classes.push('msi-pad');
    if (s.cardBorder === false) classes.push('msi-noborder');
    if (s.cardShadow) classes.push('msi-shadow');
    if (s.reviewItalic) classes.push('msi-italic');
    if (s.reviewBold) classes.push('msi-bold');
    if (s.buttonPosition === 'full') classes.push('msi-full');
    if (s.radius === 'none' || s.radius === 'lg') classes.push('msi-r-' + s.radius);
    if (s.textLines === '3' || s.textLines === 'all') classes.push('msi-lines-' + s.textLines);
    if (s.showGoogleIcon !== false) classes.push('msi-gi');

    var vars = [];
    function v(name, value) { if (value) vars.push(name + ':' + value); }
    v('--bg', hex(s.backgroundColor));
    v('--head', hex(s.headerTextColor));
    v('--text', hex(s.reviewTextColor));
    v('--star', hex(s.starColor));
    v('--card', hex(s.cardBgColor));
    v('--author', hex(s.authorNameColor));
    v('--date', hex(s.dateColor));
    v('--btn', hex(s.buttonBgColor));
    v('--btn-text', hex(s.buttonTextColor));
    v('--btn-pos', { left: 'flex-start', right: 'flex-end' }[s.buttonPosition]);
    var cols = Number(s.gridColumns) || 0;
    if (cols && layout === 'masonry') v('--cols', String(cols));

    var showName = s.showBusinessName !== false;
    var showRating = s.showOverallRating !== false && b.overall_rating != null;
    var showWrite = s.showWriteReviewBtn !== false;
    var showList = s.showReviews !== false;
    // Older widgets never set this: they showed the link only without the header button.
    var showAll = s.showAllReviewsBtn === true || (s.showAllReviewsBtn !== false && !showWrite);
    var writeUrl = w.writeReviewUrl || data.link;
    var name = b.name || w.placeName;

    var html = '<div class="' + classes.join(' ') + '" style="' + esc(vars.join(';')) + '">';

    if ((showName && name) || showRating || (showWrite && writeUrl) || s.showHeaderGoogle !== false) {
      html += '<div class="msi-head' + (showList ? ' msi-sep' : '') + '"><div>';
      if (s.showHeaderGoogle !== false) html += '<div class="msi-brand">' + GOOGLE + 'Google Reviews</div>';
      if (showName && name) html += '<p class="msi-biz">' + esc(name) + '</p>';
      if (showRating) {
        html += '<div class="msi-sum">' + stars(b.overall_rating) +
          '<span class="msi-score">' + esc(b.overall_rating) + '</span>' +
          (b.total_reviews != null ? '<span class="msi-count">\\u00b7 ' + esc(Number(b.total_reviews).toLocaleString()) + ' reviews</span>' : '') +
          '</div>';
      }
      html += '</div>';
      if (showWrite && writeUrl) {
        html += '<a class="msi-btn" target="_blank" rel="noopener" href="' + url(writeUrl) + '">' + buttonIcon(s.writeButtonIcon || 'chat') + 'Write a review</a>';
      }
      html += '</div>';
    }

    if (showList) {
      var items = '';
      for (var i = 0; i < list.length; i++) items += card(list[i], s);
      if (!list.length) {
        html += '<div class="msi-empty">No reviews to show yet.</div>';
      } else {
        var style = '';
        if (cols && (layout === 'grid' || layout === 'quotes' || layout === 'showcase')) {
          style = cols === 1
            ? 'grid-template-columns:1fr'
            : 'grid-template-columns:repeat(auto-fit,minmax(max(220px,calc((100% - ' + (cols - 1) * 12 + 'px) / ' + cols + ')),1fr))';
        }
        html += '<div class="msi-items"' + (style ? ' style="' + style + '"' : '') + '>' + items + '</div>';
      }
    }

    if (showAll && data.link) {
      html += '<div class="msi-foot"><a class="msi-btn" target="_blank" rel="noopener" href="' + url(data.link) + '">' +
        // Older widgets only had an on/off Google logo here.
        buttonIcon(s.allButtonIcon || (s.buttonIcon ? 'google' : 'none')) + 'See all reviews on Google</a></div>';
    }

    host.innerHTML = html + '</div>';

    addReadMore(host, s);
    // Fonts and images can change line breaks after the first paint.
    setTimeout(function () { addReadMore(host, s); }, 400);

    host.onclick = function (e) {
      var img = e.target && e.target.closest ? e.target.closest('.msi-pics img') : null;
      if (img) lightbox(img.getAttribute('src'));
    };

  }

  window.MySocialItems = window.MySocialItems || {};
  window.MySocialItems.render = render;

  if (PREVIEW) return;
  if (!KEY) { console.error('[my-social-items] Missing widget key.'); return; }

  function mount(host, attempt) {
    attempt = attempt || 0;
    styleOnce();
    var count = host.getAttribute('data-count');
    var sort = host.getAttribute('data-sort');
    if (!attempt) host.innerHTML = '<div class="msi"><div class="msi-count">Loading reviews...</div></div>';

    fetch(BASE + API + encodeURIComponent(KEY) + '/reviews?' +
          (count ? 'count=' + encodeURIComponent(count) + '&' : '') +
          (sort ? 'sort=' + encodeURIComponent(sort) : ''))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b || {} }; });
      })
      .then(function (res) {
        if (!res.ok) {
          // The owner needs to see why; a visitor just sees nothing.
          console.error('[my-social-items] ' + (res.body.error || 'Could not load reviews'));
          // Visitors of a live site should never see our configuration errors;
          // show them only while the owner is testing on localhost.
          var local = /^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname);
          host.innerHTML = local
            ? '<div class="msi"><div class="msi-err">' + esc(res.body.error || 'Could not load reviews') + '</div></div>'
            : '';
          return;
        }
        if (res.body.served === 'fetching' && attempt < 15) {
          // First visit for this place - the engine is still collecting.
          setTimeout(function () { mount(host, attempt + 1); }, 4000);
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
    for (var i = 0; i < nodes.length; i++) mount(nodes[i], 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;
}
