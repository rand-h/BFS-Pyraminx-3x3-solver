import subprocess
import os
import time

from .pyraminx import Pyraminx

import platform

systeme = platform.system()

flask_path = 'algorithms/solver'

engine = f"{flask_path}/fast_solver.exe" if systeme == "Windows" else f"{flask_path}/fast_solver"

path = f"{flask_path}/BFS/"

def apply_tip_fixes(cube):
    """Logique d'alignement des tips (copiée de votre code précédent)"""
    moves = []
    # Tip Haut
    if cube.cube[0][0] == cube.cube[2][2]: moves.append('u'); cube.cube[0][0], cube.cube[1][0], cube.cube[2][0] = cube.cube[1][0], cube.cube[2][0], cube.cube[0][0]
    elif cube.cube[0][0] == cube.cube[1][2]: moves.append('u`'); cube.cube[0][0], cube.cube[2][0], cube.cube[1][0] = cube.cube[2][0], cube.cube[1][0], cube.cube[0][0]
    # Tip Droite
    if cube.cube[0][8] == cube.cube[1][5]: moves.append('r'); cube.cube[0][8], cube.cube[3][8], cube.cube[1][4] = cube.cube[3][8], cube.cube[1][4], cube.cube[0][8]
    elif cube.cube[0][8] == cube.cube[3][7]: moves.append('r`'); cube.cube[0][8], cube.cube[1][4], cube.cube[3][8] = cube.cube[1][4], cube.cube[3][8], cube.cube[0][8]
    # Tip Gauche
    if cube.cube[0][4] == cube.cube[3][5]: moves.append('l'); cube.cube[0][4], cube.cube[2][8], cube.cube[3][4] = cube.cube[2][8], cube.cube[3][4], cube.cube[0][4]
    elif cube.cube[0][4] == cube.cube[2][7]: moves.append('l`'); cube.cube[0][4], cube.cube[3][4], cube.cube[2][8] = cube.cube[3][4], cube.cube[2][8], cube.cube[0][4]
    # Tip Arrière
    if cube.cube[3][0] == cube.cube[1][7]: moves.append('b'); cube.cube[3][0], cube.cube[2][4], cube.cube[1][8] = cube.cube[2][4], cube.cube[1][8], cube.cube[3][0]
    elif cube.cube[3][0] == cube.cube[2][5]: moves.append('b`'); cube.cube[3][0], cube.cube[1][8], cube.cube[2][4] = cube.cube[1][8], cube.cube[2][4], cube.cube[3][0]
    return moves

def query_c_solver(bin_path, state_str):
    """Appelle le programme C pour obtenir le prochain coup"""
    
    # 1. Obtenir le chemin absolu pour éviter les erreurs avec sudo
    abs_engine = os.path.abspath(engine)
    abs_bin_path = os.path.abspath(bin_path)

    if not os.path.exists(abs_bin_path):
        return "FILE_NOT_FOUND"

    try:
        # 2. Préparer la commande
        command = [abs_engine, abs_bin_path, state_str]
        
        # 3. Ajouter 'sudo' seulement si on est sous Linux
        if systeme != "Windows":
            command.insert(0, "sudo")

        # Appel système
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False # On gère les erreurs manuellement via le stdout/stderr
        )
        
        if result.returncode != 0:
            print(f"Erreur C Solver (Code {result.returncode}): {result.stderr}")
            return "ERROR"

        return result.stdout.strip()
        
    except Exception as e:
        print(f"Exception Python: {e}")
        return "ERROR"


def inverser_sens_moves(liste_moves): # X devient X' et X' devient X
    resultat = []
    for move in liste_moves:
        # On normalise en remplaçant le backtick ` par ' pour être standard
        m = move.replace('`', "'")

        if "'" in m:
            # Si c'est un Prime (ex: L'), on enlève le ' -> L
            resultat.append(m.replace("'", ""))
        else:
            # Si c'est normal (ex: R), on ajoute le ' -> R'
            resultat.append(m + "'")
    return resultat

def solve_with_c(state):
    start_global = time.time()

    # 1. Préparation (Tips)
    cube = Pyraminx(state=state)
    tip_moves = apply_tip_fixes(cube)
    fixed_state = cube.stringify()

    print(f"État initial: {fixed_state}")

    # 2. Détermination du fichier CIBLE
    # On regarde les centres pour deviner le fichier (ex: rbgy)
    file_code = f"{state[0]}{state[9]}{state[18]}{state[27]}"
    preferred_bin = os.path.join(path, f"{file_code}.bin")

    solution_moves = inverser_sens_moves(tip_moves[:])

    # Liste des fichiers à tester (Le préféré en premier, puis les autres)
    files_to_check = [preferred_bin]
    # Ajout des autres fichiers en cas de fallback
    all_bins = [os.path.join(path, f) for f in os.listdir(path) if f.endswith('.bin')]
    for f in all_bins:
        if f != preferred_bin:
            files_to_check.append(f)

    # 3. Boucle de résolution
    # On essaie de résoudre avec le premier fichier. Si ça bloque, on change de fichier.

    found_file = None

    for bin_file in files_to_check:
        # On fait une copie temporaire pour simuler la résolution sur ce fichier
        temp_cube = Pyraminx(state=fixed_state)
        temp_moves = []
        valid_path = True
        steps = 0

        # print(f"Test avec le fichier : {os.path.basename(bin_file)}")

        while steps < 50: # Sécurité max 50 coups
            current_str = temp_cube.stringify()

            # APPEL AU PROGRAMME C
            move = query_c_solver(bin_file, current_str)

            if move == "START":
                # SUCCÈS !
                solution_moves.extend(temp_moves)
                total_time = time.time() - start_global
                print(f"\n✓ - RÉSOLU avec {os.path.basename(bin_file)}")
                print(f"Temps total : {total_time:.4f} sec")
                print(f"Coups ({len(solution_moves)}) : {' '.join(inverser_sens_moves(solution_moves))}")
                return inverser_sens_moves(solution_moves), fixed_state

            elif move in ["NOT_FOUND", "UNKNOWN_MOVE", "FILE_NOT_FOUND", "ERROR"]:
                # Ce fichier ne contient pas la solution pour cet état
                valid_path = False
                break

            else:
                # C'est un mouvement valide (ex: U, R`, etc.)
                temp_moves.append(move)

                # Appliquer le mouvement en Python pour obtenir l'état suivant
                d = 1 if '`' in move else 0
                if move[0] == 'U': temp_cube = temp_cube.up(d)
                elif move[0] == 'R': temp_cube = temp_cube.right(d)
                elif move[0] == 'L': temp_cube = temp_cube.left(d)
                elif move[0] == 'B': temp_cube = temp_cube.back(d)

                steps += 1

        if valid_path:
            # Si on sort de la boucle while sans être START ni NOT_FOUND, c'est louche (max steps atteint)
            pass

    print("X - Aucune solution trouvée dans les 12 fichiers.")
    return [" "], fixed_state



'''
# --- TEST ---
print("\n--- TEST FINAL (C + Python) ---")
# État mélangé correspondant à un fichier existant (ex: byrg)
# Assurez-vous d'avoir converti vos fichiers avant !
test_state = "rrrrrrrrrbbbbbbbbbyyyyyyyyyggggggggg"
# Mélange manuel
c = Pyraminx(state=test_state)
c = c.up(1)       # U
c = c.right(1)    # R
scrambled = c.stringify()

scrambled = "rbrgbbbyy" + "yyybbbggg" + "gggrbbyrr" + "yryrggyrr"

sequence = solve_with_c(scrambled)

print(sequence)

'''




def test_sequence(scrambled, sequence):
    # 1. État de départ
    scrambled_state = scrambled

    # 2. Séquence
    moves_to_check = sequence

    print(f"--- VÉRIFICATION VIRTUELLE DÉTAILLÉE ---")
    print(f"État de départ : {scrambled_state}")

    print(f"\nMouvement : {' '.join(moves_to_check)}")

    cube = Pyraminx(state=scrambled_state)

    print(f"\nApplication des mouvements (Logique : Inversion du sens + Rotation cohérente)...")

    for i, move in enumerate(moves_to_check):
        clean_move = move.replace("`", "'")

        # --- LOGIQUE D'INVERSION ---
        # Si le code dit "Normal", on applique "Prime" (direction 1)
        # Si le code dit "Prime", on applique "Normal" (direction 0)
        direction = 0 if "'" in clean_move else 1
        move_name = clean_move[0]

        # Raccourci vers les données
        c = cube.cube

        # Sélection de la fonction de rotation interne (La clé du succès !)
        # direction 1 (Prime) -> utilise rotateRight (pour simuler le mouvement inverse)
        # direction 0 (Normal) -> utilise rotateLeft
        rotate_func = cube.rotateRight if direction else cube.rotateLeft

        # --- APPLICATION ---

        # A. Mouvements des FACE (Majuscules)
        if move_name == 'U': cube = cube.up(direction)
        elif move_name == 'R': cube = cube.right(direction)
        elif move_name == 'L': cube = cube.left(direction)
        elif move_name == 'B': cube = cube.back(direction)

        # B. Mouvements des TIPS (Minuscules)
        elif move_name == 'u':
            c[0][0], c[1][0], c[2][0] = rotate_func(c[0][0], c[1][0], c[2][0])
        elif move_name == 'r':
            c[0][8], c[3][8], c[1][4] = rotate_func(c[0][8], c[3][8], c[1][4])
        elif move_name == 'l':
            c[0][4], c[2][8], c[3][4] = rotate_func(c[0][4], c[2][8], c[3][4])
        elif move_name == 'b':
            c[3][0], c[2][4], c[1][8] = rotate_func(c[3][0], c[2][4], c[1][8])

        # --- AFFICHAGE ---
        real_move = move_name + ("'" if direction == 1 else "")
        print(f" {i+1:02d}. Code: {move:<3} => État: {cube.stringify()}")

    # Résultat final
    final_state = cube.stringify()
    print(f"\n--- BILAN ---")
    print(f"État Final   : {final_state}")

    # Vérification
    faces = [final_state[i:i+9] for i in range(0, 36, 9)]
    is_solved = all(f == f[0] * 9 for f in faces)

    if is_solved:
        print("✓ - RÉSULTAT VIRTUEL : CUBE RÉSOLU !")
    else:
        print("X - RÉSULTAT VIRTUEL : ÉCHEC.")


def solve(scrambled):
    """
    Adapte la configuration du scramble (spécifiquement la face du bas)
    pour qu'elle corresponde au format attendu par le solveur C,
    puis lance la résolution.
    """
    # 1. On garde les 3 premières faces intactes
    # Indices 0 à 26 inclus
    top_faces = scrambled[:27]
    
    # 2. On isole la face du bas (Bottom)
    # Indices 27 à 35 inclus (longueur 9)
    b = scrambled[27:36]
    
    # 3. On réorganise la face du bas.
    # Interprétation de votre motif "032198765" traduit en indices Python (0-8) :
    # b[0] reste b[0]
    # b[1], b[2], b[3] deviennent b[3], b[2], b[1]
    # b[4], b[5], b[6], b[7], b[8] deviennent b[8], b[7], b[6], b[5], b[4]
    
    new_bottom = (
        b[0] +          # Tip
        b[3] + b[2] + b[1] +  # Middle row reversed
        b[8] + b[7] + b[6] + b[5] + b[4] # Bottom row reversed
    )
    
    # 4. On recolle le tout
    adapted_scramble = top_faces + new_bottom
    
    sequence_list, fixed_state = solve_with_c(adapted_scramble)

    sequence_str = " ".join(sequence_list)

    # 5. Appel à votre fonction C existante
    return sequence_str, fixed_state