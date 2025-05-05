from sklearn.neural_network import MLPRegressor
import numpy as np
import json

# Exemple de données (à remplacer par tes vrais essais iPhone → Faust)
X = np.array([
    [0.0, 0.0],
    [1.0, 0.0],
    [0.0, 1.0],
    [1.0, 1.0],
    [0.5, 0.5]
])  # x, y iPhone

y = np.array([
    [0.1, 0.1, 500, 10],
    [0.8, 0.2, 3000, 30],
    [0.3, 0.9, 1000, 50],
    [0.9, 0.9, 4000, 90],
    [0.5, 0.5, 2000, 60]
])  # g, feedback, intdel, duration

# Entraîne un MLP avec deux couches cachées
model = MLPRegressor(hidden_layer_sizes=(8, 8), activation='relu', max_iter=10000)
model.fit(X, y)

# Export JSON avec poids/biais
weights = [layer.tolist() for layer in model.coefs_]
biases = [bias.tolist() for bias in model.intercepts_]

mlp_js_model = {
    "weights": weights,
    "biases": biases,
    "activation": "relu"
}

with open("mlp_model.json", "w") as f:
    json.dump(mlp_js_model, f, indent=2)