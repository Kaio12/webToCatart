# === Serveur Flask avec Socket.IO pour la communication entre un navigateur, un iphone et Max/MSP ===
# Patch: eventlet monkey patching inserted at the very top
import eventlet
eventlet.monkey_patch()
# Ce serveur gère des messages OSC bidirectionnels, sert différents fichiers (son, coordonnées des points à dessiner) et enregistre les données reçues côté navigateur.

#table de routage osc
TABLE_ROUTING = {
    "/iphone/": "/browser",
    "/ipad/": "/max",
    "/max/": "/browser"
}

from flask import Flask, render_template, request, jsonify, send_from_directory
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
UPLOAD_FOLDER = './uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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

# Route pour servir le fichier manifest.json et le service worker
@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/service-worker.js')
def service_worker():
    return send_from_directory('static', 'service-worker.js')

@app.route('/icons/<path:filename>')
def icons(filename):
    return send_from_directory('static/icons', filename)

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

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return {"error": "No file part"}, 400
    file = request.files['file']
    if file.filename == '':
        return {"error": "No selected file"}, 400
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    return {"status": "ok", "filename": file.filename}

@app.route('/audio/<filename>')
def serve_audio(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/mlp_model")
def mlp_model():
    return send_from_directory(UPLOAD_FOLDER, "mlp_model.json")

# === Communication côté navigateur ===
# Réception de messages texte ou OSC depuis le navigateur,
# enregistrement dans un fichier et redirection vers Max/MSP
@socketio.on('message', namespace='/browser')
def handle_browser_message(data):
    print('Received message from browser: ' + data)
    log_browser_data(data) #on enregistre les données dans un fichier pour éventuel analyse de geste
    socketio.emit('to_max', data, namespace='/max')  # on renvoie les infos vers max


# ****** pour l'instant un socket message et un socket osc, probablement à clarifier
@socketio.on('osc', namespace='/browser')
def handle_browser_osc(data):
    print('Received OSC from browser: ' + json.dumps(data, indent=2))
    log_browser_data(data, is_osc=True) #on enregistre les données osc recues
    route_osc(data)

# Communication côté Max/MSP
# Réception de messages texte ou OSC depuis Max,
# et transmission au navigateur
@socketio.on('message', namespace='/max')
def handle_max_message(data):
    global catched_points
# Débogue les données reçues
    print('Données brutes reçues de Max/MSP:', repr(data))
    
    catched_points = data
    print('Received message from Max/MSP: ' + catched_points)
    socketio.emit('to_browser', catched_points, namespace='/browser')  # Forward to browser namespace


@socketio.on('osc', namespace='/max')
def handle_max_osc(data):
    print('Received OSC from Max/MSP: ' + json.dumps(data, indent=2))
    route_osc(data)

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

#function qui prend les adresse osc pour et envoie les données avec le bon routing défini dans la table en tête du script
def route_osc(data):
    address = data.get("address", "")
    for prefix, target_ns in TABLE_ROUTING.items():
        if address.startswith(prefix):
            socketio.emit('to_' + target_ns.strip('/'), data, namespace=target_ns)
            return
    # Par défaut
    socketio.emit('to_browser', data, namespace='/browser')

@app.route('/api/data', methods=['POST'])
def receive_data():
    global catched_points
    data = request.get_json()
    if data:
        print('Reçu données via HTTP POST:', json.dumps(data, indent=2))
        catched_points = json.dumps(data)
        return {"status": "ok", "message": "Données reçues et stockées"}, 200
    else:
        return {"status": "error", "message": "Aucune donnée reçue"}, 400

# Lancement du serveur sur toutes les interfaces réseau, sur le port 5001
# Patch: Replace main block with eventlet.wsgi.server SSL version
import eventlet
import eventlet.wsgi
import ssl

# Ajout de ngrok pour exposer le serveur publiquement avec un certificat SSL valide

def start_ngrok(port):
    from pyngrok import ngrok
    
    # Configure ngrok
    ngrok_tunnel = ngrok.connect(port, "http")
    print(f"Ngrok tunnel disponible à: {ngrok_tunnel.public_url}")
    
    # Extrait et retourne l'URL publique
    public_url = ngrok_tunnel.public_url
    return public_url

# Ajoute cette fonction pour générer des certificats valides localement

def setup_local_certificates():
    """Génère des certificats localement approuvés avec mkcert si disponible"""
    try:
        import subprocess
        
        # Vérifie si mkcert est installé
        try:
            subprocess.check_call(['which', 'mkcert'], stdout=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            print("mkcert n'est pas installé. Pour l'installer: brew install mkcert")
            return False
        
        # Installe l'autorité de certification racine locale
        subprocess.check_call(['mkcert', '-install'])
        
        # Génère des certificats pour localhost et l'IP locale
        cert_file = f"localhost+{local_ip}.pem"
        key_file = f"localhost+{local_ip}-key.pem"
        
        subprocess.check_call(['mkcert', 'localhost', '127.0.0.1', local_ip])
        
        # Copie les fichiers générés vers cert.pem et key.pem
        import shutil
        shutil.copy(cert_file, 'cert.pem')
        shutil.copy(key_file, 'key.pem')
        
        print("Certificats localement approuvés créés avec succès!")
        return True
    except Exception as e:
        print(f"Erreur lors de la génération des certificats: {e}")
        return False

if __name__ == '__main__':
    try:
        # Essaie de configurer des certificats valides localement
        if not os.path.exists('cert.pem') or not os.path.exists('key.pem'):
            print("Certificats non trouvés. Tentative de génération...")
            setup_local_certificates()
        
        print("Pour utiliser ngrok, ouvrez un terminal séparé et exécutez:")
        print(f"  ngrok http https://localhost:5001")
        
        # Démarrage du serveur HTTPS
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
        print(f"Démarrage du serveur HTTPS sur https://{local_ip}:5001")
        
        eventlet.wsgi.server(
            eventlet.wrap_ssl(
                eventlet.listen(('0.0.0.0', 5001)),
                certfile='cert.pem',
                keyfile='key.pem',
                server_side=True
            ),
            app
        )
    except Exception as e:
        print(f"Erreur lors du démarrage du serveur: {e}")