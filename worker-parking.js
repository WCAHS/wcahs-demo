const LOGO_B64 = "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";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WCAHS - Coming Soon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Nunito', sans-serif;
      background: linear-gradient(135deg, #3b4434 0%, #5c6b4e 40%, #758762 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: #fff;
    }
    .container { text-align: center; max-width: 520px; }
    .logo { height: 60px; margin-bottom: 24px; filter: brightness(2); }
    .paws { font-size: 48px; margin-bottom: 16px; animation: wiggle 2s ease-in-out infinite; }
    @keyframes wiggle {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(-5deg); }
      75% { transform: rotate(5deg); }
    }
    h1 { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; margin-bottom: 12px; line-height: 1.2; }
    h1 span { color: #fde68a; }
    .subtitle { font-size: 1.1rem; color: #d2d8c8; margin-bottom: 32px; line-height: 1.6; }
    .contact-box {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(8px);
      border-radius: 16px;
      padding: 24px;
      border: 1px solid rgba(255,255,255,0.15);
    }
    .contact-box p { color: #e8ebe3; font-size: 0.9rem; margin-bottom: 12px; }
    .contact-box a { color: #fde68a; text-decoration: none; font-weight: 700; }
    .contact-box a:hover { text-decoration: underline; }
    .social { margin-top: 12px; display: flex; justify-content: center; gap: 16px; }
    .social a { color: #d2d8c8; font-size: 0.85rem; font-weight: 600; }
    .footer { margin-top: 40px; color: #93a27e; font-size: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    <img src="data:image/png;base64,${LOGO_B64}" alt="WCAHS Logo" class="logo">
    <div class="paws">\u{1F43E}</div>
    <h1>Our Paws Are a Little <span>Muddy</span></h1>
    <p class="subtitle">
      Please excuse the mess while we roll around in a fresh new website!
      We're working hard behind the scenes to bring you a better experience.
      We'll be back on our paws in no time.
    </p>
    <div class="contact-box">
      <p>In the meantime, you can still reach us:</p>
      <p><a href="tel:5072017287">(507) 201-7287</a></p>
      <div class="social">
        <a href="https://facebook.com/WasecaCAHS/" target="_blank">Facebook \u2192</a>
      </div>
    </div>
    <p class="footer">&copy; 2026 Waseca County Animal Humane Society &bull; Waseca, MN 56093</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}
