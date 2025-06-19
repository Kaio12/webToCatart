//****** script coté browser */
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

// pour l'instant, pas de midi
import { onMIDISuccess, onMIDIFailure, handleMIDIMessage, initMIDI,} from "./midi.js";
import {audioContext, loadAudioBuffer, playGrain, initFaustEffect} from "./audio.js";
import {  sendOSC, getIp, initSocket, loadPoints, setupSocketAndHandlers} from "./network.js";
import { loadMLPModel } from "./mlp.js";
import { drawPixiPoints, updateFormeLibreTransform, setupFormeLibre } from "./graphics.js";


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


let audioStarted = false;

loadAudioBuffer(); 

initFaustEffect().then(result => {
  const faustNode = result.faustNode;
  console.log("FaustNode initialisé :", faustNode);

  getIp().then(ip => {
    console.log("IP récupérée, initialisation du socket...");
    initSocket(ip);
    setupSocketAndHandlers(faustNode);
    }).catch(error => {
      console.error("Erreur lors de la récupération de l'IP :", error);
    });
    })

initMIDI(); 

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
 
// inutilisé pour l'instant, mais à garder pour le futur
loadMLPModel(); //charge le modele MLP (pour traduire le 2d de l'iphone vers les 4 parametres de l'effet Faust)

let entraindeZoomer = false; // pour éviter de jouer les sons quand on zoom
// Configuration de Pixi.js pour le rendu graphique
let pixiPoints = [];
window.pointerPos = { x: -9999, y: -9999 };// propriété globale pour la position du pointeur
const proximityThreshold = 80; // distance minimale pour déclencher un son
const cooldown = 300; // temps minimal entre deux update pour le toucher des points

let data = [];  // les données des points à afficher, chargées depuis le serveur
let formeLibre; //layer pour le dessin libre
let freeDrawPath = []; // pour le dessin à la main
let zoomFactor = 1.0 // facteur zoom affichage des points

// les opérations interviennent après le chargement du DOM
document.addEventListener('DOMContentLoaded', () => {

  console.log("DOM chargé, initialisation des éléments...");
  // les différents éléments de la page web récupérés
  const toggleleft = document.getElementById('toggle-left');
  const sidebarleft = document.getElementById('sidebarleft');
  const toggleright = document.getElementById('toggle-right');
  const sidebarright = document.getElementById('sidebarright');
  const body = document.body;

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
  
  // bouton apparition/disparition des barres latérales (********* à remplacer par un mouvement des doigts)
  toggleleft.addEventListener('click', () => {
    sidebarleft.classList.toggle('hidden');
    body.classList.toggle('sidebarleft-hidden');
  });
  toggleright.addEventListener('click', () => {
    sidebarright.classList.toggle('hidden');
    body.classList.toggle('sidebright-hidden');
  });

  // bouton Fullscreen
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points

    } else {
      document.exitFullscreen();
    }
  });


  // NexusUI Sliders (******** pour l'instant inutilisés ****** A ENLEVER PROBABLEMENT*****)*/
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
    });

  // le multislider gauche
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
      if (Array.isArray(v) && v.length > 0) {
      entraindeZoomer = true;
      zoomFactor = 0.5 + v[0] * 2.0; // maps slider value [0,1] to zoomFactor [0.5,2.5]
      drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points

      
      // on redessine la forme libre
      if (formeLibre) {
        updateFormeLibreTransform(zoomFactor);
        formeLibre.clear();
        if (freeDrawPath.length > 2) {
          formeLibre.drawPolygon(freeDrawPath.flatMap(p => [p.x, p.y]));
          formeLibre.fill({ color: 0xffcccc, alpha: 0.3 });
          formeLibre.stroke({ color: 0xff0000, pixelLine: true });
        }  
      }
      entraindeZoomer = false;
      }
    });

    // initialisation du canvas Pixi utilisé pour afficher les points correspondant aux grains
    setupPixi().then(() => {
      console.log("setupPixi terminé !");
      loadPoints().then(points => {
        //console.log("Points reçus :", points);
        if (!points || points.length === 0) {
          console.error("Aucun point chargé à setupPixi ou données invalides.");
          return;
        }
    data = points;
    drawPixiPoints(data, window.pixiApp, pixiPoints);
  });
    formeLibre = setupFormeLibre(window.pixiApp, zoomFactor, freeDrawPath); // initialisation de la forme libre pour dessiner
    });
});

//*********   FONCTION QUI JOUE LES GRAINS, ENVOIE LES INFOS OSC */
function triggerGrainsOnProximity(app) {
  if (entraindeZoomer) return; // si on zoom, pas de son.
  const now = performance.now(); //temps écoulé depuis le temps origine

  for (const point of pixiPoints) {

    const dist = Math.hypot(point.x - window.pointerPos.x, point.y - window.pointerPos.y);
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


  // Variables for center and zoom, accessible in event listeners
  let centerX = window.innerWidth / 2;
  let centerY = window.innerHeight / 2;
 
  app.canvas.addEventListener("mouseleave", () => {
    window.pointerPos = { x: -9999, y: -9999 }; // position très éloignée
  });

    // au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    drawPixiPoints(data, window.pixiApp, pixiPoints, zoomFactor);// on redessine les points
    updateFormeLibreTransform(zoomFactor);
  });

  // ticker : actualisation de l'app sur chaque frame
  app.ticker.add(triggerGrainsOnProximity.bind(null, app));
  window.pixiApp = app; // expose app if needed globally
}