// LAN Classroom server. Run: npm install && npm start  (or double-click start.bat)
const express = require('express'), https = require('https'), fs = require('fs');
const path = require('path'), os = require('os'), crypto = require('crypto');
const selfsigned = require('selfsigned'), QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PIN = process.env.ADMIN_PIN || '1234';   // change this!
const PORT = process.env.PORT || 3000;
// When packaged as .exe, save data next to the .exe; otherwise next to server.js
const base = process.pkg ? path.dirname(process.execPath) : __dirname;
const up = path.join(base, 'uploads');
fs.mkdirSync(up, { recursive: true });

// Screen capture needs HTTPS, so we create a self-signed certificate once.
const certFile = path.join(base, 'cert.json');
if (!fs.existsSync(certFile)) {
  const p = selfsigned.generate([{ name: 'commonName', value: 'lan-classroom' }], { days: 3650, keySize: 2048 });
  fs.writeFileSync(certFile, JSON.stringify({ key: p.private, cert: p.cert }));
}
const { key, cert } = JSON.parse(fs.readFileSync(certFile));

const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i.family === 'IPv4' && !i.internal).map(i => 'https://' + i.address + ':' + PORT);
const tokens = new Map(); // student upload token -> student id

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(up));
app.get('/api/info', (req, res) => res.json({ urls: lanUrls() }));
app.get('/qr.svg', async (req, res) => {
  res.type('image/svg+xml').send(await QRCode.toString(String(req.query.t || '').slice(0, 300), { type: 'svg', margin: 1 }));
});
app.post('/upload', express.raw({ type: '*/*', limit: '500mb' }), (req, res) => {
  if (req.get('x-pin') !== PIN && !tokens.has(req.get('x-token'))) return res.status(403).end();
  const name = path.basename(String(req.query.name || 'file'));
  const stored = Date.now().toString(36) + '-' + name;   // avoids overwriting same-named files
  fs.writeFileSync(path.join(up, stored), req.body);
  res.json({ name, url: '/files/' + encodeURIComponent(stored) });
});

const server = https.createServer({ key, cert }, app);
const wss = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 });
const students = new Map(); // id -> {ws, name, sharing, token}
const admins = new Set();
let nextId = 1;
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const pushList = () => {
  const list = [...students].map(([id, s]) => ({ id, name: s.name, sharing: s.sharing }));
  admins.forEach(a => send(a, { t: 'list', students: list }));
};

wss.on('connection', ws => {
  let id = null, isAdmin = false;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'admin') {
      if (m.pin !== PIN) return send(ws, { t: 'denied' });
      isAdmin = true; admins.add(ws); send(ws, { t: 'ok' }); pushList();
    } else if (m.t === 'hello' && !isAdmin) {
      id = String(nextId++);
      const token = crypto.randomBytes(8).toString('hex'); tokens.set(token, id);
      students.set(id, { ws, name: String(m.name || 'Student').slice(0, 40), sharing: false, token });
      send(ws, { t: 'you', token }); pushList();
    } else if (m.t === 'frame' && id) {
      const s = students.get(id);
      if (!s.sharing) { s.sharing = true; pushList(); }
      admins.forEach(a => send(a, { t: 'frame', id, img: m.img }));
    } else if (m.t === 'stopped' && id) {
      students.get(id).sharing = false; pushList();
    } else if (m.t === 'share' && id && String(m.url).startsWith('/files/')) {
      // A student shares a file with the admin, or with everyone
      const cmd = { type: 'file', name: String(m.name).slice(0, 120), url: String(m.url), from: students.get(id).name };
      admins.forEach(a => send(a, { t: 'cmd', cmd }));
      if (m.to === 'all') students.forEach((s, sid) => sid !== id && send(s.ws, { t: 'cmd', cmd }));
    } else if (m.t === 'cmd' && isAdmin) {
      const targets = m.to === 'all' ? [...students.keys()] : (m.to || []);
      targets.forEach(t => students.has(t) && send(students.get(t).ws, { t: 'cmd', cmd: m.cmd }));
    }
  });
  ws.on('close', () => {
    admins.delete(ws);
    if (id) { tokens.delete(students.get(id).token); students.delete(id); pushList(); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nLAN Classroom is running. Admin PIN:', PIN);
  lanUrls().forEach(u => console.log('  Open on any device:  ' + u));
  console.log('(Accept the browser security warning once: it is your own server.)\n');
});
