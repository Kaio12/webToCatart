// permet d'inclure ou d'exclure des buffers.

inlets = 1;

function list(numBuff, numTotal) {

	let excluded = []; //buffers à exclure

	for (let i = 1; i <= numTotal; i++) {
		if (i === numBuff) {
			outlet(0, "include " + numBuff);
			}
		else excluded.push(i);	
	};

	outlet(0, "exclude " + excluded.join(" "));

	}
	