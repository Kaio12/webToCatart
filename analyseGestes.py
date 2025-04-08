import os
import json
from collections import deque, Counter
from datetime import datetime
import sys
import stumpy
import numpy as np

#la taille de la liste en arg dans l'appel du script
nbItRech = int(sys.argv[1])


def is_iterative_gesture(log_path="logs/browser_data2.log", min_repeat=2, sequence_length=nbItRech):
    if not os.path.exists(log_path):
        print("Fichier non trouvé.")
        return
#init le tableau de la séquence d'évènements
    args_sequence = []
    #Un gestionnaire de contexte est un objet qui met en place un contexte prédéfini au moment de l'exécution de l'instruction with.
    with open(log_path, "r") as f:
        for line in f:
            if "OSC" in line and '"/hover"' in line:
                try:
                    #on récupère uniquement l'arg
                    osc_data = json.loads(line.split("OSC:")[1])
                    args = osc_data.get("args")
                    #The isinstance() function returns True if the specified object is of the specified type, otherwise False.
                    if isinstance(args, list) and args:
                        args_sequence.append(args[0])
                    elif isinstance(args, int):
                        args_sequence.append(args)
                except Exception:
                    continue

    args_sequence = np.array(args_sequence)
    args_sequence = 

    # Supprimer les répétitions consécutives
    mask = np.insert(args_sequence[1:] != args_sequence[:-1], 0, True)
    filtered = args_sequence[mask]
    print("Liste filtrée (sans répétitions consécutives) :", filtered.tolist())

    # Détection de séquences répétées
    seen = Counter()
    for i in range(len(filtered)-sequence_length +1):
        window = tuple(filtered[i:i + sequence_length])
        seen[window] += 1

    # Affichage
    repeated = {seq: count for seq, count in seen.items() if count >= min_repeat}
    if repeated:
        print("GESTE ITÉRATIF DÉTECTÉ :")
        for seq, count in repeated.items():
            print(f"  Séquence {seq} répétée {count} fois")
    else:
        print("Aucun geste itératif détecté.")

    # analyse temporelle avec stumpy
    if len(args_sequence) >= sequence_length:
        print("\nAnalyse STUMP des motifs similaires :")
        mp = stumpy.stump(args_sequence, m=sequence_length)
        motif_index = int(np.argmin(mp[:, 0]))  # motif le plus similaire
        motif = args_sequence[motif_index:motif_index + sequence_length]
        print(f"Motif récurrent détecté à l'index {motif_index} : {motif.tolist()}")
    else:
        print("\nPas assez de données pour une analyse STUMP.")


if __name__ == "__main__":
    is_iterative_gesture()