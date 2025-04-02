
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
                var points = [];
                for (let i = 0; i < DistX.length; i++)
                        {
                            var point = {
                                x: DistX[i],
                                y: DistY[i],
                                sampleId: i
                            };
                            points.push(point);
                        }
                var jsonPoints = JSON.stringify(points);
                post("JSON points ", jsonPoints, "\n");
                outlet (0, jsonPoints); // envoie le JSON à Max
            }

        }
    }
