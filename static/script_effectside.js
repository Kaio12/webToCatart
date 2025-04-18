var position = new Nexus.Position('#position')

// === Connexion socket.io avec Max/MSP ===
let socket;
fetch("/api/ip")
  .then(response => response.json())
  .then(data => {
    socket = io(`http://${data.ip}:5001/browser`);
    window.socket = socket;
    socket.on('connect', () => {
      console.log("Connecté à", data.ip);
    });
  }
);

// === Communication avec Max/MSP via socket.io ===
let sendOSC = function (address, args) {
    if (socket && socket.connected) {
      console.log("Sending OSC:", address, args);
      socket.emit('osc', { address, args });
    } else {
      console.error("Socket not connected.");
    }
  };

// === Transmission coordonnées ===
position.on('change',function(v) {
    console.log(v);
    sendOSC("/effectPos", [v.x, v.y]);
  })