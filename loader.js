// Paw print trail loader — prints stamp down one at a time, left to right, then fade
(function() {
  var loader = document.createElement('div');
  loader.id = 'pageLoader';
  loader.innerHTML = `
    <div class="ldr-trail">
      <div class="ldr-paw p0"><img src="/images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p1"><img src="/images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p2"><img src="/images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p3"><img src="/images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p4"><img src="/images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p5"><img src="/images/paws/paw_01.png" alt=""></div>
    </div>
    <p class="ldr-text">Loading...</p>
  `;
  document.body.prepend(loader);

  var style = document.createElement('style');
  style.textContent = `
    #pageLoader {
      position: fixed; inset: 0; z-index: 9999;
      background: #fdf8f3;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      transition: opacity 0.4s ease, visibility 0.4s ease;
    }
    #pageLoader.loaded { opacity: 0; visibility: hidden; pointer-events: none; }

    .ldr-trail {
      position: relative;
      width: 280px;
      height: 70px;
    }

    .ldr-paw {
      position: absolute;
      opacity: 0;
    }
    .ldr-paw img {
      height: 26px;
      width: auto;
      display: block;
    }

    /* Cat gait: left-right-left-right, alternating top/bottom rows */
    /* Left paws (top row) */
    .ldr-paw.p0 { left: 10px;  top: 6px; }
    .ldr-paw.p2 { left: 100px; top: 4px; }
    .ldr-paw.p4 { left: 190px; top: 7px; }
    /* Right paws (bottom row) */
    .ldr-paw.p1 { left: 55px;  top: 34px; }
    .ldr-paw.p3 { left: 145px; top: 36px; }
    .ldr-paw.p5 { left: 235px; top: 33px; }

    /* Toes pointing right — slight variation per paw */
    .ldr-paw.p0 img { transform: rotate(85deg); }
    .ldr-paw.p1 img { transform: rotate(95deg); }
    .ldr-paw.p2 img { transform: rotate(88deg); }
    .ldr-paw.p3 img { transform: rotate(92deg); }
    .ldr-paw.p4 img { transform: rotate(84deg); }
    .ldr-paw.p5 img { transform: rotate(96deg); }

    /* Each paw stamps in then fades — staggered */
    .ldr-paw.p0 { animation: stamp 1.8s ease infinite 0.00s; }
    .ldr-paw.p1 { animation: stamp 1.8s ease infinite 0.25s; }
    .ldr-paw.p2 { animation: stamp 1.8s ease infinite 0.50s; }
    .ldr-paw.p3 { animation: stamp 1.8s ease infinite 0.75s; }
    .ldr-paw.p4 { animation: stamp 1.8s ease infinite 1.00s; }
    .ldr-paw.p5 { animation: stamp 1.8s ease infinite 1.25s; }

    @keyframes stamp {
      0%        { opacity: 0; transform: scale(0.7); }
      6%        { opacity: 0.5; transform: scale(1); }
      40%       { opacity: 0.35; transform: scale(1); }
      70%, 100% { opacity: 0; transform: scale(1); }
    }

    .ldr-text {
      margin-top: 18px;
      color: #93a27e;
      font-family: 'Nunito', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      animation: textPulse 1s ease-in-out infinite;
    }
    @keyframes textPulse {
      0%, 100% { opacity: 0.4; }
      50%  { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  window.addEventListener('load', function() {
    setTimeout(function() {
      loader.classList.add('loaded');
      setTimeout(function() { loader.remove(); }, 500);
    }, 800);

    // Auto-detect Spanish browser — redirect to /es/ on first visit (only on English pages)
    if (!location.pathname.startsWith('/es/') && !location.pathname.includes('/admin') && !sessionStorage.getItem('wcahs_lang_offered')) {
      var lang = (navigator.language || navigator.userLanguage || '').toLowerCase();
      if (lang.startsWith('es')) {
        sessionStorage.setItem('wcahs_lang_offered', '1');
        var page = location.pathname.replace(/.*\//, '') || 'index.html';
        if (!page.endsWith('.html')) page = 'index.html';
        var esUrl = '/es/' + page + location.search + location.hash;
        // Show a small banner instead of hard redirect
        var bar = document.createElement('div');
        bar.id = 'langBar';
        bar.innerHTML = '<div style="background:#48543e;color:#fff;text-align:center;padding:10px 16px;font-family:Nunito,sans-serif;font-size:14px;position:fixed;bottom:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;"><span>Esta página está disponible en español</span><a href="'+esUrl+'" style="background:#fff;color:#48543e;padding:6px 18px;border-radius:50px;font-weight:700;font-size:13px;text-decoration:none;">Ver en Español</a><button onclick="document.getElementById(\'langBar\').remove()" style="background:none;border:none;color:#fff;opacity:0.6;cursor:pointer;font-size:18px;margin-left:8px;">&times;</button></div>';
        document.body.appendChild(bar);
      }
    }

    // Popups — construction overrides custom popup, both dismiss per-session
    fetch('/api/settings').then(function(r){return r.json();}).then(function(s) {
      var ucOn = s.under_construction === true || s.under_construction === 'true';
      var popupOn = s.popup_enabled === true || s.popup_enabled === 'true';

      // Under construction popup (priority — overrides custom)
      if (ucOn && !sessionStorage.getItem('wcahs_uc_dismissed')) {
        var uc = document.createElement('div');
        uc.id = 'constructionBanner';
        uc.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;"><div style="background:#fff;border-radius:20px;padding:36px 32px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);"><div style="font-size:40px;margin-bottom:12px;">\uD83D\uDC3E</div><h2 style="font-family:Playfair Display,serif;font-size:1.5rem;font-weight:700;color:#3b4434;margin-bottom:8px;">Pardon Our Muddy Paws!</h2><p style="color:#666;font-size:0.95rem;line-height:1.6;margin-bottom:24px;">We\'re still housebreaking this new website. You might spot a few accidents here and there \u2014 bear with us while we get everything cleaned up!</p><button onclick="document.getElementById(\'constructionBanner\').remove();sessionStorage.setItem(\'wcahs_uc_dismissed\',\'1\');" style="background:#5c6b4e;color:#fff;border:none;padding:12px 32px;border-radius:50px;font-family:Nunito,sans-serif;font-size:0.95rem;font-weight:700;cursor:pointer;">Got it, let me sniff around!</button></div></div>';
        document.body.appendChild(uc);
        return; // don't show custom popup
      }

      // Custom popup (only if construction is off) — dismiss key tied to message so new popups show
      var popupKey = 'wcahs_popup_' + s.popup_message.substring(0, 30).replace(/\W/g, '');
      if (popupOn && !ucOn && !sessionStorage.getItem(popupKey) && s.popup_message) {
        // Read custom colors (fall back to sage defaults)
        var stBg = s.popup_color_bg || '#ffffff';
        var stBtn = s.popup_color_btn || '#5c6b4e';
        var stText = s.popup_color_text || '#3b4434';
        // Auto-compute button text color for contrast
        var cr = parseInt(stBtn.slice(1,3),16), cg = parseInt(stBtn.slice(3,5),16), cb = parseInt(stBtn.slice(5,7),16);
        var stBtnText = (cr*0.299 + cg*0.587 + cb*0.114) > 150 ? '#1c1917' : '#ffffff';
        var st = { btn: stBtn, bg: stBg, text: stText, btnText: stBtnText };
        // Font
        var popupFonts = { nunito: 'Nunito,sans-serif', playfair: 'Playfair Display,serif', georgia: 'Georgia,serif', system: '-apple-system,BlinkMacSystemFont,sans-serif' };
        var popupFontCss = popupFonts[s.popup_font] || popupFonts.nunito;

        var icon = s.popup_icon || '';
        var msg = (s.popup_message || '').substring(0, 200);
        var btnText = (s.popup_button_text || '').substring(0, 40);
        var btnLink = s.popup_button_link || '';
        var btnShape = s.popup_button_shape || 'pill';
        var btnVariant = s.popup_button_variant || 'filled';
        var radius = btnShape === 'pill' ? '50px' : '12px';

        // Escape HTML in message
        var esc = document.createElement('span');
        esc.textContent = msg;
        var safeMsg = esc.innerHTML;
        esc.textContent = btnText;
        var safeBtnText = esc.innerHTML;

        var dismissFn = "document.getElementById('sitePopup').remove();sessionStorage.setItem('"+popupKey+"','1');";
        var iconHtml = icon ? '<div style="font-size:40px;margin-bottom:12px;">'+icon+'</div>' : '';
        var btnHtml = '';
        var btnStyleBase = 'padding:10px 28px;border-radius:'+radius+';font-family:'+popupFontCss+';font-size:0.9rem;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block;';
        var btnStyleFill = btnVariant === 'outline'
          ? btnStyleBase+'background:transparent;color:'+st.btn+';border:2px solid '+st.btn+';'
          : btnStyleBase+'background:'+st.btn+';color:'+st.btnText+';border:2px solid '+st.btn+';';
        if (btnText && btnLink) {
          btnHtml = '<div style="display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;"><a href="'+btnLink.replace(/"/g,'&quot;')+'" style="'+btnStyleFill+'">'+safeBtnText+'</a><button onclick="'+dismissFn+'" style="background:none;border:none;color:'+st.text+';opacity:0.5;font-size:0.8rem;cursor:pointer;font-family:'+popupFontCss+';">Dismiss</button></div>';
        } else if (btnText) {
          btnHtml = '<button onclick="'+dismissFn+'" style="'+btnStyleFill+'">'+safeBtnText+'</button>';
        } else {
          var dismissBtnStyle = btnVariant === 'outline'
            ? 'background:transparent;color:'+st.btn+';border:2px solid '+st.btn+';'
            : 'background:'+st.btn+';color:'+st.btnText+';border:2px solid '+st.btn+';';
          btnHtml = '<button onclick="'+dismissFn+'" style="'+dismissBtnStyle+'padding:8px 24px;border-radius:'+radius+';font-family:'+popupFontCss+';font-size:0.85rem;font-weight:600;cursor:pointer;">Dismiss</button>';
        }
        var closeX = '<button onclick="'+dismissFn+'" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;color:'+st.text+';opacity:0.4;cursor:pointer;line-height:1;" aria-label="Close">&times;</button>';

        var popup = document.createElement('div');
        popup.id = 'sitePopup';
        popup.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;"><div style="background:'+st.bg+';border-radius:20px;padding:36px 32px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);position:relative;">'+closeX+iconHtml+'<p style="color:'+st.text+';font-size:0.95rem;line-height:1.6;margin-bottom:24px;font-family:'+popupFontCss+';">'+safeMsg+'</p>'+btnHtml+'</div></div>';
        document.body.appendChild(popup);
      }
    }).catch(function(){});
  });

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href && (href.endsWith('.html') || href.indexOf('.html?') !== -1 || href.indexOf('.html#') !== -1) && !href.startsWith('http')) {
      e.preventDefault();
      var el = document.getElementById('pageLoader');
      if (el) {
        el.classList.remove('loaded');
        el.style.display = '';
        setTimeout(function() { window.location.href = href; }, 400);
      } else {
        window.location.href = href;
      }
    }
  });

})();
