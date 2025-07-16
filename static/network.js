export let socket;

// Envoie messages OSC via socket.io ===
export function sendOSC (address, ...args) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const message = {
      type: 'osc-to-max',
      address: address,
      args: args
    };
    socket.send(JSON.stringify(message));
  } else {
    console.error("Socket not connected.");
  }
};


export function initSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  socket = new WebSocket(wsUrl);
  

  socket.onopen = () => {
    console.log("connexion websocket");
  };

  socket.onclose =  (event) => {
    console.log("Socket déconnecté:", event.reason);
  };

  socket.onerror = (error) => {
    console.log("erreur websocket:", error);
  }

};

export function setupSocketAndHandlers(faustNode) {
  if(!socket) return;

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'osc-from-server') {
      mapOSCToFaust(data.address, data.args, faustNode);
    }
  };
}


// Mapping OSC → paramètres Faust
function mapOSCToFaust(address, args, faustNode) {
  if (!faustNode ) {
    console.warn("FaustNode non initialisé", faustNode);
    return;
  }
 if (!address ) {
    console.warn("adresse OSC invalide :", address);
    return;
  }

  if (!args || typeof args !== "object" || !Array.isArray(args)) {
    console.warn("Arguments OSC invalides :", args);
    return;
  }
  if (args.length === 0) {
    console.warn("Aucun argument fourni pour l'adresse OSC :", address);
    return;
  }

  const oscToFaustMap = {
  "/effectPos": ["/multi_Ef/g", "/multi_Ef/feedback"] // POUR L'INSTANT MAP UNIQUEMENT G ET FEEDBACK, SANS UTILISER LA REGRESSION 
  };

  const param = oscToFaustMap[address];
  if (Array.isArray(param)) {
    param.forEach((p, i) => {
      if (args[i] !== undefined) {
        console.log(`SetParam: ${p} = ${args[i]}`);
        faustNode.setParamValue(p, args[i]);
      }
    });
  } else if (typeof param === "string" && args[0] !== undefined) {
    faustNode.setParamValue(param, args[0]);
  } else {
    console.warn("Adresse OSC non reconnue :", address);
  }
}

// fonction pour charger les points via HTTP
export async function loadPoints() {
  try {
    const response = await fetch("/api/points");
    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Le fichier points.json n'existe pas encore.");
        return []; // Retourne un tableau vide si le fichier n'est pas trouvé
      }
      console.error("Erreur HTTP:", response.status);
      return;
    }
    const rawData = await response.json();

    if (rawData.type === "points" && Array.isArray(rawData.points)) {

      console.log("Points reçus :", rawData.points.length);

      const parsed = rawData.points.map(point => ({
        x: parseFloat(point.x),
        y: parseFloat(point.y),
        sampleId: point.sampleId,
        loudnessMax: parseFloat(point.loudnessmax),
        energyMax: parseFloat(point.energymax),
        time: parseFloat(point.time),
        duration: parseFloat(point.duration)
      })).filter(p => !isNaN(p.x) && !isNaN(p.y));
      
      return parsed;
    }  
  } catch (error) {
    console.error("Erreur de chargement des points:", error);
  }
}

