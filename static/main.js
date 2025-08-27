//*** script coté browser ***/
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

import { playGrain,initEffect, feedbackGain } from "./audio.js";
import { initSocket, setupSocketAndHandlers, sendOSC, loadJsonPoints, loadAudioBuffers } from "./network.js";
import { drawPixiPoints, setupFormesLibres, createCursor, DessinFormeLibre, ReDessinFormeLibre, formesLibres, formesLibresContextes } from "./graphics.js";
import { ClockWidget } from "./clock.js"

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
let currentPoints; // les points de la page courante

//let fondPourDessinFormeLibre;

let estEnTrainDeZoomer = false;

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
let clockWidget;


const selectorDiv = document.getElementById("page-selector"); // selecteur de page.
const init = document.getElementById("init"); // bouton d'initialistion globale.
const deleteEffect = document.getElementById("efface-formelibre"); // pour effacer la forme libre et l'effet afférent
const drawToggleButton = document.getElementById("draw-toggle");
const zoomToggleButton = document.getElementById("zoom");

let lastFormesLibresPath = []; //sauvegarde des coordo des formes libres.

let zoomFactor = 1.0 // facteur zoom affichage des points

let cursorGraphic; // le curseur.
//let pointerPos = { x: -9999, y: -9999 } //pointer position doigt

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

  // on ajout l'app canvas à la partie pixi-container de la page
  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);

  // Création du container principal PIXI
  if (!pixiContainer) {
    pixiContainer = new PIXI.Container();
    pixiContainer.pivot.set(centerX, centerY); // Centre le conteneur
    pixiContainer.position.set(centerX, centerY); 
    app.stage.addChild(pixiContainer);
  }

  // pour le dessin de la forme libre
  pixiContainer.hitArea = new PIXI.Rectangle(0, 0, window.innerWidth, window.innerHeight);
  pixiContainer.eventMode = 'static';


  // === blocage des gestes natifs ===
  app.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });


  const activePointers = new Map();
  let lastPinchDistance = null;

  const onPointerDown = async (event) => {
    if (drawingEnabled) return;
    activePointers.set(event.pointerId, event.global.clone());
  };

  const onPointerMove = (event) => {
    if (drawingEnabled) return; // Ne rien faire si on dessine
    if (!estEnTrainDeZoomer) return; // vérifie si le bouton zoom a été activé
    if (!activePointers.has(event.pointerId)) return;

    activePointers.set(event.pointerId, event.global.clone());

    if (activePointers.size === 3) {

      console.log('en train de zoomer');

      const pointers = Array.from(activePointers.values());
      const p1 = pointers[0];
      const p2 = pointers[1];
      const p3 = pointers[2];

      const centroidX = (p1.x + p2.x + p3.x) / 3;
      const centroidY = (p1.y + p2.y + p3.y) / 3;

      const dist1 = Math.hypot(p1.x - centroidX, p1.y - centroidY);
      const dist2 = Math.hypot(p2.x - centroidX, p2.y - centroidY);
      const dist3 = Math.hypot(p3.x - centroidX, p3.y - centroidY);

      const currentDistance = (dist1 + dist2 + dist3) / 3;


      if (lastPinchDistance === null) {
        //point central entre les trois doigts
        const pinchCenterGlobal = new PIXI.Point(centroidX, centroidY);
        const pinchCenterLocal = pixiContainer.toLocal(pinchCenterGlobal);

        //on déplace le pivot du conteneur vers ce nouveau centre:
        pixiContainer.pivot.copyFrom(pinchCenterLocal);

        //on ajuste sa position pour que le nouveau pivot apparaisse au m endroit que l'ancien
        pixiContainer.position.copyFrom(pinchCenterGlobal);
      }

      if (lastPinchDistance !== null) {
        const delta = currentDistance - lastPinchDistance;
        const sensitivity = 0.01;
        zoomFactor = Math.max(0.5, Math.min(2.5, zoomFactor + delta * sensitivity));
      }
      lastPinchDistance = currentDistance;
    }
  };

  const onPointerUp = (event) => {

    if (drawingEnabled) return; // Ne rien faire si on dessine
    estEnTrainDeZoomer = false; // fin du zoom
    activePointers.delete(event.pointerId);
    if (activePointers.size < 3) {
      lastPinchDistance = null;
    }
  };

  pixiContainer.on("pointerdown", onPointerDown);
  pixiContainer.on("pointermove", onPointerMove);
  pixiContainer.on("pointerup", onPointerUp);
  pixiContainer.on("pointerupoutside", onPointerUp);

  // au cas ou la fenêtre change de taille, on redessine les points
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    updateCenter();
    gestionPoints(bufferNames);
    
    if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], currentPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
      console.log('formelibre dessinée de resize');
    }
  });

  
  cursorGraphic = createCursor(app); // Crée le curseur.

  // ***** TICKER : actualisation de l'app sur chaque frame ******
  app.ticker.add(() => {

    // met à jour l'echelle du zoom à chaque frame */
    if (pixiContainer) {
    pixiContainer.scale.set(zoomFactor);
    }
  // Animation et redraw des points
  for (const point of pixiPoints) {
    const speed = 0.2;
    point.currentRadius += (point.targetRadius - point.currentRadius) * speed;
    if (typeof point.drawSelf === "function") point.drawSelf();
  }



  });

  console.log("1) SetupPixi terminé : ", app);

}

// crée un selecteur pour sélectionner la page/buffer à jouer.
function createPageSelector(bufferNames, onPageChange) {

  selectorDiv.innerHTML = ""; //efface le contenu précédent

  bufferNames.forEach((name, idx) => {
    const btn = document.createElement("button");
    btn.style.width = "36px";
    btn.style.height = "36px";
    btn.style.margin = "8px 0";
    btn.style.borderRadius = "50%";
    btn.style.border = "none";
    btn.style.background = idx === currentPage ? "#0f0" : "#444";
    btn.style.color = "#fff";
    btn.style.fontWeight = "bold";
    btn.style.fontSize = "16px";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = idx === currentPage ? "0 0 8px #0f0" : "none";
    btn.textContent = idx + 1; // Affiche le numéro de page

    btn.onclick = () => {
      onPageChange(idx);
      if (app && pageBackgroundColors[idx] !== undefined) {
        app.renderer.background.color = pageBackgroundColors[idx];
      }
      createPageSelector(bufferNames, onPageChange);
    };
   
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
      pageContainer.sortableChildren = true; // Active le tri pour les enfants de chaque page
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

async function gestionPoints(bufferNames) {
  try {
    pixiPoints = [];

    bufferNames.forEach((name, idx) => {

      const jsonName = name.replace(/\.wav$/i, ".json");
      const pointsDataForPage = points[jsonName] || [];
      const currentBufferForPage = buffers[name]; 

      const newPagePoints = drawPixiPoints(pointsDataForPage, app, pointsConteneurs[idx], getProximityThreshold);

      newPagePoints.forEach(point => {
       // console.log(`Attachement de l'écouteur au point ${point.sampleId} de la page ${name}`);
        
        point.on('pointerover', () => {
          console.log(`pointerover, Survol du point ${point.sampleId}. Utilisation du buffer:`, currentBufferForPage);

          point.targetRadius = point.baseRadius * 1.8;
          if (!drawingEnabled) playGrain(point.startTime, point.duration, point.isEffectEnabled, currentBufferForPage);
          sendOSC("/hover", point.sampleId);
        });

        point.on('pointerout', () => {
          point.targetRadius = point.baseRadius;
        });

      });

      pixiPoints.push(...newPagePoints);
    });
    // affiche la premiere page uniquement.
    pointsConteneurs.forEach((container, idx) => {
        container.visible = (idx === 0);
      });
      formesLibresConteneurs.forEach((container, idx) => {
        container.visible = (idx === 0);
      });
      sequenceursConteneurs.forEach((container, idx) => {
        container.visible = (idx === 0);
      });

      currentPoints = pointsConteneurs[0].children; // init currentPoints sur la première page

  } catch (e) {
    console.log("erreur dans le dessin des points", e);
  }
}

async function initialiseSelecteurDePage() {
  try {
    
    bufferNames = Object.keys(buffers);  // ["enr1.wav", "enr2.wav", ...]
    nbPages = bufferNames.length; // mise à jour du nb de pages
    
    createPageSelector(bufferNames, (pageIdx) => {
      currentPage = pageIdx;

      currentPoints = pointsConteneurs[currentPage].children; // mise à jour des points courants
      
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
      if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], currentPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
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
  drawToggleButton.textContent = "Ef";
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
    
    if (!isInitialized) {
      isInitialized = true;

      await setupPixi();
      await initialiseContexteAudio();
      await initialiseEffetAudio();
      await chargeFichiersAudioEtJson();
      await initialiseSocket();
      await initialiseSelecteurDePage();
      await initSousConteneurs(bufferNames);
      await gestionPoints(bufferNames);
    
      setupFormesLibres(app, nbPages, formesLibresConteneurs); // init nb de formesLibres = nb de pages
      }

    zoomFactor = 1.0;

    if (pixiContainer) {
      updateCenter(); // S'assure que le centre est à jour
      pixiContainer.pivot.set(centerX, centerY);
      pixiContainer.position.set(centerX, centerY);
    }

    // ======= séquenceur =======
    clockWidget = new ClockWidget(currentPoints, buffer, { radius: 80, speed: 0.04 });
    sequenceursConteneurs[currentPage].addChild(clockWidget);
    clockWidget.position.set(centerX, centerY); // position initiale
   
    app.ticker.add(() => {
      clockWidget.update();
    });

  });

  // Zoom toggle button
  zoomToggleButton.addEventListener("click", () => {
    estEnTrainDeZoomer = true;
    console.log("appel du zoom");
  })

  // ****** pour dessiner la forme libre *******
  drawToggleButton.addEventListener("click", () => {

    if (!drawingEnabled) {
      drawingEnabled = true;
      drawToggleButton.textContent = 'Stop';
      drawToggleButton.style.backgroundColor = "#0f0";

      DessinFormeLibre(pixiContainer, drawingEnabled, currentPoints, onFormeLibreComplete, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage]);
      
      if (formesLibres[currentPage]) formesLibres[currentPage].visible = true; // rend la forme libre visible
      console.log("Dessin activé");
    } 
  });

  // delete effect
  deleteEffect.addEventListener("click", async () => {
    if (formesLibresContextes[currentPage]) {
      formesLibresContextes[currentPage].clear();
       // On met à jour la propriété des points pour l'effet
      currentPoints.forEach(point => {
        point.isEffectEnabled = formesLibres[currentPage].containsPoint(point.position);
      });
    }
  });
    // bouton Fullscreen
    document.getElementById("fullscreen-btn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        updateCenter(); // met à jour le centre de la vue
        gestionPoints(bufferNames);

      if (lastFormesLibresPath[currentPage]) {
        ReDessinFormeLibre(lastFormesLibresPath[currentPage], currentPoints, formesLibres[currentPage], formesLibresContextes[currentPage], formesLibresConteneurs[currentPage] );
        console.log('formelibre dessinée de fulscreen');
      }

      } else {
        document.exitFullscreen();
      }
    });
});
