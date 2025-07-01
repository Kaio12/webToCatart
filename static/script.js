//****** script coté browser */
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

// pour l'instant, pas de midi
//import { onMIDISuccess, onMIDIFailure, handleMIDIMessage, initMIDI,} from "./midi.js";
import {audioContext, loadAudioBuffer, playGrain, initFaustEffect} from "./audio.js";
//import {  sendOSC, getIp, initSocket, loadPoints, setupSocketAndHandlers} from "./network.js";
import {  sendOSC, initSocket, loadPoints, setupSocketAndHandlers} from "./network.js";
//import { loadMLPModel } from "./mlp.js";
import { drawPixiPoints, updateFormeLibreTransform, setupFormeLibre, freeDrawPath, updateCenter, DessinFormeLibre } from "./graphics.js";
import { ongoingTouches, startTouch } from "./gestion-touch.js";

let data = [];  // les données des points à afficher, chargées depuis le serveur
let formeLibre; //layer pour le dessin libre
let drawingEnabled = false; // pour activer/désactiver le dessin libre
let zoomFactor = 1.0 // facteur zoom affichage des points
let audioStarted = false;
let entraindeZoomer = false; // pour éviter de jouer les sons quand on zoom
let pixiPoints = []; // Configuration de Pixi.js pour le rendu graphique
window.pointerPos = { x: -9999, y: -9999 };// propriété globale pour la position du pointeur
const proximityThreshold = 80; // distance minimale pour déclencher un son
const cooldown = 300; // temps minimal entre deux update pour le toucher des points


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
      //const ip = await getIp();
      //console.log("IP récupérée, initialisation du socket...");
      //initSocket(ip);
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
      drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
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
      drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
      
      // on redessine la forme libre
      if (formeLibre) {
        updateFormeLibreTransform(zoomFactor);
        formeLibre.clear();
        console.log("freedrawPath : ", freeDrawPath, freeDrawPath.length);
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

    // initialisation du canvas Pixi utilisé pour afficher les points correspondant aux grains
    setupPixi().then(() => {
      console.log("setupPixi terminé !");
      formeLibre = setupFormeLibre(window.pixiApp); // initialisation de la forme libre pour dessiner


      startTouch(window.pixiApp)// on initialise le touch pour les mobiles

      loadPoints().then(points => {
        console.log("Points reçus");
        if (!points || points.length === 0) {
          console.error("Aucun point chargé à setupPixi ou données invalides.");
          return;
        } else if (points && points.length > 0) {
          localStorage.setItem("points", JSON.stringify(points)); // on stocke les points dans le localStorage
          console.log("Points stockés dans le localStorage");
      data = points;
      drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);
        } else {
          const offlinePoints = localStorage.getItem("points");
          if (offlinePoints) {
            data = JSON.parse(offlinePoints);
            console.log("Points chargés depuis le localStorage");
            drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);
          }
        }
      });
    });
});

//*********   FONCTION QUI JOUE LES GRAINS, ENVOIE LES INFOS OSC */
function triggerGrainsOnProximity(app) {

  if (entraindeZoomer) {
    //console.log("En train de zoomer, pas de triggerGrainsOnProximity");
    return; // si on est en train de zoomer, on ne joue pas les grains
  }
  if (drawingEnabled) {
   // console.log("En train de dessiner, pas de triggerGrainsOnProximity");
    return; // si on dessine, pas de son.
  }

  if (window.pointerPos.x === -9999 && window.pointerPos.y === -9999) {
    return; // Ne fait rien si aucun mouvement tactile n'est détecté
  }

  //console.log("triggerGrainsOnProximity appelé"); 

  const now = performance.now(); //temps écoulé depuis le temps origine

  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - window.pointerPos.x, point.y - window.pointerPos.y);


    //console.log(`Distance au point ${point.sampleId}: ${dist}`); 

    const wasInside = point.isInside || false;
    const isInside = dist < (proximityThreshold); // on adapte le seuil de proximité au zoomFactor
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
    drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
    updateFormeLibreTransform(zoomFactor);
  });

  // ticker : actualisation de l'app sur chaque frame
  app.ticker.add(triggerGrainsOnProximity.bind(null, app));
  window.pixiApp = app; // expose app if needed globally
}