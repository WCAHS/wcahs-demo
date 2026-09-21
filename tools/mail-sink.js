#!/usr/bin/env node
/**
 * A stand-in for Resend, for local testing only.
 *
 *   node tools/mail-sink.js            # listens on 8790
 *
 * Point the dev server at it by adding these to .dev.vars:
 *   RESEND_API_KEY=local-fake-key
 *   RESEND_BASE_URL=http://127.0.0.1:8790
 *
 * Anything the site tries to email lands in tools/mail-out/ as a .html file you
 * can open in a browser, and nothing leaves this machine. Never set
 * RESEND_BASE_URL in production — sendNotification/sendAutoReply fall back to
 * the real api.resend.com when it's unset.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8790);
const OUT = path.join(__dirname, 'mail-out');
fs.mkdirSync(OUT, { recursive: true });

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: body }; }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const who = String(parsed.to || 'unknown').replace(/[^a-z0-9@._-]/gi, '_').slice(0, 60);
    const base = path.join(OUT, `${stamp}__${who}`);

    fs.writeFileSync(`${base}.json`, JSON.stringify({
      url: req.url, from: parsed.from, to: parsed.to, subject: parsed.subject,
    }, null, 2));
    if (parsed.html) {
      fs.writeFileSync(`${base}.html`,
        `<!-- To: ${parsed.to} | Subject: ${parsed.subject} -->\n${parsed.html}`);
    }

    console.log(`\n✉  CAPTURED (not sent)`);
    console.log(`   to:      ${parsed.to}`);
    console.log(`   subject: ${parsed.subject}`);
    console.log(`   file:    ${base}.html`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'local-capture-' + stamp }));
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`mail sink listening on http://127.0.0.1:${PORT} → ${OUT}`);
});
