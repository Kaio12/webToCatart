//script Node4Max
// reçoit les messages OSC envoyés par le serveur Flask

const path = require('path');
const Max = require('max-api');

const maxApi = require('max-api');
const  io  = require('socket.io-client'); 
const axios = require ('axios');

let socket;

axios.get("http://localhost:5001/api/ip")
    .then(response => {
        const ip = response.data.ip;
        const url = `http://${ip}:5001/max`;
        console.log("Connexion au socket :", url);

        socket = io(url);

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
    //console.log("Message from browser:", data);
    let json = JSON.stringify(data)
    console.log(json);
    let obj = JSON.parse(json);
    maxApi.outlet(obj.args);
});

})
.catch(error => {
  console.error("Impossible de récupérer l'IP depuis le serveur Flask :", error);
});

Max.addHandler("data", (msg) => {
    console.log("Message from Max:", msg);
    socket.emit("message", msg);
});
