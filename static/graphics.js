export let formeLibre;
export let freeDrawPath = []; // pour le dessin à la main
export let drawing = false; // état du dessin à la main

let pointsContainer; // conteneur Pixi pour les points
export let centerX = window.innerWidth / 2;
export let centerY = window.innerHeight / 2;

// Fonction pour mettre à jour le centre lors du resize
export function updateCenter() {
  centerX = window.innerWidth / 2;
  centerY = window.innerHeight / 2;
}


export function drawPixiPoints(pointsData, app, pixiPoints, zoomFactor = 1) {

  if (!app) {console.error("L'app pixi n'est pas initialisée");
    return;}
  if (!Array.isArray(pointsData) || pointsData.length === 0) {
      console.warn("Aucune donnée à afficher.");
      return;
    }

  if (!pointsContainer) {
    pointsContainer = new PIXI.Container();
    app.stage.addChild(pointsContainer);
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

// Décale par rapport au centre, applique le zoom, puis recentre

    pointGraphic.x = centerX + (x0 - centerX) * zoomFactor;
    pointGraphic.y = centerY + (y0 - centerY) * zoomFactor;

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
// Initialise le dessin à main levée
  formeLibre = new PIXI.Graphics();
  formeLibre.position.set(centerX, centerY);

  app.stage.addChild(formeLibre);
  app.stage.setChildIndex(formeLibre, app.stage.children.length - 1);
  console.log("formeLibre ajouté au stage", formeLibre);
  return formeLibre;
}
      

export function DessinFormeLibre(app, drawingEnabled) {
  // Supprime les anciens événements pour éviter les doublons
  app.stage.removeAllListeners('pointerdown');
  app.stage.removeAllListeners('pointermove');
  app.stage.removeAllListeners('pointerup');
  app.stage.removeAllListeners('pointerupoutside');

  app.stage.on("pointerdown", (e) => {
    window.pointerPos = e.data.global; 
    const {x, y} = e.data.global;
    if (drawingEnabled) {
    drawing = true;
    freeDrawPath = [{x: (x - centerX), y: (y - centerY) }];
    formeLibre.clear();//efface si on recommence le geste
    }
  });

  // position du pointeur (souris, doigt)
  app.stage.on("pointermove", (e) => {
    console.log("drawing", drawing, "drawingEnabled", drawingEnabled);
    window.pointerPos = e.data.global;
    if (!drawing) return; 
    if (!drawingEnabled) return; // si le dessin est désactivé, on ne fait rien
    const {x, y} = e.data.global;
    const newPoint = { x: (x - centerX) , y: (y - centerY) };
    console.log("DessinFormeLibre: newPoint", newPoint);
    freeDrawPath.push(newPoint);
    console.log("freeDrawPath:", freeDrawPath);
    formeLibre.clear();
    
    if (freeDrawPath.length > 1) {
      console.log("DessinFormeLibre: Dessin en cours");
      formeLibre.beginFill(0xffcccc, 0.3);
      formeLibre.lineStyle(2, 0xff0000, 1);
      formeLibre.drawPolygon(freeDrawPath.flatMap(p => [p.x, p.y]));
      formeLibre.endFill();
    }
  });

  app.stage.on("pointerup", () => {
    drawing = false;
    drawingEnabled = false; // désactive le dessin après le relâchement
  });

  app.stage.on("pointerupoutside", () => {
    drawing = false;
    drawingEnabled = false; // désactive le dessin après le relâchement
  });

}

// mise à jour de la position et du zoom
export function updateFormeLibreTransform(zoomFactor) {
  if (!formeLibre) return;
  formeLibre.scale.set(zoomFactor);
  formeLibre.position.set(centerX, centerY);
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

