// Script Node4Max : interface entre Max/MSP et le serveur Flask via WebSocket + HTTP

// Modules nécessaires
const path = require('path');              // Gère les chemins de fichiers (pas utilisé ici mais souvent utile)
const Max = require('max-api');            // API pour communiquer avec Max/MSP
const io = require('socket.io-client');    // Client WebSocket compatible avec Socket.IO
const axios = require('axios');            // Pour faire des requêtes HTTP (ici, pour récupérer l'IP du serveur)
const WavEncoder = require('wav-encoder'); // Afin d'encoder des données brutes en WAV
const { constants } = require('fs');
const fs = require('fs');
const fsp = require('fs/promises');
const FormData = require('form-data');


// Variable pour stocker le socket une fois connecté
let socket;

// 1. Récupération dynamique de l'IP locale du serveur Flask
axios.get("http://localhost:5001/api/ip")
    .then(response => {
        // Extraction de l'adresse IP depuis la réponse du serveur
        const ip = response.data.ip;
        const url = `http://${ip}:5001/max`;  // Création de l'URL du namespace Socket.IO côté Max
        console.log("Connexion au socket :", url);

        // 2. Connexion WebSocket au serveur Flask sur le namespace /max
        socket = io(url);

        // 3. Quand la connexion est établie
        socket.on('connect', () => {
            console.log("WebSocket is open now.");
            socket.emit("Hello Server!");  // Message test (non nécessaire)
        });

        // 4. Gestion des erreurs WebSocket
        socket.on('error', (error) => {
            console.error("WebSocket error:", error);
        });

        // 5. Détection de la fermeture de la connexion
        socket.on('close', () => {
            console.log("WebSocket connection closed.");
        });

        // 6. Réception des données envoyées par le navigateur via Flask (namespace /max → Max)
        socket.on('to_max', (data) => {
            // Transformation JSON pour éviter d’avoir des objets complexes
            let json = JSON.stringify(data);
            console.log(json);  // Log console côté Node
            let obj = JSON.parse(json);
            Max.outlet(obj.address, obj.args);  // Envoie uniquement les arguments (ex: [x, y, z]) dans Max  obj.args
        });

    })
    .catch(error => {
        console.error("Impossible de récupérer l'IP depuis le serveur Flask :", error);
    });


// 7. Envoi de messages depuis Max/MSP
Max.addHandler("data", (msg) => {
    console.log("Message from Max:", msg);
    axios.post("http://localhost:5001/api/data", msg, {
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            console.log("Données envoyées au serveur via HTTP:", response.data);
        })
        .catch(error => {
            console.error("Erreur lors de l'envoi HTTP vers le serveur:", error);
        });
});

var pathFile = "/Users/philippecaillot/Documents/programmation/geste/audiofiles/enr.wav"

Max.addHandler("exportSound", async () => {
    try {
        await fsp.access(pathFile, constants.F_OK);//vérifie que le fichier son existe
        console.log("le fichier son existe");
  
        const form = new FormData();
        form.append('file', fs.createReadStream(pathFile));
  
        const response = await axios.post("http://localhost:5001/api/upload", form, {
        headers: form.getHeaders()
      });
  
      console.log("Fichier envoyé au serveur Flask :", response.data);
    } catch (err) {
      console.error("Erreur exportSound :", err.message);
    }
  });