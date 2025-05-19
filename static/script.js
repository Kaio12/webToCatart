//****** script coté browser */


//****** partie audio

let faustNode = null; //node pour integrer l'effet audio codé en faust
let grainBus = null; // bus fixe pour router les grains vers l'effet

let audioBuffer = null; //buffer pour intégrer le fichier son reçu de max
let audioContext = new AudioContext();
console.log("AudioContext state :", audioContext.state);

let audioStarted = false;

// un bouton pour débloquer l'audiocontext (necessaire par sécurité)
document.getElementById("audio-toggle").addEventListener("click", () => {
  if (!audioStarted && audioContext.state === "suspended") {
    audioContext.resume().then(() => {
      console.log("AudioContext activé");
      audioStarted = true;
      document.getElementById("audio-toggle").textContent = "Arrêter l'audio";
    });
  } else if (audioContext.state === "running") {
    audioContext.suspend().then(() => {
      console.log("AudioContext suspendu");
      audioStarted = false;
      document.getElementById("audio-toggle").textContent = "Démarrer l'audio";
    });
  }
});

// les opérations interviennet après le chargement du DOM
document.addEventListener('DOMContentLoaded', () => {

  // les différents éléments de la page web récupérés
  const toggleleft = document.getElementById('toggle-left');
  const sidebarleft = document.getElementById('sidebarleft');
  const toggleright = document.getElementById('toggle-right');
  const sidebarright = document.getElementById('sidebarright');
  const body = document.body;

  //insere le node effet faust
  (async () => {
    const { createFaustNode } = await import("./faust/multi_Ef.dsp-wasm/create-node.js");
    const result = await createFaustNode(audioContext, "multi_Ef", 0);
    faustNode = result.faustNode;

    // crée un bus pour les grains
    grainBus = audioContext.createGain();
    // grain => faust => destination
    grainBus.connect(faustNode);
    faustNode.connect(audioContext.destination);

    if (!faustNode) {
      console.error("Erreur : faustNode non créé");
      return;
    }

    //parametres de base de l'effet audio faust (manque un dry/wet??)
    faustNode.setParamValue("/multi_Ef/g", 0.8);
    faustNode.setParamValue("/multi_Ef/feedback", 0.9);
    faustNode.setParamValue("/multi_Ef/intdel", 3000);
    faustNode.setParamValue("/multi_Ef/duration", 90);
    faustNode.setParamValue("/multi_Ef/drywet", 0);

    console.log("Faust DSP multi_Ef chargé et connecté.");
  })();

  //gestion des accés midi (pour un controle ultérieur par iphone en bt)
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
} else {
  console.warn("WebMidi non supporté");
}

  // ********** POUR L'INSTANT INUTILISÉ **********
  //charge le modele MLP (pour traduire le 2d de l'iphone vers les 4 paramètres de l'effet faust)
  loadMLPModel();

  // charge le fichier son enregistré, et servi par max via le serveur flask
fetch('/audio/enr.wav')
  .then(response => response.arrayBuffer())
  .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
  .then(decoded => {
    audioBuffer = decoded;
    console.log("Audio chargé en mémoire");
  })
  .catch(e => console.error("erreur dans le chargement du fichier audio en mémoire :", e));

  // définition de la fonction qui charge le modele de regression
async function loadMLPModel() {
  try {
    const res = await fetch("/mlp_model");
    mlpModel = await res.json();
    console.log("modele MLP chargé");
  } catch (err) {
    console.error("erreur de chargement du modele MLP", err);
  }
}

  // bouton Fullscreen
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // bouton Delete log (on log tous les évènements du browser et de l'ipad)
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

  // ******** NE SERT PLUS A RIEN, A ENLEVER *****
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

  
  // bouton apparition/disparition des barres latérales (********* à remplacer par un mouvement des doigts)
  toggleleft.addEventListener('click', () => {
    sidebarleft.classList.toggle('hidden');
    body.classList.toggle('sidebarleft-hidden');
  });
  toggleright.addEventListener('click', () => {
    sidebarright.classList.toggle('hidden');
    body.classList.toggle('sidebright-hidden');
  });

  // NexusUI Sliders (******** pour l'instant inutilisés ****** A ENLEVER PROBABLEMENT*****)
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
    
    //sendOSC("/multisliderRight", v);

  });

  let multisliderLeft = new Nexus.Multislider('#multisliderLeft', {
    'size': [200, 600],
    'numberOfSliders': 1,
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
    //sendOSC("/multisliderLeft", v);
        if (Array.isArray(v) && v.length > 0) {
      zoomFactor = 0.5 + v[0] * 2.0; // maps slider value [0,1] to zoomFactor [0.5,2.5]
      // on redessine les points
      drawPixiPoints(data, window.pixiApp);

      // on redessine la forme libre
      if (formeLibre) {
        formeLibre.scale.set(zoomFactor);
        formeLibre.clear();
        formeLibre.drawPolygon(freeDrawPath.flatMap(p => [p.x, p.y]));
        formeLibre.fill({ color: 0xffcccc, alpha: 0.3 });
        formeLibre.stroke({ color: 0xff0000, pixelLine: true });
      }
    }
  });

  // initialisation du canvas Pixi utilisé pour afficher les points correspondant aux grains
  setupPixi();
});

//fonction pour jouer le grain correspondant au point PIXI sélectionné (survolé)
function playGrain(startMs, durationMs, useEffect = true) {
  if(!audioBuffer) return;

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  //connexion au faustnode. on verifie si le point est dans la forme libre
  if (useEffect && grainBus) {
    source.connect(grainBus);
  } else {
    source.connect(audioContext.destination);

  }  const startSec = startMs / 1000; //conversion en s
  const durationSec = durationMs / 1000;

  source.start(0, startSec, durationSec);
}

// DEVRAIT POUR LOG DES MOUVEMENTS
// Envoie messages OSC via socket.io ===
let sendOSC = function (address, args) {
  if (socket && socket.connected) {
    console.log("Sending OSC:", address, args);
    socket.emit('osc', { address, args });
  } else {
    console.error("Socket not connected.");
  }
};

// getBounds calcule les limites (min et max) des coordonnées et des valeurs pour un ensemble de points, permet d'adapter à la taille de la fenètre.
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
// Convertit une couleur HSL en valeurs RGB (fournit des couleurs très proches de CATART dans Max)
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

// Configuration de Pixi.js pour le rendu graphique
let pixiPoints = [];
let pointerPos = { x: -9999, y: -9999 };
const proximityThreshold = 80;

// ******* variable à remonter dans le script??? *****
const cooldown = 300; // temps minimal entre deux update pour le toucher des points

const baseWidth = 800;
const baseHeight = 800;
let data = [];

let formeLibre; //layer pour le dessin libre
let freeDrawPath = []; // pour le dessin à la main


  // ******** FORME LIBRRE ***********
  //dessin de forme libre pour la selection de grain
function setupFormeLibre (app) {

  // centre et zoom accessibles depuis le contexte
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  let drawing = false;
  formeLibre = new PIXI.Graphics();
  formeLibre.scale.set(zoomFactor);
  formeLibre.position.set(centerX, centerY);
  freeDrawPath = [];
  app.stage.addChild(formeLibre);

  app.stage.on("pointerdown", (e) => {
    console.log("pointer down");
    const {x, y} = e.data.global;
    drawing = true;
    freeDrawPath = [{x: (x - centerX) / zoomFactor, y: (y - centerY) / zoomFactor}];
    formeLibre.clear();//efface si on recommence le geste
  });


  // position du pointeur (souris, doigt)
  app.stage.on("pointermove", (e) => {
    pointerPos = e.data.global;
    if (!drawing) return;
    const {x, y} = e.data.global;
    freeDrawPath.push({ x: (x - centerX) / zoomFactor, y: (y - centerY) / zoomFactor });

    formeLibre.clear();
    formeLibre.drawPolygon(freeDrawPath.flatMap(p => [p.x, p.y]));
    formeLibre.fill({ color: 0xffcccc, alpha: 0.3 });
    formeLibre.stroke({ color: 0xff0000, pixelLine: true });
  });

  app.stage.on("pointerup", () => {
    drawing = false;
  });

app.stage.on("pointerupoutside", () => {
    drawing = false;
  });

}


// Initialise et configure l'application Pixi.js pour le rendu interactif
async function setupPixi() {
  const app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0xffffff // couleur du fond, à adapter, mode clair mode sombre????
  });
  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);

  // stage : The root display container that's rendered.
  app.stage.interactive = true;

  app.stage.hitArea = app.screen;


  setupFormeLibre(app);

  // Variables for center and zoom, accessible in event listeners
  let centerX = window.innerWidth / 2;
  let centerY = window.innerHeight / 2;
 
  app.canvas.addEventListener("mouseleave", () => {
    pointerPos = { x: -9999, y: -9999 }; // position très éloignée
  });


// au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    centerX = window.innerWidth / 2;
    centerY = window.innerHeight / 2;
    drawPixiPoints(data, app);
  });

// ticker : actualisation de l'app sur chaque frame
app.ticker.add(triggerGrainsOnProximity.bind(null, app));
  window.pixiApp = app; // expose app if needed globally
}


let zoomFactor = 1.0 // facteur zoom affichage des points

// ****** fonction principale pour dessiner les points ******
function drawPixiPoints(pointsData, app) {

  // précautions d'usage
  if (!app) {console.error("L'app pixi n'est pas initialisée");
    return;}
  if (!Array.isArray(pointsData) || pointsData.length === 0) {
      console.warn("Aucune donnée à afficher.");
      return;
    }

  app.stage.removeChildren(); // Removes all children from this container
  pixiPoints.length = 0;

  // centre de la fenêtre
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2; 

  const bounds = getBounds(pointsData);
  console.log("BOUNDS calculés :", bounds);

  const scaleX = window.innerWidth / baseWidth;
  const scaleY = window.innerHeight / baseHeight;
   
  // mapRange désigne ici une fonction fléchée
  const mapRange = (val, inMin, inMax, outMin, outMax) =>
    ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

  // La méthode forEach() permet d'exécuter une fonction donnée sur chaque élément du tableau.
  // The Graphics class contains methods used to draw primitive shapes such as lines, circles and rectangles to the display, and to color and fill them.
  pointsData.forEach((pointData, index) => {

    const pointGraphic = new PIXI.Graphics();

    // radius (taille des points) suit loudness (donné par analyse CATART/Max)
    const radius = mapRange(pointData.loudnessMax, bounds.lMin, bounds.lMax, 5, 20);

    // couleur du point suit energy (donné par analyse CATART/Max)
    const hue = mapRange(pointData.energyMax, bounds.eMin, bounds.eMax, 240, 0);
    const [r, gVal, b] = hslToRgb(hue / 360, 1, 0.5);
    const color = (r * 255 << 16) + (gVal * 255 << 8) + (b * 255) | 0;

    pointGraphic.x = centerX + (mapRange(pointData.x, bounds.xMin, bounds.xMax, -baseWidth / 2, baseWidth / 2) * zoomFactor);
    pointGraphic.y = centerY + (mapRange(pointData.y, bounds.yMin, bounds.yMax, -baseHeight / 2, baseHeight / 2) * zoomFactor);

    pointGraphic.baseRadius = radius;
    pointGraphic.currentRadius = radius;
    pointGraphic.targetRadius = radius;
    pointGraphic.lastTrigger = 0;
    pointGraphic.sampleId = pointData.sampleId;
    pointGraphic.color = color;

    pointGraphic.startTime = pointData.time;
    pointGraphic.duration = pointData.duration;

    pointGraphic.drawSelf = function () {
      this.clear();
      this.beginFill(this.color);
      this.drawCircle(0, 0, this.currentRadius);
      this.endFill();
    };

    console.log(`Point ${index}:`, {
      originalX: pointData.x,
      originalY: pointData.y,
      mappedX: pointGraphic.x,
      mappedY: pointGraphic.y,
      radius: radius
    });
    pointGraphic.drawSelf();
    app.stage.addChild(pointGraphic);
    pixiPoints.push(pointGraphic);
  });

  if (formeLibre) {
    app.stage.addChild(formeLibre);
  }
}

//*********   FONCTION QUI JOUE LES GRAINS, ENVOIE LES INFOS OSC */
function triggerGrainsOnProximity(app) {
  const now = performance.now(); //temps écoulé depuis le temps origine


  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - pointerPos.x, point.y - pointerPos.y);

    const wasInside = point.isInside || false;
    const isInside = dist < proximityThreshold;
    point.isInside = isInside;

    if (dist < proximityThreshold) {
      point.targetRadius = point.baseRadius * 1.8; //on marque le point joué en augmentant sa taille.

      if (now - point.lastTrigger > cooldown) {

        point.lastTrigger = now;

        //joue le grain
        if (isInside && !wasInside) {
        const isInForme = formeLibre && formeLibre.containsPoint(formeLibre.toLocal(new PIXI.Point(point.x, point.y)));          
        console.log ('isinForme :', isInForme);
          playGrain(point.startTime, point.duration, isInForme);

          sendOSC("/hover", point.sampleId);// point.sampleId
        }

      }
    } else {
      point.targetRadius = point.baseRadius;
    }

    const speed = 0.2;
    point.currentRadius += (point.targetRadius - point.currentRadius) * speed;
    point.drawSelf();
  }
}

// ************* MIDI ********************
//*******POUR L'INSTANT INUTILISÉ ********
//gestion midi (qui va se superposer à osc, a revoir)
function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values()) {
    input.onmidimessage = handleMIDIMessage;
  }
  console.log("✅ MIDI ready");
}

//*****INUTILISÉ POUR L'INSTANT */
function handleMIDIMessage(message) {
  const [status, data1, data2] = message.data;

  // Exemple : MIDI CC sur canal 1
  if ((status & 0xF0) === 0xB0) {
    const cc = data1;
    const val = data2 / 127;

    if (!faustNode) return;

    // Exemple : CC#1 -> gain, CC#2 -> delay
    if (cc === 1) {
      faustNode.setParamValue("/multi_Ef/drywet", val);
    } else if (cc === 2) {
      faustNode.setParamValue("/multi_Ef/delay", val);
    }
  }
}

function onMIDIFailure() {
  console.error("❌ Échec accès MIDI");
}


// ********** PARTIE RESEAU / RECUPERE LES DONNEES *************
// Connexion socket.io avec le reseau, Max/MSP et IPHONE connecté
let socket;
fetch("/api/ip")
  .then(response => response.json())
  .then(data => {
    socket = io(`http://${data.ip}:5001/browser`);//renvoie l'adresse ip
    window.socket = socket;
//reception de données osc, mapping vers l'effet faust
    socket.on('connect', () => {
      console.log("Connecté à", data.ip);

      socket.on('to_browser', (data) => {
        const { address, args } = data;
        console.log("osc recu: ", address, args);
        mapOSCToFaust(address, args);
      });

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
        energyMax: parseFloat(point.energymax),
        time: parseFloat(point.time),
        duration: parseFloat(point.duration)
      })).filter(p => !isNaN(p.x) && !isNaN(p.y));
      
      data = parsed;
      drawPixiPoints(data, window.pixiApp);
    } else if (rawData.type === "soundfile") {
      console.log("Reçu un fichier son : ", rawData.filename);
    } else {
      console.warn("Type de données inconnu :", rawData);
    }
  } catch (error) {
    console.error("Erreur de chargement des points:", error);
  }
}


// Mapping OSC → paramètres Faust
function mapOSCToFaust(address, args) {
  if (!faustNode || !address || !Array.isArray(args)) return;

  const oscToFaustMap = {
  "/effectPos": ["multi_Ef/g", "/multi_Ef/feedback"] // POUR L'INSTANT MAP UNIQUEMENT G ET FEEDBACK, SANS UTILISER LA REGRESSION 
  };

  const param = oscToFaustMap[address];
  if (Array.isArray(param)) {
    param.forEach((p, i) => {
      if (args[i] !== undefined) {
        faustNode.setParamValue(p, args[i]);
      }
    });
  } else if (typeof param === "string" && args[0] !== undefined) {
    faustNode.setParamValue(param, args[0]);
  } else {
    console.warn("Adresse OSC non reconnue :", address);
  }
}