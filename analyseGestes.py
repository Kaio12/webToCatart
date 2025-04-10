import os
from collections import Counter
import numpy as np
import pandas as pd
import ast

# Fonction principale pour détecter les gestes itératifs à partir d'un fichier de log
def is_iterative_gesture(log_path="logs/hover_data.csv", min_repeat=2):
    # Vérifie si le fichier de log existe
    if not os.path.exists(log_path):
        print("Fichier non trouvé.")
        return
  
    args_sequence = []
    # Lecture du fichier CSV et transformation des données
    with open(log_path, "r") as f:
        f = pd.read_csv(log_path, header=None, names = ["timestamp", "data"])
        f["data"] = f["data"].apply(ast.literal_eval)  # Évalue les chaînes de caractères en objets Python
        f["args"] = f["data"].apply(lambda d: d["args"])  # Extrait les arguments des données

        args_sequence = f["args"].tolist()  # Convertit la colonne des arguments en liste
        args_sequence = np.array(args_sequence).astype(np.float64)  # Convertit la liste en tableau NumPy de type float64

    best_seq = None
    best_count = 0
    best_length = 0
    second_best_count = 0
    filtered = []

    # Teste plusieurs longueurs possibles de séquence pour détecter les gestes itératifs
    for test_len in range(2, min(20, len(args_sequence))):
        # Supprime les répétitions consécutives à chaque test
        mask = np.insert(args_sequence[1:] != args_sequence[:-1], 0, True)
        filtered = args_sequence[mask]

        seen = Counter()  # Compteur pour suivre les séquences vues
        for i in range(len(filtered) - test_len + 1):
            window = tuple(filtered[i:i + test_len])  # Crée une fenêtre de la séquence actuelle
            seen[window] += 1  # Incrémente le compteur pour cette fenêtre

        # Filtre les séquences qui ont été répétées suffisamment de fois
        repeated = {seq: count for seq, count in seen.items() if count >= min_repeat}
        for seq, count in repeated.items():
            print(f"  Candidat : {seq} — {count} fois (taille {test_len})")
        if repeated:
            most_common = max(repeated.items(), key=lambda x: x[1])  # Trouve la séquence la plus fréquente
            if most_common[1] > best_count:
                second_best_count = best_count
                best_seq, best_count, best_length = most_common[0], most_common[1], test_len  # Met à jour la meilleure séquence

    # Affiche le résultat de la détection des gestes itératifs
    if best_seq:
        print ("\nSéquence filtrée : ")
        print (filtered.tolist())
        print(f"\nGESTE ITÉRATIF DÉTECTÉ :\n  Séquence {best_seq} répétée {best_count} fois (longueur détectée : {best_length})")
        print(f"  Score précédent (deuxième meilleur) : {second_best_count}")
    else:
        print("\nAucun geste itératif détecté.")


# Exécution conditionnelle pour démarrer le script
if __name__ == "__main__":
    is_iterative_gesture()
