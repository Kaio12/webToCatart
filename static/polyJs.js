import Delaunator from "delaunator";
import pip from "robust-point-in-polygon";

/**
 * Library: polyJs
 * Objet: Uniformiser et redistribuer un nuage de points dans une région polygonale,
 *        via forces de ressorts entre voisins (triangulation de Delaunay) et
 *        repositionnement dans un polygone normalisé.
 *
 * Hypothèses/Unités:
 * - Les points sont normalisés dans [0,1]^2 (selon bounds d'entrée).
 * - La région (region) est définie en coordonnées normalisées si isNorm=true.
 * - l0_uni: longueur de repos moyenne cible (dépend de l’aire et du nombre de points).
 *
 * Dépendances:
 * - delaunator: triangulation de Delaunay 2D.
 * - robust-point-in-polygon: inclusion point-polygone robuste.
 */

/* ============================== */
/* == Utilitaires géométriques == */
/* ============================== */

/**
 * Aire signée (valeur absolue) d'un polygone simple.
 * @param {number[][]} poly - Tableau de sommets [[x,y], ...]
 * @returns {number} Aire positive
 */
function polygonArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/**
 * Centroïde d'un polygone (moyenne pondérée par aire).
 * @param {number[][]} poly
 * @returns {[number, number]} [cx, cy]
 */
function polygonCentroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) return [poly[0][0], poly[0][1]];
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Test point-dans-polygone (robuste).
 * @param {number[][]} poly
 * @param {number} x
 * @param {number} y
 * @returns {boolean} true si dans ou sur le bord
 */
function pointInPoly(poly, x, y) {
  // robust-point-in-polygon: -1 inside, 0 on edge, 1 outside
  return pip(poly, [x, y]) <= 0;
}

/** Clamp [0..1] */
function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }

/**
 * Distance d'un point à un segment (A->B) + point projeté.
 * @returns {{d:number,qx:number,qy:number,t:number}}
 */
function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const den = abx * abx + aby * aby || 1e-12;
  const t = clamp01((apx * abx + apy * aby) / den);
  const qx = ax + t * abx, qy = ay + t * aby;
  const dx = px - qx, dy = py - qy;
  return { d: Math.hypot(dx, dy), qx, qy, t };
}

/**
 * Point du polygone le plus proche (sur les arêtes).
 * @param {number[][]} poly
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]} point le plus proche
 */
function nearestPointOnPolygon(poly, x, y) {
  let best = { d: Infinity, qx: x, qy: y };
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const cand = distPointToSegment(x, y, ax, ay, bx, by);
    if (cand.d < best.d) best = cand;
  }
  return [best.qx, best.qy];
}

/**
 * Distance minimale de chaque point au contour du polygone.
 * - 0 si à l’intérieur (ou sur le bord), sinon distance au bord la plus proche.
 * @param {number[][]} poly
 * @param {number[][]} points - [[x,y], ...]
 * @returns {number[]} distances
 */
function polygonDistanceList(poly, points) {
  return points.map(([x, y]) => {
    if (pointInPoly(poly, x, y)) return 0;
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const { d } = distPointToSegment(x, y, ax, ay, bx, by);
      if (d < best) best = d;
    }
    return best;
  });
}

/* ===================== */
/* == Classe: Point  == */
/* ===================== */

/**
 * Représentation d’un point normalisé dans [0,1]^2, avec états pour la simulation.
 */
export class Point {
  /**
   * @param {number} x - coordonnée brute (non normalisée)
   * @param {number} y - coordonnée brute (non normalisée)
   * @param {[number,number,number,number]} bounds - [xmin, xmax, ymin, ymax]
   * @param {number} i - index
   */
  constructor(x, y, bounds, i) {
    this.index = i;

    // Coordonnées brutes (pour export/trace)
    this.scaled_og_x = x;
    this.scaled_og_y = y;

    // Normalisation dans [0,1]^2
    const nx = (x - bounds[0]) / (bounds[1] - bounds[0]);
    const ny = (y - bounds[2]) / (bounds[3] - bounds[2]);

    // Positions d'origine et courante (normalisées)
    this.og_x = nx; this.og_y = ny;
    this.x = nx; this.y = ny;

    // Coordonnées rescalées (selon bounds)
    this.scaled_x = x; this.scaled_y = y;

    // Position après uniformisation (souvenir)
    this.uni_x = nx; this.uni_y = ny;

    // Position au dernier recalcul de triangulation (pour seuil de retriangulation)
    this.prev_x = nx; this.prev_y = ny;

    // Vecteur de poussée cumulé (itération)
    this.push_x = 0; this.push_y = 0;

    // Voisins (points connectés par triangles Delaunay)
    this.near = [];
  }

  /** Milieu vers un autre point (coords normalisées) */
  midTo(pt) { return [(this.x + pt.x) / 2, (this.y + pt.y) / 2]; }

  getX() { return this.x; }
  getY() { return this.y; }

  /** Distance euclidienne (normalisée) à un autre point */
  distTo(pt) { return Math.hypot(this.x - pt.x, this.y - pt.y); }

  /**
   * Applique une force répulsive depuis un voisin (sens de la droite point->voisin).
   * @param {number} f - force (déjà multipliée par dt)
   * @param {Point} pt - voisin source
   */
  repulsiveForce(f, pt) {
    const ang = Math.atan2(this.y - pt.y, this.x - pt.x);
    this.push_x += f * Math.cos(ang);
    this.push_y += f * Math.sin(ang);
  }

  /**
   * Met à jour la position en appliquant la poussée, recalcule les coordonnées scalées.
   * @param {[number,number,number,number]} bounds
   */
  update(bounds) {
    this.x += this.push_x;
    this.y += this.push_y;
    this.scaled_x = this.x * (bounds[1] - bounds[0]) + bounds[0];
    this.scaled_y = this.y * (bounds[3] - bounds[2]) + bounds[2];
    this.push_x = 0; this.push_y = 0;
  }

  /** Mémorise la position courante (pour test de déplacement depuis la dernière triangulation) */
  updateOrigin() { this.prev_x = this.x; this.prev_y = this.y; }

  /** Norme du déplacement depuis le dernier updateOrigin() */
  distFromOrigin() { return Math.hypot(this.x - this.prev_x, this.y - this.prev_y); }

  /** Réinitialise la liste de voisins */
  resetNear() { this.near = []; }

  /** Programme un déplacement vers des coordonnées normalisées [nx,ny] */
  moveTo([nx, ny]) { this.push_x = nx - this.x; this.push_y = ny - this.y; }

  /** Norme de la poussée courante (utile pour test d’arrêt) */
  moveDist() { return Math.hypot(this.push_x, this.push_y); }

  /** Rappelle la position d’origine et met à jour les coordonnées scalées */
  recallOg(bounds) {
    this.x = this.og_x; this.y = this.og_y;
    this.scaled_x = this.x * (bounds[1] - bounds[0]) + bounds[0];
    this.scaled_y = this.y * (bounds[3] - bounds[2]) + bounds[2];
  }

  /** Sauvegarde la position « uniformisée » */
  storeUni() { this.uni_x = this.x; this.uni_y = this.y; }

  /** Rappelle la position « uniformisée » */
  recallUni() { this.x = this.uni_x; this.y = this.uni_y; }

  toString() { return `${this.index} (${this.x.toFixed(3)}, ${this.y.toFixed(3)})`; }
}

/* ====================== */
/* == Classe: Corpus   == */
/* ====================== */

/**
 * Corpus: agrège des points (depuis un track), normalise, définit une région et
 * redistribue les points uniformément via un processus itératif:
 * - Triangulation de Delaunay -> voisins
 * - Forces répulsives selon une longueur de repos cible (l0_uni * h_scale)
 * - Reprojections des points hors polygone vers le bord le plus proche
 */
export class Corpus {
  /**
   * @param {Record<string, number[][]>} track - objet {key: [[x,y,...], ...], ...}
   * @param {[number, number]} cols - indices des colonnes pour x,y
   */
  constructor(track, cols = [0, 1]) {
    this.track = track;
    this.buffers_md = {};
    this.all_buffer = [];
    // Concaténer tous les buffers + mémoriser tailles
    for (const [key, buffer] of Object.entries(this.track)) {
      this.all_buffer.push(...buffer);
      this.buffers_md[key] = buffer.length;
    }
    // Densité spatiale h(x,y): par défaut uniforme (=1)
    this.h_dist = (x, y) => 1;
    this.interp = 0;
    this.stop = false;
    this.setCols(cols);
  }

  /**
   * Sélection des colonnes x,y, calcul du bounding box et normalisation.
   * Définit region par défaut à [0,1]^2 (si reset_region).
   * @returns {[number,number,number,number]} bounds
   */
  setCols(cols, reset_region = true) {
    const pts = this.all_buffer.map(pt => [pt[cols[0]], pt[cols[1]]]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    this.bounds = [xmin, xmax, ymin, ymax];

    // Création des Points normalisés
    this.points = this.all_buffer.map((pt, i) =>
      new Point(pt[cols[0]], pt[cols[1]], this.bounds, i)
    );

    if (reset_region) {
      // Polygone unité (carré [0,1]^2)
      const vertices = [[0,0],[0,1],[1,1],[1,0]];
      this.setRegion(vertices, true);
    } else {
      const area = polygonArea(this.region);
      // Longueur de repos initiale (eq. 4)
      this.l0_uni = Math.sqrt(2 / (Math.sqrt(3) * this.points.length / area));
    }
    return this.bounds;
  }

  /**
   * Définit la région (polygone) cible pour la redistribution.
   * @param {number[][]} regionVertices - sommets du polygone
   * @param {boolean} isNorm - true si déjà normalisé [0..1]^2
   */
  setRegion(regionVertices, isNorm = false) {
    if (!isNorm) {
      // Normalise le polygone selon bounds
      const [xmin, xmax, ymin, ymax] = this.bounds;
      const w = xmax - xmin, h = ymax - ymin;
      this.region = regionVertices.map(([x, y]) => [(x - xmin) / w, (y - ymin) / h]);
    } else {
      this.region = regionVertices;
    }

    // Fonction distance signée (ici: 0 à l'intérieur, >0 à l'extérieur)
    this.dist_func = pts => polygonDistanceList(this.region, pts);

    // Boîte interne (pour pré-uniformisation)
    const center = polygonCentroid(this.region);
    const sides = Math.sqrt(polygonArea(this.region)) / 3;
    this.region_inbox = [center, sides];

    // Longueur de repos uniforme (eq. 4)
    const area = polygonArea(this.region);
    this.l0_uni = Math.sqrt(2 / (Math.sqrt(3) * this.points.length / area));
  }

  /**
   * Facteur d’échelle de la longueur de repos (eq. 5): dépend de h_dist et de la connectivité.
   * @returns {number}
   */
  getScalingFactor() {
    let target_area = 0, npair = 0;
    for (const p of this.points) {
      for (const n of p.near) {
        npair += 1;
        const [mx, my] = p.midTo(n);
        target_area += 1 / (this.h_dist(mx, my) ** 2);
      }
    }
    return this.l0_uni * Math.sqrt(npair / (target_area || 1));
  }

  /**
   * Pré-uniformisation: répartit grossièrement les points dans une sous-boîte centrale
   * en triant indépendamment sur x puis sur y.
   */
  preUniformization() {
    const [c, s] = this.region_inbox;
    const x1 = c[0] - s, x2 = c[0] + s;
    const y1 = c[1] - s, y2 = c[1] + s;
    const arr = this.points.slice();
    const n = arr.length;

    // Étale sur X
    arr.sort((a, b) => a.getX() - b.getX());
    for (let i = 0; i < n; i++) arr[i].x = (i / Math.max(1, n - 1)) * (x2 - x1) + x1;

    // Étale sur Y
    arr.sort((a, b) => a.getY() - b.getY());
    for (let i = 0; i < n; i++) arr[i].y = (i / Math.max(1, n - 1)) * (y2 - y1) + y1;
  }

  /**
   * Triangulation de Delaunay et mise à jour des voisinages.
   */
  delaunayTriangulation() {
    const coords = this.points.map(p => [p.x, p.y]);
    const tri = Delaunator.from(coords);
    this.updateNearPoints(tri.triangles);
    return tri;
  }

  /**
   * Remplit la liste des voisins pour chaque point à partir des triangles.
   * @param {Uint32Array|number[]} triangles - indices par triplets
   */
  updateNearPoints(triangles) {
    for (const p of this.points) { p.resetNear(); p.updateOrigin(); }
    for (let i = 0; i < triangles.length; i += 3) {
      const a = this.points[triangles[i]];
      const b = this.points[triangles[i + 1]];
      const c = this.points[triangles[i + 2]];
      if (!a.near.includes(b)) { a.near.push(b); b.near.push(a); }
      if (!a.near.includes(c)) { a.near.push(c); c.near.push(a); }
      if (!b.near.includes(c)) { b.near.push(c); c.near.push(b); }
    }
  }

  /** Demande d’arrêt de la simulation (sera prise en compte à l’itération suivante). */
  stop_distribute() { this.stop = true; }

  /**
   * Boucle principale de redistribution:
   * - pré-uniformisation
   * - boucle: Delaunay (si besoin), forces répulsives, re-projection dans la région, mise à jour
   * - s’arrête quand le déplacement est inférieur à stop_tol pour tous les points.
   *
   * @param {{exportPeriod?:number, stop_tol?:number}} opts
   * @returns {[number, number]} [nombre d’itérations, nombre de retriangulations]
   */
  distribute({ exportPeriod = 0, stop_tol = 0.001 } = {}) {
    // Réinitialise à la position d'origine
    for (const p of this.points) p.recallOg(this.bounds);

    // Répartition grossière initiale
    this.preUniformization();

    // Paramètres de simulation
    const dt = 0.2;      // pas de temps (intégration d’Euler)
    const tri_tol = 0.1; // seuil de déplacement (relatif à l0_uni) pour retrianguler
    const int_pres = 1.2;// pression (longueur de repos cible multipliée)
    const k = 1;         // raideur du ressort (masse supposée = 1)

    this.stop = false;
    let hscale = this.l0_uni, tot_count = 0, tri_count = 0;
    let update_tri = true;
    let exit = false;

    while (!exit) {
      exit = true;

      // Recalcule la triangulation si demandé
      if (update_tri) {
        tri_count += 1;
        this.delaunayTriangulation();
        update_tri = false;
      }

      // Met à jour l’échelle de la longueur de repos (densité)
      hscale = this.getScalingFactor();

      // 1) Accumule les forces répulsives de voisinage
      for (const p of this.points) {
        for (const n of p.near) {
          const [mx, my] = p.midTo(n);
          const f = k * (int_pres * hscale / this.h_dist(mx, my) - p.distTo(n));
          if (f > 0) n.repulsiveForce(dt * f, p);
        }
      }

      // 2) Contraintes de région + mise à jour
      for (const p of this.points) {
        // Si à l'intérieur: test d'arrêt, sinon re-projette sur le bord
        if (pointInPoly(this.region, p.x, p.y)) {
          if (exit && p.moveDist() / this.l0_uni > stop_tol) exit = false;
        } else {
          p.moveTo(nearestPointOnPolygon(this.region, p.x, p.y));
        }

        // Applique la poussée et recalcule les coordonnées scalées
        p.update(this.bounds);

        // Demande une retriangulation si trop de déplacement depuis la dernière origine
        if (!update_tri && p.distFromOrigin() / this.l0_uni > tri_tol) update_tri = true;
      }

      tot_count += 1;

      // Export intermédiaire (hook) si demandé
      if (exportPeriod && tot_count % exportPeriod === 0) {
        this.export();
      }

      // Arrêt externe
      if (this.stop) return [-tot_count, tri_count];
    }

    // Nettoyage et mémorisation de la config « uniforme »
    for (const p of this.points) { p.resetNear(); p.storeUni(); }
    return [tot_count, tri_count];
  }

  /**
   * Attracteurs simples (gaussiennes) — non porté ici.
   * Implémentable via un champ scalaire discret + gradient bilinéaire si besoin.
   */
  simple_attractors(/* gaussians_param, reset=false */) {
    // À implémenter si nécessaire (remplace l'usage de SciPy griddata/gradient).
  }

  /**
   * Hook d’export utilisateur (sérialisation/visualisation).
   * Exemple: console.log(this.points.map(p => [p.scaled_x, p.scaled_y]));
   */
  export() {
    // Surcharger dans l’application si besoin.
  }
}