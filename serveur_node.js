const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const qrcode = require('qrcode');
const WebSocket = require('ws');
const { Server: OscServer, Client: OscClient } = require('node-osc');



const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'secrets','ggkey.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'secrets','gg.pem'))
};

require('dotenv').config(); // Charge les variables d'environnement depuis .env

// === CONFIGURATION ===
const UPLOAD_FOLDER = path.join(__dirname, 'uploads');
const PUBLIC_FOLDER = path.join(__dirname, 'public');
const STATIC_FOLDER = path.join(__dirname, 'static');
const PORT = 5001;
const OSC_LISTEN_PORT = 9000;

// destination pour les messages vers max
const MAX_HOST = process.env.MAX_HOST;
const MAX_PORT = process.env.MAX_PORT;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(STATIC_FOLDER));
app.use('/public', express.static(PUBLIC_FOLDER));


if (!fs.existsSync(UPLOAD_FOLDER)) fs.mkdirSync(UPLOAD_FOLDER);
if (!fs.existsSync(PUBLIC_FOLDER)) fs.mkdirSync(PUBLIC_FOLDER);


const formesLibresPath = path.join(PUBLIC_FOLDER, 'formesLibres.JSON');

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


// sert la liste des fichiers de type audio enrN.wav => audiofiles
app.get('/api/listaudiofiles', (req, res) => {
  fs.readdir(PUBLIC_FOLDER, (err, files) => {
    if (err) return res.status(500).json({ error: 'Erreur lecture dossier' });
    // Filtre les fichiers audio (wav, mp3, etc.)
    const audioFiles = files.filter(f => /^enr\d\.(wav|mp3|ogg)$/i.test(f));
    res.json(audioFiles);
  });
});

  // sert le fichier json des formes libres
app.get('/api/formesLibres', (req, res) => {
  fs.readFile('public/formesLibres.JSON', 'utf8', (err, data) => {
    if (err) 
      {
        if (err.code === 'ENOENT') return res.json([]);
        return res.status(500).json({ error: 'Erreur lecture fichier'});
      }
      
    res.json(data);
    });
});

// sert la liste des fichiers enrN.json (points) => jsonfiles
app.get('/api/listpointsjsonfiles', (req,res) => {
  fs.readdir(PUBLIC_FOLDER, (err, files) => {
    if (err) return res.status(500).json({ error: 'Erreur lecture dossier json' });
    const pointsJsonFiles = files.filter(f => /^enr\d+\.json$/i.test(f));
    res.json(pointsJsonFiles);
  });
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
  const localIp = getLocalIp();

  if (localIp) {
    const localUrl = `https://${localIp}:${PORT}`;
    const effectUrl = `https://${localIp}:${PORT}/effect`;
    try {
      const qrCodeDataUrl = await qrcode.toDataURL(localUrl);
      const qrCodeEffectUrl = await qrcode.toDataURL(effectUrl);
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
          <h1>Scannez pour vous connecter a l'appli principale</h1>
          <img src="${qrCodeDataUrl}" alt="QR Code">
          <p>URL : <a href="${localUrl}" target="_blank">${localUrl}</a></p>

          <h1>Scannez pour vous connecter à la page de gestion de l'effet Faust</h1>
          <img src="${qrCodeEffectUrl}" alt="QR Code Effect">
          <p> URL : <a href="${effectUrl}" target="_blank">${effectUrl}</a></p>
        </body>
        </html>
      `);
    } catch (error) {
      res.status(500).send("<h1>Erreur lors de la génération du QR Code.</h1>");
    }
  } else {
    res.status(404).send("<h1>Erreur : impossible de déterminer l'adresse ip locale.</h1><p>Assurez-vous d'être connecté à un réseau.</p>");
  }
});

// === serveur https ===
const server = https.createServer(httpsOptions, app);

// === serveur webSocket ===
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info) => {
    console.log(`Tentative de connexion WebSocket depuis: ${info.req.socket.remoteAddress}`);
    console.log(`Headers:`, info.req.headers);
    return true; // Accepter toutes les connexions pour le débogage
  }
});
let webClientSocket = null;

wss.on('connection', (ws, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`Client WebSocket connecté depuis: ${clientIp}`);
  console.log(`URL demandée: ${request.url}`);
  console.log(`Host header: ${request.headers.host}`);
  console.log('Client websocket connecté');
  webClientSocket = ws;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'osc-to-max' && data.address) {
        console.log(`relai vers max: ${data.address}`, data.args);
        maxClient.send(data.address, ...data.args);
      } else if 
        (data.type === 'osc-to-browser' && data.address) {
          console.log(`relai vers browser: ${data.address}`, data.args)
          webClientSocket.send(JSON.stringify({
            type: 'osc-from-server',
            address: data.address,
            args: data.args
          }));
        } else {

          // data.type? construction fichier json a partir du message recu
          const data = JSON.parse(message);
          console.log('Forme libre reçue:', data);
          
          let formesLibres = [];

if (fs.existsSync(formesLibresPath)) {
  // Le fichier existe, on lit et ajoute le nouveau message
  try {
    const fileContent = fs.readFileSync(formesLibresPath, 'utf8');
    formesLibres = JSON.parse(fileContent);
    if (!Array.isArray(formesLibres)) formesLibres = [];
  } catch (e) {
    console.error('Erreur lecture/parsing formesLibres.JSON:', e);
    formesLibres = {};
  }
} else {
  // Le fichier n'existe pas, on le crée vide
  fs.writeFileSync(formesLibresPath, '[]', 'utf8');
  formesLibres = [];
}

// Ajoute le nouveau message JSON
formesLibres.push(data);

// Sauvegarde le tableau mis à jour
try {
  fs.writeFileSync(formesLibresPath, JSON.stringify(formesLibres, null, 2), 'utf8');
  console.log('Forme libre ajoutée à formesLibres.JSON');
} catch (e) {
  console.error('Erreur écriture formesLibres.JSON:', e);
}
        }
      
     } catch(e) {
        console.error("erreur de parsing du mes ws", e);
      }
    });

    ws.on('close', () => {
      console.log('Client ws déconnecté');
      webClientSocket = null;
    });
  });


  // === OSC : écoute TouchOSC ===
const oscServer = new OscServer(OSC_LISTEN_PORT, '0.0.0.0', () => {
  console.log(`serveur osc écoute ToucOSC sur le port UDP ${OSC_LISTEN_PORT}`);
  });

oscServer.on('message', (msg) => {
  const [address, ...args] = msg;
  console.log(`message OSC recu de TouchOsc: ${address}`, args);

  // relai vers browser
  if(webClientSocket && webClientSocket.readyState === WebSocket.OPEN) {
    webClientSocket.send(JSON.stringify({ type: 'osc-from-server', address, args }));
  }
});





//=== OSC lien max ===
const maxClient = new OscClient(MAX_HOST, MAX_PORT);
console.log(`Client OSC prêt à envoyer vers max sur ${MAX_HOST}:${MAX_PORT}`);

// === SERVER START ===
function startServer() {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`Serveur HTTP local lancé sur https://localhost:${PORT}`);
    console.log(`page effect sur https://localhost:${PORT}/effect`);
    if (localIp) {
      const localUrl = `https://${localIp}:${PORT}`;
      console.log(`pour ipad: ${localUrl}`);
      console.log (`lien qr code: ${localUrl}/qr` );
      console.log(`lien vers la page effect: https://${localIp}:${PORT}/effect`)
     } else {
        console.warn ('impossible de déterminer ip locale');
      }
  });
}

startServer();
