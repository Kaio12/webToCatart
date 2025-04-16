document.addEventListener('DOMContentLoaded', () => {
  const toggleleft = document.getElementById('toggle-left');
  const sidebarleft = document.getElementById('sidebarleft');
  const toggleright = document.getElementById('toggle-right');
  const sidebarright = document.getElementById('sidebarright');
  const body = document.body;

  // Fullscreen button
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Delete log button
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

  // Ask points button
  document.getElementById("ask-points").addEventListener("click", () => {
    fetch("/catched_points", { method: "GET" })
      .then(response => {
        if (response.ok) {
          console.log("✅ Points demandés au serveur !");
        } else {
          console.error("❌ Erreur lors de la demande des points.");
        }
      })
      .catch(error => {
        console.error("❌ Erreur réseau :", error);
      });
  });

  // Sidebar toggle
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

  // Init Pixi canvas
  setupPixi();
});

// === OSC socket communication ===
let sendOSC = function (address, args) {
  if (socket && socket.connected) {
    console.log("Sending OSC:", address, args);
    socket.emit('osc', { address, args });
  } else {
    console.error("Socket not connected.");
  }
};

// === Utilitaires ===
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

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));

  return (f(0) << 16) + (f(1) << 8) + f(2);
}


// === Pixi.js Setup ===
let app;
let pixiPoints = [];
let pointerPos = { x: -9999, y: -9999 };
const proximityThreshold = 80;
const cooldown = 300;
const baseWidth = 800;
const baseHeight = 800;
let data = [];

function setupPixi() {
  app = new PIXI.Application();
  app.init({
    resizeTo: window,
    backgroundColor: 0xffffff
  }).then(() => {
    const container = document.getElementById("pixi-container");
    if (container) container.appendChild(app.canvas);

    app.stage.interactive = true;
    app.stage.on("pointermove", (e) => {
      pointerPos = e.data.global;
    });

    window.addEventListener('resize', () => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
      drawPixiPoints(data);
    });

    app.ticker.add(updatePixiPoints);
  });
}

function drawPixiPoints(pointsData) {
  if (!app) return;
  app.stage.removeChildren();
  pixiPoints.length = 0;

  const bounds = getBounds(pointsData);

  const scaleX = window.innerWidth / baseWidth;
  const scaleY = window.innerHeight / baseHeight;

  const mapRange = (val, inMin, inMax, outMin, outMax) =>
    ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

  pointsData.forEach((p, index) => {
    const g = new PIXI.Graphics();

    const radius = mapRange(p.loudnessMax, bounds.lMin, bounds.lMax, 5, 20);
    const hue = mapRange(p.energyMax, bounds.eMin, bounds.eMax, 240, 0);
    const color = hslToHex(hue, 100, 50); // retourne un entier hexadécimal utilisable directement
    g.x = mapRange(p.x, bounds.xMin, bounds.xMax, 50, window.innerWidth - 50);
    g.y = mapRange(p.y, bounds.yMin, bounds.yMax, 50, window.innerHeight - 50);

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

    g.drawSelf();
    app.stage.addChild(g);
    pixiPoints.push(g);
  });
}

function updatePixiPoints() {
  const now = performance.now();

  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - pointerPos.x, point.y - pointerPos.y);

    if (dist < proximityThreshold) {
      point.targetRadius = point.baseRadius * 1.8;

      if (now - point.lastTrigger > cooldown) {
        sendOSC("/hover", point.sampleId);
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
    socket = io(`http://${data.ip}:5001/browser`);
    window.socket = socket;

    socket.on('connect', () => {
      console.log("✅ Connecté à", data.ip);
    });

    socket.on('to_browser', (raw) => {
      try {
        const rawData = JSON.parse(raw);

        const parsed = rawData.map(point => ({
          x: parseFloat(point.x),
          y: parseFloat(point.y),
          sampleId: point.sampleId,
          loudnessMax: parseFloat(point.loudnessmax),
          energyMax: parseFloat(point.energymax)
        })).filter(p => !isNaN(p.x) && !isNaN(p.y));

        data = parsed;
        drawPixiPoints(data);
      } catch (e) {
        console.error("erreur parsing", e);
      }
    });
  })
  .catch(err => console.error("❌ Erreur de récupération IP :", err));