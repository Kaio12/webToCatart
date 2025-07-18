// *** script définit le comportement d'une page destinée à un Iphone controlant un effet faust ***


var position = new Nexus.Position('#position')
position.colorize ("fill", "#356");


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

// === Transmission coordonnées ===
position.on('change',function(v) {
    console.log(v);
    sendOSC("/effectPos", [v.x, v.y]);
  })