import os
import json
from collections import deque, Counter
from datetime import datetime

def is_iterative_gesture(log_path="logs/browser_data2.log", min_repeat=2, sequence_length=8):
    if not os.path.exists(log_path):
        print("Fichier non trouvé.")
        return

    args_sequence = []
    with open(log_path, "r") as f:
        for line in f:
            if "OSC" in line and '"/hover"' in line:
                try:
                    osc_data = json.loads(line.split("OSC:")[1])
                    args = osc_data.get("args")
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
        print("✅ GESTE ITÉRATIF DÉTECTÉ :")
        for seq, count in repeated.items():
            print(f"  Séquence {seq} répétée {count} fois")
    else:
        print("❌ Aucun geste itératif détecté.")

if __name__ == "__main__":
    is_iterative_gesture()