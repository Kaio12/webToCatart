import { Delaunay } from "d3-delaunay";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";

/**
 * applyForceLayout(pointsData, pixiPoints, app, opts)
 * - pointsData : tableau d'objets source (avec éventuellement type/energy/loudness)
 * - pixiPoints  : tableau des PIXI.Graphics créés (même ordre que pointsData)
 * - app         : instance PIXI.Application pour connaître width/height
 * - opts        : { baseDist, baseCharge, iterations, weightFn }
 */
export async function applyForceLayout(pointsData, pixiPoints, app, opts = {}) {
  const {
    baseDist = Math.min(app.renderer.width, app.renderer.height) * 0.08,
    baseCharge = 400,
    iterations = 300,
    weightFn = (d) => {
      // exemple : calcule un poids entre 0.2 (petit) et 2.0 (fort) selon loudness/energy
      const loud = (d.loudnessMax ?? 0);
      const energy = (d.energyMax ?? 0);
      const score = (loud * 0.6 + energy * 0.4);
      return 0.5 + Math.min(1.5, score); // adapte à tes données
    }
  } = opts;

  // nodes init: si pixiPoints existants, prends leurs positions actives
  const nodes = pointsData.map((pd, i) => {
    const px = pixiPoints[i];
    const x = px ? px.x : (pd.xNorm ? pd.xNorm * app.renderer.width : (pd.x || app.renderer.width/2));
    const y = px ? px.y : (pd.yNorm ? pd.yNorm * app.renderer.height : (pd.y || app.renderer.height/2));
    const weight = weightFn(pd);
    return { id: i, x, y, weight, data: pd };
  });

  // triangulation Delaunay sur positions actuelles
  const coords = nodes.map(n => [n.x, n.y]);
  const delaunay = Delaunay.from(coords);
  const triangles = delaunay.triangles; // flat int32 array [i0,i1,i2,...]

  // construire set d'arêtes uniques à partir des triangles
  const edgeSet = new Set();
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t+1], c = triangles[t+2];
    [[a,b],[b,c],[c,a]].forEach(([u,v]) => {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      edgeSet.add(key);
    });
  }
  const links = Array.from(edgeSet).map(k => {
    const [u,v] = k.split('_').map(Number);
    return { source: u, target: v };
  });

  // simulation
  const sim = forceSimulation(nodes)
    .force("link", forceLink(links).id(d => d.id).distance(link => {
      const s = link.source, t = link.target;
      // distance dépend du poids moyen : plus weight -> plus distant
      const w = (s.weight + t.weight) / 2;
      return baseDist * (1 + w * 0.6);
    }).strength(0.8))
    .force("charge", forceManyBody().strength(d => -baseCharge * d.weight))
    .force("collide", forceCollide().radius(d => (d.data._radius ?? 10) * (1 + d.weight * 0.2)).iterations(2))
    .force("center", forceCenter(app.renderer.width/2, app.renderer.height/2))
    .stop();

  // tick loop manuel (contrôlé) : exécute N itérations et met à jour Pixi à chaque étape
  for (let i = 0; i < iterations; i++) {
    sim.tick();

    // update positions PIXI (si pixiPoints fournis)
    if (pixiPoints && pixiPoints.length) {
      for (const node of nodes) {
        const g = pixiPoints[node.id];
        if (!g) continue;
        g.x = node.x;
        g.y = node.y;
        // si point utilise hitArea centré, rien d'autre à faire ; redraw se fait dans ticker
      }
    }
    // tu peux await un petit délai si tu veux animer lentement
  }

  sim.stop();
  return nodes; // nodes contiennent positions finales
}



/*
import { applyForceLayout } from "./forceLayout.js";
// ...après gestionPoints(bufferNames) a rempli pixiPoints...
const finalNodes = await applyForceLayout(pointsDataForPage, pixiPointsForPage, app, {
  baseDist: 80,
  baseCharge: 300,
  iterations: 200,
  weightFn: (d) => {
    // exemple : si d.type === 'percussive' => weight élevé
    if (d.type === 'percussive') return 1.6;
    if (d.type === 'melodic') return 0.6;
    return 1.0;
  }
});
*/