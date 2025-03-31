//script Node4Max
// reçoit les messages OSC envoyés par le serveur Flask

const path = require('path');
const Max = require('max-api');

const maxApi = require('max-api');
const  io  = require('socket.io-client'); 

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

Max.addHandler("data", (...msg) => {
    console.log("Message from Max:", msg);
    socket.emit("message", JSON.stringify(msg));
});