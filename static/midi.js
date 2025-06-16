// ************* MIDI ********************
//*******POUR L'INSTANT INUTILISÉ ********
//gestion midi (qui va se superposer à osc, a revoir)

/*
├── midi.js
│   ├── onMIDISuccess()
│   ├── onMIDIFailure()
│   ├── handleMIDIMessage(event)
│   └── initMIDI() ← (optionnel pour centraliser l’accès)
│*/

export function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values()) {
    input.onmidimessage = handleMIDIMessage;
  }
  console.log("✅ MIDI ready");
}

export function onMIDIFailure() {
  console.error("❌ Échec accès MIDI");
}

//*****INUTILISÉ POUR L'INSTANT */
export function handleMIDIMessage(message) {
  const [status, data1, data2] = message.data;

  // Exemple : MIDI CC sur canal 1
  if ((status & 0xF0) === 0xB0) {
    const cc = data1;
    const val = data2 / 127;

    if (!faustNode) return;

    // Exemple : CC#1 -> gain, CC#2 -> delay
    if (cc === 1) {
      faustNode.setParamValue("/multi_Ef/drywet", val);
    } else if (cc === 2) {
      faustNode.setParamValue("/multi_Ef/delay", val);
    }
  }
}

export function initMIDI() {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
  } else {
    console.warn("Web MIDI API non supporté");
  }
}

