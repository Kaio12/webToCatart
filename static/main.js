//****** script coté browser */
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

// pour l'instant, pas de midi
//import { onMIDISuccess, onMIDIFailure, handleMIDIMessage, initMIDI,} from "./midi.js";
import {audioContext, loadAudioBuffer, playGrain, initFaustEffect} from "./audio.js";
//import {  sendOSC, getIp, initSocket, loadPoints, setupSocketAndHandlers} from "./network.js";
import {  sendOSC, initSocket, loadPoints, setupSocketAndHandlers} from "./network.js";
//import { loadMLPModel } from "./mlp.js";
import { drawPixiPoints, updateFormeLibreTransform, setupFormeLibre, freeDrawPath, updateCenter, DessinFormeLibre } from "./graphics.js";
import { startTouch } from "./gestion-touch.js";

let pointsData = [];  // les données des points à afficher, chargées depuis le serveur
let formeLibre; //layer pour le dessin libre
let drawingEnabled = false; // pour activer/désactiver le dessin libre
let zoomFactor = 1.0 // facteur zoom affichage des points

let entraindeZoomer = false; // pour éviter de jouer les sons quand on zoom
let pixiPoints = []; // Configuration de Pixi.js pour le rendu graphique

window.pointerPos = { x: -9999, y: -9999 };// propriété globale pour la position du pointeur

const proximityThreshold = 80; // distance minimale pour déclencher un son
const cooldown = 300; // temps minimal entre deux update pour le toucher des points

let audioStarted = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker enregistré avec succès :', registration);
      })
      .catch(error => {
        console.error('Échec de l’enregistrement du Service Worker :', error);
      });
  });
}

// Fonction pour initialiser le contexte audio et charger le buffer audio
(async () => {
  await loadAudioBuffer();
  try {
    const result = await initFaustEffect();
    const faustNode = result.faustNode;
    console.log("FaustNode initialisé :", faustNode);
    try {
      initSocket();
      setupSocketAndHandlers(faustNode);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'IP :", error);
    }
  } catch (error) {
    console.error("Erreur lors de l'initialisation de Faust :", error);
  }
})();

//initMIDI();
//loadMLPModel();

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
 
// les opérations interviennent après le chargement du DOM
document.addEventListener('DOMContentLoaded', () => {

  console.log("DOM chargé, initialisation des éléments...");

// Empêche le zoom natif du navigateur (pinch sur trackpad)
window.addEventListener('wheel', function(e) {
  if (e.ctrlKey) {
    e.preventDefault();
  }
}, { passive: false });

  const sidebarleft = document.getElementById('sidebarleft');
  const body = document.body;
  const deleteLogButton = document.getElementById("delete-log");
  const drawToggleButton = document.getElementById("draw-toggle");
  const pages = Array.from(document.querySelectorAll('#swipe-container .page'));

// bouton pour supprimer le fichier log
  deleteLogButton.addEventListener("click", () => {
    fetch("/delete", { method: "POST" })
      .then(response => {
        if (response.ok) {
          console.log("Fichier log supprimé");
        } else {
          console.error("Erreur lors de la suppression.");
        }
    });
  });

// pour dessiner la forme libre
drawToggleButton.addEventListener("click", () => {
  drawingEnabled = !drawingEnabled;
  if (drawingEnabled) {
    drawToggleButton.textContent = "Désactiver le dessin";
    drawToggleButton.style.backgroundColor = "#f00"; // rouge
    DessinFormeLibre(window.pixiApp, drawingEnabled);

    if (formeLibre) {
      formeLibre.visible = true; // rend la forme libre visible
    }
    console.log("Dessin activé");

  } else {
    drawToggleButton.textContent = "Activer le dessin";
    drawToggleButton.style.backgroundColor = "#0f0"; // vert
    }
  });

// bouton Fullscreen
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      updateCenter(); // met à jour le centre de la vue
      drawPixiPoints(pointsData, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
    } else {
      document.exitFullscreen();
    }
  });


    // le multislider gauche
    let multisliderLeft = new Nexus.Multislider('#multisliderLeft', {
      'size': [50, 300],
      'numberOfSliders': 1,
      'min': 0,
      'max': 1,
      'step': 0,
      'candycane': 3,
      'values': [0.25], // valeur initiale du zoom
      'smoothing': 0,
      'mode': 'bar',
    });

    multisliderLeft.colorize("accent", "#ff0");
    multisliderLeft.colorize("fill", "#333");

    multisliderLeft.on('change', function (v) {
      if (Array.isArray(v) && v.length > 0) {
      entraindeZoomer = true;
      zoomFactor = 0.5 + v[0] * 2.0; // maps slider value [0,1] to zoomFactor [0.5,2.5]

      updateCenter(); // met à jour le centre de la vue
      drawPixiPoints(pointsData, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points

      // on redessine la forme libre
      if (formeLibre) {
        updateFormeLibreTransform(zoomFactor);
        formeLibre.clear();
        if (freeDrawPath.length > 2) {
          formeLibre.beginFill(0xffcccc, 0.3);
          formeLibre.lineStyle(2, 0xff0000, 1);
          formeLibre.drawPolygon(freeDrawPath.flatMap(p => [p.x, p.y]));
          formeLibre.endFill();
        }  
      }
      entraindeZoomer = false;
      }
    });

    // Séquence d'initialisation principale
    async function initializeApplication() {
      await setupPixi();
      console.log("setupPixi terminé !");

      formeLibre = setupFormeLibre(window.pixiApp);
      startTouch(window.pixiApp);

      const points = await loadPointsWithFallback();
      if (points && points.length > 0) {
        pointsData = points;
        drawPixiPoints(pointsData, window.pixiApp, pixiPoints, zoomFactor);
      } else {
        console.error("Échec du chargement des points depuis le réseau et le cache.");
      }
    }

    // Fonction dédiée pour charger les points
    async function loadPointsWithFallback() {
      try {
        // 1. Essayer de charger depuis le réseau
        const networkPoints = await loadPoints();
        if (networkPoints && networkPoints.length > 0) {
          console.log("Points chargés depuis le réseau.");
          localStorage.setItem("points", JSON.stringify(networkPoints));
          console.log("Points mis à jour dans le localStorage.");
          return networkPoints;
        }
      } catch (error) {
        console.warn("Échec du chargement des points depuis le réseau, tentative depuis le cache.", error);
      }

      // 2. Si le réseau échoue, essayer de charger depuis le localStorage
      const offlinePoints = localStorage.getItem("points");
      if (offlinePoints) {
        console.log("Points chargés depuis le localStorage (mode hors-ligne).");
        return JSON.parse(offlinePoints);
      }

      // 3. Si tout échoue, retourner null
      return null;
    }

    // Lancer l'initialisation
    initializeApplication();
});

//*********   FONCTION QUI JOUE LES GRAINS, ENVOIE LES INFOS OSC */
function triggerGrainsOnProximity(app) {

  if (entraindeZoomer || drawingEnabled || (window.pointerPos.x === -9999 && window.pointerPos.y === -9999)) {
    return; // Ne rien faire si on zoome, dessine, ou si le pointeur n'est pas actif
  }

  const now = performance.now();

  // Envoi de la position continue du pointeur (normalisée)
  //const normalizedX = window.pointerPos.x / window.innerWidth;
  //const normalizedY = window.pointerPos.y / window.innerHeight;
  //sendOSC("/ipad/xy", [normalizedX, normalizedY]);

  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - window.pointerPos.x, point.y - window.pointerPos.y);
    const wasInside = point.isInside || false; // L'état à la frame précédente
    const isInside = dist < proximityThreshold; // Le nouvel état
    
    // 1. Détecter un changement d'état : quand le pointeur ENTRE dans la zone
    if (isInside && !wasInside) {
      // On est entré dans la zone, on déclenche le son et l'OSC
      const isInForme = formeLibre && formeLibre.containsPoint(formeLibre.toLocal(new PIXI.Point(point.x, point.y)));
      playGrain(point.startTime, point.duration, isInForme);
      sendOSC("/hover", point.sampleId);
    }

    // 2. Gérer la logique visuelle en continu
    if (isInside) {
      // Si on est à l'intérieur, on grossit le point
      point.targetRadius = point.baseRadius * 1.8;
    } else {
      // Si on est à l'extérieur, on le remet à sa taille normale
      point.targetRadius = point.baseRadius;
    }

    // 3. Mettre à jour l'état pour la prochaine frame
    point.isInside = isInside;

    // 4. Animer le rayon et redessiner le point à chaque frame
    const speed = 0.2;
    point.currentRadius += (point.targetRadius - point.currentRadius) * speed;
    point.drawSelf();
  }
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
  app.stage.hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);

    // au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    updateCenter();
    drawPixiPoints(pointsData, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
    updateFormeLibreTransform(zoomFactor);
  });

  // ticker : actualisation de l'app sur chaque frame
  app.ticker.add(triggerGrainsOnProximity.bind(null, app));
  window.pixiApp = app; // expose app if needed globally
}