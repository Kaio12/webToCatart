export let formeLibre;
let formeLibreContext;

export let drawing = false; // état du dessin à la main

let pointsContainer; // conteneur Pixi pour les points
export let centerX = window.innerWidth / 2;
export let centerY = window.innerHeight / 2;

// Fonction pour mettre à jour le centre lors du resize
export function updateCenter() {
  centerX = window.innerWidth / 2;
  centerY = window.innerHeight / 2;
}


export function drawPixiPoints(pointsData, app, pixiPoints) {

  if (!app) {console.error("L'app pixi n'est pas initialisée");
    return;}
  if (!Array.isArray(pointsData) || pointsData.length === 0) {
      console.warn("Aucune donnée à afficher.");
      return;
    }

  if (!pointsContainer) {
    pointsContainer = new PIXI.Container();
    pointsContainer.pivot.set(centerX, centerY); // Centre le conteneur
    pointsContainer.position.set(centerX, centerY); 
    app.stage.addChild(pointsContainer);
    window.pointsContainer = pointsContainer; // Stocke le conteneur dans la fenêtre pour un accès global
  }

  pointsContainer.removeChildren(); // Efface les anciens points
  pixiPoints.length = 0;

  const bounds = getBounds(pointsData);
  //console.log("BOUNDS calculés :", bounds);

  pointsData.forEach((pointData) => {

    const pointGraphic = new PIXI.Graphics();

  // radius (taille des points) suit loudness (donné par analyse CATART/Max)
    const radius = mapRange(pointData.loudnessMax, bounds.lMin, bounds.lMax, 5, 20);

  // couleur du point suit energy (donné par analyse CATART/Max)
    const hue = mapRange(pointData.energyMax, bounds.eMin, bounds.eMax, 240, 0);
    const [r, gVal, b] = hslToRgb(hue / 360, 1, 0.5);
    const color = (r * 255 << 16) + (gVal * 255 << 8) + (b * 255) | 0;

  // Calcule la position centrée AVANT zoom
    const x0 = mapRange(pointData.x, bounds.xMin, bounds.xMax, radius, window.innerWidth -  2 * radius);
    const y0 = mapRange(pointData.y, bounds.yMin, bounds.yMax, radius, window.innerHeight - 2 * radius);


    pointGraphic.x = x0;
    pointGraphic.y = y0;

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

    pointGraphic.drawSelf();

    pointsContainer.addChild(pointGraphic); // Ajoute au container dédié
    pixiPoints.push(pointGraphic);
  });
}

  
export function setupFormeLibre (app) {
  formeLibreContext = new PIXI.GraphicsContext();
  formeLibre = new PIXI.Graphics(formeLibreContext);
  app.stage.addChild(formeLibre);
  return formeLibre;
}
      
let onDrawStart, onDrawMove, onDrawEnd;
let isCurrentlyDrawing = false; // Indique si le dessin est en cours

export function DessinFormeLibre(app, drawingEnabled) {
  const stage = app.stage;

  if(drawingEnabled) {

    onDrawStart = (event) => {
      isCurrentlyDrawing = true;
      const startPoint = event.global;

      formeLibreContext.clear()
      formeLibreContext.moveTo(startPoint.x, startPoint.y);
  };

    onDrawMove = (event) => {
      if (isCurrentlyDrawing) {
        const movePoint = event.global;
        formeLibreContext.lineTo(movePoint.x, movePoint.y);
        formeLibreContext.stroke({ width: 4, color: 0xff0000, alpha: 1});
        }
      };

    onDrawEnd = () => {
      isCurrentlyDrawing = false;
      formeLibreContext.stroke({ width: 4, color: 0xff0000, alpha: 1 });
    };

    stage.on("pointerdown", onDrawStart);
    stage.on("pointermove", onDrawMove);
    stage.on("pointerup", onDrawEnd);
    stage.on("pointerupoutside", onDrawEnd);
  } else {
    // Si le dessin est désactivé, on nettoie les anciens écouteurs d'événements
    if (onDrawStart) stage.off("pointerdown", onDrawStart);
    if (onDrawMove) stage.off("pointermove", onDrawMove);
    if (onDrawEnd) {
      stage.off("pointerup", onDrawEnd);
      stage.off("pointerupoutside", onDrawEnd);
    }
  }
}


// mise à jour de la position et du zoom
export function updateFormeLibreTransform(zoomFactor) {
 // if (!formeLibre) return;
 // formeLibre.scale.set(zoomFactor);
 // formeLibre.position.set(centerX, centerY);
}

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

// mapRange désigne ici une fonction fléchée
const mapRange = (val, inMin, inMax, outMin, outMax) =>
    ((val - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;


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



export function createCursor(app) {
  const cursor = new PIXI.Graphics();
  cursor.lineStyle(2, 0x333333, 0.6);
  cursor.drawCircle(0, 0, 25);
  cursor.endFill();

  cursor.visible = false; // Masqué par défaut
  app.stage.addChild(cursor);
  return cursor;
}

