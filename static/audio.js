// Gestion du son, lecture des grains, effets Faust
/*
├── audioContext
│   ├── faustNode
│   ├── grainBus
│   ├── playGrain(start, duration, useEffect)
│   ├── loadAudioBuffer()
│   ├── initFaustEffect()
*/

export let feedbackGain = null;

let audioBuffer = null; //buffer pour intégrer le fichier son reçu de max
let activeAudioSources = []; // tableau pour stocker les sources audio actives

// AudioContext pour gérer l'audio
export const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// FaustNode
//export let faustNode = null; //node pour integrer l'effet audio codé en faust
export let effectNode = null;
// GrainBus
export let grainBus = null; // bus fixe pour router les grains vers l'effet

//playgrain, pour jouer le grain correspondant au point PIXI sélectionné (survolé)
//*** probleme avec l'effet faust et la garbage collection ***
export function playGrain(startMs, durationMs, useEffect = false) {
  if(!audioBuffer) return;

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  activeAudioSources.push(source); // ajoute la source pour éviter qu'elle soit garbage collectée
  
  source.onended = () => {
    source.disconnect(); // déconnecte la source une fois terminée
    activeAudioSources = activeAudioSources.filter(s => s !== source); // retire la source
    /*
    if (!useEffect) {
      source.disconnect(); // déconnecte la source une fois terminée
      activeAudioSources = activeAudioSources.filter(s => s !== source); // retire la source du tableau
    } else {
      const delayTailDuration = 5000; // durée de la queue de l'effet Faust
      setTimeout(() => {
        console.log("Queue de l'effet Faust terminée, source déconnectée");
        source.disconnect(); // déconnecte la source après la queue
        activeAudioSources = activeAudioSources.filter(s => s !== source); // retire la source du tableau après la queue
      }, delayTailDuration);
    }
      */
  };
  
  //connexion au faustnode. on verifie si le point est dans la forme libre
  if (useEffect && grainBus) {
    source.connect(grainBus);
  } else {
    source.connect(audioContext.destination);
  }  
  const startSec = startMs / 1000; //conversion en s
  const durationSec = durationMs / 1000;
  source.start(0, startSec, durationSec);
}

// loadAudioBuffer charge le fichier audio depuis le serveur et le décode dans un AudioBuffer
export async function loadAudioBuffer() {
  try {
    const response = await fetch('/public/enr.wav');
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log("Audio chargé en mémoire");
  } catch (e) {
    console.error("Erreur de chargement audio :", e);
  }
}


export async function initEffect() {
  try {
    effectNode = audioContext.createDelay();
    effectNode.delayTime.value = 0.1;

    feedbackGain = audioContext.createGain();
    feedbackGain.gain.value = 0.8;

    grainBus = audioContext.createGain();

    grainBus.connect(effectNode);
    grainBus.connect(audioContext.destination);
    effectNode.connect(audioContext.destination);

    //boucle de feedback
    effectNode.connect(feedbackGain);
    feedbackGain.connect(effectNode);


    console.log("effectNode chargé");
    return {effectNode };
  } catch (e) {
    console.error("erreur lors de l'init de effectNode");
    return null;s
  }
}

/*
//init faust effect
export async function initFaustEffect() {
  try{
    const module = await import("./faust/multi_Ef_dsp_wasm/create-node.js");
    console.log("module importé (initFaustEffect)");
    const { createFaustNode } = module;

    // Vérification de l'AudioContext et de l'AudioWorklet
    if (!audioContext.audioWorklet) {
      throw new Error("AudioWorklet non supporté ou non initialisé.");
    }

    const result = await createFaustNode(audioContext, "multi_Ef", 0);
    console.log("createFaustNode effectué");
    faustNode = result.faustNode;

    // crée un bus pour router les grains vers l'effet Faust
    grainBus = audioContext.createGain();
    // grain => faust => destination
    grainBus.connect(faustNode);
    faustNode.connect(audioContext.destination);

    //parametres de base de l'effet audio faust (manque un dry/wet??)
    faustNode.setParamValue("/multi_Ef/g", 0.8);
    faustNode.setParamValue("/multi_Ef/feedback", 0.9);
    faustNode.setParamValue("/multi_Ef/intdel", 3000);
    faustNode.setParamValue("/multi_Ef/duration", 90);
    faustNode.setParamValue("/multi_Ef/drywet", 1);

    console.log("Faust DSP multi_Ef chargé et connecté.");
    return result; // retourne le faustNode pour l'utiliser ailleurs
  }catch (e) {
    console.error("Erreur lors de l'initialisation de l'effet Faust :", e);
    return null;
  }
}

*/


