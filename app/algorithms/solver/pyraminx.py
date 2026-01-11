class Pyraminx:
    def __init__(self, colours=["r", "y", "g", "b"], state=None):
        self.rotateNumber = 0 # Initialisation inconditionnelle de rotateNumber

        # Initialisation vide par défaut
        if state is None:
            self.cube = [
                ["r" for i in range(9)],
                ["y" for i in range(9)],
                ["g" for i in range(9)],
                ["b" for i in range(9)],
            ]
        else:
            # Reconstruction à partir du string (Optimisé)
            self.cube = [[], [], [], []]
            if len(state) != 36:
                raise Exception("The length of state is incorrect")

            # Parsing direct
            for i in range(4):
                self.cube[i] = list(state[i*9 : (i+1)*9])

            # Auto-rotation logic (Gardée telle quelle)
            # Note : Cette logique d'auto-rotation peut être coûteuse si elle se déclenche souvent.
            # Assure-toi que tes états de départ sont bien orientés (Face 0 centre = rouge).
            if self.cube[0][7] != 'r' and self.cube[1][5] != 'r' and self.cube[3][7] != 'r':
                self.cube = self.rotate().cube
                self.cube = self.rotate().cube
                self.rotateNumber = 2
            elif self.cube[0][5] != 'r' and self.cube[2][7] != 'r' and self.cube[3][5] != 'r':
                self.cube = self.rotate().cube
                self.rotateNumber = 1

    def stringify(self):
        # Plus rapide que la boucle imbriquée
        return "".join(["".join(face) for face in self.cube])

    def solved(self):
        # Comparaison directe
        return self.stringify() == "rrrrrrrrryyyyyyyyygggggggggbbbbbbbbb"

    # --- MÉTHODE UTILITAIRE POUR REMPLACER DEEPCOPY ---
    def copy(self):
        """Crée une copie rapide de l'instance actuelle"""
        new_obj = Pyraminx(state=None) # Crée une coquille vide résolue
        # Copie manuelle des listes (beaucoup plus rapide que deepcopy)
        new_obj.cube = [face[:] for face in self.cube]
        new_obj.rotateNumber = self.rotateNumber
        return new_obj

    def show(self):
        # (Ton code d'affichage reste identique, je ne le répète pas ici pour gagner de la place)
        print(
            " " * 2
            + f"{self.cube[2][0]}"
            + " " * 6
            + f"{self.cube[0][0]}"
            + " " * 6
            + f"{self.cube[1][0]}"
        )
        print(
            " " * 1
            + "".join([self.cube[2][i] for i in range(1, 4)])
            + " " * 4
            + "".join([self.cube[0][i] for i in range(1, 4)])
            + " " * 4
            + "".join([self.cube[1][i] for i in range(1, 4)])
        )
        print(
            " " * 0
            + "".join([self.cube[2][i] for i in range(4, 9)])
            + " " * 2
            + "".join([self.cube[0][i] for i in range(4, 9)])
            + " " * 2
            + "".join([self.cube[1][i] for i in range(4, 9)])
        )
        print(" ")
        print(" " * 7 + "".join([self.cube[3][i] for i in range(4, 9)]))
        print(" " * 8 + "".join([self.cube[3][i] for i in range(1, 4)]))
        print(" " * 9 + "".join([self.cube[3][i] for i in range(0, 1)]))

    #### Move functions
    @staticmethod
    def rotateRight(x,y,z):
        return y, z, x # Simplification pythonique

    @staticmethod
    def rotateLeft(x,y,z):
        return z, x, y # Simplification pythonique

    # --- MODIFICATION DES MOUVEMENTS POUR UTILISER self.copy() ---

    def up(self, direction):
        newState = self.copy() # Utilise la copie rapide
        c = newState.cube
        if not direction:
            for i in range(4):
                c[0][i], c[1][i], c[2][i] = self.rotateLeft(c[0][i], c[1][i], c[2][i])
        else:
            for i in range(4):
                c[0][i], c[1][i], c[2][i] = self.rotateRight(c[0][i], c[1][i], c[2][i])
        return newState

    def right(self, direction):
        newState = self.copy()
        c = newState.cube
        if not direction:
            c[0][3], c[3][6], c[1][6] = self.rotateLeft(c[0][3], c[3][6], c[1][6])
            c[0][7], c[3][7], c[1][5] = self.rotateLeft(c[0][7], c[3][7], c[1][5])
            c[0][6], c[3][3], c[1][1] = self.rotateLeft(c[0][6], c[3][3], c[1][1])
            c[0][8], c[3][8], c[1][4] = self.rotateLeft(c[0][8], c[3][8], c[1][4])
        else:
            c[0][3], c[3][6], c[1][6] = self.rotateRight(c[0][3], c[3][6], c[1][6])
            c[0][7], c[3][7], c[1][5] = self.rotateRight(c[0][7], c[3][7], c[1][5])
            c[0][6], c[3][3], c[1][1] = self.rotateRight(c[0][6], c[3][3], c[1][1])
            c[0][8], c[3][8], c[1][4] = self.rotateRight(c[0][8], c[3][8], c[1][4])
        return newState

    def left(self, direction):
        newState = self.copy()
        c = newState.cube
        if not direction:
            c[0][1], c[2][6], c[3][6] = self.rotateLeft(c[0][1], c[2][6], c[3][6])
            c[0][5], c[2][7], c[3][5] = self.rotateLeft(c[0][5], c[2][7], c[3][5])
            c[0][6], c[2][3], c[3][1] = self.rotateLeft(c[0][6], c[2][3], c[3][1])
            c[0][4], c[2][8], c[3][4] = self.rotateLeft(c[0][4], c[2][8], c[3][4])
        else:
            c[0][1], c[2][6], c[3][6] = self.rotateRight(c[0][1], c[2][6], c[3][6])
            c[0][5], c[2][7], c[3][5] = self.rotateRight(c[0][5], c[2][7], c[3][5])
            c[0][6], c[2][3], c[3][1] = self.rotateRight(c[0][6], c[2][3], c[3][1])
            c[0][4], c[2][8], c[3][4] = self.rotateRight(c[0][4], c[2][8], c[3][4])
        return newState

    def back(self, direction):
        newState = self.copy()
        c = newState.cube
        if not direction:
            c[1][3], c[3][3], c[2][6] = self.rotateLeft(c[1][3], c[3][3], c[2][6])
            c[1][7], c[3][2], c[2][5] = self.rotateLeft(c[1][7], c[3][2], c[2][5])
            c[1][6], c[3][1], c[2][1] = self.rotateLeft(c[1][6], c[3][1], c[2][1])
            c[1][8], c[3][0], c[2][4] = self.rotateLeft(c[1][8], c[3][0], c[2][4])
        else:
            c[1][3], c[3][3], c[2][6] = self.rotateRight(c[1][3], c[3][3], c[2][6])
            c[1][7], c[3][2], c[2][5] = self.rotateRight(c[1][7], c[3][2], c[2][5])
            c[1][6], c[3][1], c[2][1] = self.rotateRight(c[1][6], c[3][1], c[2][1])
            c[1][8], c[3][0], c[2][4] = self.rotateRight(c[1][8], c[3][0], c[2][4])
        return newState

    def rotate(self):
        # Utilisation de self.copy() ici aussi
        newState = self.copy()
        frontFace = newState.cube.pop(0)
        newState.cube.insert(2, frontFace)

        # Mapping manuel pour la rotation de la face du bas
        # (J'ai gardé ta logique exacte)
        old_bottom = self.cube[3]
        newState.cube[3][8] = old_bottom[0]
        newState.cube[3][3] = old_bottom[1]
        newState.cube[3][7] = old_bottom[2]
        newState.cube[3][6] = old_bottom[3]
        newState.cube[3][0] = old_bottom[4]
        newState.cube[3][2] = old_bottom[5]
        newState.cube[3][1] = old_bottom[6]
        newState.cube[3][5] = old_bottom[7]
        newState.cube[3][4] = old_bottom[8]

        return newState
        
    



# --- Codes ANSI pour les couleurs de fond ---
class Colors:
    """Codes ANSI pour les couleurs de fond (Background)"""
    RED = '\033[41m'
    GREEN = '\033[42m'
    YELLOW = '\033[43m'
    BLUE = '\033[44m'
    MAGENTA = '\033[45m'
    CYAN = '\033[46m'
    WHITE = '\033[47m'
    RESET = '\033[0m'

# Mapper les lettres de votre cube aux couleurs ANSI
COLOR_MAP = {
    'r': Colors.RED,
    'y': Colors.YELLOW,
    'g': Colors.GREEN,
    'b': Colors.BLUE,
    # Ajoutez d'autres couleurs si nécessaire pour d'autres états
    # 'w': Colors.WHITE,
}

# La fonction de formatage pour un autocollant
def colorize_sticker(char):
    """Encapsule un caractère avec son code couleur de fond et le réinitialise."""
    # Le ' ' au milieu crée un petit carré visible
    color_code = COLOR_MAP.get(char.lower(), Colors.WHITE)
    return f"{color_code} {Colors.RESET}"











state = "rbrgbbbyyyyybbggggggrrryrrybyybyyrgryrrybb"  # Exemple d'état du Pyraminx

def print_face(state = state, face="all"):
    """
    Affiche une face spécifique ou toutes les faces (patron complet).
    """
    # Extraction des données des 4 faces
    f0 = state[0:9]   # Front
    f1 = state[9:18]  # Right
    f2 = state[18:27] # Left
    f3 = state[27:36] # Bottom (Inverted)

    # Raccourci pour la fonction de couleur (pour alléger le code)
    # Assurez-vous que colorize_sticker est bien définie dans votre code
    try:
        c = colorize_sticker 
        colored_mode = True
    except NameError:
        c = lambda x: f"[{x.upper()}]" # Fallback texte si pas de couleur
        colored_mode = False

    # --- CAS 1 : AFFICHAGE DE TOUTES LES FACES (Patron) ---
    if face == "all":
        print("\n" + "="*50)
        print("       LEFT             FRONT             RIGHT")
        print("="*50 + "\n")
        
        # Espacement entre les faces (Gap)
        gap = "     "  # Tes 5 espaces conservés
        
        # Calcul de l'indentation pour la face du bas
        # Tes espacements conservés
        padding_bottom = " " * 19 if colored_mode else " " * 15

        if colored_mode:
            # --- LIGNE 1 : LES POINTES (Index 0) ---
            # J'ai ajouté *2 à chaque c(...)
            print(f"      {c(f2[0])*2}{gap}            {c(f0[0])*2}{gap}            {c(f1[0])*2}")

            # --- LIGNE 2 : LES MILIEUX (Indices 1,2,3) ---
            # J'ai ajouté *2 à chaque c(...)
            row2_L = f"   {c(f2[1])*2} {c(f2[2])*2} {c(f2[3])*2}"
            row2_F = f"   {c(f0[1])*2} {c(f0[2])*2} {c(f0[3])*2}"
            row2_R = f"   {c(f1[1])*2} {c(f1[2])*2} {c(f1[3])*2}"
            print(f"{row2_L}{gap}   {row2_F}{gap}   {row2_R}")

            # --- LIGNE 3 : LES BASES (Indices 4,5,6,7,8) ---
            # J'ai ajouté *2 à chaque c(...)
            row3_L = f"{c(f2[4])*2} {c(f2[5])*2} {c(f2[6])*2} {c(f2[7])*2} {c(f2[8])*2}"
            row3_F = f"{c(f0[4])*2} {c(f0[5])*2} {c(f0[6])*2} {c(f0[7])*2} {c(f0[8])*2}"
            row3_R = f"{c(f1[4])*2} {c(f1[5])*2} {c(f1[6])*2} {c(f1[7])*2} {c(f1[8])*2}"
            print(f"{row3_L}{gap}{row3_F}{gap}{row3_R}")
            
            # --- LIGNE 4, 5, 6 : BOTTOM (Inversé, centré sous Front) ---
            # Base du bottom (4-8) - Ajout *2
            print(f"\n{padding_bottom}{c(f3[4])*2} {c(f3[5])*2} {c(f3[6])*2} {c(f3[7])*2} {c(f3[8])*2}")
            # Milieu du bottom (1-3) - Ajout *2
            print(f"{padding_bottom}   {c(f3[1])*2} {c(f3[2])*2} {c(f3[3])*2}")
            # Pointe du bottom (0) - Ajout *2
            print(f"{padding_bottom}      {c(f3[0])*2}")
            
            print("\n" + "="*50)
            print("" + " "*23 + "BOTTOM")
            print("="*50 + "\n")

        else:
            # Fallback TEXTE pour "all"
            print("Mode texte non supporté pour 'all' (layout complexe).")

        return # Fin de l'affichage "all"


    # --- CAS 2 : AFFICHAGE D'UNE SEULE FACE ---
    
    faces_data = {
        "f0": {"title": "FACE 0 (FRONT)", "idx": f0},
        "f1": {"title": "FACE 1 (RIGHT)", "idx": f1},
        "f2": {"title": "FACE 2 (LEFT)", "idx": f2},
        "f3": {"title": "FACE 3 (BOTTOM)", "idx": f3},
    }

    if face not in faces_data:
        print(f"Face '{face}' inconnue.")
        return

    data = faces_data[face]
    f = data["idx"]
    print(f"\n{data['title']}")

    if colored_mode:
        if face == "f3": # Bottom inversé
            # J'ai ajouté *2 partout ici aussi pour la cohérence
            print(f"{c(f[4])*2} {c(f[5])*2} {c(f[6])*2} {c(f[7])*2} {c(f[8])*2}")
            print(f"   {c(f[1])*2} {c(f[2])*2} {c(f[3])*2}")
            print(f"      {c(f[0])*2}\n")
        else: # Standard
            print(f"      {c(f[0])*2}")
            print(f"   {c(f[1])*2} {c(f[2])*2} {c(f[3])*2}")
            print(f"{c(f[4])*2} {c(f[5])*2} {c(f[6])*2} {c(f[7])*2} {c(f[8])*2}\n")
    else:
        # Fallback texte simple
        print(f"  [ {f[0]} ]")
        print(f" [ {f[1]} {f[2]} {f[3]} ]")
        print(f"[ {f[4]} {f[5]} {f[6]} {f[7]} {f[8]} ]\n")

#print_face()



