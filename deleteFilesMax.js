// Ce script est conçu pour [node.script] et ne fait qu'une seule chose :
// supprimer le fichier points.json, puis envoyer un bang.

const Max = require('max-api');
const fs = require('fs');
const path = require('path');

// Définir le chemin du fichier à supprimer de manière robuste
const filePathToDelete = path.join(__dirname, 'public', 'points.json');

// Créer un gestionnaire qui attend le message "delete"
Max.addHandler('delete', () => {
  // Utiliser fs.unlink pour supprimer le fichier
  fs.unlink(filePathToDelete, (err) => {
    if (err) {
      // Si l'erreur est que le fichier n'existe pas, ce n'est pas un problème.
      if (err.code === 'ENOENT') {
        Max.post('Le fichier points.json n\'existait pas. Prêt à créer un nouveau fichier.');
      } else {
        // Pour toute autre erreur, on l'affiche.
        Max.post(`Erreur lors de la suppression du fichier : ${err.message}`, Max.POST_LEVEL.ERROR);
      }
    } else {
      // Si la suppression réussit
      Max.post('Ancien fichier points.json supprimé avec succès.');
    }
    
    // Une fois l'opération terminée (réussie ou non), envoyer un bang
    // pour déclencher la prochaine étape dans le patcher Max.
    Max.outlet('bang');
  });
});