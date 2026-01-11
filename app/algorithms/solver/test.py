from .solver import solve_with_c
from .pyraminx import Pyraminx, print_face


import argparse

# --- TEST ---
if __name__ == "__main__":
    print("\n--- TEST FINAL (C + Python) ---")

    # Configuration de l'analyseur d'arguments
    parser = argparse.ArgumentParser(description="Solveur de Pyraminx")
    parser.add_argument("scramble", nargs="?", help="La chaîne représentant l'état du puzzle", default=None)
    
    args = parser.parse_args()

    # Définition du défaut
    default_scramble = "rbrgbbbyy" + "yyybbbggg" + "gggrbbyrr" + "yryrggyrr"

    if args.scramble:
        scrambled = args.scramble
        print(f"-> Scramble utilisateur : {scrambled}")
    else:
        scrambled = default_scramble
        print("-> Teste avec le scramble par defaut")

    print_face(scrambled)
    sequence = solve_with_c(scrambled)
    print(sequence)
