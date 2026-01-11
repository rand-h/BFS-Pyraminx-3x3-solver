from collections import deque
import time
import pickle
import multiprocessing
import os
import struct

from pyraminx import Pyraminx

# Dossier de sortie
path = "BFS/"
os.makedirs(path, exist_ok=True)

# Mapping couleur -> bits
COLOR_MAP = {'r': 0, 'g': 1, 'b': 2, 'y': 3}

# Mapping mouvement -> entier
MOVE_MAP = {
    "U": 0, "U`": 1, "R": 2, "R`": 3,
    "L": 4, "L`": 5, "B": 6, "B`": 7,
    "START": 255
}

def pack_state(state_str):
    """Compresse 36 chars en 9 bytes (2 bits par char)."""
    packed_int = 0
    for char in state_str:
        packed_int = (packed_int << 2) | COLOR_MAP[char]
    return packed_int.to_bytes(9, byteorder='big')


def convert_to_binary_for_c(pkl_full_path, output_bin_full_path):
    """Convertit un fichier PKL en fichier binaire trié pour C."""
    with open(pkl_full_path, 'rb') as f:
        data = pickle.load(f)

    binary_list = []
    for state, move in data.items():
        if len(state) != 36:
            continue
        packed = pack_state(state)
        move_byte = MOVE_MAP[move]
        binary_list.append((packed, move_byte))

    # Tri indispensable pour bsearch en C
    binary_list.sort(key=lambda x: x[0])

    with open(output_bin_full_path, 'wb') as f:
        for packed, move_byte in binary_list:
            f.write(packed)
            f.write(struct.pack('B', move_byte))


def bfs_generate_combinations(solved_state):
    visited = set()
    queue = deque([solved_state])
    visited.add(solved_state)

    allStates = {solved_state: "START"}

    moves = [(r, d) for r in ['U', 'R', 'L', 'B'] for d in [0, 1]]

    while queue:
        currentState = queue.popleft()
        cube = Pyraminx(state=currentState)

        for move in moves:
            if move[0] == 'U':
                newStateObj = cube.up(move[1])
            elif move[0] == 'R':
                newStateObj = cube.right(move[1])
            elif move[0] == 'L':
                newStateObj = cube.left(move[1])
            elif move[0] == 'B':
                newStateObj = cube.back(move[1])

            newState = newStateObj.stringify()

            if newState not in visited:
                visited.add(newState)
                queue.append(newState)
                mov_name = move[0] + ('`' if move[1] == 0 else '')
                allStates[newState] = mov_name

    return allStates


def process_case(args):
    index, state = args

    # Nom du fichier basé sur les 4 faces
    name_code = f"{state[0]}{state[9]}{state[18]}{state[27]}"
    pkl_filename = f"{path}{name_code}.pkl"
    bin_filename = f"{path}{name_code}.bin"

    print(f"[Process {index}] Démarrage pour : {name_code} ({state[:10]}...)")
    start_time = time.time()

    # BFS
    combinations = bfs_generate_combinations(state)

    # Sauvegarde directe en Pickle
    with open(pkl_filename, "wb") as f:
        pickle.dump(combinations, f, protocol=pickle.HIGHEST_PROTOCOL)

    # Conversion en .bin
    convert_to_binary_for_c(pkl_filename, bin_filename)

    duration = time.time() - start_time
    return (f"[Process {index}] Terminé en {duration:.2f}s | "
            f"PKL : {pkl_filename} | BIN : {bin_filename} | "
            f"Combinaisons : {len(combinations)}")


if __name__ == '__main__':

    target_states = [
        "rrrrrrrrrbbbbbbbbbyyyyyyyyyggggggggg",
        "rrrrrrrrrgggggggggbbbbbbbbbyyyyyyyyy",
        "gggggggggyyyyyyyyybbbbbbbbbrrrrrrrrr",
        "bbbbbbbbbyyyyyyyyyrrrrrrrrrggggggggg",
        "rrrrrrrrryyyyyyyyygggggggggbbbbbbbbb",
        "gggggggggbbbbbbbbbrrrrrrrrryyyyyyyyy",
        "gggggggggrrrrrrrrryyyyyyyyybbbbbbbbb",
        "yyyyyyyyybbbbbbbbbgggggggggrrrrrrrrr",
        "yyyyyyyyyrrrrrrrrrbbbbbbbbbggggggggg",
        "yyyyyyyyygggggggggrrrrrrrrrbbbbbbbbb",
        "bbbbbbbbbgggggggggyyyyyyyyyrrrrrrrrr",
        "bbbbbbbbbrrrrrrrrrgggggggggyyyyyyyyy"
    ]

    # Vérification de sécurité
    for i, s in enumerate(target_states):
        if len(s) != 36:
            print(f"ERREUR : L'état {i} fait {len(s)} chars au lieu de 36.")
            exit()

    tasks = [(i, state) for i, state in enumerate(target_states)]

    cpu_count = multiprocessing.cpu_count()
    print(f"Démarrage du traitement sur {cpu_count} processeurs...")

    global_start = time.time()

    with multiprocessing.Pool() as pool:
        results = pool.map(process_case, tasks)

    print("\n--- Résultat Final ---")
    for res in results:
        print(res)

    print(f"Temps total d'exécution : {time.time() - global_start:.4f} sec")