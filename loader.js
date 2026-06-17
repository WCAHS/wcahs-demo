// Paw print trail loader — prints stamp down one at a time, left to right, then fade
(function() {
  var loader = document.createElement('div');
  loader.id = 'pageLoader';
  loader.innerHTML = `
    <div class="ldr-trail">
      <div class="ldr-paw p0"><img src="images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p1"><img src="images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p2"><img src="images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p3"><img src="images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p4"><img src="images/paws/paw_01.png" alt=""></div>
      <div class="ldr-paw p5"><img src="images/paws/paw_01.png" alt=""></div>
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
  });

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href && href.endsWith('.html') && !href.startsWith('http')) {
      e.preventDefault();
      var el = document.getElementById('pageLoader');
      if (el) {
        el.classList.remove('loaded');
        el.style.display = '';
      }
      setTimeout(function() { window.location.href = href; }, 500);
    }
  });
})();
