export let formeLibre;
export let freeDrawPath = []; // pour le dessin à la main

const baseWidth = 800;  // largeur de la zone d'affichage des points
const baseHeight = 800; // hauteur de la zone d'affichage des points

// ****** fonction principale pour dessiner les points ******
export function drawPixiPoints(pointsData, app, pixiPoints, zoomFactor = 1) {

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
/*
    console.log(`Point ${index}:`, {
      originalX: pointData.x,
      originalY: pointData.y,
      mappedX: pointGraphic.x,
      mappedY: pointGraphic.y,
      radius: radius
    });
    */

    pointGraphic.drawSelf();
    app.stage.addChild(pointGraphic);
    pixiPoints.push(pointGraphic);
  });

  if (formeLibre) {
    app.stage.addChild(formeLibre);
     //updateFormeLibreTransform();
  }
}

  // ******** FORME LIBRRE ***********
  //dessin de forme libre pour la selection de grain
export function setupFormeLibre (app, zoomFactor) {

  // centre et zoom accessibles depuis le contexte
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  let drawing = false;
  formeLibre = new PIXI.Graphics();
  formeLibre.scale.set(zoomFactor);
  formeLibre.position.set(centerX, centerY);
  //freeDrawPath = [];
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
    window.pointerPos = e.data.global;
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

  return formeLibre;
}

// mise à jour de la position et du zoom
export function updateFormeLibreTransform(zoomFactor) {
  if (!formeLibre) {
    console.error("formeLibre n'est pas initialisée");
    return;
  }
  const centerX = window.innerWidth /2 ;
  const centerY = window.innerHeight / 2 ;
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

