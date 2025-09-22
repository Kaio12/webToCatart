// resample array to length 64

export function resample(points, N) {
  if (points.length <= 1) return points; // si un seul point séléctionné, pas de resampling

    let longueur = 0; 
    let pas = 0; // longueur unitaire des futurs segments, initilisée à 0.

    let distOrigineCumul = [0]; 

    for (let i = 1; i < points.length; i ++) {
	
	    const longSeg = Math.hypot(
		    points[i][0] - points[ i - 1 ][0], 
		    points[ i ][1] - points[i-1][1]);
	
	    longueur += longSeg;
	    distOrigineCumul.push(longueur);
	  }

    let nombreSegmentsTabOri = distOrigineCumul.length;
    pas = longueur / ( N - 1 ); // calcul de la distance entre chaque point dans le tableau resamplé
    let distCibleCumul = [];

    for (let k = 0; k < N; k++) {
	    distCibleCumul.push(k * pas);
      }

    let pointsResamp = [];

    for (let distCible of distCibleCumul) { // pour chaque distance cible du tableau des distances cible cumulées
   
        let numSeg = 1;
        while (numSeg < nombreSegmentsTabOri && distOrigineCumul[numSeg] < distCible) {
            numSeg++;
        }
    
        // Si on dépasse, prendre le dernier point
        if (numSeg >= nombreSegmentsTabOri) {
            pointsResamp.push([...points[points.length - 1]]);
            continue;
        }
    
        // Interpoler entre points[numSeg-1] et points[numSeg]
        let coef = (distCible - distOrigineCumul[numSeg-1]) / (distOrigineCumul[numSeg] - distOrigineCumul[numSeg-1]);
        let x = points[numSeg-1][0] + coef * (points[numSeg][0] - points[numSeg-1][0]);
        let y = points[numSeg-1][1] + coef * (points[numSeg][1] - points[numSeg-1][1]);
        pointsResamp.push([x, y]);
        }
    return pointsResamp;
}


export function getBoundsArray(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
   const xs = points.map(p => p[0]);
   const ys = points.map(p => p[1]);
    const xmin = Math.min (...xs);
    const xmax = Math.max (...xs);
    const ymin = Math.min (...ys);
    const ymax = Math.max (...ys);
    return { xmin, xmax, ymin, ymax };
}


export function moyenneDistanceEntreTableaux(g1, g2) {
  if (!Array.isArray(g1) || !Array.isArray(g2)) return null; 
  let total = 0;
  const n = Math.min(g1.length, g2.length);
  for (let i = 0; i < n; i++) {
    const dx = g1[i][0] - g2[i][0];
    const dy = g1[i][1] - g2[i][1];
    total += Math.hypot(dx, dy);
  }
  return total / n;
}