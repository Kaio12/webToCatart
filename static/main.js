//*** script coté browser ***/
// script.js - Gère l'interaction entre le navigateur, Pixi.js, l'audio et le MIDI

import { playGrain,initEffect, feedbackGain } from "./audio.js";
import { socket, initSocket, setupSocketAndHandlers, sendOSC, loadJsonPoints, loadAudioBuffers, loadFormesLibres } from "./network.js";
import { drawPixiPoints, createCursor, DessinFormeLibre, formesLibres, termineFormeLibre  } from "./graphics.js";
import { ClockWidget } from "./clock.js"
import { VirtualPointer } from './virtualPointer.js';

//import { Point, Resample } from "./dollar.js";
import { resample, getBoundsArray, moyenneDistanceEntreTableaux } from "./resampler.js";

export let pixiContainer = null; // conteneur Pixi global

export let app; // app pixi
export let pixiPoints = []; // Configuration de Pixi.js pour le rendu graphique
export let drawingEnabled = false; // pour activer/désactiver le dessin libre

export let centerX = 0;
export let centerY = 0;

export const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let eventBoundary;
let isInitialized = false;

let pointsData = [];  // les données des points à afficher, chargées depuis le serveur
let currentPage = 0;
let currentPoints; // les points de la page courante


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

let points;

let buffers;
let buffer;
let bufferNames;

let effectNode;

let lastFormesLibresPath = []; //sauvegarde des coordo des formes libres.

let zoomFactor = 1.0 // facteur zoom affichage des points
let zoomFactors = []; // un zoom par page

let cursorGraphic; // le curseur.

let geste = null;
//let gesteAn = null;
let sequences = []; // tableau contenant les gestes
let sequencesAn = []; // tableau pour l'analyse des gestes

let vptrSeq; // pointer virtuel pour prochain séquenceur libre à construire

const selectorDiv = document.getElementById("page-selector"); // selecteur de page.
const init = document.getElementById("init"); // bouton d'initialistion globale.
const deleteEffect = document.getElementById("efface-formelibre"); // pour effacer la forme libre et l'effet afférent
const drawToggleButton = document.getElementById("draw-toggle");
const zoomToggleButton = document.getElementById("zoom");
const addClock = document.getElementById("clock+");
const delClock = document.getElementById("clock-");

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
  if (app && app.renderer) {
    centerX = app.renderer.width / 2;
    centerY = app.renderer.height / 2;
}
};

// **** Initialise et configure l'application Pixi.js ****
async function setupPixi() {

  app = new PIXI.Application();
  await app.init({
  resizeTo: document.getElementById('pixi-container'), // ou window
    backgroundColor: 0x000000 // couleur du fond
  });

  app.ticker.maxFPS = 60; // will not tick faster than 60fps

  app.renderer.on('resize', (width, height) => {
    console.log(`Pixi a redimensionné le canvas à ${width}x${height}`);

    centerX = width / 2;
    centerY = height / 2;

    if (pixiContainer) {
      pixiContainer.pivot.set(centerX, centerY);
      pixiContainer.position.set(centerX, centerY);
    }

    gestionPoints(bufferNames)  // redessine les points

  });

  // on ajout l'app canvas à la partie pixi-container de la page
  const container = document.getElementById("pixi-container");
  if (container) container.appendChild(app.canvas);

  // Création du container principal PIXI
  if (!pixiContainer) {
    pixiContainer = new PIXI.Container({label: 'pixiContainer'});
    app.stage.addChild(pixiContainer);
    pixiContainer.hitArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);
  }

  eventBoundary = new PIXI.EventBoundary(app.stage);

  pixiContainer.eventMode = 'static';

  // === blocage des gestes natifs ===
  app.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });
  app.canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });

  //cursorGraphic = createCursor(app); // Crée le curseur.

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

// pour jouer une séquence enregistrée
function playgeste(geste, vptr, onEnd) {
  if (!geste || !geste.events || geste.events.length === 0 || !vptr) return;
  console.log("playgeste");
  let i = 0;
  const start = performance.now();

  function step() {
    if (i >= geste.events.length) {
      if (typeof onEnd === "function") onEnd();
      return;
    };

    const evt = geste.events[i];
    const now = performance.now();
    const elapsed = now - start;

    if (elapsed >= evt.time) {
      vptr.move(evt.x, evt.y);
      i++;
    }
    if (i <= geste.events.length) {
      requestAnimationFrame(step);
    }
  }
  step();
}

// détermine les bornes de points (pour recogniser)
function getBounds(points) {
  const xs = points.map(p => p.X ?? p[0]);
  const ys = points.map(p => p.Y ?? p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  return { xmin, xmax, ymin, ymax };
}

function moyenneDistanceEntreGestes(g1, g2) {
  let total = 0;
  for (let i = 0; i < Math.min(g1.length, g2.length); i++) {
    const dx = g1[i].x - g2[i].x;
    const dy = g1[i].y - g2[i].y;
    total += Math.hypot(dx, dy);
  }
  return total / Math.min(g1.length, g2.length);
}

// à renommer, contient également le séquenceur (gestion des pointeurs);
function initZoom() {
    if (!pixiContainer) {
      console.log("pas de pixicontainer, pas de zoom");
      return;
    };
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

    if (activePointers.size === 2) {

      const pointers = Array.from(activePointers.values());
      const p1 = pointers[0];
      const p2 = pointers[1];

      const centroidX = (p1.x + p2.x ) / 2;
      const centroidY = (p1.y + p2.y ) / 2;

      const dist1 = Math.hypot(p1.x - centroidX, p1.y - centroidY);
      const dist2 = Math.hypot(p2.x - centroidX, p2.y - centroidY);

      const currentDistance = (dist1 + dist2 ) / 2;

      if (lastPinchDistance === null) {
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
}

// utilisée dans initReconnaissanceGeste
function createEventSeq(time, x, y) {
  return { time, x, y };
}

// reconnaissance de forme
function initReconnaissanceGeste() {

  const onPointerDown = async (event) => {
    geste = {
      startTimeSeq : performance.now(),
      events: []
    };

    if (drawingEnabled) return;
   
    const pos = pixiContainer.toLocal(event.global);
    geste.events.push(createEventSeq(geste.startTimeSeq, pos.x, pos.y)); // premier point enregistré sur pointerDown
  };

  const onPointerMove = (event) => {

    if (geste) {
      const currentTime = performance.now();
      const relTime = currentTime - geste.startTimeSeq;
      const pos = pixiContainer.toLocal(event.global);
      geste.events.push(createEventSeq(relTime, pos.x, pos.y));
    }

    if (drawingEnabled) return; // Ne rien faire si on dessine
  };

  const onPointerUp = (event) => {
    
    if (geste) {
      
      //console.log("geste", geste);

      sequences.push(geste);
      if (sequences.length > 3) sequences.shift();

      let pointsTab = geste.events.map(e => [e.x, e.y]);
      let gesteAnTab = resample(pointsTab, 64);
      
      sequencesAn.push(gesteAnTab);
      if (sequencesAn.length > 3) sequencesAn.shift();
      //console.log ("sequencesAn", sequencesAn);

      if (sequencesAn.length >= 3) {
        const scores = [
          moyenneDistanceEntreTableaux(sequencesAn[0], sequencesAn[1]),
          moyenneDistanceEntreTableaux(sequencesAn[0], sequencesAn[2]),
          moyenneDistanceEntreTableaux(sequencesAn[1], sequencesAn[2])
        ];
        const scoreGlobal = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log ("score global", scoreGlobal);
        if (scoreGlobal < 30) console.log("!!!!!!!OUI!!!!!!");
        else console.log("-------NON--------");
      };
  /*
  // joue la séquence une seule fois
      const seqClone = {
        startTimeSeq: geste.startTimeSeq,
        events: geste.events.map(e => ({ ...e }))
      };
      
      vptrSeq = new VirtualPointer(app, eventBoundary, pixiContainer);

      playgeste(seqClone, vptrSeq, () => {
        vptrSeq.up();
        vptrSeq.destroy();
        vptrSeq = null;

      });

  */
      geste = null;
      
    };

    if (drawingEnabled) return; // Ne rien faire si on dessine
    
  };

  pixiContainer.on("pointerdown", onPointerDown);
  pixiContainer.on("pointermove", onPointerMove);
  pixiContainer.on("pointerup", onPointerUp);
  pixiContainer.on("pointerupoutside", onPointerUp);

};


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
      const pageContainer = new PIXI.Container({label: 'page'});
      pixiContainer.addChild(pageContainer);

      // Crée des sous-conteneurs pour les points, formes libres et séquenceurs
      const pointsContainer = new PIXI.Container({label: 'points'});
      const formesLibresContainer = new PIXI.Container({label: 'formesLibres'});
      const sequenceursContainer = new PIXI.Container({label: 'sequenceurs'});

      // Ajoute les sous-conteneurs au conteneur de la page
      pageContainer.addChild(pointsContainer);
      pageContainer.addChild(formesLibresContainer);
      pageContainer.addChild(sequenceursContainer);

      // Gestion Zindex
      pageContainer.sortableChildren = true; // Active le tri pour les enfants de chaque page
      pageContainer.zIndex = 1;
      pointsContainer.zIndex = 2;
      formesLibresContainer.zIndex = 3;
      sequenceursContainer.zIndex = 4;

      });

    // Activer le tri par zIndex
    pixiContainer.sortableChildren = true;
  } catch (e) {
    console.log("erreur init sous conteneurs PIXI",e);
  }
}

// dessine les points, leur attribue fonction play et sendOsc, affiche la premiere page
async function gestionPoints(bufferNames) {
  try {
    pixiPoints = [];

    bufferNames.forEach((name, idx) => {

      const jsonName = name.replace(/\.wav$/i, ".json");
      const pointsDataForPage = points[jsonName] || [];
      const currentBufferForPage = buffers[name]; 

      const newPagePoints = drawPixiPoints(pointsDataForPage, app, pixiContainer.getChildrenByLabel('points', true)[idx], getProximityThreshold);

      newPagePoints.forEach(point => {
        
        point.on('pointerover', () => {

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
    
    // affiche la premiere page uniquement. pixiContainer.getChildByLabel('page');
    pixiContainer.getChildrenByLabel('page').forEach((container, idx) => {
        container.visible = (idx === 0);
      });


      currentPoints = pixiContainer.getChildrenByLabel('points', true)[0].children; // init currentPoints sur la première page

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

      currentPoints = pixiContainer.getChildrenByLabel('points', true)[currentPage].children; // mise à jour des points courants
      
      // rend tous les pages invisibles sauf la page courante
      pixiContainer.getChildrenByLabel('page').forEach((container, idx) => {
        container.visible = (idx === currentPage);
      });

      
      const bufferName = bufferNames[pageIdx]; // ex; "enr1.wav"
      const jsonName = bufferName.replace(/\.wav$/i, ".json"); // obtient ex "enr1.json"
      pointsData = points[jsonName] || [];
      buffer = buffers[bufferName]; 

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

export function onFormeLibreComplete(normPath) {
  drawingEnabled = false;
  const drawToggleButton = document.getElementById("draw-toggle");
  drawToggleButton.textContent = "Eff+";
  drawToggleButton.style.backgroundColor = "";

   let indiceFormeLibre; // num de la forme libre, probablement à déplacer
   indiceFormeLibre  += 1;

  // construction d'un objet JSON pour sauvegarder la formelibre construite et envoi par ws
  let recordFormeLibre = {"path": normPath};
  socket.send(JSON.stringify({
    page: currentPage,
    formeLibre: recordFormeLibre
  }));
  };

// pour dessiner les formesLibres à partir du fichier json
async function FormesLibresPredessinees() {
 const preFormesLibres = await loadFormesLibres();
 const path = [];
 if (pixiContainer) {
  const newFormeLibre = new PIXI.Graphics({label: 'formeLibre'});
  pixiContainer.children[0].children[1].addChild(newFormeLibre);

 }
}

  //pour activer drawingEnabled depuis network.js
export function enableDrawing() {
  drawingEnabled = true;
}

  // modifie le threshold suivant le zoom et la taille de fenetre
function getProximityThreshold() {
  const base = Math.min(app.renderer.width, app.renderer.height) * 0.04;
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
    
    try{
      await setupPixi();
      await initialiseContexteAudio();
      await chargeFichiersAudioEtJson();

      bufferNames = Object.keys(buffers);
      nbPages = bufferNames.length;

      await initSousConteneurs(bufferNames);
      //setupFormesLibres(app, nbPages, pixiContainer.getChildrenByLabel("formesLibres", true)); // init nb de formesLibres = nb de pages
      await gestionPoints(bufferNames);
      await initialiseSelecteurDePage();
      await initialiseEffetAudio();
      await initialiseSocket();

      initReconnaissanceGeste();

      //FormesLibresPredessinees();

      console.log("Initialisation terminée");
    } catch (e) {
      console.error("erreur initialisation", e);
    }
  }
      
    zoomFactor = 1.0;
    if (pixiContainer) {
      updateCenter(); // S'assure que le centre est à jour
      //pixiContainer.pivot.set(centerX, centerY);
      //pixiContainer.position.set(centerX, centerY);
    }

    // essai d'animation d'un vptr sur un cercle, pour remplacer clock plus tart
    let vptr = new VirtualPointer(app, eventBoundary, pixiContainer);
    let t = 0;
    app.ticker.add(() => {
      const cx = app.renderer.width * 0.5;
      const cy = app.renderer.height * 0.5;
      const r = Math.min(cx, cy) * 0.6;
      
      if (vptr) vptr.move(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
      t += 0.02;
      if (t>5 && vptr) {vptr.up(); vptr.destroy(); vptr = null};
    });


  });

  // Zoom toggle button
  zoomToggleButton.addEventListener("click", () => {
    estEnTrainDeZoomer = true;

    initZoom();

    console.log("appel du zoom");
  })

  // ****** pour dessiner la forme libre *******
  drawToggleButton.addEventListener("click", () => {

    if (!drawingEnabled) {
      drawingEnabled = true;
      drawToggleButton.textContent = 'Stop';
      drawToggleButton.style.backgroundColor = "#0f0";

      DessinFormeLibre(app, pixiContainer, currentPage, onFormeLibreComplete);
      
      //if (formesLibres[currentPage]) formesLibres[currentPage].visible = true; // rend la forme libre visible
      console.log("Dessin activé");
    } 
  });

  // delete effect
  deleteEffect.addEventListener("click", async () => {
    const formesLibresContainer = pixiContainer.getChildrenByLabel("formesLibres", true)[currentPage];

    if (formesLibresContainer && formesLibresContainer.children.length > 0) {
      // Supprime uniquement la dernière forme libre
      const lastFormeLibre = formesLibresContainer.children.pop();
      formesLibresContainer.removeChild(lastFormeLibre);

    // Met à jour les propriétés des points pour l'effet
    currentPoints.forEach(point => {
      point.isEffectEnabled = formesLibresContainer.children.some(forme => forme.containsPoint(point.position));
    });

    console.log("Dernière forme libre supprimée.");
  } else {
    console.log("Aucune forme libre à supprimer.");
  }
  });

    // bouton Fullscreen
    document.getElementById("fullscreen-btn").addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        updateCenter(); // met à jour le centre de la vue
        gestionPoints(bufferNames);

      } else {
        document.exitFullscreen();
      }
    });

    // bouton ajout clock
    addClock.addEventListener("click", () => {
      const clockWidget = new ClockWidget(currentPoints, buffer, { radius: 80, speed: 0.03 });
      pixiContainer.getChildrenByLabel("sequenceurs", true)[currentPage].addChild(clockWidget);
      clockWidget.position.set(app.renderer.width / 2, app.renderer.height / 2); // position initiale
      clockWidget.addTicker(app);
    });

      // bouton delete clock
    delClock.addEventListener("click", () => {
      const children = pixiContainer.getChildrenByLabel("sequenceurs", true)[currentPage].children;
      const lastChild = children[children.length - 1];
      if (lastChild instanceof ClockWidget) {
      pixiContainer.getChildrenByLabel("sequenceurs", true)[currentPage].removeChild(lastChild);
      lastChild.removeTicker(app);
      }
    }); 
});
