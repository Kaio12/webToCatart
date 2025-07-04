const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const socketIo = require('socket.io');
const cors = require('cors');
const qrcode = require('qrcode');
const ngrok = require('ngrok');

require('dotenv').config(); // Charge les variables d'environnement depuis .env

// === CONFIGURATION ===
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const LOG_FOLDER = path.join(__dirname, 'logs');
const STATIC_FOLDER = path.join(__dirname, 'static');
const PORT = 5001;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(STATIC_FOLDER));
app.use('/public', express.static(PUBLIC_FOLDER));


if (!fs.existsSync(UPLOAD_FOLDER)) fs.mkdirSync(UPLOAD_FOLDER);
if (!fs.existsSync(LOG_FOLDER)) fs.mkdirSync(LOG_FOLDER);
if (!fs.existsSync(PUBLIC_FOLDER)) fs.mkdirSync(PUBLIC_FOLDER);

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
let ngrokUrl = ''; 

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

// API: Serve audio
app.get('/audio/:filename', (req, res) => {
  res.sendFile(path.join(UPLOAD_FOLDER, req.params.filename));
});

app.get('/api/points', (req, res) => {
  const pointsPath = path.join(PUBLIC_FOLDER, 'points.json');
  fs.readFile(pointsPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Erreur de lecture du fichier points.json:', err);
      return res.status(404).json({ error: 'Fichier points.json non trouvé' });
    }
    try {
      res.status(200).json(JSON.parse(data));
    } catch (parseError) {
      console.error('Erreur de parsing du fichier points.json:', parseError);
      res.status(500).json({ error: 'Erreur de parsing du fichier points.json' });
    }
  });
});

// API: Serve mlp_model
app.get('/mlp_model', (req, res) => {
  res.sendFile(path.join(UPLOAD_FOLDER, 'mlp_model.json'));
});

// génère et affiche le QR code
app.get('/qr', async (req, res) => {
  // 2. UTILISEZ directement la variable ngrokUrl
  if (ngrokUrl) {
    try {
      const qrCodeDataUrl = await qrcode.toDataURL(ngrokUrl);
      res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR Code de Connexion</title>
          <style>
            body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; background-color: #f0f0f0; margin: 0; }
            h1 { color: #333; }
            p { color: #555; }
            img { border: 5px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
          </style>
        </head>
        <body>
          <h1>Scannez pour vous connecter</h1>
          <img src="${qrCodeDataUrl}" alt="QR Code">
          <p>URL : <a href="${ngrokUrl}" target="_blank">${ngrokUrl}</a></p>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send("<h1>Erreur lors de la génération du QR Code.</h1>");
    }
  } else {
    res.status(404).send("<h1>Erreur : Tunnel ngrok non encore initialisé.</h1><p>Veuillez patienter quelques secondes et rafraîchir la page.</p>");
  }
});

// === SOCKET.IO ===
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }});


// Logging
function log_browser_data(data, is_osc = false) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOG_FOLDER, 'hover_data.csv');
  const entry_type = is_osc ? "OSC" : "MSG";
  fs.appendFileSync(logFile, `${timestamp},${entry_type},${JSON.stringify(data)}\n`);
}

// OSC Routing (version simplifiée et logique)
function route_osc(data) {
  const address = data.address || "";
  if (!address) {
    console.warn("Message OSC reçu sans adresse.");
    return;
  }
  console.log(`Routage OSC: ${address} -> /max`);
  io.of('/max').emit('to_max', data);
}

// Namespaces
const browser = io.of('/browser');
const max = io.of('/max');

// Communication côté navigateur
browser.on('connection', (socket) => {
  socket.on('osc', (data) => {
    console.log('Received OSC from browser:', JSON.stringify(data, null, 2));
    log_browser_data(data, true);
    route_osc(data);
  });
});


// === SERVER START ===
function startServer() {
  server.listen(PORT, () => {
    console.log(`Serveur HTTP local lancé sur http://localhost:${PORT}`);
    
    // On vérifie d'abord si une URL externe est fournie
    if (process.env.NGROK_URL) {
      ngrokUrl = process.env.NGROK_URL;
      console.log(`URL Ngrok externe définie : ${ngrokUrl}`);
      console.log(`Accédez à http://localhost:${PORT}/qr pour voir le QR code.`);
    } else {
      // Sinon, on essaie le mode automatique (votre code actuel)
      console.log("Tentative de lancement automatique de Ngrok...");
      startNgrokTunnel();
    }
  });
}

// Fonction séparée pour le lancement automatique de Ngrok
async function startNgrokTunnel() {
  try {
    console.log("--- Début du débogage Ngrok ---");
    console.log(`Valeur de NGROK_AUTHTOKEN: ${process.env.NGROK_AUTHTOKEN}`);
    console.log(`Valeur de NGROK_STATIC_DOMAIN: ${process.env.NGROK_STATIC_DOMAIN}`);
    console.log("--- Fin du débogage Ngrok ---");

    const url = await ngrok.connect({
      proto: 'http',
      addr: PORT,
      authtoken: process.env.NGROK_AUTHTOKEN,
      domain: process.env.NGROK_STATIC_DOMAIN
    });
    ngrokUrl = url;
    console.log(`Tunnel Ngrok automatique ouvert : ${ngrokUrl}`);
    console.log(`Accédez à http://localhost:${PORT}/qr pour voir le QR code.`);
  } catch (error) {
    console.error("Erreur lors de l'ouverture automatique du tunnel Ngrok :", error);
    console.error("Vous pouvez utiliser le mode manuel :");
    console.error("1. Lancez 'ngrok http 5001 --domain prawn-model-mostly.ngrok-free.app' dans un autre terminal");
    console.error("2. Relancez le serveur avec : NGROK_URL='https://prawn-model-mostly.ngrok-free.app' node serveur_node.js");
  }
}

startServer();
