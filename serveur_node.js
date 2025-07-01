const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const socketIo = require('socket.io');
const cors = require('cors');

// === CONFIGURATION ===
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');
const LOG_FOLDER = path.join(__dirname, 'logs');
const STATIC_FOLDER = path.join(__dirname, 'static');
const SECRET_KEY = 'philippe';
const PORT = 5001;

// SSL (utilise tes cert.pem et key.pem générés avec mkcert)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
};

// === APP SETUP ===
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(STATIC_FOLDER));
const upload = multer({ dest: UPLOAD_FOLDER });

if (!fs.existsSync(UPLOAD_FOLDER)) fs.mkdirSync(UPLOAD_FOLDER);
if (!fs.existsSync(LOG_FOLDER)) fs.mkdirSync(LOG_FOLDER);

// === UTILS ===
function getLocalIp() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}
const local_ip = getLocalIp();

// === ROUTES ===

// Manifest & Service Worker
app.get('/manifest.json', (req, res) => res.sendFile(path.join(STATIC_FOLDER, 'manifest.json')));
app.get('/service-worker.js', (req, res) => res.sendFile(path.join(STATIC_FOLDER, 'service-worker.js')));
app.get('/icons/:filename', (req, res) => res.sendFile(path.join(STATIC_FOLDER, 'icons', req.params.filename)));

// Main pages
app.get('/', (req, res) => res.sendFile(path.join(STATIC_FOLDER, 'index.html')));
app.get('/effect', (req, res) => res.sendFile(path.join(STATIC_FOLDER, 'gestion_effet.html')));

// API: IP
app.get('/api/ip', (req, res) => res.json({ ip: local_ip }));

// API: Delete log
app.post('/delete', (req, res) => {
  const logFile = path.join(LOG_FOLDER, 'hover_data.csv');
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
    console.log(`Fichier log supprimé: ${logFile}`);
  } else {
    console.log('Fichier log non trouvé');
  }
  res.sendFile(path.join(STATIC_FOLDER, 'index.html'));
});

// API: Points
let catched_points = null;
app.get('/catched_points', (req, res) => {
  if (catched_points) {
    try {
      res.status(200).json(JSON.parse(catched_points));
    } catch {
      res.status(200).json(catched_points);
    }
  } else {
    res.status(204).json({ status: "empty", message: "No points available" });
  }
});

// API: Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file part" });
  if (!req.file.originalname) return res.status(400).json({ error: "No selected file" });
  // Optionally rename/move file here
  res.json({ status: "ok", filename: req.file.originalname });
});

// API: Serve audio
app.get('/audio/:filename', (req, res) => {
  res.sendFile(path.join(UPLOAD_FOLDER, req.params.filename));
});

// API: Serve mlp_model
app.get('/mlp_model', (req, res) => {
  res.sendFile(path.join(UPLOAD_FOLDER, 'mlp_model.json'));
});

// API: Receive data (POST)
app.post('/api/data', (req, res) => {
  catched_points = JSON.stringify(req.body);
  if (catched_points) {
    console.log('Reçu données via HTTP POST:', catched_points);
    res.status(200).json({ status: "ok", message: "Données reçues et stockées" });
  } else {
    res.status(400).json({ status: "error", message: "Aucune donnée reçue" });
  }
});

// === SOCKET.IO ===
const server = https.createServer(sslOptions, app);
const io = socketIo(server, { cors: { origin: "*" } });

// Table de routage OSC
const TABLE_ROUTING = {
  "/iphone/": "/browser",
  "/ipad/": "/max",
  "/max/": "/browser"
};

// Logging
function log_browser_data(data, is_osc = false) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOG_FOLDER, 'hover_data.csv');
  const entry_type = is_osc ? "OSC" : "MSG";
  fs.appendFileSync(logFile, `${timestamp},${entry_type},${JSON.stringify(data)}\n`);
}

// OSC Routing
function route_osc(data) {
  const address = data.address || "";
  for (const prefix in TABLE_ROUTING) {
    if (address.startsWith(prefix)) {
      io.of(TABLE_ROUTING[prefix]).emit('to_' + TABLE_ROUTING[prefix].replace('/', ''), data);
      return;
    }
  }
  io.of('/browser').emit('to_browser', data);
}

// Namespaces
const browser = io.of('/browser');
const max = io.of('/max');

// Communication côté navigateur
browser.on('connection', (socket) => {
  socket.on('message', (data) => {
    console.log('Received message from browser:', data);
    log_browser_data(data);
    max.emit('to_max', data);
  });
  socket.on('osc', (data) => {
    console.log('Received OSC from browser:', JSON.stringify(data, null, 2));
    log_browser_data(data, true);
    route_osc(data);
  });
});

// Communication côté Max/MSP
max.on('connection', (socket) => {
  socket.on('message', (data) => {
    catched_points = typeof data === 'string' ? data : JSON.stringify(data);
    console.log('Données brutes reçues de Max/MSP:', data);
    browser.emit('to_browser', catched_points);
  });
  socket.on('osc', (data) => {
    console.log('Received OSC from Max/MSP:', JSON.stringify(data, null, 2));
    route_osc(data);
  });
});

// === SERVER START ===
server.listen(PORT, () => {
  console.log(`Serveur HTTPS Node.js lancé sur https://${local_ip}:${PORT}`);
});