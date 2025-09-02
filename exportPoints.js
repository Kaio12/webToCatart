outlets = 2;

// exporte de max vers browser les coordonnées de chaque grain
    function exportPoints(fileName) {
    var mubu = new MubuJS("echantillons");
    mubu.refer("echantillons"); 

    if (mubu != null) {
        var lesdeux = mubu.gettrack(1, "lesdeux");
        if (lesdeux != null) {
            var DistX = lesdeux.getmxcolumn(0);
            var DistY = lesdeux.getmxcolumn(1);
            var loudnessMax = lesdeux.getmxcolumn(7);
            var energyMax = lesdeux.getmxcolumn(4);
            var Time = lesdeux.gettime();
            var Duration = lesdeux.getmxcolumn(2);

            try {
                var folderPath = "/Users/philippecaillot/Documents/programmation/geste/public";
                //var fileName = "points.json";
                

                var filePath = folderPath + "/" + fileName;
                var file = new File(filePath, "write", "JSON");

                if (file.isopen) {
                    // --- MODIFICATION : Écriture itérative ---

                    // 1. Écrire le début du fichier
                    file.writestring('{\n  "type": "points",\n  "points": [\n');

                    // 2. Boucler sur les points et les écrire un par un
                    for (let i = 0; i < DistX.length; i++) {
                        var point = {
                            x: DistX[i],
                            y: DistY[i],
                            loudnessmax: loudnessMax[i],
                            energymax: energyMax[i],
                            sampleId: i,
                            time: Time[i],
                            duration: Duration[i]
                        };
                        
                        // Convertir UN SEUL point en JSON
                        var pointString = JSON.stringify(point, null, 2);
                        
                        // Ajouter une virgule sauf pour le dernier élément
                        if (i < DistX.length - 1) {
                            pointString += ',';
                        }
                        
                        // Écrire le point dans le fichier
                        file.writestring(pointString + '\n');
                    }

                    // 3. Écrire la fin du fichier
                    file.writestring('  ]\n}\n');
                    
                    file.close();
                    post("Fichier points.json mis à jour avec succès avec " + DistX.length + " points.\n");
                } else {
                    post("Erreur : Impossible d'ouvrir le fichier points.json.\n");
                }
            } catch (error) {
                post("Erreur lors de l'écriture du fichier points.json : " + error.message + "\n");
            }
        }
    }
}

// exporte le son enregistré dans mubu vers un fichier wav
function exportSound(fileName)
    {
       var mubu = new MubuJS("echantillons");
        mubu.refer("echantillons");
       
        if (mubu != null) 
        {
            try {
            var audio = mubu.gettrack(1, "audio");
            
            if(audio != null){
                audio.write(`/Users/philippecaillot/Documents/programmation/geste/public/${fileName}`);
            }
            } catch (error) {
                post("Erreur lors de l'exportation du son :", error.message, "\n");
            }
        }
    }