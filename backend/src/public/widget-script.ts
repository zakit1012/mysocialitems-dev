/**
 * The embeddable widget, served as plain JavaScript.
 *
 * It renders into whatever element carries data-widgetpop, so a customer can
 * drop it anywhere. Styles are scoped under one class and kept deliberately
 * plain, because this runs inside somebody else's stylesheet.
 *
 * The renderer is also exposed as window.WidgetPop.render, and the
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
    '.wpop{--bg:#f9fafb;--head:#111827;--text:#374151;--muted:#6b7280;--card:#fff;--line:#e5e7eb;--star:#f59e0b;--btn:#f43f5e;--btn-text:#fff;--r:14px;' +
      'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--head);background:var(--bg);border-radius:calc(var(--r) + 4px);text-align:left}' +
    '.wpop.wpop-dark{--bg:#111827;--head:#f9fafb;--text:#d1d5db;--muted:#9ca3af;--card:#1f2937;--line:#374151}' +
    // Background: the theme's panel (boxed), the site's own colour (clear) or
    // the owner's colour (--bg set inline).
    '.wpop.wpop-clear{--bg:transparent}' +
    '.wpop.wpop-boxed{border:1px solid var(--line)}' +
    '.wpop.wpop-r-none{--r:4px}.wpop.wpop-r-lg{--r:22px}' +
    '.wpop.wpop-pad{padding:20px}' +
    '@media (max-width:480px){.wpop.wpop-pad{padding:14px}}' +
    // Text outside the cards follows the colour it sits on (see contrast()).
    '.wpop.wpop-on-dark .wpop-head,.wpop.wpop-on-dark .wpop-empty,.wpop.wpop-on-dark .wpop-powered{--head:#f9fafb;--muted:rgba(255,255,255,.78);--line:rgba(255,255,255,.22)}' +
    '.wpop.wpop-on-light .wpop-head,.wpop.wpop-on-light .wpop-empty,.wpop.wpop-on-light .wpop-powered{--head:#111827;--muted:#4b5563;--line:rgba(17,24,39,.14)}' +
    '.wpop *{box-sizing:border-box}' +
    '.wpop-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}' +
    '.wpop-head.wpop-sep{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:14px}' +
    '.wpop-biz{font-size:20px;font-weight:800;letter-spacing:-.01em;margin:0 0 4px;color:var(--head);line-height:1.25}' +
    '.wpop-sum{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.wpop-score{font-size:15px;font-weight:700;color:var(--head)}' +
    '.wpop-count{color:var(--muted);font-size:13px}' +
    '.wpop-stars{position:relative;display:inline-block;color:var(--star);letter-spacing:1px;white-space:nowrap}' +
    '.wpop-stars i{font-style:normal;opacity:.28}' +
    '.wpop-stars b{position:absolute;top:0;left:0;overflow:hidden;font-weight:inherit}' +
    '.wpop-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:13.5px;font-weight:600;color:var(--btn-text);background:var(--btn);text-decoration:none;padding:9px 16px;border-radius:min(var(--r),999px);transition:opacity .2s;border:0;cursor:pointer;line-height:1.2}' +
    '.wpop-btn:hover{opacity:.9}' +
    '.wpop-btn svg{width:16px;height:16px;flex:none}' +
    // SVG attributes lose to any site CSS (svg{fill:...}); say it in CSS too.
    '.wpop .wpop-i-line,.wpop .wpop-i-line path{fill:none!important;stroke:currentColor!important}' +
    '.wpop .wpop-i-fill,.wpop .wpop-i-fill path{fill:currentColor!important;stroke:none!important}' +
    '.wpop-gbadge{display:inline-grid;place-items:center;width:22px;height:22px;margin-left:-5px;border-radius:50%;background:#fff;flex:none;box-shadow:0 1px 2px rgba(0,0,0,.18)}' +
    '.wpop-btn .wpop-gbadge svg{width:14px;height:14px}' +
    // min(100%,...) and minmax(0,...): a card never gets wider than the page
    // around it, even in a narrow sidebar or with a long reviewer name.
    '.wpop-items{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}' +
    '.wpop-list .wpop-items{grid-template-columns:minmax(0,1fr)}' +
    '.wpop-masonry .wpop-items{display:block;columns:240px var(--cols,3);column-gap:12px}' +
    '.wpop-masonry .wpop-card{break-inside:avoid;margin-bottom:12px}' +
    '.wpop-quotes .wpop-items{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px}' +
    '.wpop-quotes .wpop-card{display:flex;flex-direction:column;padding:20px 18px 16px}' +
    '.wpop-quotes .wpop-card:before{content:"“";display:block;font:44px/0.7 Georgia,"Iowan Old Style",serif;color:var(--star);margin:0 0 10px}' +
    '.wpop-quotes .wpop-text{font-size:15px;line-height:1.55}' +
    '.wpop-quotes .wpop-top{order:2;margin:14px 0 0}' +
    '.wpop-quotes .wpop-pics{order:3}' +
    '.wpop-showcase .wpop-items{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;align-items:stretch}' +
    '.wpop-showcase .wpop-card{display:flex;flex-direction:column;height:100%;padding:18px 16px 14px}' +
    '.wpop-showcase .wpop-text{flex:1}' +
    // Showcase: the fullest review sits large across two columns and two
    // rows, the rest around it (only with three columns or more; see showcase()).
    '.wpop-showcase .wpop-items{grid-auto-flow:dense}' +
    '.wpop-showcase .wpop-feature{grid-column:span 2;grid-row:span 2;order:-1;padding:28px 26px 22px}' +
    '.wpop-showcase .wpop-feature:before{content:"“";display:block;font:64px/0.55 Georgia,"Iowan Old Style",serif;color:var(--star);margin:4px 0 14px}' +
    '.wpop-showcase .wpop-feature .wpop-text{font-size:17px;line-height:1.6;color:var(--head);-webkit-line-clamp:9}' +
    '.wpop-showcase .wpop-feature .wpop-top{order:2;margin:18px 0 0}' +
    '.wpop-showcase .wpop-feature .wpop-pics{order:3;margin-top:14px}' +
    '.wpop-showcase .wpop-feature .wpop-pics img{width:72px;height:72px}' +
    '.wpop-showcase .wpop-feature .wpop-more-btn{order:1;align-self:flex-start}' +
    '.wpop-car{position:relative;padding:0 48px}' +
    '.wpop-car.wpop-fits{padding:0}' +
    '.wpop-carousel .wpop-items{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding:2px 0 6px;align-items:stretch}' +
    '.wpop-carousel .wpop-items::-webkit-scrollbar{display:none}' +
    '.wpop-carousel .wpop-card{flex:0 0 var(--slide,min(280px,85%));scroll-snap-align:start}' +
    // Off while the arrows or autoplay glide, so an unseen jump lands exactly.
    '.wpop-carousel .wpop-items.wpop-glide{scroll-snap-type:none}' +
    // The arrows sit in their own gutter, beside the cards, centred on them.
    // Sites style every <button> (colours, hover fills, padding, transforms),
    // so each look-defining property is pinned with !important, in every state.
    '.wpop .wpop-nav{all:unset;box-sizing:border-box!important;position:absolute!important;top:calc(50% - 20px)!important;z-index:1;' +
      'display:flex!important;align-items:center!important;justify-content:center!important;width:40px!important;height:40px!important;min-width:0!important;min-height:0!important;' +
      'margin:0!important;padding:0!important;border:1px solid var(--line)!important;border-radius:50%!important;background:var(--card)!important;color:var(--head)!important;' +
      'box-shadow:0 1px 2px rgba(0,0,0,.08),0 4px 14px rgba(0,0,0,.1)!important;font-size:0!important;line-height:0!important;text-shadow:none!important;opacity:1!important;' +
      'transform:none!important;cursor:pointer!important;transition:box-shadow .2s,transform .15s!important}' +
    '.wpop .wpop-nav:hover,.wpop .wpop-nav:focus{background:var(--card)!important;color:var(--head)!important;border-color:var(--line)!important;outline:none!important;box-shadow:0 2px 4px rgba(0,0,0,.1),0 8px 22px rgba(0,0,0,.14)!important}' +
    '.wpop .wpop-nav:focus-visible{outline:2px solid var(--btn)!important;outline-offset:2px!important}' +
    '.wpop .wpop-nav:active{transform:scale(.92)!important}' +
    '.wpop .wpop-nav svg{display:block!important;width:20px!important;height:20px!important;margin:0!important;fill:none!important;stroke:currentColor!important;pointer-events:none}' +
    '.wpop .wpop-nav svg path{fill:none!important;stroke:currentColor!important;stroke-width:2.4!important;stroke-linecap:round!important;stroke-linejoin:round!important}' +
    '.wpop .wpop-prev{left:0!important;right:auto!important}.wpop .wpop-next{right:0!important;left:auto!important}' +
    '.wpop .wpop-fits .wpop-nav{display:none!important}' +
    '@media (max-width:480px){.wpop-car{padding:0 40px}.wpop .wpop-nav{width:34px!important;height:34px!important;top:calc(50% - 17px)!important}.wpop .wpop-nav svg{width:18px!important;height:18px!important}}' +
    '.wpop-fits .wpop-items{justify-content:center}' +
    '.wpop-fits .wpop-clone{display:none}' +
    '.wpop-card{position:relative;min-width:0;border:1px solid var(--line);border-radius:var(--r);padding:14px;background:var(--card)}' +
    '.wpop-g{position:absolute;top:13px;right:13px;width:16px;height:16px;line-height:0}' +
    '.wpop-g svg{width:16px;height:16px}' +
    '.wpop-gi .wpop-top{padding-right:22px}' +
    '.wpop-noborder .wpop-card{border-color:transparent}' +
    '.wpop-shadow .wpop-card{box-shadow:0 4px 12px -2px rgba(0,0,0,.12)}' +
    '.wpop-top{display:flex;gap:10px;align-items:center;margin-bottom:8px}' +
    '.wpop-av{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;display:grid;place-items:center;font-weight:700;color:#fff;background:var(--star)}' +
    '.wpop-who{min-width:0}' +
    '.wpop-name{font-weight:600;font-size:13.5px;line-height:1.25;color:var(--author,var(--head));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.wpop-when{color:var(--date,var(--muted));font-size:11.5px}' +
    '.wpop-date{white-space:nowrap}' +
    '.wpop-text{margin:0;font-size:13px;color:var(--text);white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}' +
    '.wpop-lines-3 .wpop-text{-webkit-line-clamp:3}' +
    '.wpop-lines-all .wpop-text{display:block;-webkit-line-clamp:unset}' +
    '.wpop-italic .wpop-text{font-style:italic}' +
    '.wpop-bold .wpop-text{font-weight:700}' +
    '.wpop-pics{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}' +
    '.wpop-pic{position:relative;display:block;padding:0;border:0;background:none;line-height:0;cursor:zoom-in;border-radius:min(var(--r),8px);overflow:hidden}' +
    '.wpop-pics img{width:52px;height:52px;border-radius:min(var(--r),8px);object-fit:cover;transition:transform .2s}' +
    '.wpop-pic:hover img{transform:scale(1.06)}' +
    '.wpop-pic-more{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.55);color:#fff;font-size:14px;font-weight:700;line-height:1}' +
    '.wpop-more-btn{display:inline-block;background:none;border:0;padding:0;margin-top:6px;color:var(--btn);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}' +
    '.wpop-more-btn:hover{text-decoration:underline}' +
    '.wpop .wpop-more-btn,.wpop .wpop-more-btn:hover,.wpop .wpop-more-btn:focus{background:none!important;border:0!important;box-shadow:none!important;padding:0!important;min-height:0!important;color:var(--btn)!important;text-transform:none!important;letter-spacing:normal!important}' +
    '.wpop .wpop-pic,.wpop .wpop-pic:hover,.wpop .wpop-pic:focus{background:none!important;border:0!important;box-shadow:none!important;padding:0!important;min-width:0!important;min-height:0!important}' +
    '.wpop .wpop-btn,.wpop .wpop-btn:hover,.wpop .wpop-btn:focus,.wpop .wpop-btn:visited{color:var(--btn-text)!important;background:var(--btn)!important;text-decoration:none!important}' +
    '.wpop-open .wpop-text{display:block;-webkit-line-clamp:unset}' +
    '.wpop-brand{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px}' +
    '.wpop-brand svg{width:18px;height:18px;flex:none}' +
    '.wpop-hc .wpop-head{flex-direction:column;justify-content:center;text-align:center}' +
    '.wpop-hc .wpop-brand,.wpop-hc .wpop-sum{justify-content:center}' +
    '.wpop-lb{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:60px 16px;cursor:zoom-out;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '.wpop-lb img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5);cursor:default;user-select:none}' +
    '.wpop-lb button{all:unset;box-sizing:border-box!important;position:absolute!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.14)!important;color:#fff!important;box-shadow:none!important;cursor:pointer!important;transform:none!important;transition:background .2s!important}' +
    '.wpop-lb button:hover,.wpop-lb button:focus{background:rgba(255,255,255,.3)!important;color:#fff!important;outline:none!important}' +
    '.wpop-lb button:focus-visible{outline:2px solid #fff!important;outline-offset:2px!important}' +
    '.wpop-lb button svg{display:block!important;width:24px!important;height:24px!important;fill:none!important;stroke:#fff!important;pointer-events:none}' +
    '.wpop-lb button svg path{fill:none!important;stroke:#fff!important;stroke-width:2.2!important;stroke-linecap:round!important;stroke-linejoin:round!important}' +
    '.wpop-lb-x{top:14px!important;right:14px!important;width:42px!important;height:42px!important}' +
    '.wpop-lb-nav{top:calc(50% - 24px)!important;width:48px!important;height:48px!important}' +
    '.wpop-lb-nav svg{width:28px!important;height:28px!important}' +
    '.wpop-lb-prev{left:12px!important}.wpop-lb-next{right:12px!important}' +
    '.wpop-lb-count{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);padding:5px 11px;border-radius:999px;background:rgba(0,0,0,.5);color:#fff;font-size:13px;font-weight:600}' +
    '.wpop-foot{margin-top:16px;display:flex;justify-content:var(--btn-pos,center)}' +
    '.wpop-full .wpop-foot .wpop-btn{width:100%}' +
    '.wpop-empty{color:var(--muted);font-size:13px;padding:8px 0}' +
    '.wpop-powered{margin-top:14px;text-align:center;font-size:11.5px;color:var(--muted)}' +
    '.wpop-powered a{color:inherit;text-decoration:none}' +
    '.wpop-powered a:hover{color:var(--btn)}' +
    '.wpop-err{border:1px dashed #fecaca;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:12px;font-size:13px}';

  var PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var CHAT = '<svg class="wpop-i-line" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var STAR = '<svg class="wpop-i-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  var GOOGLE = '<svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>';

  /** A button's icon. The colored Google logo sits on a white badge so it stays visible on any button color. */
  function buttonIcon(choice) {
    if (choice === 'google') return '<span class="wpop-gbadge">' + GOOGLE + '</span>';
    return { chat: CHAT, star: STAR }[choice] || '';
  }

  function styleOnce() {
    if (document.getElementById('wpop-style')) return;
    var el = document.createElement('style');
    el.id = 'wpop-style';
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

  /** url() for a DOM property: same check, but not HTML-escaped. */
  function rawUrl(u) {
    return /^https?:\\/\\//i.test(String(u || '')) ? String(u) : '';
  }

  /** Colors are validated server side; this is a second fence. */
  function hex(c) {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '';
  }

  /**
   * What sits behind the reviews: the theme's panel, nothing (the site shows
   * through) or the owner's colour. Widgets saved before this choice: light
   * sat on the site, dark in its panel.
   */
  function backdrop(s) {
    if (hex(s.backgroundColor)) return 'custom';
    if (s.background === 'theme' || s.background === 'transparent') return s.background;
    return s.theme === 'dark' ? 'theme' : 'transparent';
  }

  /** [r, g, b, a] from a #hex or any colour a computed style gives back. */
  var paint = null;
  function rgba(c) {
    c = String(c || '');
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length < 6) h = h.replace(/./g, '$&$&');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    var m = /^rgba?\\(([^)]*)\\)$/.exec(c);
    if (m) {
      var p = m[1].split(/[\\s,\\/]+/);
      var a = p[3] ? parseFloat(p[3]) / (p[3].indexOf('%') > 0 ? 100 : 1) : 1;
      return [Number(p[0]), Number(p[1]), Number(p[2]), a];
    }
    // oklch(), lab(), color(): let a 1px canvas turn it into rgb.
    try {
      if (!paint) {
        var cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        paint = cv.getContext('2d');
      }
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = 'rgba(0,0,0,0)';
      paint.fillStyle = c;
      paint.fillRect(0, 0, 1, 1);
      var d = paint.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch (e) {
      return null;
    }
  }

  /** The colour a transparent widget sits on: the nearest solid background around it. */
  function siteColor(host) {
    for (var n = host; n && n.nodeType === 1; n = n.parentElement) {
      var c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c[3] >= 0.5) return c;
    }
    return [255, 255, 255, 1];
  }

  /** True when white text reads better on it than black (WCAG luminance). */
  function isDark(c) {
    function lin(x) { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) < 0.179;
  }

  /**
   * On a transparent or custom background, the heading, empty note and
   * "Powered by" turn light on a dark colour and dark on a light one -
   * unless the owner picked the heading colour.
   */
  function contrast(host, bg, s) {
    var root = host.firstChild;
    if (!root || !root.classList || bg === 'theme' || hex(s.headerTextColor)) return;
    var c = bg === 'custom' ? rgba(hex(s.backgroundColor)) : siteColor(host);
    var dark = isDark(c);
    root.classList.toggle('wpop-on-dark', dark);
    root.classList.toggle('wpop-on-light', !dark);
  }

  /** Something to undo when the widget is drawn again (the editor preview redraws often). */
  function onStop(host, fn) {
    (host.__wpopStops = host.__wpopStops || []).push(fn);
  }

  /** A faded row of five, with the colored row cut to the exact rating on top: 4.8 fills 96%. */
  function stars(n) {
    var value = Math.max(0, Math.min(5, Number(n) || 0));
    var row = '\\u2605\\u2605\\u2605\\u2605\\u2605';
    return '<span class="wpop-stars" aria-label="' + esc(n) + ' out of 5">' +
      '<i>' + row + '</i><b style="width:' + value * 20 + '%">' + row + '</b></span>';
  }

  /** A steady colour per reviewer for the initial, so a row of avatars is not all one colour. */
  var AVATAR = ['#F97316', '#10B981', '#6366F1', '#EC4899', '#0EA5E9', '#8B5CF6', '#14B8A6', '#EF4444', '#84CC16', '#F59E0B'];
  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR[h % AVATAR.length];
  }

  function card(r, s, index) {
    var initial = (r.author || '?').trim().charAt(0).toUpperCase();
    var html = '<div class="wpop-card" data-i="' + index + '">' +
      (s.showGoogleIcon !== false ? '<span class="wpop-g" title="Posted on Google">' + GOOGLE + '</span>' : '') +
      '<div class="wpop-top">';
    if (s.showReviewerPhoto !== false) {
      html += r.author_photo
        ? '<img class="wpop-av" loading="lazy" referrerpolicy="no-referrer" src="' + url(r.author_photo) + '" alt="">'
        : '<div class="wpop-av" style="background:' + avatarColor(r.author || '?') + '">' + esc(initial) + '</div>';
    }
    html += '<div class="wpop-who"><div class="wpop-name">' + esc(r.author || 'Google user') + '</div>' +
      '<div class="wpop-when">' + stars(r.rating) +
      // One piece, so a narrow card moves "2 weeks ago" down whole instead
      // of splitting it over two lines.
      (s.showReviewDate !== false && r.published_at_text
        ? ' <span class="wpop-date">' + esc(r.published_at_text) + '</span>'
        : '') +
      '</div></div></div>' +
      '<p class="wpop-text">' + esc(r.text) + '</p>';
    if (s.showReviewPhotos !== false && r.images && r.images.length) {
      html += '<div class="wpop-pics">';
      var thumbs = Math.min(r.images.length, 4);
      for (var j = 0; j < thumbs; j++) {
        // The last thumbnail says how many more the viewer holds.
        var more = j === thumbs - 1 && r.images.length > thumbs
          ? '<span class="wpop-pic-more">+' + (r.images.length - thumbs) + '</span>' : '';
        html += '<button type="button" class="wpop-pic" data-n="' + j + '" aria-label="Open photo ' + (j + 1) + ' of ' + r.images.length + '">' +
          '<img loading="lazy" referrerpolicy="no-referrer" src="' + url(r.images[j]) + '" alt="Photo from the review">' + more + '</button>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  /** "Read more" only where the clamp actually hid something. */
  function addReadMore(host, s) {
    if (s.readMore === false) return;
    var cards = host.querySelectorAll('.wpop-card');
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.querySelector('.wpop-more-btn')) continue;
      var t = c.querySelector('.wpop-text');
      var clipped = t && t.scrollHeight > t.clientHeight + 2;
      if (!clipped || !t) continue;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wpop-more-btn';
      b.textContent = 'Read more';
      b.onclick = (function (cardEl, btn) {
        return function () {
          var open = cardEl.classList.toggle('wpop-open');
          btn.textContent = open ? 'Show less' : 'Read more';
        };
      })(c, b);
      t.parentNode.insertBefore(b, t.nextSibling);
    }
  }

  /**
   * Cards are sized so a view holds only whole cards - never half of one at
   * the edge. "Columns" caps how many a view shows; a phone gets one. Arrows
   * move one card and wrap around at either end. Autoplay moves one card
   * every few seconds and waits while the visitor hovers, touches or tabs
   * through it, and while it is off screen. When every card fits, the arrows
   * hide and the cards sit centred.
   */
  /**
   * A carousel that never runs out: a copy of every card sits before and
   * after the real ones, so the track can always move on. Once it rests on
   * a copy it jumps, unseen, to the same card among the real ones - no
   * rewind from the last card to the first.
   */
  function carousel(host, s, cols) {
    var GAP = 12, MIN = 240;
    var wrap = host.querySelector('.wpop-car');
    var track = wrap && wrap.querySelector('.wpop-items');
    if (!track) return;
    var real = Array.prototype.slice.call(track.children);
    var n = real.length;
    function copy(card) {
      var c = card.cloneNode(true);
      c.classList.add('wpop-clone');
      c.setAttribute('aria-hidden', 'true');
      var focusable = c.querySelectorAll('a,button');
      for (var i = 0; i < focusable.length; i++) focusable[i].tabIndex = -1;
      return c;
    }
    var before = document.createDocumentFragment(), after = document.createDocumentFragment();
    for (var i = 0; i < n; i++) { before.appendChild(copy(real[i])); after.appendChild(copy(real[i])); }
    track.insertBefore(before, track.firstChild);
    track.appendChild(after);

    function perView(width) {
      var k = Math.max(1, Math.floor((width + GAP) / (MIN + GAP)));
      return cols ? Math.min(cols, k) : k;
    }
    function fits() { return wrap.classList.contains('wpop-fits'); }
    /** One card and its gap, and one whole set of cards. */
    function unit() { return real[0].getBoundingClientRect().width + GAP; }
    function set() { return n * unit(); }
    /**
     * An instant move, so the jump cannot be seen. The track has no CSS
     * smooth scrolling: only the arrows and autoplay glide (step), and a
     * re-snap after a resize is instant too.
     */
    function jump(left) {
      track.scrollLeft = left;
    }
    /** The review at the left edge, by the card itself (copies share data-i). */
    function current() {
      var edge = track.getBoundingClientRect().left, best = 0, gap = Infinity;
      for (var i = 0; i < track.children.length; i++) {
        var d = Math.abs(track.children[i].getBoundingClientRect().left - edge);
        if (d < gap) { gap = d; best = Number(track.children[i].getAttribute('data-i')) || 0; }
      }
      return best;
    }
    /** Back among the real cards if the track came to rest on a copy. */
    function settle() {
      aim = null;
      if (!fits()) {
        var w = set();
        if (track.scrollLeft < w - 2) jump(track.scrollLeft + w);
        else if (track.scrollLeft >= 2 * w - 2) jump(track.scrollLeft - w);
      }
      track.classList.remove('wpop-glide');
    }
    var resting;
    track.addEventListener('scroll', function () {
      clearTimeout(resting);
      resting = setTimeout(settle, 140);
    }, { passive: true });

    /** Where the running glide is heading; null at rest. */
    var aim = null;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** One card on. Quick clicks add up: each goes on from the last one's aim. */
    function step(dir) {
      if (fits()) return;
      var u = unit(), w = set();
      var at = aim === null ? Math.round(track.scrollLeft / u) * u : aim;
      track.classList.add('wpop-glide');
      // Stay among the real cards, jumping unseen by one whole set.
      if (at < w) { jump(track.scrollLeft + w); at += w; }
      else if (at >= 2 * w) { jump(track.scrollLeft - w); at -= w; }
      aim = at + dir * u;
      track.scrollTo({ left: aim, behavior: still ? 'auto' : 'smooth' });
    }
    wrap.querySelector('.wpop-prev').onclick = function () { step(-1); };
    wrap.querySelector('.wpop-next').onclick = function () { step(1); };

    var looping = null;
    function fit() {
      var nowFits = n <= perView(wrap.clientWidth);
      wrap.classList.toggle('wpop-fits', nowFits);
      // Measured after the arrows' gutters are on or off.
      var width = track.clientWidth, per = perView(width);
      wrap.style.setProperty('--slide', (width - (per - 1) * GAP) / per + 'px');
      aim = null;
      track.classList.remove('wpop-glide');
      if (nowFits) { jump(0); looping = false; return; }
      // Keep the card in view when the width changes; start on the first.
      var at = looping ? current() : 0;
      jump(set() + at * unit());
      looping = true;
    }
    fit();
    setTimeout(fit, 400);
    window.addEventListener('resize', fit);
    onStop(host, function () { window.removeEventListener('resize', fit); });
    if (s.autoplay && !still) autoplay(host, wrap, fits, step);
  }

  /**
   * One card on every few seconds. It waits while a mouse is over it, for a
   * few seconds after a tap, swipe, click or key, while a key has focus in
   * it, and while it is off screen or in a hidden tab.
   */
  function autoplay(host, wrap, fits, step) {
    var over = false, touched = 0, seen = true;
    wrap.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') over = true; });
    wrap.addEventListener('pointerleave', function () { over = false; });
    var wake = function () { touched = Date.now(); };
    var events = ['pointerdown', 'wheel', 'keydown', 'focusin'];
    for (var i = 0; i < events.length; i++) wrap.addEventListener(events[i], wake, { passive: true });
    function tabbing() {
      try { return !!wrap.querySelector(':focus-visible'); } catch (e) { return false; }
    }
    if (window.IntersectionObserver) {
      var watch = new IntersectionObserver(function (e) { seen = e[e.length - 1].isIntersecting; });
      watch.observe(wrap);
      onStop(host, function () { watch.disconnect(); });
    }
    var timer = setInterval(function () {
      if (over || !seen || document.hidden || fits() || tabbing() || Date.now() - touched < 6000) return;
      step(1);
    }, 3500);
    onStop(host, function () { clearInterval(timer); });
  }

  /**
   * Showcase: the review with the most to say (of the first four) becomes the
   * big featured card, while the widget is wide enough for three columns.
   */
  function showcase(host) {
    var items = host.querySelector('.wpop-items');
    var cards = items ? items.querySelectorAll('.wpop-card') : [];
    if (cards.length < 3) return;
    var best = cards[0], most = -1;
    for (var i = 0; i < Math.min(4, cards.length); i++) {
      var t = cards[i].querySelector('.wpop-text');
      var size = (t ? t.textContent.length : 0) + (cards[i].querySelector('.wpop-pics') ? 80 : 0);
      if (size > most) { most = size; best = cards[i]; }
    }
    function fit() {
      best.classList.remove('wpop-feature');
      var columns = getComputedStyle(items).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (columns >= 3) best.classList.add('wpop-feature');
    }
    fit();
    window.addEventListener('resize', fit);
    onStop(host, function () { window.removeEventListener('resize', fit); });
  }

  /**
   * Full-screen viewer for one review's photos: arrows, keyboard left/right,
   * swipe on phones, and a "2 / 5" count. Escape, the x or the dark backdrop
   * closes it.
   */
  function lightbox(images, start) {
    images = images.filter(rawUrl);
    if (!images.length) return;
    var many = images.length > 1, at = 0;
    var box = document.createElement('div');
    box.className = 'wpop-lb';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Review photos');
    box.innerHTML = '<img alt="Photo from the review" referrerpolicy="no-referrer">' +
      '<button type="button" class="wpop-lb-x" aria-label="Close">' + CLOSE + '</button>' +
      (many
        ? '<button type="button" class="wpop-lb-nav wpop-lb-prev" aria-label="Previous photo">' + PREV + '</button>' +
          '<button type="button" class="wpop-lb-nav wpop-lb-next" aria-label="Next photo">' + NEXT + '</button>' +
          '<div class="wpop-lb-count"></div>'
        : '');
    var img = box.querySelector('img');
    var count = box.querySelector('.wpop-lb-count');
    function show(n) {
      at = (n + images.length) % images.length;
      img.src = rawUrl(images[at]);
      if (count) count.textContent = (at + 1) + ' / ' + images.length;
    }
    var scroll = document.documentElement.style.overflow;
    function close() {
      if (box.parentNode) box.parentNode.removeChild(box);
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = scroll;
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (many && e.key === 'ArrowLeft') show(at - 1);
      else if (many && e.key === 'ArrowRight') show(at + 1);
    }
    box.onclick = function (e) {
      if (e.target.closest('.wpop-lb-prev')) show(at - 1);
      else if (e.target.closest('.wpop-lb-next')) show(at + 1);
      else if (e.target !== img) close();
    };
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (many && Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(box);
    show(start || 0);
    box.querySelector('.wpop-lb-x').focus();
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
    if (layout === 'compact') layout = 'quotes';

    var classes = ['wpop', 'wpop-' + layout];
    if (s.theme === 'dark') classes.push('wpop-dark');
    var bg = backdrop(s);
    if (bg === 'transparent') classes.push('wpop-clear');
    else classes.push('wpop-pad');
    if (bg === 'theme') classes.push('wpop-boxed');
    if (s.cardBorder === false) classes.push('wpop-noborder');
    if (s.cardShadow) classes.push('wpop-shadow');
    if (s.reviewItalic) classes.push('wpop-italic');
    if (s.reviewBold) classes.push('wpop-bold');
    if (s.buttonPosition === 'full') classes.push('wpop-full');
    if (s.radius === 'none' || s.radius === 'lg') classes.push('wpop-r-' + s.radius);
    if (s.textLines === '3' || s.textLines === 'all') classes.push('wpop-lines-' + s.textLines);
    if (s.showGoogleIcon !== false) classes.push('wpop-gi');
    // Header centred unless the owner picked left.
    if (s.headerAlign !== 'left') classes.push('wpop-hc');

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
      html += '<div class="wpop-head' + (showList ? ' wpop-sep' : '') + '"><div>';
      if (s.showHeaderGoogle !== false) html += '<div class="wpop-brand">' + GOOGLE + 'Google Reviews</div>';
      if (showName && name) html += '<p class="wpop-biz">' + esc(name) + '</p>';
      if (showRating) {
        html += '<div class="wpop-sum">' + stars(b.overall_rating) +
          '<span class="wpop-score">' + esc(b.overall_rating) + '</span>' +
          (b.total_reviews != null ? '<span class="wpop-count">\\u00b7 ' + esc(Number(b.total_reviews).toLocaleString()) + ' reviews</span>' : '') +
          '</div>';
      }
      html += '</div>';
      if (showWrite && writeUrl) {
        html += '<a class="wpop-btn" target="_blank" rel="noopener" href="' + url(writeUrl) + '">' + buttonIcon(s.writeButtonIcon || 'chat') + 'Write a review</a>';
      }
      html += '</div>';
    }

    if (showList) {
      var items = '';
      for (var i = 0; i < list.length; i++) items += card(list[i], s, i);
      if (!list.length) {
        html += '<div class="wpop-empty">No reviews to show yet.</div>';
      } else if (layout === 'carousel') {
        html += '<div class="wpop-car">' +
          '<button type="button" class="wpop-nav wpop-prev" aria-label="Previous review">' + PREV + '</button>' +
          '<div class="wpop-items">' + items + '</div>' +
          '<button type="button" class="wpop-nav wpop-next" aria-label="Next review">' + NEXT + '</button></div>';
      } else {
        var style = '';
        if (cols && (layout === 'grid' || layout === 'quotes' || layout === 'showcase')) {
          // Each layout's own gap (see CSS), and 1px of slack: with the gap
          // counted wrong, or on the exact edge, the chosen number of
          // columns never fits and the browser drops one.
          var gap = layout === 'quotes' ? 16 : layout === 'showcase' ? 14 : 12;
          style = cols === 1
            ? 'grid-template-columns:minmax(0,1fr)'
            : 'grid-template-columns:repeat(auto-fit,minmax(min(100%,max(220px,calc((100% - ' + (cols - 1) * gap + 'px) / ' + cols + ' - 1px))),1fr))';
        }
        html += '<div class="wpop-items"' + (style ? ' style="' + style + '"' : '') + '>' + items + '</div>';
      }
    }

    if (showAll && data.link) {
      html += '<div class="wpop-foot"><a class="wpop-btn" target="_blank" rel="noopener" href="' + url(data.link) + '">' +
        // Older widgets only had an on/off Google logo here.
        buttonIcon(s.allButtonIcon || (s.buttonIcon ? 'google' : 'none')) + 'See all reviews on Google</a></div>';
    }

    // Free plan widgets link back to us; paid plans send no branding.
    if (data.branding && data.branding.url) {
      html += '<div class="wpop-powered"><a target="_blank" rel="noopener" href="' + url(data.branding.url) + '">' +
        'Powered by <b>WidgetPop</b></a></div>';
    }

    // The preview re-renders on every settings change; stop the last
    // drawing's timers, watchers and listeners first.
    var stops = host.__wpopStops || [];
    host.__wpopStops = [];
    for (var k = 0; k < stops.length; k++) stops[k]();

    host.innerHTML = html + '</div>';
    contrast(host, bg, s);
    if (bg === 'transparent' && !hex(s.headerTextColor)) {
      var recheck = function () { contrast(host, bg, s); };
      // Sites switch light/dark mode with a class on <html> or <body>, or
      // with the visitor's system setting.
      if (window.MutationObserver) {
        var modes = new MutationObserver(recheck);
        var what = { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] };
        modes.observe(document.documentElement, what);
        if (document.body) modes.observe(document.body, what);
        onStop(host, function () { modes.disconnect(); });
      }
      var scheme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
      if (scheme && scheme.addEventListener) {
        scheme.addEventListener('change', recheck);
        onStop(host, function () { scheme.removeEventListener('change', recheck); });
      }
    }
    // Columns here means the most cards one view shows.
    if (layout === 'carousel') carousel(host, s, cols);
    if (layout === 'showcase') showcase(host);

    addReadMore(host, s);
    // Fonts and images can change line breaks after the first paint, and
    // the site's own styles may land late.
    setTimeout(function () {
      addReadMore(host, s);
      contrast(host, bg, s);
    }, 400);

    host.onclick = function (e) {
      if (!e.target || !e.target.closest) return;
      // Button clicks feed the owner's analytics; the preview has no key.
      if (e.target.closest('a.wpop-btn') && !PREVIEW && KEY && navigator.sendBeacon) {
        navigator.sendBeacon(BASE + API + encodeURIComponent(KEY) + '/click');
      }
      var pic = e.target.closest('.wpop-pic');
      if (!pic) return;
      var review = list[Number(pic.closest('.wpop-card').getAttribute('data-i'))];
      if (review && review.images) lightbox(review.images, Number(pic.getAttribute('data-n')));
    };

  }

  window.WidgetPop = window.WidgetPop || {};
  window.WidgetPop.render = render;

  if (PREVIEW) return;
  if (!KEY) { console.error('[widgetpop] Missing widget key.'); return; }

  function mount(host, attempt) {
    attempt = attempt || 0;
    styleOnce();
    var count = host.getAttribute('data-count');
    var sort = host.getAttribute('data-sort');
    if (!attempt) host.innerHTML = '<div class="wpop"><div class="wpop-count">Loading reviews...</div></div>';

    fetch(BASE + API + encodeURIComponent(KEY) + '/reviews?' +
          (count ? 'count=' + encodeURIComponent(count) + '&' : '') +
          (sort ? 'sort=' + encodeURIComponent(sort) : ''))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b || {} }; });
      })
      .then(function (res) {
        if (!res.ok) {
          // The owner needs to see why; a visitor just sees nothing.
          console.error('[widgetpop] ' + (res.body.error || 'Could not load reviews'));
          // Visitors of a live site should never see our configuration errors;
          // show them only while the owner is testing on localhost.
          var local = /^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname);
          host.innerHTML = local
            ? '<div class="wpop"><div class="wpop-err">' + esc(res.body.error || 'Could not load reviews') + '</div></div>'
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
        console.error('[widgetpop]', err);
        host.innerHTML = '';
      });
  }

  /**
   * Loads a widget only when it comes near the screen: the rest of the page
   * is never held up, and a visitor who never scrolls that far is not a view.
   */
  function watch(host) {
    if (!('IntersectionObserver' in window)) return mount(host, 0);
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          mount(host, 0);
          return;
        }
      }
    }, { rootMargin: '600px 0px' });
    io.observe(host);
  }

  function boot() {
    // data-msi-widget is the attribute snippets used before the rename; keep
    // those customer sites working.
    var nodes = document.querySelectorAll('[data-widgetpop],[data-msi-widget]');
    if (!nodes.length) {
      console.warn('[widgetpop] Nothing to mount. Add <div data-widgetpop></div>.');
      return;
    }
    for (var i = 0; i < nodes.length; i++) watch(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();`;
}
