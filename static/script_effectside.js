// *** script définit le comportement d'une page destinée à un Iphone controlant un effet faust ***

// empeche le touché
document.addEventListener('touchmove', function(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

const pad = document.getElementById('xy-pad');
let dragging = false;

const dessin = document.getElementById('dessin');

function getCoords(e) {
  const rect = pad.getBoundingClientRect();
  const x = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width;
  const y = ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top) / rect.height;
  return {
    x: Math.max(0, Math.min(1,x)),
    y: Math.max(0, Math.min(1,y))
  };
}

function updateDot(x,y) {
  let dot = document.getElementById('xy-dot');
  dot.style.left = (x * 100) + '%';
  dot.style.top = (y * 100) + '%';
}

function handleEvent(e) {
  if (!dragging && e.type.startsWith('touch')) return;
  const {x,y} = getCoords(e);
  updateDot(x,y);
  console.log({x,y});
  sendOSC("/effectPos", [x, y]);
}

dessin.addEventListener("click", () =>  {
  sendOSC("/dessin", [1])
});

pad.addEventListener('mousedown', e => { dragging = true; handleEvent(e); });
pad.addEventListener('mousemove', e => { if (dragging) handleEvent(e); });
pad.addEventListener('mouseup', () => { dragging = false; });
pad.addEventListener('mouseleave', () => { dragging = false; });


pad.addEventListener('touchstart', e => { dragging = true; handleEvent(e); });
pad.addEventListener('touchmove', handleEvent);
pad.addEventListener('touchend', () => { dragging = false; });
pad.addEventListener('touchcancel', () => { dragging = false; });

// on commence avec le point au centre du pad xy
updateDot(0.5, 0.5);

//*** partie réseau */

let socket;
fetch("/api/ip")
  .then(response => response.json())
  .then(data => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'localhost' : data.ip;
    const wsUrl = `${wsProtocol}//${host}:5001/browser`;
    socket = new WebSocket(wsUrl);
});

// === Communication avec la wpa ===
let sendOSC = function (address, args) {
    if (socket) {
      console.log("Sending via ws:", address, args);
      const message = {
        type: 'osc-to-browser',
        address,
        args
      };
      socket.send(JSON.stringify(message));
    } else {
      console.error("Socket not connected.");
    }
};

