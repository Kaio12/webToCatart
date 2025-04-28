document.addEventListener('DOMContentLoaded', () => {
  const toggleleft = document.getElementById('toggle-left');
  const sidebarleft = document.getElementById('sidebarleft');
  const toggleright = document.getElementById('toggle-right');
  const sidebarright = document.getElementById('sidebarright');
  const body = document.body;

  // bouton Fullscreen
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // bouton Delete log
  document.getElementById("delete-log").addEventListener("click", () => {
    fetch("/delete", { method: "POST" })
      .then(response => {
        if (response.ok) {
          console.log("Fichier supprimé !");
        } else {
          console.error("Erreur lors de la suppression.");
        }
      });
  });

  // bouton demande points (en cas de rechargement, à automatiser)
  document.getElementById("ask-points").addEventListener("click", () => {
    fetch("/catched_points", { method: "GET" })
      .then(response => {
        if (response.ok) {
          console.log("Points demandés au serveur.");
        } else {
          console.error("Erreur lors de la demande des points.");
        }
      })
      .catch(error => {
        console.error("Erreur réseau :", error);
      });
  });

// bouton demande fichier son
document.getElementById("ask-soundfile").addEventListener("click", () => {
  fetch("/soundfile", { method: "GET" })
    .then(response => {
      if (response.ok) {
        console.log("fichier son demandé au serveur");
      } else {
        console.error("Erreur lors de la demande du fichier son.");
      }
      })
      .catch(error => {
        console.error("Erreur réseau:", error);
      });
    });

  // bouton barres latérales
  toggleleft.addEventListener('click', () => {
    sidebarleft.classList.toggle('hidden');
    body.classList.toggle('sidebarleft-hidden');
  });
  toggleright.addEventListener('click', () => {
    sidebarright.classList.toggle('hidden');
    body.classList.toggle('sidebright-hidden');
  });

  // NexusUI Sliders
  let multisliderRight = new Nexus.Multislider('#multisliderRight', {
    'size': [200, 600],
    'numberOfSliders': 3,
    'min': 0,
    'max': 1,
    'step': 0,
    'candycane': 3,
    'values': [0.9, 0.8, 0.7],
    'smoothing': 0,
    'mode': 'bar',
  });
  multisliderRight.colorize("accent", "#ff0");
  multisliderRight.colorize("fill", "#333");
  multisliderRight.on('change', function (v) {
    console.log(v);
    sendOSC("/multisliderRight", v);
  });

  let multisliderLeft = new Nexus.Multislider('#multisliderLeft', {
    'size': [200, 600],
    'numberOfSliders': 3,
    'min': 0,
    'max': 1,
    'step': 0,
    'candycane': 3,
    'values': [0.9, 0.8, 0.7],
    'smoothing': 0,
    'mode': 'bar',
  });
  multisliderLeft.colorize("accent", "#ff0");
  multisliderLeft.colorize("fill", "#333");
  multisliderLeft.on('change', function (v) {
    console.log(v);
    sendOSC("/multisliderLeft", v);
  });

  // initialisation du canvas Pixi 
  setupPixi();
});

// === Envoie messages OSC via socket.io ===
let sendOSC = function (address, args) {
  if (socket && socket.connected) {
    console.log("Sending OSC:", address, args);
    socket.emit('osc', { address, args });
  } else {
    console.error("Socket not connected.");
  }
};

// === Fonctions utilitaires ===
// Calcule les limites (min et max) des coordonnées et des valeurs pour un ensemble de points
function getBounds(data) {
  let xs = data.map(p => p.x);
  let ys = data.map(p => p.y);
  let ls = data.map(p => p.loudnessMax);
  let es = data.map(p => p.energyMax);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    lMin: Math.min(...ls),
    lMax: Math.max(...ls),
    eMin: Math.min(...es),
    eMax: Math.max(...es)
  };
}

// Convertit une couleur HSL en format hexadécimal
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));

  return (f(0) << 16) + (f(1) << 8) + f(2);
}
// Convertit une couleur HSL en valeurs RGB
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [r, g, b];
}

// === Configuration de Pixi.js pour le rendu graphique ===
let pixiPoints = [];
let pointerPos = { x: -9999, y: -9999 };
const proximityThreshold = 80;
const cooldown = 300;
const baseWidth = 800;
const baseHeight = 800;
let data = [];

// Initialise et configure l'application Pixi.js pour le rendu interactif
async function setupPixi() {
  const app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0xffffff
  });
  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);
  app.stage.interactive = true;
  app.stage.on("pointermove", (e) => {
    pointerPos = e.data.global;
  });
// au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    drawPixiPoints(data, app);
  });

  app.ticker.add(updatePixiPoints.bind(null, app));
  window.pixiApp = app; // expose app if needed globally
}

function drawPixiPoints(pointsData, app) {
  if (!app) {console.error("pixi pas initialisée");
    return;}
  if (!Array.isArray(pointsData) || pointsData.length === 0) {
      console.warn("Aucune donnée à afficher.");
      return;
    }
  app.stage.removeChildren();
  pixiPoints.length = 0;

  const bounds = getBounds(pointsData);
  console.log("📊 BOUNDS calculés :", bounds);

  const scaleX = window.innerWidth / baseWidth;
  const scaleY = window.innerHeight / baseHeight;

  const mapRange = (val, inMin, inMax, outMin, outMax) =>
    ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

  pointsData.forEach((p, index) => {
    const g = new PIXI.Graphics();

    const radius = mapRange(p.loudnessMax, bounds.lMin, bounds.lMax, 5, 20);
    const hue = mapRange(p.energyMax, bounds.eMin, bounds.eMax, 240, 0);
    const [r, gVal, b] = hslToRgb(hue / 360, 1, 0.5);
    const color = (r * 255 << 16) + (gVal * 255 << 8) + (b * 255) | 0;
    g.x = mapRange(p.x, bounds.xMin, bounds.xMax, 50, window.innerWidth - 50);
    g.y = mapRange(p.y, bounds.yMin, bounds.yMax, window.innerHeight - 50, 50);

    g.baseRadius = radius;
    g.currentRadius = radius;
    g.targetRadius = radius;
    g.lastTrigger = 0;
    g.sampleId = p.sampleId;
    g.color = color;

    g.drawSelf = function () {
      this.clear();
      this.beginFill(this.color);
      this.drawCircle(0, 0, this.currentRadius);
      this.endFill();
    };

    console.log(`🟡 Point ${index}:`, {
      originalX: p.x,
      originalY: p.y,
      mappedX: g.x,
      mappedY: g.y,
      radius: radius
    });
    g.drawSelf();
    app.stage.addChild(g);
    pixiPoints.push(g);
  });
}

function updatePixiPoints(app) {
  const now = performance.now();

  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - pointerPos.x, point.y - pointerPos.y);

    if (dist < proximityThreshold) {
      point.targetRadius = point.baseRadius * 1.8;

      if (now - point.lastTrigger > cooldown) {
        sendOSC("/hover", point.sampleId);// point.sampleId
        point.lastTrigger = now;
      }
    } else {
      point.targetRadius = point.baseRadius;
    }

    const speed = 0.2;
    point.currentRadius += (point.targetRadius - point.currentRadius) * speed;
    point.drawSelf();
  }
}

// === Connexion socket.io avec Max/MSP ===
let socket;
fetch("/api/ip")
  .then(response => response.json())
  .then(data => {
    socket = io(`http://${data.ip}:5001/browser`);//renvoie l'adresse ip
    window.socket = socket;

    socket.on('connect', () => {
      console.log("✅ Connecté à", data.ip);
      loadPoints(); // Charger les points une fois connecté
    });
  });

// fonction pour charger les points via HTTP
async function loadPoints() {
  try {
    const response = await fetch("/catched_points");
    if (!response.ok) {
      console.error("Erreur HTTP:", response.status);
      return;
    }
    const rawData = await response.json();

    if (rawData.type === "points" && Array.isArray(rawData.points)) {
      const parsed = rawData.points.map(point => ({
        x: parseFloat(point.x),
        y: parseFloat(point.y),
        sampleId: point.sampleId,
        loudnessMax: parseFloat(point.loudnessmax),
        energyMax: parseFloat(point.energymax)
      })).filter(p => !isNaN(p.x) && !isNaN(p.y));
      
      data = parsed;
      drawPixiPoints(data, window.pixiApp);
    } else if (rawData.type === "soundfile") {
      console.log("🎵 Reçu un fichier son : ", rawData.filename);
    } else {
      console.warn("Type de données inconnu :", rawData);
    }
  } catch (error) {
    console.error("Erreur de chargement des points:", error);
  }
}