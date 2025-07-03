outlets = 2;

// exporte de max vers browser les coordonnées de chaque grain
function exportPoints()
    {
    var mubu = new MubuJS("echantillons");
    mubu.refer("echantillons"); 

    if (mubu != null) 
        {
            var lesdeux = mubu.gettrack(1, "lesdeux");
            if(lesdeux != null){
                DistX = lesdeux.getmxcolumn(1); // récupère les positions x des grains
                DistY = lesdeux.getmxcolumn(2); // récupère les positions y des grains
                loudnessMax = lesdeux.getmxcolumn(8);
                energyMax = lesdeux.getmxcolumn(5);
                Time = lesdeux.gettime();
                Duration= lesdeux.getmxcolumn(3);

                var points = [];
                for (let i = 0; i < DistX.length; i++)
                        {
                            var point = {
                                x: DistX[i],
                                y: DistY[i],
                                loudnessmax : loudnessMax[i],
                                energymax : energyMax[i],
                                sampleId: i,
                                time : Time[i],
                                duration : Duration[i]
                            };
                            points.push(point);
                        }
              // On crée l'objet JavaScript complet
                var dataObject = {type: "points", points: points};
                
                // On transforme l'objet en chaîne JSON formatée (avec sauts de ligne et indentation)
                var dataToWrite = JSON.stringify(dataObject, null, 2);
                
                try {
                    var file = new File("/Users/philippecaillot/Documents/programmation/geste/public/points.json", "write", "JSON");
                    if (file.isopen) {
                        file.writestring(dataToWrite);
                        file.close();
                        post("Fichier points.json mis à jour avec succès.\n");
                    } else {
                        post("Erreur : Impossible d'ouvrir le fichier points.json.\n");
                    }
                } catch (error) {
                    post("Erreur lors de l'écriture du fichier points.json :", error.message, "\n");
                }
               
            }
        }
    }

    function exportSound()
    {
       var mubu = new MubuJS("echantillons");
        mubu.refer("echantillons");
       
        if (mubu != null) 
        {
            try {
            var audio = mubu.gettrack(1, "audio");
            
            if(audio != null){
                audio.write("/Users/philippecaillot/Documents/programmation/geste/public/enr.wav");
            }
            } catch (error) {
                post("Erreur lors de l'exportation du son :", error.message, "\n");
            }
        }
    }