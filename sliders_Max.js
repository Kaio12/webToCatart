const maxApi = require('max-api');
const  io  = require('socket.io-client'); // Use socket.io-client instead of WebSocket

const socket = io("http://127.0.0.1:5000/max");

socket.on('connect', () => {
    console.log("WebSocket is open now.");
    socket.emit("Hello Server!");
});


socket.on('error', (error) => {
    console.error("WebSocket error:", error);
});

socket.on('close', () => {
    console.log("WebSocket connection closed.");
});



socket.on('to_max', (data) => {
    console.log("Message from browser:", data);
    maxApi.outlet(data);
});
