export let socket;

import {DessinFormeLibre} from "./graphics.js";
import {app, pixiPoints, drawingEnabled, onFormeLibreComplete, enableDrawing} from "./main.js";


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

export function setupSocketAndHandlers(effectNode, feedbackGain) {
  if(!socket) return;

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'osc-from-server') {
     if (data.address === '/effectPos') {
      mapOSCToEffect(data.address, data.args, effectNode, feedbackGain)
      console.log("osc-from-server", data.address, data.args[0], data.args[1]);
     }
      else if (data.address === '/dessin') {
        console.log ('dessin recu');
        enableDrawing();
        DessinFormeLibre(app, drawingEnabled, pixiPoints, onFormeLibreComplete);
      }
      
    }
  };
}


function mapOSCToEffect(address, args, effectNode, feedbackGain) {
   if (!effectNode) {
    console.warn("EffectNode non initialisé", effectNode);
    return;
  }
  if (!address) {
    console.warn("adresse OSC invalide :", address);
    return;
  }

  if (!args || !Array.isArray(args)) {
    console.warn("Arguments OSC invalides :", args);
    return;
  }
  if (args.length === 0) {
    console.warn("Aucun argument fourni pour l'adresse OSC :", address);
    return;
  }

  if (address === "/effectPos") {
    feedbackGain.gain.value = args[0];
    effectNode.delayTime.value = args[1];
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

