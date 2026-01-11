import subprocess
import os
import sys

# Assurez-vous que l'import fonctionne (attention aux imports circulaires)
# Si log_to_browser est dans app.py, c'est bon.

def send_sequence_to_the_robot(sequence):
    """
    Exécute le programme C 'controller' et stream les logs vers le navigateur.
    """
    from app import log_to_browser
    
    dossier_actuel = os.path.dirname(os.path.abspath(__file__))
    chemin_executable = os.path.join(dossier_actuel, "controller")

    # 1. Vérifications (Inchangées)
    if not os.path.exists(chemin_executable):
        msg = f"❌ Erreur : L'exécutable '{chemin_executable}' est introuvable."
        print(msg)
        log_to_browser(msg)
        return False
    
    if not os.access(chemin_executable, os.X_OK):
        msg = f"❌ Erreur : Droits d'exécution manquants pour '{chemin_executable}'."
        print(msg)
        log_to_browser(msg)
        return False

    try:
        log_to_browser(f"🤖 Démarrage séquence : {sequence}")
        
        # 2. Utilisation de Popen pour le TEMPS RÉEL
        # stdout=subprocess.PIPE : On capture la sortie du C
        # stderr=subprocess.STDOUT : On mélange les erreurs avec la sortie normale
        # text=True : On reçoit des chaînes de caractères (pas des bytes)
        # bufsize=1 : On force le buffer ligne par ligne
        
        with subprocess.Popen(
            ["sudo", chemin_executable, sequence],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1 
        ) as process:
            
            # 3. Boucle de lecture ligne par ligne
            for line in process.stdout:
                line = line.strip() # Enlève les espaces/sauts de ligne inutiles
                if line:
                    print(f"[ROBOT-C] {line}") # Affiche dans la console serveur
                    log_to_browser(line)       # Envoie au navigateur via SSE

            # 4. Attente de la fin propre
            process.wait()

        # 5. Vérification du code de retour
        if process.returncode == 0:
            log_to_browser("✅ Séquence terminée avec succès.")
            return True
        else:
            log_to_browser(f"⚠️ Le robot a fini avec une erreur (Code {process.returncode}).")
            return False

    except Exception as e:
        err_msg = f"❌ Erreur Python lors de l'exécution : {e}"
        print(err_msg)
        log_to_browser(err_msg)
        return False