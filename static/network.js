export let socket;

import {DessinFormeLibre} from "./graphics.js";
import {app, pixiPoints, drawingEnabled, onFormeLibreComplete, enableDrawing, audioContext} from "./main.js";

export let audioFiles;// liste des fichiers audio au format json
export let jsonFiles;// liste des fichiers analyse au format json

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
}

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

// charge la liste des fichiers audio sous forme JSON
async function loadListAudioFiles() {
  try {
    const response = await fetch('/api/listaudiofiles');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Le fichier listaudiofiles n'existe pas.");
        return []; // Retourne un tableau vide si le fichier n'est pas trouvé
      }
      console.error("Erreur HTTP:", response.status);
      return;
    }
    const liste = await response.json();
    return liste;
  } catch (e) {
    console.log("Erreur de chargement de la liste des fichiers audio:", e);
  }
}

export async function loadAudioBuffers() {
  const listAudioFiles = await loadListAudioFiles();
  const buffers = {};
  for (const fileName of listAudioFiles) {
    try {
      const response = await fetch(`/public/${fileName}`);
      const arrayBuffer = await response.arrayBuffer();
      buffers[fileName] = await audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error(`Erreur de chargement des fichiers audio ${fileName}:`, e);
    }
  }
  return buffers; // { "enr1.wav": AudioBuffer, ... }
}

// charge la liste des fichiers json analyse sous forme JSON
async function loadListJsonFiles() {
  try {
    const response = await fetch('/api/listjsonfiles');
    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Le fichier listjsonfiles n'existe pas.");
        return []; // Retourne un tableau vide si le fichier n'est pas trouvé
      }
      console.error("Erreur HTTP:", response.status);
      return;
    }
    const liste = await response.json();
    return liste;
  } catch (e) {
    console.log("Erreur de chargement de la liste des fichiers audio:", e);
  }
}

export async function loadJsonPoints() {
  const listJsonFiles = await loadListJsonFiles();
  const pointsByFile = {};
  for (const fileName of listJsonFiles) {
    try {
      const response = await fetch(`/public/${fileName}`);
      if (!response.ok) {
        console.warn(`le fichier ${fileName} n'a pas pu être chargé.`);
        continue;
      }
      const rawData = await response.json();

      if (rawData.type === "points" && Array.isArray(rawData.points)) {
        pointsByFile[fileName] = rawData.points.map(point => ({
          x: parseFloat(point.x),
          y : parseFloat(point.y),
          sampleId: point.sampleId,
          loudnessMax: parseFloat(point.loudnessmax),
          energyMax: parseFloat(point.energymax),
          time: parseFloat(point.time),
          duration: parseFloat(point.duration)
        })).filter(p => !isNaN(p.x)  && !isNaN(p.y));
      } else {
        pointsByFile[fileName] = [];
      }

    }catch (e) {
      console.error(`erreur de chargement du fichier JSON ${fileName}:`, e);
      pointsByFile[fileName] = [];
    }
  }
  return pointsByFile; // { "enr1.json": [...], ... }
}

