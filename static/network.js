export let socket;
// Envoie messages OSC via socket.io ===
export let sendOSC = function (address, args) {
  if (socket && socket.connected) {
    //console.log("Sending OSC:", address, args);
    socket.emit('osc', { address, args });
  } else {
    console.error("Socket not connected.");
  }
};

export function getIp() {
  return fetch("/api/ip")
    .then(response => response.json())
    .then(data => {
      console.log("IP récupérée :", data.ip);
      return data.ip;
  })
  .catch(error => {
    console.error("Erreur lors de la récupération de l'IP :", error);
    throw error;
  });
}

export function initSocket(ip) {
  socket = io(`http://${ip}:5001/browser`);
  socket.on('connect', () => {
    console.log("Connecté à", ip);
  });    
}

export function setupSocketAndHandlers(faustNode) {
  socket.on('to_browser', (data) => {
    if (!data) {
      console.warn("data to_browser vide ou non défini");}
    //console.log("data to_browser:", data);
    
    const { address, args } = data;
    if (address === "/hover") return;  
    console.log("osc recu: ", address, args);
    mapOSCToFaust(address, args, faustNode);
  });
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
    const response = await fetch("/catched_points");
    if (!response.ok) {
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
      
    } else if (rawData.type === "soundfile") {
      console.log("Reçu un fichier son : ", rawData.filename);
    } else {
      console.warn("Type de données inconnu :", rawData);
    }
  } catch (error) {
    console.error("Erreur de chargement des points:", error);
  }
}

