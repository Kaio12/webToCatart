from flask import Flask, render_template
from flask_socketio import SocketIO
import json
import os
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'philippe'
socketio = SocketIO(app, cors_allowed_origins="*") 

@app.route("/")
def hello():
    return render_template('index.html')

socketio.emit('to_max', 'Hello from Flask!', namespace='/max')  # Emit a message to Max/MSP namespace

# Namespace for the browser
@socketio.on('message', namespace='/browser')
def handle_browser_message(data):
    print('Received message from browser: ' + data)
    log_browser_data(data) #on enregistre les données dans un fichier
    socketio.emit('to_max', data, namespace='/max')  # Forward to Max/MSP namespace


@socketio.on('osc', namespace='/browser')
def handle_browser_osc(data):
    print('Received OSC from browser: ' + json.dumps(data, indent=2))
    log_browser_data(data, is_osc=True) #on enregistre les données osc recues
    socketio.emit('to_max', data, namespace='/max')  # Forward to Max/MSP namespace

# Namespace for Max/MSP
@socketio.on('message', namespace='/max')
def handle_max_message(data):
    print('Received message from Max/MSP: ' + data)
    socketio.emit('to_browser', data, namespace='/browser')  # Forward to browser namespace

@socketio.on('osc', namespace='/max')
def handle_max_osc(data):
    print('Received OSC from Max/MSP: ' + json.dumps(data, indent=2))
    socketio.emit('to_browser', data, namespace='/browser')  # Forward to browser namespace

if __name__ == '__main__':
     socketio.run(app, host='0.0.0.0', port=5000)
   
def log_browser_data(data, is_osc=False):
    timestamp = datetime.now().isoformat()
    log_dir = "logs"
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "browser_data.log")

    entry_type = "OSC" if is_osc else "MSG"
    with open(log_file, "a") as f:
        f.write(f"[{timestamp}] {entry_type}: {json.dumps(data)}\n")

    