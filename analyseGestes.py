import os
import json
from collections import deque, Counter
from datetime import datetime
import sys

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

    # Supprimer les répétitions consécutives
    filtered = [args_sequence[0]] if args_sequence else []
    for val in args_sequence[1:]:
        if val != filtered[-1]:
            filtered.append(val)

    # Détection de séquences répétées
    seen = Counter()
    recent = deque(maxlen=sequence_length)
    for val in filtered:
        recent.append(val)
        if len(recent) == sequence_length:
            seen[tuple(recent)] += 1

    # Affichage
    repeated = {seq: count for seq, count in seen.items() if count >= min_repeat}
    if repeated:
        print("GESTE ITÉRATIF DÉTECTÉ :")
        for seq, count in repeated.items():
            print(f"  Séquence {seq} répétée {count} fois")
    else:
        print("Aucun geste itératif détecté.")

if __name__ == "__main__":
    is_iterative_gesture()