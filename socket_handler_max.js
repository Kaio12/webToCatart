// Script Node4Max : interface entre Max/MSP et le serveur NODE via WebSocket 

// Modules nécessaires

//const path = require('path');              // Gère les chemins de fichiers (pas utilisé ici mais souvent utile)
const Max = require('max-api');            // API pour communiquer avec Max/MSP
const io = require('socket.io-client');    // Client WebSocket compatible avec Socket.IO
const axios = require('axios'); 
const path = require('path');
const fs = require('fs');
           // Pour faire des requêtes HTTP (ici, pour récupérer l'IP du serveur)
const LOG_FOLDER = path.join(__dirname, 'logs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Désactive la vérification des certificats

// Variable pour stocker le socket une fois connecté
let socket;

// Récupération dynamique de l'IP locale du serveur
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
        });

        // 4. Gestion des erreurs WebSocket
        socket.on('error', (error) => {
            console.error("WebSocket error:", error);
        });

        // 5. Détection de la fermeture de la connexion
        socket.on('close', () => {
            console.log("WebSocket connection closed.");
        });

        // 6. Réception des données envoyées par le navigateur via server node (namespace /max → Max)
        socket.on('to_max', (data) => {
            // Transformation JSON pour éviter d’avoir des objets complexes
            let json = JSON.stringify(data);
            console.log(json);  // Log console côté Node
            let obj = JSON.parse(json);
            Max.outlet(obj.address, obj.args);  // Envoie uniquement les arguments (ex: [x, y, z]) dans Max  obj.args
            log_browser_data(data, true);
        });

    })
    .catch(error => {
        console.error("Impossible de récupérer l'IP depuis le serveur Node :", error);
    });

// Écoute le message "clear_log" venant de l'inlet de l'objet node.script
Max.addHandler("clear_log", () => {
  const logFile = path.join(LOG_FOLDER, 'hover_data.csv');
  try {
    // Tente de supprimer le fichier
    fs.unlinkSync(logFile);
    const successMsg = "Fichier log effacé avec succès.";
    console.log(successMsg);
    Max.outlet("log_status", successMsg); // Envoie une confirmation à Max
  } catch (e) {
    // Gère les erreurs, notamment si le fichier n'existe pas
    if (e.code === 'ENOENT') {
      const notFoundMsg = "Fichier log déjà inexistant.";
      console.log(notFoundMsg);
      Max.outlet("log_status", notFoundMsg);
    } else {
      const errorMsg = `Erreur lors de la suppression du fichier log: ${e.message}`;
      console.error(errorMsg);
      Max.outlet("log_status", errorMsg);
    }
  }
});


    // Logging
function log_browser_data(data, is_osc = false) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOG_FOLDER, 'hover_data.csv');
  const entry_type = is_osc ? "OSC" : "MSG";
  fs.appendFileSync(logFile, `${timestamp},${entry_type},${JSON.stringify(data)}\n`);
}


