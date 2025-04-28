# === Serveur Flask avec Socket.IO pour la communication entre navigateur et Max/MSP ===
# Ce serveur gère des messages OSC bidirectionnels et enregistre les données reçues côté navigateur.

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
import json
import os
from datetime import datetime
import socket
import csv

# pour la mise en cache des coordonnées des grains
catched_points = None
catched_audio = None

#définition du serveur Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = 'philippe'
socketio = SocketIO(app, cors_allowed_origins="*")

# Fonction pour récupérer l'adresse IP locale de la machine afin de la communiquer dynamiquement au client
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP
local_ip = get_local_ip()

# Route principale qui sert la page HTML avec l'interface utilisateur
@app.route("/")
def hello():
    return render_template('index.html')

# Route qui sert la page correspondant à la partie effet
@app.route("/effect")
def effect():
    return render_template('gestion_effet.html')

# Route API pour renvoyer dynamiquement l'adresse IP du serveur au client navigateur
@app.route("/api/ip")
def get_ip():
    return {"ip": local_ip}

# gestion bouton delete, efface le fichier log
@app.route('/delete' , methods= ['POST'])
def delete_file():
    log_dir = "logs"
    filepath = os.path.join(log_dir, "hover_data.csv")
    if os.path.exists(filepath):
        os.remove(filepath)
        print(f"Fichier log supprimé: {filepath}")
    else:
        print("Fichier log non trouvé")
    return render_template('index.html')

# gestion demande_points, envoie les points
@app.route('/catched_points', methods=['GET'])
def send_points():
    if catched_points:
        try:
            points_data = json.loads(catched_points)
        except (TypeError, json.JSONDecodeError):
            points_data = catched_points
        return jsonify(points_data), 200
    else:
        return {"status": "empty", "message": "No points available"}, 204

@app.route('/soundfile', methods=['GET'])
def soundfile():
    global catched_audio
    if catched_audio:
        try:
            son = json.loads(catched_audio)
        except (TypeError, json.JSONDecodeError):
            son = catched_audio
        return jsonify(son), 200
    else:
        return {"status": "empty", "message": "No soundfile available"}, 204


# === Communication côté navigateur ===
# Réception de messages texte ou OSC depuis le navigateur,
# enregistrement dans un fichier et redirection vers Max/MSP
@socketio.on('message', namespace='/browser')
def handle_browser_message(data):
    print('Received message from browser: ' + data)
    log_browser_data(data) #on enregistre les données dans un fichier pour éventuel analyse de geste
    socketio.emit('to_max', data, namespace='/max')  # on renvoie les infos vers max

@socketio.on('osc', namespace='/browser')
def handle_browser_osc(data):
    print('Received OSC from browser: ' + json.dumps(data, indent=2))
    log_browser_data(data, is_osc=True) #on enregistre les données osc recues
    socketio.emit('to_max', data, namespace='/max')  # Forward to Max/MSP namespace

# === Communication côté Max/MSP ===
# Réception de messages texte ou OSC depuis Max,
# et transmission au navigateur
@socketio.on('message', namespace='/max')
def handle_max_message(data):
    global catched_points
    catched_points = data
    print('Received message from Max/MSP: ' + catched_points)
    socketio.emit('to_browser', catched_points, namespace='/browser')  # Forward to browser namespace


@socketio.on('osc', namespace='/max')
def handle_max_osc(data):
    print('Received OSC from Max/MSP: ' + json.dumps(data, indent=2))
    socketio.emit('to_browser', data, namespace='/browser')  # Forward to browser namespace

# Fonction pour enregistrer les données reçues du navigateur dans un fichier de log
def log_browser_data(data, is_osc=False):
    timestamp = datetime.now().isoformat()
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "hover_data.csv")

    entry_type = "OSC" if is_osc else "MSG"
    with open(log_file, "a") as csvf:
        writer = csv.writer(csvf)
        writer.writerow([timestamp, data])

@app.route('/api/data', methods=['POST'])
def receive_data():
    global catched_points, catched_audio
    data = request.get_json()
    if data:
        print('Reçu données via HTTP POST:', json.dumps(data, indent=2))
        if data.get('type') == 'audio':
            catched_audio = json.dumps(data)
            print("audio recu")
        else:
            catched_points = json.dumps(data)
            print("pas de type audio")
        return {"status": "ok", "message": "Données reçues et stockées"}, 200
    else:
        return {"status": "error", "message": "Aucune donnée reçue"}, 400

# Lancement du serveur sur toutes les interfaces réseau, sur le port 5001
if __name__ == '__main__':
     socketio.run(app, host='0.0.0.0', port=5001)
