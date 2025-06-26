export const ongoingTouches = [];


export function startTouch(app) {
  const el = app.view;
  el.addEventListener("touchstart", handleStart);
  el.addEventListener("touchend", handleEnd);
  el.addEventListener("touchcancel", handleCancel);
  el.addEventListener("touchmove", handleMove);
  console.log("Initialisation.");
}   


function handleStart(evt) {
  evt.preventDefault();
  const touches = evt.changedTouches;

  for (let i = 0; i < touches.length; i++) {
    console.log(`touchstart: ${i}.`);
    ongoingTouches.push(copyTouch(touches[i]));
    window.pointerPos = { x: touches[i].clientX, y: touches[i].clientY };
  }
}

function handleMove(evt) {
  evt.preventDefault();

  console.log("touchmove");
  const touches = evt.changedTouches;

  for (let i = 0; i < touches.length; i++) {
    const idx = ongoingTouchIndexById(touches[i].identifier);
console.log(`Index du point de contact : ${idx}`);
    if (idx >= 0) {
      
      ongoingTouches.splice(idx, 1, copyTouch(touches[i])); // on met à jour le point de contact
      window.pointerPos = { x: touches[i].clientX, y: touches[i].clientY };
      console.log(`position du pointeur: ${window.pointerPos.x}, ${window.pointerPos.y}`);
      
    } else {
      console.log(`impossible de déterminer le point de contact à faire avancer`);
    }
  }
}

function handleEnd(evt) {
  evt.preventDefault();
  console.log("touchend");
  
  const touches = evt.changedTouches;

  for (let i = 0; i < touches.length; i++) {
    let idx = ongoingTouchIndexById(touches[i].identifier);
    if (idx >= 0) {
      
      ongoingTouches.splice(idx, 1); // on le retire du tableau de suivi
    } else {
      console.log(`impossible de déterminer le point de contact à terminer`);
    }
  }
   // Réinitialise la position du pointeur
  if (ongoingTouches.length === 0) {
    window.pointerPos = { x: -9999, y: -9999 }; // Position invalide
    console.log("window.pointerPos", window.pointerPos);
    console.log("Aucun contact actif, réinitialisation de pointerPos");
  }
}

  function handleCancel(evt) {
  evt.preventDefault();
  console.log("touchcancel.");
  const touches = evt.changedTouches;

  for (let i = 0; i < touches.length; i++) {
    let idx = ongoingTouchIndexById(touches[i].identifier);
    ongoingTouches.splice(idx, 1); // on le retire du tableau de suivi
  }
}


function copyTouch({ identifier, pageX, pageY }) {
  return { identifier, pageX, pageY };
}


function ongoingTouchIndexById(idToFind) {
  for (let i = 0; i < ongoingTouches.length; i++) {
    const id = ongoingTouches[i].identifier;

    if (id == idToFind) {
      return i;
    }
  }
  return -1; // non trouvé
}