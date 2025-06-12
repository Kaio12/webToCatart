let audioBuffer = null; //buffer pour intégrer le fichier son reçu de max
export const audioContext = new (window.AudioContext || window.webkitAudioContext)();


export let faustNode = null; //node pour integrer l'effet audio codé en faust
export let grainBus = null; // bus fixe pour router les grains vers l'effet


// AudioContext pour gérer l'audio
export async function loadAudioBuffer() {
  try {
    const response = await fetch('/audio/enr.wav');
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log("Audio chargé en mémoire");
  } catch (e) {
    console.error("Erreur de chargement audio :", e);
  }
}


//fonction pour jouer le grain correspondant au point PIXI sélectionné (survolé)
export function playGrain(startMs, durationMs, useEffect = true) {
  if(!audioBuffer) return;

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  //connexion au faustnode. on verifie si le point est dans la forme libre
  if (useEffect && grainBus) {
    source.connect(grainBus);
  } else {
    source.connect(audioContext.destination);

  }  const startSec = startMs / 1000; //conversion en s
  const durationSec = durationMs / 1000;

  source.start(0, startSec, durationSec);
}

//insere le node effet faust
export async function initFaustEffect() {
  try{
    const { createFaustNode } = await import("./faust/multi_Ef.dsp-wasm/create-node.js");
    const result = await createFaustNode(audioContext, "multi_Ef", 0);
    faustNode = result.faustNode;

    // crée un bus pour les grains
    grainBus = audioContext.createGain();
    // grain => faust => destination
    grainBus.connect(faustNode);
    faustNode.connect(audioContext.destination);

    //parametres de base de l'effet audio faust (manque un dry/wet??)
    faustNode.setParamValue("/multi_Ef/g", 0.8);
    faustNode.setParamValue("/multi_Ef/feedback", 0.9);
    faustNode.setParamValue("/multi_Ef/intdel", 3000);
    faustNode.setParamValue("/multi_Ef/duration", 90);
    faustNode.setParamValue("/multi_Ef/drywet", 0);

    console.log("Faust DSP multi_Ef chargé et connecté.");
  }catch (e) {
    console.error("Erreur lors de l'initialisation de l'effet Faust :", e);
  }
}


