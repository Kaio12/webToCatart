//*** script coté browser ***/
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

import { playGrain,initEffect, feedbackGain } from "./audio.js";
import { initSocket, setupSocketAndHandlers, sendOSC, loadJsonPoints, loadAudioBuffers } from "./network.js";
import { drawPixiPoints, setupFormesLibres, createCursor, DessinFormeLibre, ReDessinFormeLibre, formesLibres, formesLibresContextes } from "./graphics.js";

export let pixiContainer = null; // conteneur Pixi global
export let pixiPointsContainer = null; // pour les points
export let formesLibresContainer = null; // pour les formes libres


export let pointsConteneurs = [];
export let formesLibresConteneurs = [];
export let sequenceursConteneurs = [];

export let app; // app pixi
export let pixiPoints = []; // Configuration de Pixi.js pour le rendu graphique
export let drawingEnabled = false; // pour activer/désactiver le dessin libre

export let centerX = window.innerWidth / 2;
export let centerY = window.innerHeight / 2;

export const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let isInitialized = false;

let pointsData = [];  // les données des points à afficher, chargées depuis le serveur
let currentPage = 0;

const pageBackgroundColors = [
   0x1a237e, // bleu profond
  0x263238, // bleu-gris foncé
  0x004d40, // vert canard foncé
  0x880e4f, // bordeaux vif
  0x212121, // noir intense
  0x3e2723, // brun foncé
  0x0d47a1, // bleu roi foncé
  0x1b5e20, // vert forêt foncé
  0x311b92, // violet foncé
  0xb71c1c  // rouge foncé
];

let nbPages = 0; // le nombre de pages qui correspond au nombres de buffers

let buffers;
let points;

let buffer;
let bufferNames;

let effectNode;

const selectorDiv = document.getElementById("page-selector"); // selecteur de page.
const init = document.getElementById("init"); // bouton d'initialistion globale.
const deleteEffect = document.getElementById("efface-formelibre"); // pour effacer la forme libre et l'effet afférent
const drawToggleButton = document.getElementById("draw-toggle");

let lastFormesLibresPath = []; //sauvegarde des coordo des formes libres.

let zoomFactor = 1.0 // facteur zoom affichage des points

let cursorGraphic; // le curseur.
let pointerPos = { x: -9999, y: -9999 } //pointer position doigt

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


// Fonction pour mettre à jour le centre lors du resize
export function updateCenter() {
  centerX = window.innerWidth / 2;
  centerY = window.innerHeight / 2;
}

// **** Initialise et configure l'application Pixi.js ****
async function setupPixi() {

  app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x000000 // couleur du fond
  });

  // on ajout l'app canvas à la partie pixi-contianer de la page
  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);

  // Création du container principal PIXI
  if (!pixiContainer) {
    pixiContainer = new PIXI.Container();
    pixiContainer.pivot.set(centerX, centerY); // Centre le conteneur
    pixiContainer.position.set(centerX, centerY); 
    app.stage.addChild(pixiContainer);
  }

  // === blocage des gestes natifs ===
  app.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });

  // stage : Le conteneur racine d’affichage.
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const activePointers = new Map();
  let lastPinchDistance = null;

  const onPointerDown = async (event) => {
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
  };

  const onPointerMove = (event) => {
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
  };

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

  app.stage.on("pointerdown", onPointerDown);
  app.stage.on("pointermove", onPointerMove);
  app.stage.on("pointerup", onPointerUp);
  app.stage.on("pointerupoutside", onPointerUp);

  // au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    updateCenter();
    
    drawPixiPoints(pointsData, app, pixiPoints, pointsConteneurs[currentPage]);// on redessine les points
    
    if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], pixiPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
      console.log('formelibre dessinée de resize');
    }
  });

  
  cursorGraphic = createCursor(app); // Crée le curseur.

  // ***** TICKER : actualisation de l'app sur chaque frame ******
  app.ticker.add(() => {

    if (cursorGraphic && cursorGraphic.visible) {
      cursorGraphic.position.set(pointerPos.x, pointerPos.y);
    }
    
    // met à jour l'echelle du zoom à chaque frame */
    if (pixiContainer) {
    pixiContainer.scale.set(zoomFactor);
    }
    

    triggerGrainsOnProximity();
  });

  console.log("1) SetupPixi terminé : ", app);

}

// crée un selecteur pour sélectionner la page/buffer à jouer.
function createPageSelector(bufferNames, onPageChange) {

  selectorDiv.innerHTML = ""; //efface le contenu précédent

  bufferNames.forEach((name, idx) => {
    const btn = document.createElement("button");
    btn.textContent = name.replace(".wav", "");
    btn.onclick = () => {
      onPageChange(idx);

      if (app && pageBackgroundColors[idx] !== undefined) {
        app.renderer.background.color = pageBackgroundColors[idx];
      }

      createPageSelector(bufferNames, onPageChange);
    };
    btn.style.margin = "0 4px";
    if (idx === currentPage) {
      btn.style.backgroundColor = "#0f0"; // bouton sel vert
    }
    selectorDiv.appendChild(btn);
  });
}

async function initialiseContexteAudio() {
  try {
    if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
    }
    console.log("2) audioContext.state:", audioContext.state);
  } catch (e) {
    console.log("erreur initialisation contexte audio", e);
  }
} 

async function initialiseEffetAudio() {
  try {
    const result = await initEffect();
    effectNode = null;
    effectNode = result.effectNode;
    console.log("3) effectNode initialisé: ", effectNode);
  } catch (e) {
    console.log("erreur initialisation effet audio", e);
  }
}

async function chargeFichiersAudioEtJson() {
  try {
    // 4) on charge les buffers et fichiers d'analyse
    buffers = await loadAudioBuffers();// { "enr1.wav": AudioBuffer, ... }
    points = await loadJsonPoints();  // { "enr1.json": [ ... ], ... }

    console.log("4) Fichiers audio et fichiers JSON chargés. buffers :", buffers, "points : ", points);
  }
  catch (e) {
    console.log("Erreur chargement des fichiers audio et json",e);
  }
}

async function initialiseSocket() {
  try {
    // 3) on init le socket
    initSocket();
    setupSocketAndHandlers(effectNode, feedbackGain);
    console.log ('5) Initialisation socket OK');
  } catch (e) {
    console.log("erreur initialisation du socket et handler",e);
  }
}

async function initSousConteneurs(bufferNames) {
  try {

    bufferNames.forEach((name, idx) => {

      // Crée un conteneur pour chaque page
      const pageContainer = new PIXI.Container();
      pixiContainer.addChild(pageContainer);

      // Crée des sous-conteneurs pour les points, formes libres et séquenceurs
      const pointsContainer = new PIXI.Container();
      const formesLibresContainer = new PIXI.Container();
      const sequenceursContainer = new PIXI.Container();

      // Ajoute les sous-conteneurs au conteneur de la page
      pageContainer.addChild(pointsContainer);
      pageContainer.addChild(formesLibresContainer);
      pageContainer.addChild(sequenceursContainer);

      // Gestion Zindex
      pointsContainer.zIndex = 1;
      formesLibresContainer.zIndex = 2;
      sequenceursContainer.zIndex = 3;

      // Stocke les conteneurs dans des structures accessibles si nécessaire
      pointsConteneurs[idx] = pointsContainer;
      formesLibresConteneurs[idx] = formesLibresContainer;
      sequenceursConteneurs[idx] = sequenceursContainer;
      });

    // Activer le tri par zIndex
    pixiContainer.sortableChildren = true;
  } catch (e) {
    console.log("erreur init sous conteneurs PIXI",e);
  }
}

async function initialiseSelecteurDePage() {
  try {
    
    bufferNames = Object.keys(buffers);  // ["enr1.wav", "enr2.wav", ...]
    nbPages = bufferNames.length; // mise à jour du nb de pages
    
    createPageSelector(bufferNames, (pageIdx) => {
      currentPage = pageIdx;
      
      // rend tous les conteneurs invisibles sauf celui de la page courante
      pointsConteneurs.forEach((container, idx) => {
        container.visible = (idx === currentPage);
      });
      formesLibresConteneurs.forEach((container, idx) => {
        container.visible = (idx === currentPage);
      });
      sequenceursConteneurs.forEach((container, idx) => {
        container.visible = (idx === currentPage);
      });
      
      const bufferName = bufferNames[pageIdx]; // ex; "enr1.wav"
      const jsonName = bufferName.replace(/\.wav$/i, ".json"); // obtient ex "enr1.json"
      pointsData = points[jsonName] || [];
      buffer = buffers[bufferName];

      // gestion des objets graphiques PIXI à dessiner
      drawPixiPoints(pointsData, app, pixiPoints, pointsConteneurs[currentPage]);
      if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], pixiPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
          if (formesLibres[currentPage]) formesLibres[currentPage].visible = true;
      }

      console.log("Sélecteur de page initialisé");
    });

    // Affiche la première page par défaut
    if (bufferNames.length > 0) {
      //currentPage = 0;
      const bufferName = bufferNames[0];
      const jsonName = bufferName.replace(/\.wav$/i, ".json");
      pointsData = points[jsonName] || [];
      buffer = buffers[bufferName];
      if (app && pageBackgroundColors[0] !== undefined) {
        app.renderer.background.color = pageBackgroundColors[0];
      }
    }

  }
  catch(e){
    console.log("erreur pendant l'initialisation du selecteur de pages", e);
  }
}

export function onFormeLibreComplete(path) {

  lastFormesLibresPath[currentPage] = path; // stocke le chemin pour le resize/redessin
  drawingEnabled = false;
  const drawToggleButton = document.getElementById("draw-toggle");
  drawToggleButton.textContent = "Activer le dessin";
  drawToggleButton.style.backgroundColor = "";
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

// =======  INITIALISATION ==========
document.addEventListener('DOMContentLoaded', () => {

  console.log("DOM chargé, initialisation des éléments");

  // Empêche le zoom natif du navigateur (pinch sur trackpad)
  window.addEventListener('wheel', function(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });


  // *** click INIT initialisation de tous les éléments ***
  init.addEventListener("click", async () => {
    
    if (isInitialized) return;
    isInitialized = true;

    await setupPixi();
    await initialiseContexteAudio();
    await initialiseEffetAudio();
    await chargeFichiersAudioEtJson();
    await initialiseSocket();
    await initialiseSelecteurDePage();
    await initSousConteneurs(bufferNames);

    drawPixiPoints(pointsData, app, pixiPoints, pointsConteneurs[currentPage]);
    
    setupFormesLibres(app, nbPages, formesLibresConteneurs); // init nb de formesLibres = nb de pages
  });

  deleteEffect.addEventListener("click", async () => {
    if (formesLibresContextes[currentPage]) {
      formesLibresContextes[currentPage].clear();
       // On met à jour la propriété des points pour l'effet
      pixiPoints.forEach(point => {
        point.isEffectEnabled = formesLibres[currentPage].containsPoint(point.position);
      });
    }
  });

  // ****** pour dessiner la forme libre *******
  drawToggleButton.addEventListener("click", () => {

    if (!drawingEnabled) {
      drawingEnabled = true;
      drawToggleButton.textContent = 'Désactiver mode dessin';
      drawToggleButton.style.backgroundColor = "#0f0";

      DessinFormeLibre(app, drawingEnabled, pixiPoints, onFormeLibreComplete, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage]);
      
      if (formesLibres[currentPage]) formesLibres[currentPage].visible = true; // rend la forme libre visible
      console.log("Dessin activé");
    } 
  });

    // bouton Fullscreen
    document.getElementById("fullscreen-btn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        updateCenter(); // met à jour le centre de la vue

        
        drawPixiPoints(pointsData, app, pixiPoints, pointsConteneurs[currentPage]);// on redessine les points
    
    if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], pixiPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
      console.log('formelibre dessinée de fulscreen');
    }

      } else {
        document.exitFullscreen();
      }
    });
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
      playGrain(point.startTime, point.duration, point.isEffectEnabled, buffer);
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
