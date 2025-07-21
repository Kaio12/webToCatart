//*** script coté browser ***/
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

import {audioContext, loadAudioBuffer, playGrain,initEffect, feedbackGain} from "./audio.js";
import {   initSocket, loadPoints, setupSocketAndHandlers, sendOSC} from "./network.js";
import { drawPixiPoints, setupFormeLibre, createCursor, updateCenter, DessinFormeLibre, ReDessinFormeLibre, pixiContainer } from "./graphics.js";


export let app; // app pixi
//let effectNode; // effet audio
let isInitialized = false;

let pointsData = [];  // les données des points à afficher, chargées depuis le serveur
export let pixiPoints = []; // Configuration de Pixi.js pour le rendu graphique

let formeLibre; //layer pour le dessin libre de la zone effet audio
let lastFormeLibrePath; //sauvegarde des coordo de la forme libre.
export let drawingEnabled = false; // pour activer/désactiver le dessin libre

let zoomFactor = 1.0 // facteur zoom affichage des points

let cursorGraphic; // le curseur.
let pointerPos = { x: -9999, y: -9999 } //pointer position doigt

//const proximityThreshold = 80; // distance minimale pour déclencher un son

// nécessaire pour pwa
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

async function initializeAudioAndNetwork() {

  if (isInitialized) return;

  isInitialized = true;

  try {
    if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
    }

    await loadAudioBuffer();


    //*** pour l'instant, on utilise pas faust, pb garbage collection */
    
    //const result = await initFaustEffect();
    const result = await initEffect();

    let effectNode = null;
    effectNode = result.effectNode;


    console.log("effectNode init: ", effectNode);

    initSocket();
    setupSocketAndHandlers(effectNode, feedbackGain);
    } catch (error) {
        console.error("erreur lors de l'init post-interaction: ", error);
      
      }
}

export function onFormeLibreComplete(path) {
  lastFormeLibrePath = path; // stocke le chemin pour le resize/redessin
  disableDrawingMode();      // désactive le mode dessin
}

//pour activer drawingEnabled depuis network.js
export function enableDrawing() {
  drawingEnabled = true;
}


// modifie le threshold suivant le zoom et la taille de fenetre
function getProximityThreshold() {
  const base = Math.min(window.innerWidth, window.innerHeight) * 0.08;
  return base / zoomFactor;
}


// fonction envoyée en callback pour désactiver le mode dessin
function disableDrawingMode() {
  drawingEnabled = false;
  const drawToggleButton = document.getElementById("draw-toggle");
  drawToggleButton.textContent = "Activer le dessin";
  drawToggleButton.style.backgroundColor = "#0f0";

  // nettoyer les écouteurs d'évènements de DessinFormeLibre
  DessinFormeLibre(app, false, pixiPoints);
}

// les opérations interviennent après le chargement du DOM
document.addEventListener('DOMContentLoaded', () => {

  console.log("DOM chargé, initialisation des éléments...");

  // Empêche le zoom natif du navigateur (pinch sur trackpad)
  window.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });

  const init = document.getElementById("init");
  init.addEventListener("click", () => {
    initializeAudioAndNetwork();
  });


  const drawToggleButton = document.getElementById("draw-toggle");

  // pour dessiner la forme libre
  drawToggleButton.addEventListener("click", () => {

    if (!drawingEnabled) {
      drawingEnabled = true;
      drawToggleButton.textContent = 'Désactiver mode dessin';
      drawToggleButton.style.backgroundColor = "#f00";

      DessinFormeLibre(app, drawingEnabled, pixiPoints, onFormeLibreComplete);
      console.log ("lastFormeLibrePath :", lastFormeLibrePath);

      if (formeLibre) formeLibre.visible = true; // rend la forme libre visible
      console.log("Dessin activé");
    } else {
      disableDrawingMode();
    }
  });

    // bouton Fullscreen
    document.getElementById("fullscreen-btn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        updateCenter(); // met à jour le centre de la vue
        drawPixiPoints(pointsData, app, pixiPoints);// on redessine les points
        console.log('lastFormeLibrePath pour fullscreen', lastFormeLibrePath);
        if (lastFormeLibrePath) {
        ReDessinFormeLibre(lastFormeLibrePath, pixiPoints);
       
    }
      } else {
        document.exitFullscreen();
      }
    });

    // Séquence d'initialisation principale
    async function initializeApplication() {
      await setupPixi();
      console.log("setupPixi terminé !");

      const points = await loadPointsWithFallback();
      if (points && points.length > 0) {
        pointsData = points;
        drawPixiPoints(pointsData, app, pixiPoints);
      } else {
        console.error("Échec du chargement des points depuis le réseau et le cache.");
      }

      formeLibre = setupFormeLibre(app);
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
function triggerGrainsOnProximity() {

  if (drawingEnabled || (pointerPos.x === -9999 && pointerPos.y === -9999)) {
    return; // Ne rien faire si on dessine, ou si le pointeur n'est pas actif (pinch ou aucun doigt)
  }

  // On convertit la position globale du pointeur en coordonnées locales au conteneur des points.
  const localPointerPos = pixiContainer.toLocal(pointerPos);

  for (const point of pixiPoints) {
    const dist = Math.hypot(point.x - localPointerPos.x, point.y - localPointerPos.y);
    const wasInside = point.isInside || false; // L'état à la frame précédente
    const isInside = dist < getProximityThreshold(); // Le nouvel état
   
    
    // 1. Détecter un changement d'état : quand le pointeur ENTRE dans la zone
    if (isInside && !wasInside) {
      
      console.log(point.isEffectEnabled);
      playGrain(point.startTime, point.duration, point.isEffectEnabled);
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

// Initialise et configure l'application Pixi.js
async function setupPixi() {

  app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0xffffff // couleur du fond
  });

  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);

  cursorGraphic = createCursor(app); // Crée le curseur.

  // === BLOCAGE DES GESTES NATIFS ===
  // Empêche le navigateur de gérer les gestes tactiles (scroll, zoom, multitâche) sur notre canvas
  app.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  // On bloque aussi la molette pour éviter le zoom du navigateur sur les trackpads
  app.canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });
  // ===================================

  // stage : The root display container that's rendered.
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const activePointers = new Map();
  let lastPinchDistance = null;

  app.stage.on("pointerdown", async (event) => {
    if (drawingEnabled) return;

    pointerPos = { x: event.global.x, y: event.global.y }; // met à jour la position du pointeur
    activePointers.set(event.pointerId, event.global.clone());

    if (activePointers.size === 1) {
      if (cursorGraphic) {
        cursorGraphic.position.set(event.global.x, event.global.y);
        cursorGraphic.visible = true; // rend le curseur visible
      } else {
        if (cursorGraphic) cursorGraphic.visible = false; // cache le curseur si pas de pointeur unique
      }
    }
  });

  app.stage.on("pointermove", (event) => {
    if (drawingEnabled) return; // Ne rien faire si on dessine
    if (!activePointers.has(event.pointerId)) return;

    activePointers.set(event.pointerId, event.global.clone());
    if (activePointers.size === 1) {
      pointerPos = { x: event.global.x, y: event.global.y };
      
      if (cursorGraphic) {
        cursorGraphic.position.set(event.global.x, event.global.y);
        cursorGraphic.visible = true;
      }

    } else if (activePointers.size === 2) {
      pointerPos = { x:-9999, y: -9999 }; // désactive le pointeur unique
      if (cursorGraphic) cursorGraphic.visible = false; // cache le curseur
      
      const pointers = Array.from(activePointers.values());
      const p1 = pointers[0];
      const p2 = pointers[1];
      const currentDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y);


      if (lastPinchDistance === null) {
        //point central entre les deux doigts
        const pinchCenterGlobal = new PIXI.Point((p1.x + p2.x)/2, (p1.y + p2.y)/2);
        const pinchCenterLocal = pixiContainer.toLocal(pinchCenterGlobal);

        //on déplace le pivot du conteneur vers ce nouveau centre:
        pixiContainer.pivot.copyFrom(pinchCenterLocal);

        //on ajuste sa position pour que le nouveau pivot apparaisse au m endroit que l'ancien
        pixiContainer.position.copyFrom(pinchCenterGlobal);
      }

      if (lastPinchDistance !== null) {
        const delta = currentDistance - lastPinchDistance;
        const sensitivity = 0.005;
        zoomFactor = Math.max(0.5, Math.min(2.5, zoomFactor + delta * sensitivity));
      }
      lastPinchDistance = currentDistance;
    }
  });

  const onPointerUp = (event) => {

    if (drawingEnabled) return; // Ne rien faire si on dessine

    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      lastPinchDistance = null;
    }
    if (activePointers.size === 0) {
      pointerPos = { x: -9999, y: -9999 };
      if (cursorGraphic) cursorGraphic.visible = false; // cache le curseur

      // Réinitialise l'état de proximité de tous les points
  for (const point of pixiPoints) {
    point.isInside = false;
  }
    }
  };

    app.stage.on("pointerup", onPointerUp);
    app.stage.on("pointerupoutside", onPointerUp);


  // au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    updateCenter();
    
    drawPixiPoints(pointsData, app, pixiPoints);// on redessine les points
    
    if (lastFormeLibrePath) {
      ReDessinFormeLibre(lastFormeLibrePath, pixiPoints);
    }
    
    console.log("formeLibre: ",formeLibre);
    console.log ("reDessinFormeLibre");
  });

  // ticker : actualisation de l'app sur chaque frame
  app.ticker.add(() => {

    if (cursorGraphic && cursorGraphic.visible) {
      cursorGraphic.position.set(pointerPos.x, pointerPos.y);
    }
    
    //** mais a jour l'echelle du zoom à chaque frame */
    if (pixiContainer) {
    pixiContainer.scale.set(zoomFactor);
    }

    triggerGrainsOnProximity();
  });

}
