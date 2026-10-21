/* Loads the Supabase library, then the app. Shows a friendly message instead of a blank page if anything fails. */
(function () {
  var app = document.getElementById('app');
  function banner(msg) {
    var b = document.getElementById('mgm-err');
    if (!b) { b = document.createElement('div'); b.id = 'mgm-err'; b.setAttribute('role', 'alert');
      b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99;background:#c62828;color:#fff;padding:10px 14px;border-radius:10px;font:14px system-ui'; document.body.appendChild(b); }
    b.textContent = msg; clearTimeout(b._t); b._t = setTimeout(function () { b.remove(); }, 8000);
  }
  function problem(e) { console.error('[MGM]', e && (e.error || e.reason || e.message || e)); if (window.__mgmReady) banner('Something went wrong. Please try again or refresh the page.'); }
  window.addEventListener('error', problem);
  window.addEventListener('unhandledrejection', problem);
  function fatal(title, text) {
    app.innerHTML = '<div style="max-width:560px;margin:12vh auto;padding:20px;font-family:system-ui;color:#0a2463"><h2>' + title + '</h2><p>' + text +
      '</p><button onclick="location.reload()" style="background:#0b57e3;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer">Retry</button></div>';
  }
  function load(src, ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }
  function start() { load('assets/js/app.js', function () {}, function () { fatal('MGM MARKET could not start', 'A required file (assets/js/app.js) is missing. Re-upload the whole project folder.'); }); }
  // 1) local copy (works offline / inside the Android app)  2) CDN fallback  3) start anyway and show a clear notice
  load('assets/js/vendor/supabase.js', start, function () {
    load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js', start, start);
  });
  setTimeout(function () { if (!window.__mgmReady) fatal('MGM MARKET is taking too long to start', 'Check your internet connection and press Retry. If it keeps happening, see the Troubleshooting section of the README.'); }, 12000);
})();
