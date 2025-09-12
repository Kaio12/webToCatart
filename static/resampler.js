// 


export function resample(points, N) {

points = [[0,0],[1,2],[2,2],[3,2],[4,5]];
let longueur = 0; 
let pas = 0; // longueur de chaque segement

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