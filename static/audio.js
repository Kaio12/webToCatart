// Gestion du son, lecture des grains, effets Faust
/*
├── audioContext

│   ├── grainBus
│   ├── playGrain(start, duration, useEffect)

*/

import { audioContext } from "./main.js";


export let feedbackGain = null;

export let audioBuffers = {}; //buffer pour intégrer le fichier son reçu de max
let activeAudioSources = []; // tableau pour stocker les sources audio actives


export let effectNode = null;
// GrainBus
export let grainBus = null; // bus fixe pour router les grains vers l'effet

//playgrain, pour jouer le grain correspondant au point PIXI sélectionné (survolé)
export function playGrain(startMs, durationMs, useEffect = false, BufferName) {
  if(!BufferName) return;

  const source = audioContext.createBufferSource();
  source.buffer = BufferName;

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

    return {effectNode };
  } catch (e) {
    console.error("erreur lors de l'init de effectNode");
    return null;s
  }
}



