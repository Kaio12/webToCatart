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

// Envelope par défaut (en secondes)
let GRAIN_ATTACK = 0.005;
let GRAIN_RELEASE = 0.05;

export function setGrainEnvelope(attack, release) {
  if (attack >= 0) GRAIN_ATTACK = attack;
  if (release >= 0) GRAIN_RELEASE = release;
}

//playgrain, pour jouer le grain correspondant au point PIXI sélectionné (survolé)
export function playGrain(startMs, durationMs, useEffect = false, BufferName) {
  if(!BufferName) return;

  const source = audioContext.createBufferSource();
  source.buffer = BufferName;

  // Gain d'enveloppe
  const envGain = audioContext.createGain();
  envGain.gain.value = 0;

  activeAudioSources.push(source); // ajoute la source pour éviter qu'elle soit garbage collectée
  
  source.onended = () => {
    source.disconnect(); // déconnecte la source une fois terminée
    envGain.disconnect();
    activeAudioSources = activeAudioSources.filter(s => s !== source); // retire la source
  };
  
  //connexion au node. on verifie si le point est dans la forme libre
  if (useEffect && grainBus) {
    source.connect(envGain).connect(grainBus);
  } else {
    source.connect(envGain).connect(audioContext.destination);
  }
  
  const startSec = startMs / 1000; //conversion en s
  const durationSec = durationMs / 1000;
  source.start(0, startSec, durationSec);
  
  // Planification enveloppe
  const now = audioContext.currentTime;
  let attack = GRAIN_ATTACK;
  let release = GRAIN_RELEASE;
  const minDur = 0.002;
  const effDur = Math.max(durationSec, minDur);
  if (attack + release > effDur) {
    const scale = effDur / (attack + release);
    attack *= scale;
    release *= scale;
  }
  const peakTime = now + attack;
  const endTime = now + effDur;
  const releaseStart = Math.max(peakTime, endTime - release);

  envGain.gain.setValueAtTime(0, now);
  envGain.gain.linearRampToValueAtTime(1, peakTime);
  envGain.gain.setValueAtTime(1, releaseStart);
  envGain.gain.linearRampToValueAtTime(0.0001, endTime); // quasi silence
}

export async function initEffect() {
  try {
    effectNode = audioContext.createDelay();
    effectNode.delayTime.value = 0.5;

    feedbackGain = audioContext.createGain();
    feedbackGain.gain.value = 0.8;

    grainBus = audioContext.createGain();

    grainBus.connect(effectNode);
    grainBus.connect(audioContext.destination);
    effectNode.connect(audioContext.destination);

    //boucle de feedback
    effectNode.connect(feedbackGain);
    feedbackGain.connect(effectNode);

    return { effectNode };
  } catch (e) {
    console.error("erreur lors de l'init de effectNode");
    return null;
  }
}



