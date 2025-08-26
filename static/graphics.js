export let formesLibres;
export let formesLibresContextes;

export let drawing = false; // état du dessin à la main
let onDrawStart, onDrawMove, onDrawEnd;
let isCurrentlyDrawing = false; // Indique si le dessin est en cours
let startDrawPoint;
let currentPath = [];

export function drawPixiPoints(pointsData, app, container, getProximityThreshold) {

  if (!app) {console.error("L'app pixi n'est pas initialisée");
    return;}
  if (!Array.isArray(pointsData) || pointsData.length === 0) {
      console.warn("Aucune donnée à afficher.");
      return;
    }

  container.removeChildren(); // Efface les anciens points
  const newPoints = [];

  
  const bounds = getBounds(pointsData);

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
    pointGraphic.isEffectEnabled = false;

    pointGraphic.startTime = pointData.time;
    pointGraphic.duration = pointData.duration;

    pointGraphic.drawSelf = function () {
      this.clear();
      this.beginFill(this.color);
      this.drawCircle(0, 0, this.currentRadius);
      this.endFill();
    };

    pointGraphic.drawSelf();

    pointGraphic.eventMode = 'static';
    pointGraphic.cursor = 'pointer';
    pointGraphic.hitArea = new PIXI.Circle(0, 0, getProximityThreshold());

    container.addChild(pointGraphic); // Ajoute au container dédié
    newPoints.push(pointGraphic);
  });

  return newPoints;
}
  
export function setupFormesLibres (app,  nbPages, formesLibresConteneurs) {
  formesLibres = [];
  formesLibresContextes = [];

  for (let i = 0; i < nbPages; i++) {
    const ctx = new PIXI.GraphicsContext(); 
    const graphic = new PIXI.Graphics(ctx); 
    formesLibresContextes.push(ctx);
    formesLibres.push(graphic);

    if(formesLibresConteneurs) {
      formesLibresConteneurs[i].addChild(graphic);
    }
    else {
      console.log ("pas de formesLibresConteneurs lors de l'initialisation des formesLibres");
    }
    
  }
  console.log('formesLibres', formesLibres);
  return formesLibres;
}   

export function DessinFormeLibre(fondPourDessinFormeLibre, drawingEnabled, currentPoints, onCompleteCallback, formeLibre, formeLibreContext, Container) {
  const stage = fondPourDessinFormeLibre;
  let lastPath; //pour sauvegarder les coordonnées après dessin de la forme libre.

  if(drawingEnabled) {

    onDrawStart = (event) => {
      isCurrentlyDrawing = true;
      startDrawPoint = Container.toLocal(event.global);
      currentPath = [startDrawPoint];

      formeLibreContext.clear()
  };

    onDrawMove = (event) => {
      if (isCurrentlyDrawing) {
        const movePoint = Container.toLocal(event.global);
        currentPath.push(movePoint);
        
        formeLibreContext.clear();
        formeLibreContext.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i< currentPath.length; i++) {
          formeLibreContext.lineTo(currentPath[i].x, currentPath[i].y);
          }
        formeLibreContext.stroke({ width: 4, color: 0xff0000, alpha: 1});
        }
    };

    onDrawEnd = () => {
      if(!isCurrentlyDrawing) return;
      isCurrentlyDrawing = false;

      formeLibreContext.clear();
      if (currentPath.length > 1) {
        formeLibreContext.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
          formeLibreContext.lineTo(currentPath[i].x, currentPath[i].y);
        }
        // On ferme le chemin en revenant au premier point
        formeLibreContext.lineTo(currentPath[0].x, currentPath[0].y);
      }

      // On peut maintenant remplir ET tracer le contour
      formeLibreContext.fill({ color: 0x0000ff, alpha: 0.2 });
      formeLibreContext.stroke({ width: 4, color: 0xff0000, alpha: 1 });
      
      // On réinitialise pour le prochain dessin, on sauvegarde dans lastPath
      lastPath = currentPath;
      currentPath = [];

      // gestion de l'effet: on marque les points concernés, à l'intérieur de la forme libre.
      currentPoints.forEach(point => {
        point.isEffectEnabled = formeLibre.containsPoint(point.position);
      });

      if (onCompleteCallback) {
        // coordonnées normalisés
        const normPath = lastPath.map(pt => ({
          x: pt.x / window.innerWidth,
          y: pt.y / window.innerHeight
        }));
      onCompleteCallback(normPath);
      }


      // on nettoie les écouteurs après le dessin de la forme libre.
      if (onDrawStart) fondPourDessinFormeLibre.off("pointerdown", onDrawStart);
      if (onDrawMove) fondPourDessinFormeLibre.off("pointermove", onDrawMove);
      if (onDrawEnd) {
        fondPourDessinFormeLibre.off("pointerup", onDrawEnd);
        fondPourDessinFormeLibre.off("pointerupoutside", onDrawEnd);
      }
    };

    fondPourDessinFormeLibre.on("pointerdown", onDrawStart);
    fondPourDessinFormeLibre.on("pointermove", onDrawMove);
    fondPourDessinFormeLibre.on("pointerup", onDrawEnd);
    fondPourDessinFormeLibre.on("pointerupoutside", onDrawEnd);

  } 
}

// après un zoom ou un redimensionnement de fenetre, ou le choix d'un corpus
export function ReDessinFormeLibre(normPath, currentPoints, formeLibre, formeLibreContext, Container) {
  formeLibreContext.clear();
  const pxPath = normPath.map(pt => ({
    x: pt.x * window.innerWidth,
    y: pt.y * window.innerHeight
  }));

  formeLibreContext.moveTo(pxPath[0].x, pxPath[0].y);
  for (let i = 1; i < pxPath.length; i++) {
    formeLibreContext.lineTo(pxPath[i].x, pxPath[i].y);
  }
  // On ferme le chemin en revenant au premier point
  formeLibreContext.lineTo(pxPath[0].x, pxPath[0].y);

  // On peut remplir et tracer le contour
  formeLibreContext.fill({ color: 0x0000ff, alpha: 0.2 });
  formeLibreContext.stroke({ width: 4, color: 0xff0000, alpha: 1 });

  // On met à jour la propriété des points pour l'effet
  currentPoints.forEach(point => {
      point.isEffectEnabled = formeLibre.containsPoint(point.position);
  });

  if (Container && formeLibre && !Container.children.includes(formeLibre)) {Container.addChild(formeLibre);}

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

