import os
import json

# Add these functions before your routes

def save_to_file(key, data):
    """Sauvegarder dans un fichier JSON pour persistance"""
    try:
        # Create patterns directory if it doesn't exist
        patterns_dir = 'patterns'
        if not os.path.exists(patterns_dir):
            os.makedirs(patterns_dir)

        filename = f"{patterns_dir}/{key}.json"

        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Erreur sauvegarde fichier: {e}")
        return False
        

def load_from_file(key):
    """Charger depuis un fichier JSON"""
    try:
        filename = f"patterns/{key}.json"
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Erreur chargement fichier: {e}")
    return None


def convert_to_abcd(cube_state):
    # 1. Définition du mappage (Couleur -> Lettre)
    # Adaptez les lettres selon vos besoins (ex: 'JAUNE': 'j' ou 'y' pour yellow)
    color_map = {
        'ROUGE': 'r',
        'JAUNE': 'y', 
        'VERT':  'g', 
        'BLEU':  'b',
        'ORANGE':'r',
    }

    # 2. Définition de l'ordre des faces
    # L'ordre standard pour les solveurs (ex: Kociemba) est souvent :
    # U (Up/Haut), R (Right/Droite), F (Front/Face), D (Down/Bas), L (Left/Gauche), B (Back/Arrière)
    # Note : J'ai mis 'BOTTOM' à la place de 'DOWN' pour coller à votre exemple.
    ordre_faces = ['FRONT', 'RIGHT', 'LEFT', 'BOTTOM']

    resultat = ""

    # 3. Construction de la chaîne
    for face in ordre_faces:
        if face in cube_state:
            liste_couleurs = cube_state[face]
            for couleur in liste_couleurs:
                # On ajoute la lettre correspondante, ou '?' si la couleur est inconnue
                resultat += color_map.get(couleur, '?')
        else:
            # Optionnel : Gestion des faces manquantes si nécessaire
            pass 

    return resultat
