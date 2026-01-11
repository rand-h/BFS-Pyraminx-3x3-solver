# app.py

# ==============================================================================
# 1. IMPORTATIONS
# ==============================================================================

# -- Bibliothèques Standard --
import os
import re
import json
import time
import base64
import threading
import subprocess
import platform
import traceback
import queue
import gc  # [OPTIMISATION] Garbage Collector interface
from io import BytesIO
from datetime import datetime
from collections import Counter
          # 
# -- Bibliothèques Tierces --
from flask import Flask, render_template, request, jsonify, session, send_from_directory, url_for, Response
import cv2
import numpy as np
import matplotlib
import matplotlib.pyplot as plt # [OPTIMISATION] Nécessaire pour le nettoyage
from jinja2 import Undefined


# Configuration du backend Matplotlib
matplotlib.use('Agg')

# -- Modules Locaux --
from algorithms.scan import process_single_scan_and_draw
from algorithms.utils import save_to_file, load_from_file, convert_to_abcd
from algorithms.solver.solver import solve
from algorithms.solver.corrector import get_corrected_state
from robot.controller_helper import send_sequence_to_the_robot


# ==============================================================================
# 2. CONFIGURATION DE L'APPLICATION ET VARIABLES GLOBALES
# ==============================================================================

app = Flask(__name__, 
            static_folder='static',
            static_url_path='/static')

app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.secret_key = 'une_cle_secrete_tres_tres_secure_pour_le_pyraminx' 

# --- Variables Globales ---

data_store = {}
MAX_STORE_ITEMS = 10  # [OPTIMISATION] Limite le nombre de sauvegardes en RAM

derniere_sequence = ""
dernier_etat_abcd = ""

camera = None
camera_lock = threading.Lock()

log_queue = queue.Queue()

# ==============================================================================
# 3. FONCTIONS UTILITAIRES (SYSTÈME ET CAMÉRA)
# ==============================================================================

def get_system_info():
    """Récupère les informations système du Raspberry Pi."""
    try:
        ip_output = subprocess.check_output(['hostname', '-I']).decode('utf-8').strip()
        ip_address = ip_output.split()[0] if ip_output else "Non connecté"
    except Exception:
        ip_address = "Erreur IP"

    try:
        with open('/etc/os-release') as f:
            lines = f.readlines()
            os_name = next((line.split('=')[1].strip().strip('"') for line in lines if line.startswith('PRETTY_NAME')), "Inconnu")
    except:
        os_name = "Linux générique"

    return {
        "ip": ip_address,
        "os": os_name,
        "kernel": platform.release()
    }

def get_camera():
    """Démarre la caméra avec une résolution optimisée et le codec MJPG."""
    global camera
    if camera is None or not camera.isOpened():
        print("Démarrage de la caméra...")
        
        # 1. On spécifie le backend V4L2 explicitement (plus stable sur Linux)
        camera = cv2.VideoCapture(0, cv2.CAP_V4L2)
        
        # 2. [CRITIQUE] On force le codec MJPG pour éviter le Timeout
        # C'est la ligne qui a sauvé votre test précédent !
        camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        
        # 3. Résolution et FPS
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        camera.set(cv2.CAP_PROP_FPS, 30)
        
        # 4. On laisse un peu plus de temps au capteur pour s'initialiser (2s est plus sûr que 0.5s)
        time.sleep(2.0) 

    return camera

def close_camera():
    global camera
    if camera and camera.isOpened():
        print("Arrêt de la caméra...")
        camera.release()
    camera = None
    # [OPTIMISATION] Libérer la mémoire immédiatement
    gc.collect()

def gen_frames():  
    global camera
    while True:
        with camera_lock:
            if camera is None or not camera.isOpened():
                break
            success, frame = camera.read()
        
        if success:
            try:
                # [OPTIMISATION] Compression plus forte (qualité 60 au lieu de défaut 95)
                # Réduit la bande passante réseau et la RAM tampon
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 60]
                ret, buffer = cv2.imencode('.jpg', frame, encode_param)
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                
                # Nettoyage explicite des variables temporaires
                del buffer
                del frame_bytes
                
            except Exception as e:
                pass
        else:
            time.sleep(0.1)


def clean_for_json(data):
    """
    Nettoie récursivement les données pour les rendre compatibles JSON.
    Gère les objets 'Undefined' de Jinja2 et les types NumPy.
    """
    # 1. Gestion des fantômes Jinja2 (Undefined)
    if isinstance(data, Undefined):
        return None  # Ou "INCONNU" si tu préfères

    # 2. Gestion des types NumPy (int64, float32, ndarray...)
    if isinstance(data, (np.integer, np.floating)):
        return int(data) if isinstance(data, np.integer) else float(data)
    if isinstance(data, np.ndarray):
        return data.tolist()

    # 3. Récursion pour les Dictionnaires
    if isinstance(data, dict):
        return {k: clean_for_json(v) for k, v in data.items()}

    # 4. Récursion pour les Listes
    if isinstance(data, list):
        return [clean_for_json(v) for v in data]

    # 5. Retourne la donnée brute si elle est déjà propre (str, int, bool...)
    return data

def log_to_browser(message):
    """Fonction utilitaire pour envoyer un log au navigateur"""
    print(f"WEB-LOG: {message}") # Affiche aussi dans la console serveur
    log_queue.put(message)


# ==============================================================================
# 4. ROUTES FRONTEND
# ==============================================================================
# (Identique à ton code précédent...)
@app.route('/')
def index(): return render_template('index.html')

@app.route('/edit')
def edit(): return render_template('edit.html')

@app.route('/scan')
def scan_page():
    default_patron = { "FRONT": ["INCONNU"]*9, "RIGHT": ["INCONNU"]*9, "LEFT": ["INCONNU"]*9, "BOTTOM": ["INCONNU"]*9 }
    if 'pyraminx_patron' not in session:
        session['pyraminx_patron'] = default_patron
    return render_template('scan.html')

@app.route('/3D_model')
def render3D(): return render_template('render3D.html')

@app.route('/analyse')
def analyse_page():
    # On récupère l'état, ou un dict vide si rien n'existe
    current_state = session.get('pyraminx_patron', {})
    
    # On l'injecte dans le template HTML
    return render_template('analyse.html', etat_initial=current_state)

@app.route('/robot')
def robot_page():
    # 1. On récupère l'état actuel depuis la session (ou vide si inexistant)
    current_state = session.get('pyraminx_patron', {})

    # 2. IMPORTANT : On nettoie les données (pour éviter l'erreur JSON précédente)
    # Assure-toi que la fonction clean_for_json est bien définie dans ton fichier app.py
    state_propre = clean_for_json(current_state)

    # 3. On passe 'etat_initial' au template
    return render_template('robot.html', etat_initial=state_propre)

@app.route('/static/<path:path>')
def send_static(path):
    response = send_from_directory('static', path)
    if path.endswith('.js') or path.endswith('.mjs'):
        response.headers['Content-Type'] = 'application/javascript'
    return response

# ==============================================================================
# 5. API - SCAN (OPTIMISÉE MÉMOIRE)
# ==============================================================================

@app.route('/api/init_scan', methods=['POST'])
def init_scan():
    session['pyraminx_patron'] = {
        "FRONT": ["INCONNU"] * 9, "RIGHT": ["INCONNU"] * 9,
        "LEFT": ["INCONNU"] * 9, "BOTTOM": ["INCONNU"] * 9        
    }
    return jsonify({"status": "initialized", "patron": session['pyraminx_patron']})

@app.route('/api/save-image', methods=['POST'])
def save_image_route():
    try:
        if 'file' not in request.files or 'face_name' not in request.form:
            return jsonify({'error': 'Données manquantes'}), 400

        file = request.files['file']
        face_name = request.form['face_name']
        filename = f"{face_name}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        public_url = url_for('static', filename=f'uploads/{filename}') + f"?t={int(time.time())}"
        
        # [OPTIMISATION] Nettoyage
        del file
        gc.collect()
        
        return jsonify({'success': True, 'message': f'Image {face_name} sauvegardée', 'image_url': public_url})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/get-saved-images', methods=['GET'])
def get_saved_images():
    faces = ['FRONT', 'LEFT', 'RIGHT', 'BOTTOM', 'pyraminxSavedImages']
    saved_images = {}
    for face in faces:
        filename = f"{face}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            saved_images[face] = url_for('static', filename=f'uploads/{filename}') + f"?t={int(time.time())}"
    return jsonify({'success': True, 'images': saved_images})

@app.route('/api/scan', methods=['POST'])
def api_scan():
    """
    Traite une image. 
    Version optimisée RASPBERRY PI 3 (OpenCV pur + Gestion RAM stricte).
    """
    
    # 1. Nettoyage préventif immédiat
    gc.collect() 
    
    face_name = request.form.get('face_name')
    if not face_name or 'file' not in request.files:
        return jsonify({"error": "Données manquantes."}), 400

    file = request.files['file']
    img_bgr = None
    
    try:
        # Lecture optimisée
        in_memory_file = file.read()
        np_arr = np.frombuffer(in_memory_file, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        # Libération immédiate du buffer fichier
        del in_memory_file
        del np_arr

        if img_bgr is None: 
            raise ValueError("Erreur lecture image.")

        # --- ALGORITHME ---
        # On récupère la session ou on crée un vide si inexistant
        current_patron = session.get('pyraminx_patron', {})
        
        # Appel à l'algo de scan
        # IMPORTANT : Cette fonction doit être la version OpenCV (sans Matplotlib)
        liste_couleurs_face, img_patron_np = process_single_scan_and_draw(
            img_bgr, face_name.upper(), current_patron
        )
        
        # On n'a plus besoin de l'image source (lourde)
        del img_bgr 
        
        # Mise à jour session
        session['pyraminx_patron'] = current_patron 
        session.modified = True 
        
        # --- ENCODAGE BASE64 OPTIMISÉ ---
        # NOTE : Avec la nouvelle fonction de dessin OpenCV, img_patron_np est DÉJÀ en BGR uint8.
        # Pas besoin de conversion complexe ni de multiplication par 255.
        
        # Compression JPG qualité 70 (Bon compromis Qualité/RAM)
        success, buffer = cv2.imencode('.jpg', img_patron_np, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        
        if not success:
            raise ValueError("Erreur encodage image résultat.")

        patron_base64 = base64.b64encode(buffer).decode('utf-8')

        reponse_brute = {
            "status": "success", 
            "face": face_name.upper(),
            "colors": liste_couleurs_face, 
            "patron_image_base64": patron_base64,
            "full_patron": current_patron
        }
        
        # Nettoyage variables intermédiaires
        del img_patron_np
        del buffer

        reponse_propre = clean_for_json(reponse_brute)

        return jsonify(reponse_propre)

    except Exception as e:
        print(f"Erreur API Scan: {e}")
        # Même l'erreur doit être nettoyée au cas où 'e' contienne du bizarre
        return jsonify({"error": str(e)}), 500
    
    finally:
        # [OPTIMISATION CRITIQUE]
        # On nettoie tout ce qui pourrait rester
        if 'img_bgr' in locals() and img_bgr is not None: del img_bgr
        if 'img_patron_np' in locals() and 'img_patron_np' in locals(): del img_patron_np
        
        # Sécurité Matplotlib (au cas où il reste des imports)
        plt.close('all')
        plt.clf()
        
        # Force le Garbage Collector
        gc.collect()

# ==============================================================================
# 6. API - RÉSOLUTION
# ==============================================================================
# (Identique, sauf gestion mémoire si solveur lourd)

@app.route('/api/solve', methods=['POST'])
def api_solve():
    global derniere_sequence, dernier_etat_abcd
    data = request.get_json()
    
    try:
        # ... (Logique identique à ton code précédent pour le parsing) ...
        raw_patron = data['pyraminx_patron']
        ordre_faces = ["FRONT", "RIGHT", "LEFT", "BOTTOM"]
        patron_ordonne = {}
        for f in ordre_faces: patron_ordonne[f] = raw_patron.get(f)

        # ... (Vérifications) ...

        # Conversion ABCD
        segments_origine_abcd = {}
        full_abcd_string = ""
        map_c = {"ROUGE": "r", "VERT": "g", "BLEU": "b", "JAUNE": "y"}
        for face in ordre_faces:
            segment = ""
            for c in patron_ordonne[face]: segment += map_c.get(c.upper(), "?")
            segments_origine_abcd[face] = segment
            full_abcd_string += segment
        
        # Solve
        sequence, fixed_state_str = solve(full_abcd_string)
        derniere_sequence = sequence
        dernier_etat_abcd = full_abcd_string 

        # Matching
        solver_face_u = fixed_state_str[0:9]
        best_match_face, best_match_score = "INCONNUE", -1
        for nom_face, segment_origine in segments_origine_abcd.items():
            score = sum(1 for i in range(9) if solver_face_u[i] == segment_origine[i])
            if score > best_match_score:
                best_match_score = score
                best_match_face = nom_face

        nom_couleur_visuelle = Counter(patron_ordonne[best_match_face]).most_common(1)[0][0]

        response = jsonify({
            "status": "solved", "sequence": sequence,
            "move_count": len(sequence.strip().split()), "fixed_state": fixed_state_str,
            "setup": {
                "face_to_front": best_match_face, "face_color": nom_couleur_visuelle,
                "instruction": f"Placez la face {best_match_face} ({nom_couleur_visuelle}) face au robot.",
                "debug_score": f"{best_match_score}/9 matches"
            }
        })
        
        # Nettoyage après calcul
        gc.collect()
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==============================================================================
# 7. API - ROBOT & HARDWARE
# ==============================================================================

@app.route('/video_feed')
def video_feed():
    with camera_lock: get_camera()
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/scan_server', methods=['POST'])
def scan_server():
    global camera
    data = request.get_json()
    face_name = data.get('face_name', 'default_face')
    file_path = f"static/uploads/{face_name}.jpg"
    
    saved_successfully = False
    
    with camera_lock:
        was_closed = (camera is None or not camera.isOpened())
        cam = get_camera() if was_closed else camera
        
        # Vider le buffer pour avoir la dernière frame réelle
        # (Parfois le buffer retient une vieille image sur le Pi)
        cam.grab() 
        success, frame = cam.read()
        
        if success:
            cv2.imwrite(file_path, frame)
            saved_successfully = True
            
        if was_closed: close_camera()
    
    # Nettoyage
    del frame
    gc.collect()

    if saved_successfully:
        return jsonify({"ok": True, "colors": [], "path": file_path})
    return jsonify({"ok": False, "error": "Capture impossible"})

@app.route('/api/stop_camera', methods=['POST'])
def stop_camera():
    with camera_lock: close_camera()
    return jsonify({"ok": True, "message": "Caméra arrêtée"})

@app.route('/api/robot/connect', methods=['POST'])
def robot_connect():
    try:
        sys_info = get_system_info()
        return jsonify({ "status": "success", "info": sys_info })
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/robot/solve', methods=['POST'])
def robot_solve_trigger():
    # (Identique au code précédent...)
    global derniere_sequence, dernier_etat_abcd
    try:
        data = request.get_json()
        patron = data.get('config')
        algo_type = data.get('algorithm', 'SPEED')

        try:
            if 'dernier_etat_abcd' in globals() and dernier_etat_abcd:
                s, _ = solve(dernier_etat_abcd)
            else: raise NameError
        except:
            patron_abcd = get_corrected_state(convert_to_abcd(patron))
            s, _ = solve(patron_abcd)

        sequence_ = (derniere_sequence or s) if (derniere_sequence or s) else ""

        if sequence_:
            print(f"ROBOT: Executing {algo_type} solve: {sequence_}")
            send_sequence_to_the_robot(sequence_)
            move_count = len(sequence_.split())
        else:
            move_count = 0
            
        return jsonify({ "status": "executing", "sequence": sequence_, "estimated_time": move_count * 1.5 })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/get_pyraminx_state', methods=['GET'])
def get_pyraminx_state():
    """
    Récupère l'état actuel du scan (session utilisateur).
    Garantit de renvoyer l'état le plus récent, même après modification manuelle.
    """
    # 1. Récupération sécurisée (évite le crash si clé inexistante)
    # .get() renvoie un dict vide {} si 'pyraminx_patron' n'existe pas
    patron = session.get('pyraminx_patron', {})

    # 2. Si le patron est vide, on renvoie 'empty' tout de suite
    if not patron:
        return jsonify({"status": "empty", "full_patron": {}}), 200

    # 3. Vérification rigoureuse de la complétude
    # Pour être "complete", il faut :
    # - Avoir les 4 faces (FRONT, LEFT, RIGHT, BOTTOM)
    # - Avoir 9 couleurs par face
    # - Aucune couleur ne doit être 'INCONNU', 'MANQUANT' ou 'ERREUR'
    
    REQUIRED_FACES = ['FRONT', 'LEFT', 'RIGHT', 'BOTTOM']
    INVALID_KEYWORDS = ['INCONNU', 'MANQUANT', 'ERREUR', 'HORS_CADRE']
    
    is_complete = True
    
    # On vérifie chaque face requise
    for face in REQUIRED_FACES:
        colors = patron.get(face) # Récupère la liste des couleurs pour cette face
        
        # Si la face n'existe pas ou n'a pas 9 stickers -> Incomplet
        if not colors or len(colors) != 9:
            is_complete = False
            break
            
        # Si une des couleurs est invalide -> Incomplet
        # On utilise any() pour scanner rapidement la liste
        if any(bad_word in c for c in colors for bad_word in INVALID_KEYWORDS):
            is_complete = False
            break

    # 4. Retour de la réponse JSON
    return jsonify({
        "status": "complete" if is_complete else "incomplete",
        "full_patron": patron_propre  # On renvoie la version propre
    }), 200


# ==============================================================================
# 8. API - PERSISTANCE (LIMITE MÉMOIRE AJOUTÉE)
# ==============================================================================

def clean_data_store():
    """Supprime les vieilles entrées si le store est trop plein."""
    if len(data_store) > MAX_STORE_ITEMS:
        # Supprime la première clé trouvée (approximatif FIFO)
        keys_to_remove = list(data_store.keys())[:len(data_store) - MAX_STORE_ITEMS]
        for k in keys_to_remove:
            del data_store[k]
        print(f"[MEMOIRE] Nettoyage data_store: {len(keys_to_remove)} éléments supprimés.")

@app.route('/save-data', methods=['POST'])
def save_data():
    try:
        request_data = request.get_json()
        key, data = request_data.get('key'), request_data.get('data')
        
        if key and data:
            clean_data_store() # [OPTIMISATION]
            data_store[key] = data
            return jsonify({'success': True, 'message': f'Saved: {key}'})
        return jsonify({'success': False, 'error': 'Missing info'}), 400
    except Exception as e: return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get-data/<key>', methods=['GET'])
def get_data(key):
    data = data_store.get(key)
    if data: return jsonify({'success': True, 'key': key, 'data': data})
    return jsonify({'success': False, 'error': 'Key not found'}), 404

@app.route('/save-pattern', methods=['POST'])
def save_pattern():
    try:
        data = request.get_json()
        key, pattern, metadata = data.get('key'), data.get('pattern'), data.get('metadata', {})

        if not key or not pattern: return jsonify({'success': False, 'error': 'Missing info'}), 400
        
        save_data = { 'pattern': pattern, 'metadata': { **metadata, 'saved_at': datetime.now().isoformat() } }

        clean_data_store() # [OPTIMISATION]
        data_store[key] = save_data
        save_to_file(key, save_data) # Sauvegarde disque (ne consomme pas de RAM durable)
        
        # On ne garde pas tout en RAM pour rien, on force le GC
        gc.collect()

        return jsonify({
            'success': True, 'key': key, 'saved_at': save_data['metadata']['saved_at'],
            'message': 'Pattern saved'
        })
    except Exception as e: return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get-pattern/<key>', methods=['GET'])
def get_pattern(key):
    if key in data_store:
        save_data = data_store[key]
        return jsonify({'success': True, 'key': key, 'pattern': save_data.get('pattern'), 'metadata': save_data.get('metadata', {})})
    
    file_data = load_from_file(key)
    if file_data:
        clean_data_store() # [OPTIMISATION]
        data_store[key] = file_data
        return jsonify({'success': True, 'key': key, 'pattern': file_data.get('pattern'), 'metadata': file_data.get('metadata', {})})

    return jsonify({'success': False, 'error': 'Pattern not found'}), 404

@app.route('/list-patterns', methods=['GET'])
def list_patterns():
    # On renvoie juste les métadonnées pour être léger
    patterns_list = [{'key': k, 'metadata': d.get('metadata', {})} for k, d in data_store.items()]
    return jsonify({'success': True, 'count': len(patterns_list), 'patterns': patterns_list})

@app.route('/health-check', methods=['GET'])
def health_check(): return jsonify({'status': 'healthy'}), 200

@app.route('/stream-logs')
def stream_logs():
    def generate():
        while True:
            try:
                # Timeout court pour permettre au thread de respirer
                message = log_queue.get(timeout=1) 
                
                # --- FORMAT OBLIGATOIRE ---
                # "data: " au début
                # "\n\n" à la fin
                yield f"data: {message}\n\n" 
                
            except queue.Empty:
                # Heartbeat pour ne pas couper la connexion
                yield ": keep-alive\n\n" # Le ":" au début indique un commentaire (ignoré par le JS)
    
    response = Response(generate(), mimetype='text/event-stream')
    # Ces headers forcent Nginx à envoyer direct
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Cache-Control'] = 'no-cache'
    return response

# ==============================================================================
# 9. DÉMARRAGE
# ==============================================================================

if __name__ == '__main__':
    # 
    # threaded=True est indispensable.
    # Sur Raspberry Pi, debug=False en prod économise un peu de ressources.
    app.run(debug=True, host='0.0.0.0', port=5000, ssl_context='adhoc', threaded=True)