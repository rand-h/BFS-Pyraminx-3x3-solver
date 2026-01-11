import subprocess
import os
import platform

# --- CONFIGURATION DES CHEMINS ---
# Adaptez 'flask_path' selon votre structure de dossiers
flask_path = 'algorithms/solver' 
bfs_dir = os.path.join(flask_path, "BFS")

# Détection automatique de l'exécutable (Linux vs Windows)
systeme = platform.system()
engine_name = "corrector.exe" if systeme == "Windows" else "corrector"
engine_path = os.path.join(flask_path, engine_name)

def preprocess_bottom_face(scrambled):
    """
    Réorganise la face du bas si votre caméra la scanne dans un ordre différent 
    de celui attendu par le solveur C.
    (Basé sur votre code précédent : 032198765)
    """
    if len(scrambled) != 36:
        return scrambled # Évite de planter si la chaine est incomplète

    top_faces = scrambled[:27]
    b = scrambled[27:36] # Face du bas
    
    # Réarrangement spécifique
    new_bottom = (
        b[0] +                  # Pointe
        b[3] + b[2] + b[1] +    # Ligne du milieu inversée
        b[8] + b[7] + b[6] + b[5] + b[4] # Ligne du bas inversée
    )
    
    return top_faces + new_bottom

def get_target_bin_filename(state):
    """
    Devine quel fichier .bin utiliser en regardant les CENTRES (Tips/Coins).
    Sur un Pyraminx, les centres (indices 0, 9, 18, 27) déterminent la parité du fichier.
    """
    # Indices des sommets (Tips) dans votre représentation string
    # F(0), R(9), L(18), B(27)
    try:
        c1 = state[0]
        c2 = state[9]
        c3 = state[18]
        c4 = state[27]
        
        # Si un des centres est inconnu '?', on ne peut pas deviner facilement le fichier.
        # Dans ce cas, on renvoie None pour forcer un scan complet.
        if '?' in [c1, c2, c3, c4]:
            return None
            
        # Le nom du fichier est généralement la concaténation des couleurs des centres
        # Ex: "rygb.bin"
        return f"{c1}{c2}{c3}{c4}.bin"
    except IndexError:
        return None

def call_fuzzy_solver(bin_path, state_str):
    """Exécute le programme C pour un fichier donné."""
    if not os.path.exists(bin_path):
        return None

    try:
        # Construction de la commande
        cmd = [os.path.abspath(engine_path), os.path.abspath(bin_path), state_str]
        
        # Exécution
        result = subprocess.run(cmd, capture_output=True, text=True)
        output = result.stdout.strip()
        
        # Vérification basique de la sortie
        if not output or "ERROR" in output or "NOT_FOUND" in output:
            return None
            
        # Le programme C renvoie juste la string (ex: "rgby...")
        return output
        
    except Exception as e:
        print(f"Erreur exécution C: {e}")
        return None

def get_corrected_state(raw_state_from_camera):
    """
    FONCTION PRINCIPALE
    1. Adapte l'ordre de la face du bas.
    2. Trouve le bon fichier .bin.
    3. Appelle le correcteur C.
    4. Retourne l'état propre.
    """
    
    # 1. Adaptation de l'ordre (Mapping caméra -> Solver)
    # Si votre scan est déjà dans le bon ordre, commentez cette ligne.
    adapted_state = preprocess_bottom_face(raw_state_from_camera)
    
    # 2. Identification du fichier cible
    target_filename = get_target_bin_filename(adapted_state)
    
    files_to_check = []
    
    if target_filename:
        # Si on a deviné le fichier, on le teste en PREMIER
        files_to_check.append(os.path.join(bfs_dir, target_filename))
    
    # On ajoute TOUS les autres fichiers au cas où (si la détection des centres était fausse)
    all_bins = [os.path.join(bfs_dir, f) for f in os.listdir(bfs_dir) if f.endswith('.bin')]
    for f in all_bins:
        if f not in files_to_check:
            files_to_check.append(f)

    # 3. Scan des fichiers
    for bin_file in files_to_check:
        corrected = call_fuzzy_solver(bin_file, adapted_state)
        
        if corrected:
            print(f"✓ État trouvé et corrigé via {os.path.basename(bin_file)}")
            return corrected

    print("X Impossible de corriger l'état (trop d'erreurs ou fichier manquant)")
    return None

'''
# --- EXEMPLE D'UTILISATION ---
if __name__ == "__main__":
    # Simulation d'un scan avec des trous et une erreur
    # Supposons que la caméra ait raté des stickers ('?')
    # et qu'il y ait une erreur de couleur.
    scan_sale = "?rygbbrrrbybbggrrrgggbyyyrrbbbygggyy" 
    
    etat_propre = get_corrected_state(scan_sale)
    
    print(f"Entrée : {scan_sale}")
    print(f"Sortie : {etat_propre}")
'''