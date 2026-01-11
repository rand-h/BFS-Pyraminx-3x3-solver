import cv2
import numpy as np

# --- CORRECTION CRITIQUE POUR FLASK ---
import matplotlib
# Force le backend non-interactif AVANT d'importer pyplot
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
# --------------------------------------

from typing import Dict, Tuple, List, Optional
from PIL import Image
from io import BytesIO # Nécessaire pour la conversion finale
import os

# --- CONSTANTES ---
NORMALIZED_SIZE = 400
COULEURS_REFERENCE_RGB = {
    "ROUGE": np.array([255, 0, 0]), 
    "VERT": np.array([0, 150, 0]), 
    "BLEU": np.array([0, 0, 255]), 
    "JAUNE": np.array([255, 255, 0]), 
    "ORANGE": np.array([255, 120, 0]),
}

# =========================================
# FONCTIONS UTILITAIRES DU SCANNER ULTIME
# =========================================




def generer_masque_reflet(hsv_img, seuil_v=200, seuil_s=80):
    """
    Génère un masque binaire (0 ou 255) des zones de reflets spéculaires.
    """
    h, s, v = cv2.split(hsv_img)
    # Reflet = Valeur haute (très lumineux) ET Saturation basse (blanc/gris)
    masque = ((v > seuil_v) & (s < seuil_s)).astype(np.uint8) * 255
    
    # Nettoyage : Enlever le bruit isolé
    kernel_noise = np.ones((3, 3), np.uint8)
    masque = cv2.morphologyEx(masque, cv2.MORPH_OPEN, kernel_noise)
    
    # Dilatation pour couvrir les bords flous du reflet
    masque = cv2.dilate(masque, kernel_noise, iterations=1)
    
    return masque



def reparer_reflets_par_blob(image_bgr):
    """
    Entrée : Image BGR (numpy array)
    Sortie : Image BGR corrigée (numpy array) - MÊME TYPE
    """
    # Copie pour ne pas modifier l'original si nécessaire
    resultat = image_bgr.copy()
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    
    # 1. Détection
    masque_reflet = generer_masque_reflet(hsv)
    
    # Si aucun reflet détecté, on renvoie l'image telle quelle
    # (MODIFICATION ICI : on ne renvoie plus le masque)
    if cv2.countNonZero(masque_reflet) == 0:
        return resultat

    # 2. Analyse des composantes connectées (blobs)
    num_labels, labels_im = cv2.connectedComponents(masque_reflet)
    
    # 3. Masque du "non-noir" (pour ne pas échantillonner le plastique noir)
    _, _, v = cv2.split(hsv)
    # On considère comme plastique tout ce qui est très sombre (V < 40)
    masque_non_noir = (v > 40).astype(np.uint8) * 255

    # 4. Traitement par blob (label 0 est le fond, on commence à 1)
    for i in range(1, num_labels):
        # Masque du blob actuel uniquement
        masque_blob_actuel = (labels_im == i).astype(np.uint8) * 255
        
        # --- Stratégie de l'Anneau ---
        # On cherche les pixels sains juste autour du reflet
        kernel_voisins = np.ones((5, 5), np.uint8) 
        blob_dilate = cv2.dilate(masque_blob_actuel, kernel_voisins, iterations=2)
        
        # Anneau = (Blob Dilaté) - (Blob Original)
        masque_anneau = cv2.bitwise_xor(blob_dilate, masque_blob_actuel)
        
        # Validation des voisins : 
        # Ils ne doivent pas être un reflet EUX-MÊMES, ni être du plastique NOIR
        masque_sain_global = cv2.bitwise_not(masque_reflet)
        masque_voisins_valides = cv2.bitwise_and(masque_anneau, masque_sain_global)
        masque_voisins_valides = cv2.bitwise_and(masque_voisins_valides, masque_non_noir)
        
        # --- Remplacement ---
        pixels_voisins = image_bgr[masque_voisins_valides > 0]
        
        if len(pixels_voisins) > 0:
            # On prend la médiane (plus robuste que la moyenne pour les stickers)
            couleur_remplacement = np.median(pixels_voisins, axis=0)
            resultat[masque_blob_actuel > 0] = couleur_remplacement
        else:
            # Fallback : Si l'anneau échoue (ex: reflet entouré de noir), 
            # on tente une inpainting classique OpenCV sur ce blob précis
            # cv2.inpaint peut être utilisé ici en secours
            pass

    return resultat







def points_are_similar(pt1, pt2, tol=40):
    return abs(pt1[0] - pt2[0]) < tol and abs(pt1[1] - pt2[1]) < tol

def triangles_are_the_same(norm1, norm2, tol=45):
    pts1 = sorted(norm1)
    pts2 = sorted(norm2)
    matches = 0
    for p1 in pts1:
        for p2 in pts2:
            if points_are_similar(p1, p2, tol):
                matches += 1
                break
    return matches >= 3

def get_pyraminx_triangles_from_contour(approx, img_h, img_w):
    triangles = []

    if len(approx) == 3:
        if cv2.contourArea(approx) > (img_h * img_w) * 0.03:
            triangles.append(approx.copy())
        return triangles

    if len(approx) == 4:
        pts = approx.reshape(4, 2).astype(np.float32)
        pts_int = pts.astype(np.int32)

        left_pt   = min(pts_int, key=lambda p: p[0])
        right_pt  = max(pts_int, key=lambda p: p[0])
        top_pt    = min(pts_int, key=lambda p: p[1])

        middle_candidates = [p for p in pts_int if not (
            np.allclose(p, left_pt, atol=20) or
            np.allclose(p, right_pt, atol=20) or
            np.allclose(p, top_pt, atol=20)
        )]
        middle_pt = middle_candidates[0] if middle_candidates else \
                    sorted(pts_int, key=lambda p: abs(p[0] - (left_pt[0] + right_pt[0]) / 2))[0]

        tri1 = np.array([left_pt, top_pt, middle_pt], dtype=np.int32).reshape(-1, 1, 2)
        tri2 = np.array([right_pt, top_pt, middle_pt], dtype=np.int32).reshape(-1, 1, 2)

        area1 = cv2.contourArea(tri1)
        area2 = cv2.contourArea(tri2)

        if area1 > (img_h * img_w) * 0.04:
            triangles.append(tri1)
        if area2 > (img_h * img_w) * 0.03 and area2 > area1 * 0.25:
            triangles.append(tri2)

        return triangles

    # Fallback
    epsilon = 0.06 * cv2.arcLength(approx, True)
    approx2 = cv2.approxPolyDP(approx, epsilon, True)
    if len(approx2) >= 3:
        tri = approx2[:3].reshape(-1, 1, 2)
        if cv2.contourArea(tri) > (img_h * img_w) * 0.03:
            triangles.append(tri)
    return triangles


# =========================================
# NOUVELLE DÉTECTION + NORMALISATION (remplace l'ancienne)
# =========================================

def detecter_normaliser_face(image_bgr: np.ndarray) -> Optional[np.ndarray]:
    """
    Détection ultra-robuste avec rembg + règle physique Pyraminx
    Retourne l'image normalisée de la face principale (la plus grande)
    """
    h, w = image_bgr.shape[:2]
    
    # --- 1. Suppression du fond avec rembg ---
    """
    pil_img = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
    try:
        clean_pil = remove(pil_img, alpha_matting=True, alpha_matting_foreground_threshold=230)
        clean_np = np.array(clean_pil)
        if clean_np.shape[2] == 4:
            mask = clean_np[:,:,3] > 50
            clean_rgb = clean_np[:,:,:3]
            clean_bgr = cv2.cvtColor(clean_rgb, cv2.COLOR_RGB2BGR)
            clean_bgr[~mask] = [255, 255, 255]
        else:
            clean_bgr = cv2.cvtColor(clean_np, cv2.COLOR_RGB2BGR)
    except Exception as e:
        print("Warning: rembg échoué → on continue sans suppression de fond")
        clean_bgr = image_bgr.copy()
    """
    
    clean_bgr = image_bgr.copy()
    # --- 2. Détection des contours ---
    gray = cv2.cvtColor(clean_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (11, 11), 0)
    edges = cv2.Canny(blurred, 15, 80)
    kernel = np.ones((9,9), np.uint8)
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=3)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < (h*w)*0.04 or area > (h*w)*0.92:
            continue
        hull = cv2.convexHull(cnt)
        epsilon = 0.04 * cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, epsilon, True)
        tris = get_pyraminx_triangles_from_contour(approx, h, w)
        for tri in tris:
            a = cv2.contourArea(tri)
            if a > (h*w)*0.03:
                candidates.append((a, tri))

    if not candidates:
        print("Erreur: Aucune face Pyraminx détectée.")
        return None

    # --- 3. Prendre la face principale (plus grande aire) ---
    candidates.sort(key=lambda x: x[0], reverse=True)
    meilleur_triangle = candidates[0][1]

    # Dessiner le contour détecté (vert)
    cv2.polylines(image_bgr, [meilleur_triangle], True, (0, 255, 0), 6)

    # --- 4. Normalisation affine ---
    src_pts = meilleur_triangle.reshape(-1, 2).astype(np.float32)

    # Trier les points : haut, bas-gauche, bas-droit
    src_pts_ordonnes = sorted(src_pts, key=lambda p: p[1])
    p_haut = src_pts_ordonnes[0]
    p_bas_gauche = sorted(src_pts_ordonnes[1:], key=lambda p: p[0])[0]
    p_bas_droit = sorted(src_pts_ordonnes[1:], key=lambda p: p[0])[1]

    src_pts_final = np.array([p_haut, p_bas_gauche, p_bas_droit], dtype=np.float32)

    H_cible = NORMALIZED_SIZE * np.sqrt(3) / 2.0
    dst_pts = np.array([
        [NORMALIZED_SIZE / 2, 0],
        [0, H_cible],
        [NORMALIZED_SIZE, H_cible]
    ], dtype=np.float32)

    M = cv2.getAffineTransform(src_pts_final, dst_pts)
    img_normalisee = cv2.warpAffine(image_bgr, M, (NORMALIZED_SIZE, int(H_cible + 0.5)))

    return reparer_reflets_par_blob(img_normalisee)


# =========================================
# CLASSIFICATION COULEUR
# =========================================

def classer_couleur_rgb(rgb_value: np.ndarray) -> str:
    min_distance = float('inf')
    couleur_reconnue = "INCONNU"
    
    luminosity_factor = 255.0 / max(1, np.max(rgb_value))
    normalized_rgb = rgb_value * luminosity_factor

    for nom, ref_rgb in COULEURS_REFERENCE_RGB.items():
        distance = np.linalg.norm(normalized_rgb - ref_rgb)
        if distance < min_distance:
            min_distance = distance
            couleur_reconnue = nom
            
    return couleur_reconnue if min_distance <= 150 else "INCONNU"




'''
def classer_couleur_hsv(bgr_pixel: np.ndarray) -> str:
    """
    Classifie un pixel BGR en utilisant des plages HSV réalistes et tolérantes.
    Méthode utilisée par tous les scanners de cube sérieux (2023-2025).
    """
    # Conversion en HSV (OpenCV: H=0-179, S=0-255, V=0-255)
    hsv = cv2.cvtColor(np.uint8([[bgr_pixel]]), cv2.COLOR_BGR2HSV)[0][0]
    h, s, v = hsv[0], hsv[1], hsv[2]

    # --- Seuils ajustés manuellement sur des centaines de photos de Pyraminx ---
    if s < 50 or v < 40:           # Trop gris ou trop sombre → on ignore
        return "IN7INCONNU"

    # ROUGE (le plus délicat : il boucle de 0 à 179)
    if (h <= 10 or h >= 170) and s > 80:
        return "ROUGE"
    # ORANGE (très large car souvent confondu avec rouge/jaune)
    if 11 <= h <= 25 and s > 70:
        return "ROUGE" # "ORANGE"
    # JAUNE
    if (26 <= h <= 35 and s > 80) or (s <= 32) and (v >= 175):
        return "JAUNE"


    # VERT
    if 36 <= h <= 85 and s > 60:
        return "VERT"
    # BLEU
    if 86 <= h <= 130 and s > 70:
        return "BLEU"

    return "INCONNU"

'''

def classer_couleur_hsv(bgr_pixel: np.ndarray) -> str:
    """
    Classifie un pixel BGR avec une logique adaptée au Pyraminx.
    Gère spécifiquement le cas du JAUNE qui apparait BLANC/FADE.
    """
    # Conversion en HSV
    # H (Teinte) : 0-179
    # S (Saturation) : 0-255
    # V (Luminosité/Valeur) : 0-255
    hsv = cv2.cvtColor(np.uint8([[bgr_pixel]]), cv2.COLOR_BGR2HSV)[0][0]
    h, s, v = hsv[0], hsv[1], hsv[2]

    # --- 1. FILTRE DU NOIR / SOMBRE (Le plastique entre les stickers) ---
    if v < 50: 
        return "INCONNU"

    # --- 2. GESTION DU JAUNE FADE (Le "Problème du Blanc") ---
    # Sur un Pyraminx, il n'y a pas de blanc. 
    # Donc : Forte Luminosité + Faible Saturation = JAUNE.
    
    # Si la saturation est faible (c'est gris ou blanc)...
    if s < 60:
        # ...mais que c'est très lumineux (V > 140)
        if v > 140:
            return "JAUNE"  # C'est du jaune surexposé
        else:
            return "INCONNU" # C'est du gris (plastique ou ombre)

    # --- 3. CLASSIFICATION CLASSIQUE (Pour les couleurs bien saturées) ---
    
    # ROUGE (Il boucle autour de 0/180)
    # On inclut un peu d'orange dans le rouge car l'orange n'existe pas sur le Pyraminx standard
    if (h <= 15 or h >= 165):
        return "ROUGE"

    # JAUNE (Normal, bien saturé)
    # Environ 20 à 35
    if 16 <= h <= 40:
        return "JAUNE"

    # VERT
    if 41 <= h <= 95:
        return "VERT"

    # BLEU
    if 96 <= h <= 145:
        return "BLEU"

    return "INCONNU"


# =========================================
# ANALYSE DES 9 POINTS
# =========================================

def analyser_couleurs_normalisee(img_normalisee: np.ndarray) -> Tuple[Dict[int, str], np.ndarray]:
    
    # --- Correction Gamma pour rehausser les couleurs fades ---
    # Cela rend le jaune pâle un peu plus "jaune" avant l'analyse
    gamma = 1.2
    invGamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** invGamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    img_analyse = cv2.LUT(img_normalisee, table)
    # ------------------------------------------------------------------

    hauteur, largeur, _ = img_normalisee.shape

    points_echantillonnage = [
        (int(largeur // 2), int(hauteur * ( 7 / 32))),      # point 1

        (int(largeur * (2 / 6)), int(hauteur * ( 7 / 12))), # point 2 
        (int(largeur // 2), int(hauteur * (15 / 32))),      # point 4
        (int(largeur * (4 / 6)), int(hauteur * ( 7 / 12))), # point 3
        
        (int(largeur * (1 / 6)), int(hauteur * (29 / 32))), # point 8
        (int(largeur * (2 / 6)), int(hauteur * (26 / 32))), # point 5
        (int(largeur // 2), int(hauteur * (29 / 32))),      # point 7
        (int(largeur * (4 / 6)), int(hauteur * (26 / 32))), # point 6 
        (int(largeur * (5 / 6)), int(hauteur * (29 / 32))), # point 9
    ]

    couleurs_detectees = {}
    taille = 18  # un peu plus grand = plus stable

    for i, (x, y) in enumerate(points_echantillonnage):
        x0 = max(0, x - taille)
        y0 = max(0, y - taille)
        x1 = min(largeur, x + taille)
        y1 = min(hauteur, y + taille)
        
        roi = img_normalisee[y0:y1, x0:x1]
        if roi.size == 0:
            couleurs_detectees[i + 1] = "HORS_CADRE"
            continue

        # On prend la médiane (beaucoup plus robuste que la moyenne face aux reflets)
        median_bgr = np.median(roi, axis=(0,1)).astype(np.uint8)

        couleur = classer_couleur_hsv(median_bgr)
        couleurs_detectees[i + 1] = couleur

        # Point de debug
        cv2.circle(img_normalisee, (x, y), 10, (0, 0, 255), -1)

    return couleurs_detectees, img_normalisee

# =========================================
# AFFICHAGE FINAL
# =========================================

def dessiner_face_pyraminx_resultats(resultats: Dict[int, str], img_originale, img_normalisee):
    couleur_map = {
        "ROUGE": (1, 0, 0), "VERT": (0, 0.5, 0), "BLEU": (0, 0, 1),
        "JAUNE": (1, 1, 0), "ORANGE": (1, 0.5, 0),
        "INCONNU": (0.7, 0.7, 0.7), "HORS_CADRE": (0.5, 0.5, 0.5)
    }
    
    S = NORMALIZED_SIZE
    H = S * np.sqrt(3) / 2.0
    H_3 = H / 3.0
    S_3 = S / 3.0

    triangles_coords = [
        [(S/2, 0), (S/2 - S_3/2, H_3), (S/2 + S_3/2, H_3)],
        [(S/2 - S_3/2, H_3), (S/2 + S_3/2, H_3), (S/2, 2*H_3)],
        [(S/2 - S_3, 2*H_3), (S/2 - S_3/2, H_3), (S/2, 2*H_3)],
        [(S/2 + S_3/2, H_3), (S/2 + S_3, 2*H_3), (S/2, 2*H_3)],
        [(S/2 - S_3, 2*H_3), (0, H), (S/2 - S_3/2, H)],
        [(S/2 + S_3, 2*H_3), (S, H), (S/2 + S_3/2, H)],
        [(S/2 - S_3, 2*H_3), (S/2 - S_3/2, H), (S/2, 2*H_3)],
        [(S/2 + S_3, 2*H_3), (S/2 + S_3/2, H), (S/2, 2*H_3)],
        [(S/2 - S_3/2, H), (S/2 + S_3/2, H), (S/2, 2*H_3)],
    ]

    map_triangle_to_sample = {
        0: 1,   # petit triangle du haut → 1
        1: 3,   # centre haut (ancien 4) → maintenant 3
        2: 2,   # gauche milieu → 2
        3: 4,   # droit milieu → 4
        4: 5,   # coin bas gauche → 5
        5: 9,   # coin bas droit → 9
        6: 6,   # bas gauche centre → 6
        7: 8,   # bas droit centre → 8
        8: 7,   # centre tout en bas → 7
    }

    fig, axes = plt.subplots(1, 3, figsize=(20, 7))
    
    axes[0].imshow(cv2.cvtColor(img_originale, cv2.COLOR_BGR2RGB))
    axes[0].set_title("Image Originale + Contour Détecté", fontsize=14)
    axes[0].axis('off')

    axes[1].imshow(cv2.cvtColor(img_normalisee, cv2.COLOR_BGR2RGB))
    axes[1].set_title("Face Normalisée + Points Échantillonnés", fontsize=14)
    axes[1].axis('off')

    ax = axes[2]
    ax.set_xlim(-50, S + 50); ax.set_ylim(-50, H + 50)
    ax.set_aspect('equal'); ax.invert_yaxis()
    ax.axis('off')
    ax.set_title("Pyraminx - Face Reconstituée", fontsize=16, pad=20)

    for i, coords in enumerate(triangles_coords):
        sample = map_triangle_to_sample[i]
        couleur = resultats.get(sample, "INCONNU")
        color = couleur_map.get(couleur, (0.5, 0.5, 0.5))
        poly = Polygon(coords, facecolor=color, edgecolor='black', linewidth=1.8)
        ax.add_patch(poly)
        center = np.mean(coords, axis=0)
        ax.text(center[0], center[1], str(sample), ha='center', va='center',
                fontsize=11, weight='bold', color='white', bbox=dict(boxstyle="circle,pad=0.3", facecolor='black'))

    plt.tight_layout()
    plt.savefig("pyraminx_resultat_final.svg", dpi=200, bbox_inches='tight')
    print("\nRésultat sauvegardé → pyraminx_resultat_final.png")
    #plt.show()







def construire_patron_complet(images_faces: Dict[str, np.ndarray]) -> Dict[str, List[str]]:
    """
    Traite les 4 images (FRONT, LEFT, RIGHT, BOTTOM) et retourne le patron 2D.
    Sortie : Dictionnaire { 'FACE': ['COULEUR_1', ..., 'COULEUR_9'] }
    """
    patron_2d = {}
    ordre_faces = ["FRONT", "RIGHT", "LEFT",  "BOTTOM"]
    
    print("\n--- CONSTRUCTION DU PATRON 2D ---")

    for face_nom in ordre_faces:
        if face_nom not in images_faces:
            print(f"Attention: L'image pour la face {face_nom} est manquante.")
            patron_2d[face_nom] = ["MANQUANT"] * 9
            continue

        img_bgr = images_faces[face_nom]
        
        # 1. Détection et Normalisation
        face_normalisee = detecter_normaliser_face(img_bgr)
        
        if face_normalisee is None:
            print(f"Erreur: Impossible de détecter le triangle sur la face {face_nom}")
            patron_2d[face_nom] = ["ERREUR"] * 9
            continue
            
        # 2. Extraction des couleurs (retourne un dict {1: 'R', 2: 'V'...})
        couleurs_dict, _ = analyser_couleurs_normalisee(face_normalisee)
        
        # 3. Conversion en liste ordonnée [1, 2, ..., 9]
        # L'ordre est garanti par l'ordre de la liste `points_echantillonnage` 
        # dans ta fonction `analyser_couleurs_normalisee`.
        liste_couleurs = [couleurs_dict.get(i, "INCONNU") for i in range(1, 10)]
        
        patron_2d[face_nom] = liste_couleurs
        print(f"Face {face_nom} scannée : {liste_couleurs}")

    return patron_2d



"""
patron_2d = {
    FRONT  : ['BLEU', 'BLEU', 'BLEU', 'VERT', 'JAUNE', 'JAUNE', 'VERT', 'VERT', 'VERT'],
    LEFT   : ['ROUGE', 'VERT', 'ROUGE', 'ROUGE', 'JAUNE', 'JAUNE', 'JAUNE', 'VERT', 'VERT'],
    RIGHT  : ['JAUNE', 'ROUGE', 'JAUNE', 'BLEU', 'ROUGE', 'ROUGE', 'BLEU', 'BLEU', 'BLEU'],
    BOTTOM : ['VERT', 'JAUNE', 'VERT', 'ROUGE', 'BLEU', 'BLEU', 'JAUNE', 'ROUGE', 'ROUGE']
};

"""

''' a remplaver par le caméra
# --- EXEMPLE D'UTILISATION ---
if __name__ == "__main__":
    # Supposons que tu aies les chemins de tes 4 images
    chemins = {
        "FRONT": "images/F2.jpg",
        "LEFT":  "images/L2.jpg",
        "RIGHT": "images/R2.jpg",
        "BOTTOM":"images/B2.jpg"
    }
    
    # Chargement des images en mémoire
    images_chargees = {}
    images_ok = True
    
    for face, path in chemins.items():
        if os.path.exists(path):
            images_chargees[face] = cv2.imread(path)
        else:
            print(f"Fichier introuvable : {path}")
            images_ok = False
            
    if images_ok:
        # Lancement du scan complet
        resultat_final = construire_patron_complet(images_chargees)
        
        print("\n=== RÉSULTAT FINAL (PATRON 2D) ===")
        for face, couleurs in resultat_final.items():
            print(f"{face:<7}: {couleurs}")

'''









import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
import numpy as np
from typing import Dict, List


'''
def dessiner_patron_complet_avec_gap(patron_data: Dict[str, List[str]]):
    """
    Dessine le patron 2D du Pyraminx (Triforce net) de manière sécurisée pour Flask.
    """
    
    # --- CONFIGURATION GÉOMÉTRIQUE ---
    S = 400.0
    H = S * np.sqrt(3) / 2.0
    GAP = 20.0
    s = S / 3.0
    h = H / 3.0

    couleur_map = {
        "ROUGE": (0.85, 0.1, 0.1), "VERT": (0, 0.6, 0.1), "BLEU": (0, 0.2, 0.8),
        "JAUNE": (1, 1, 0), "ORANGE": (1, 0.55, 0),
        "INCONNU": (0.8, 0.8, 0.8), "ERREUR": (0.2, 0.2, 0.2), "MANQUANT": (0.9, 0.9, 0.9)
    }

    # --- 1. GÉNÉRATION DES COORDONNÉES (Identique à votre code) ---
    tris_base = []
    tris_base.append([(0, H), (-s/2, 2*h), (s/2, 2*h)])
    tris_base.append([(-s/2, 2*h), (-s, h), (0, h)])
    tris_base.append([(-s/2, 2*h), (s/2, 2*h), (0, h)])
    tris_base.append([(s/2, 2*h), (0, h), (s, h)])
    tris_base.append([(-s, h), (-1.5*s, 0), (-0.5*s, 0)])
    tris_base.append([(-s, h), (0, h), (-0.5*s, 0)])
    tris_base.append([(0, h), (-0.5*s, 0), (0.5*s, 0)])
    tris_base.append([(0, h), (s, h), (0.5*s, 0)])
    tris_base.append([(s, h), (0.5*s, 0), (1.5*s, 0)])

    def rotate(points, angle_deg, center=(0, 0)):
        angle_rad = np.radians(angle_deg)
        cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)
        cx, cy = center
        new_points = []
        for x, y in points:
            tx, ty = x - cx, y - cy
            rx = tx * cos_a - ty * sin_a
            ry = tx * sin_a + ty * cos_a
            new_points.append((rx + cx, ry + cy))
        return new_points

    def translate(points, dx, dy):
        return [(x + dx, y + dy) for x, y in points]

    faces_geo = {}
    pivot_top = (0, H)
    raw_front = tris_base
    raw_bottom = [rotate(t, 180, (0,0)) for t in tris_base]
    raw_left = [rotate(t, -60, pivot_top) for t in tris_base]
    raw_right = [rotate(t, 60, pivot_top) for t in tris_base]

    faces_geo["FRONT"] = raw_front
    faces_geo["BOTTOM"] = [translate(t, 0, -GAP) for t in raw_bottom]
    
    cos_30 = np.sqrt(3) / 2.0
    sin_30 = 0.5
    dx_left = -GAP * cos_30
    dy_left = GAP * sin_30
    faces_geo["LEFT"] = [translate(t, dx_left, dy_left) for t in raw_left]

    dx_right = GAP * cos_30
    dy_right = GAP * sin_30
    faces_geo["RIGHT"] = [translate(t, dx_right, dy_right) for t in raw_right]

    center_ref = (0, H/3)

    # --- 2. DESSIN SÉCURISÉ (Try / Finally) ---
    fig = None
    try:
        # Création de la figure
        fig, ax = plt.subplots(figsize=(12, 12))
        ax.set_aspect('equal')
        ax.axis('off')
        # Couleur de fond adaptée à votre UI
        fig.patch.set_facecolor('#2b2b2b') 

        for nom_face, triangles_coords in faces_geo.items():
            couleurs = patron_data.get(nom_face, ["MANQUANT"]*9)
            
            for i, coords in enumerate(triangles_coords):
                numero_sticker = i + 1
                nom_couleur = couleurs[i] if i < len(couleurs) else "ERREUR"
                rgba = couleur_map.get(nom_couleur, (0.5, 0.5, 0.5))
                
                poly = Polygon(coords, facecolor=rgba, edgecolor='#1a1a1a', linewidth=2)
                ax.add_patch(poly)
                
                cx = np.mean([p[0] for p in coords])
                cy = np.mean([p[1] for p in coords])
                txt_color = 'black' if nom_couleur == "JAUNE" else 'white'
                ax.text(cx, cy, str(numero_sticker), ha='center', va='center', 
                        fontsize=9, color=txt_color, fontweight='bold', alpha=0.8)

            lx, ly = 0, 0
            if nom_face == "FRONT": lx, ly = center_ref
            elif nom_face == "BOTTOM":
                rotated_center = rotate([center_ref], 180, (0,0))[0]
                lx, ly = translate([rotated_center], 0, -GAP)[0]
            elif nom_face == "LEFT":
                rotated_center = rotate([center_ref], -60, pivot_top)[0]
                lx, ly = translate([rotated_center], dx_left, dy_left)[0]
            elif nom_face == "RIGHT":
                rotated_center = rotate([center_ref], 60, pivot_top)[0]
                lx, ly = translate([rotated_center], dx_right, dy_right)[0]
                
            ax.text(lx, ly, nom_face, ha='center', va='center', 
                    fontsize=22, color='white', alpha=0.3, fontweight='bold')

        ax.autoscale_view()
        ax.margins(0.15)
        
        # --- SAUVEGARDE EN MÉMOIRE ---
        buf = BytesIO()
        # Important : bbox_inches='tight' évite les marges blanches excessives
        plt.savefig(buf, format='png', dpi=100, facecolor='#2b2b2b', bbox_inches='tight')
        buf.seek(0)
        
        # Conversion pour OpenCV
        file_bytes = np.asarray(bytearray(buf.read()), dtype=np.uint8)
        img_array = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)
        
        # Si image vide (erreur rare), on crée une image noire
        if img_array is None:
             print("Erreur: Image générée vide")
             return np.zeros((400, 400, 3), dtype=np.uint8)

        # Suppression canal Alpha si présent (BGRA -> BGR)
        if len(img_array.shape) == 3 and img_array.shape[2] == 4:
            img_array = cv2.cvtColor(img_array, cv2.COLOR_BGRA2BGR)
            
        return img_array

    except Exception as e:
        print(f"ERREUR MATPLOTLIB : {e}")
        # En cas d'erreur, on retourne une image noire pour ne pas crasher le serveur
        return np.zeros((400, 400, 3), dtype=np.uint8)

    finally:
        # --- NETTOYAGE CRITIQUE ---
        # Si on ne fait pas ça, la RAM du Pi se remplit et Flask crashe
        if fig:
            plt.close(fig)
        plt.close('all')
        # Force le garbage collector de matplotlib
        plt.clf()
        plt.cla()
'''



def dessiner_patron_complet_avec_gap(patron_data: Dict[str, List[str]]):
    """
    Version optimisée OpenCV (Sans Matplotlib) pour Raspberry Pi.
    """
    # --- CONFIGURATION ---
    S = 400.0
    H = S * np.sqrt(3) / 2.0
    GAP = 20.0
    s = S / 3.0
    h = H / 3.0

    # Couleurs BGR (OpenCV utilise BGR, pas RGB)
    couleur_map_bgr = {
        "ROUGE": (0, 0, 200),    # BGR
        "VERT": (0, 180, 0),     # BGR
        "BLEU": (200, 0, 0),     # BGR
        "JAUNE": (0, 255, 255),  # BGR
        "ORANGE": (0, 140, 255), # BGR
        "INCONNU": (200, 200, 200),
        "ERREUR": (50, 50, 50),
        "MANQUANT": (230, 230, 230)
    }

    # --- 1. GÉOMÉTRIE (Identique à avant) ---
    tris_base = []
    # (Copie tes définitions de tris_base ici, c'est les mêmes maths)
    tris_base.append([(0, H), (-s/2, 2*h), (s/2, 2*h)]) 
    tris_base.append([(-s/2, 2*h), (-s, h), (0, h)])
    tris_base.append([(-s/2, 2*h), (s/2, 2*h), (0, h)])
    tris_base.append([(s/2, 2*h), (0, h), (s, h)])
    tris_base.append([(-s, h), (-1.5*s, 0), (-0.5*s, 0)])
    tris_base.append([(-s, h), (0, h), (-0.5*s, 0)])
    tris_base.append([(0, h), (-0.5*s, 0), (0.5*s, 0)])
    tris_base.append([(0, h), (s, h), (0.5*s, 0)])
    tris_base.append([(s, h), (0.5*s, 0), (1.5*s, 0)])

    def rotate(points, angle_deg, center=(0, 0)):
        angle_rad = np.radians(angle_deg)
        cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)
        cx, cy = center
        new_points = []
        for x, y in points:
            tx, ty = x - cx, y - cy
            rx = tx * cos_a - ty * sin_a
            ry = tx * sin_a + ty * cos_a
            new_points.append((rx + cx, ry + cy))
        return new_points

    def translate(points, dx, dy):
        return [(x + dx, y + dy) for x, y in points]

    # --- 2. CALCUL POSITIONS ---
    pivot_top = (0, H)
    raw_front = tris_base
    raw_bottom = [rotate(t, 180, (0,0)) for t in tris_base]
    raw_left = [rotate(t, -60, pivot_top) for t in tris_base]
    raw_right = [rotate(t, 60, pivot_top) for t in tris_base]

    faces_geo = {}
    faces_geo["FRONT"] = raw_front
    faces_geo["BOTTOM"] = [translate(t, 0, -GAP) for t in raw_bottom]

    cos_30 = np.sqrt(3) / 2.0
    sin_30 = 0.5
    
    dx_left = -GAP * cos_30
    dy_left = GAP * sin_30
    faces_geo["LEFT"] = [translate(t, dx_left, dy_left) for t in raw_left]

    dx_right = GAP * cos_30
    dy_right = GAP * sin_30
    faces_geo["RIGHT"] = [translate(t, dx_right, dy_right) for t in raw_right]

    # --- 3. DESSIN OPENCV ---
    # Création d'une image noire (Hauteur, Largeur, 3)
    # On prévoit large : 1200x1200px
    W_IMG, H_IMG = 1200, 1200
    CANVAS_CENTER_X, CANVAS_CENTER_Y = W_IMG // 2, H_IMG // 2
    
    # Fond gris foncé (#2b2b2b)
    img_result = np.full((H_IMG, W_IMG, 3), (43, 43, 43), dtype=np.uint8)

    # Offset global pour centrer le dessin dans l'image
    # Le calcul précédent était centré autour de (0,0) et (0,H)
    OFFSET_X = CANVAS_CENTER_X
    OFFSET_Y = CANVAS_CENTER_Y - int(H / 2)

    for nom_face, triangles_coords in faces_geo.items():
        couleurs = patron_data.get(nom_face, ["MANQUANT"]*9)

        for i, coords in enumerate(triangles_coords):
            # Conversion des coords float -> int pour OpenCV
            # Et ajout de l'offset pour centrer dans l'image
            pts = np.array([
                [int(x + OFFSET_X), int(H_IMG - (y + OFFSET_Y))] # Inversion Y car OpenCV 0 est en haut
                for x, y in coords
            ], np.int32)
            
            pts = pts.reshape((-1, 1, 2))

            # Couleur
            nom_couleur = couleurs[i] if i < len(couleurs) else "ERREUR"
            color_bgr = couleur_map_bgr.get(nom_couleur, (128, 128, 128))

            # Remplissage
            cv2.fillPoly(img_result, [pts], color_bgr)
            
            # Contour noir
            cv2.polylines(img_result, [pts], True, (26, 26, 26), 2, cv2.LINE_AA)

            # Texte (Numéro sticker)
            # Calcul du centre du triangle pour le texte
            M = cv2.moments(pts)
            if M["m00"] != 0:
                cX = int(M["m10"] / M["m00"])
                cY = int(M["m01"] / M["m00"])
                
                txt_color = (0, 0, 0) if nom_couleur == "JAUNE" else (255, 255, 255)
                numero = str(i + 1)
                
                # Centrer le texte
                (tw, th), _ = cv2.getTextSize(numero, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
                cv2.putText(img_result, numero, (cX - tw//2, cY + th//2), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, txt_color, 1, cv2.LINE_AA)

    # --- 4. OPTIMISATION FINALE ---
    # On découpe l'image pour enlever le trop-plein de vide autour
    # On convertit en gris pour trouver la bounding box des éléments non-gris-foncé
    gray = cv2.cvtColor(img_result, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 44, 255, cv2.THRESH_BINARY) # 43 est le fond
    x, y, w, h = cv2.boundingRect(thresh)
    
    # Marge de sécurité
    m = 20
    img_cropped = img_result[max(0, y-m):min(H_IMG, y+h+m), max(0, x-m):min(W_IMG, x+w+m)]

    return img_cropped





'''
def dessiner_patron_complet_avec_gap(patron_data: Dict[str, List[str]]):
    """
    Dessine le patron 2D du Pyraminx (Triforce net) avec un petit espace entre les faces.
    """
    
    # --- CONFIGURATION GÉOMÉTRIQUE ---
    S = 400.0  # Longueur du côté d'une face
    H = S * np.sqrt(3) / 2.0  # Hauteur de la face
    
    # --- CONFIGURATION DE L'ESPACEMENT (GAP) ---
    # C'est la valeur à changer pour écarter plus ou moins les faces
    GAP = 20.0  # Espace en pixels entre les faces

    # Dimensions des petits triangles
    s = S / 3.0
    h = H / 3.0

    couleur_map = {
        "ROUGE": (0.85, 0.1, 0.1), "VERT": (0, 0.6, 0.1), "BLEU": (0, 0.2, 0.8),
        "JAUNE": (1, 1, 0), "ORANGE": (1, 0.55, 0),
        "INCONNU": (0.8, 0.8, 0.8), "ERREUR": (0.2, 0.2, 0.2), "MANQUANT": (0.9, 0.9, 0.9)
    }

    # --- 1. GÉNÉRATION DES COORDONNÉES DE BASE (Pointe en HAUT) ---
    tris_base = []
    # Rangée 1 (Haut)
    tris_base.append([(0, H), (-s/2, 2*h), (s/2, 2*h)]) # 1
    # Rangée 2 (Milieu)
    tris_base.append([(-s/2, 2*h), (-s, h), (0, h)])         # 2
    tris_base.append([(-s/2, 2*h), (s/2, 2*h), (0, h)])      # 3 (Inv)
    tris_base.append([(s/2, 2*h), (0, h), (s, h)])           # 4
    # Rangée 3 (Bas)
    tris_base.append([(-s, h), (-1.5*s, 0), (-0.5*s, 0)])    # 5
    tris_base.append([(-s, h), (0, h), (-0.5*s, 0)])         # 6 (Inv)
    tris_base.append([(0, h), (-0.5*s, 0), (0.5*s, 0)])      # 7
    tris_base.append([(0, h), (s, h), (0.5*s, 0)])           # 8 (Inv)
    tris_base.append([(s, h), (0.5*s, 0), (1.5*s, 0)])       # 9

    # --- 2. FONCTIONS UTILITAIRES GÉOMÉTRIQUES ---
    def rotate(points, angle_deg, center=(0, 0)):
        """Tourne une liste de points autour d'un centre."""
        angle_rad = np.radians(angle_deg)
        cos_a, sin_a = np.cos(angle_rad), np.sin(angle_rad)
        cx, cy = center
        new_points = []
        for x, y in points:
            tx, ty = x - cx, y - cy
            rx = tx * cos_a - ty * sin_a
            ry = tx * sin_a + ty * cos_a
            new_points.append((rx + cx, ry + cy))
        return new_points

    def translate(points, dx, dy):
        """Déplace (translate) une liste de points."""
        new_points = []
        for x, y in points:
            new_points.append((x + dx, y + dy))
        return new_points

    # --- 3. DÉFINITION DES POSITIONS AVEC GAP ---
    faces_geo = {}
    pivot_top = (0, H) # Le sommet où se rejoignent les pointes 1

    # --- Étape 3a : Calcul des positions "collées" (comme avant) ---
    # FRONT reste de base
    raw_front = tris_base
    # BOTTOM tourne de 180° autour de l'origine
    raw_bottom = [rotate(t, 180, (0,0)) for t in tris_base]
    # LEFT tourne de -60° autour du sommet haut
    raw_left = [rotate(t, -60, pivot_top) for t in tris_base]
    # RIGHT tourne de +60° autour du sommet haut
    raw_right = [rotate(t, 60, pivot_top) for t in tris_base]

    # --- Étape 3b : Application du GAP (Translation pour éclater la vue) ---
    
    # FRONT : On décide qu'elle ne bouge pas, c'est la référence.
    faces_geo["FRONT"] = raw_front

    # BOTTOM : On le décale simplement vers le bas (axe Y négatif)
    faces_geo["BOTTOM"] = [translate(t, 0, -GAP) for t in raw_bottom]

    # LEFT et RIGHT : Il faut les éloigner du centre.
    # On calcule les vecteurs pour les pousser perpendiculairement à leurs arêtes de jonction.
    # Facteurs trigonométriques pour 30 degrés (l'angle d'éloignement)
    cos_30 = np.sqrt(3) / 2.0  # approx 0.866
    sin_30 = 0.5

    # Vecteur pour LEFT (vers le haut-gauche)
    dx_left = -GAP * cos_30
    dy_left = GAP * sin_30
    faces_geo["LEFT"] = [translate(t, dx_left, dy_left) for t in raw_left]

    # Vecteur pour RIGHT (vers le haut-droite)
    dx_right = GAP * cos_30
    dy_right = GAP * sin_30
    faces_geo["RIGHT"] = [translate(t, dx_right, dy_right) for t in raw_right]


    # --- 4. AFFICHAGE ---
    fig, ax = plt.subplots(figsize=(12, 12))
    ax.set_aspect('equal')
    ax.axis('off')
    fig.patch.set_facecolor('#2b2b2b') # Fond légèrement plus clair
    
    # Barycentre de référence pour une face droite
    center_ref = (0, H/3) 

    for nom_face, triangles_coords in faces_geo.items():
        couleurs = patron_data.get(nom_face, ["MANQUANT"]*9)
        
        # Dessin des stickers
        for i, coords in enumerate(triangles_coords):
            numero_sticker = i + 1
            nom_couleur = couleurs[i]
            rgba = couleur_map.get(nom_couleur, (0.5, 0.5, 0.5))
            
            # Bordure légèrement plus épaisse pour bien délimiter avec le gap
            poly = Polygon(coords, facecolor=rgba, edgecolor='#1a1a1a', linewidth=2)
            ax.add_patch(poly)
            
            cx = np.mean([p[0] for p in coords])
            cy = np.mean([p[1] for p in coords])
            txt_color = 'black' if nom_couleur == "JAUNE" else 'white'
            ax.text(cx, cy, str(numero_sticker), ha='center', va='center', 
                    fontsize=9, color=txt_color, fontweight='bold', alpha=0.8)

        # Positionnement des labels des faces
        # On applique les MÊMES transformations au centre du label pour qu'il suive la face
        lx, ly = 0, 0
        if nom_face == "FRONT":
            lx, ly = center_ref
        elif nom_face == "BOTTOM":
            rotated_center = rotate([center_ref], 180, (0,0))[0]
            lx, ly = translate([rotated_center], 0, -GAP)[0]
        elif nom_face == "LEFT":
            rotated_center = rotate([center_ref], -60, pivot_top)[0]
            lx, ly = translate([rotated_center], dx_left, dy_left)[0]
        elif nom_face == "RIGHT":
            rotated_center = rotate([center_ref], 60, pivot_top)[0]
            lx, ly = translate([rotated_center], dx_right, dy_right)[0]
            
        ax.text(lx, ly, nom_face, ha='center', va='center', 
                fontsize=22, color='white', alpha=0.3, fontweight='bold')

    ax.autoscale_view()
    # Marge un peu plus grande pour accommoder l'éclatement
    ax.margins(0.15) 
    plt.tight_layout()

    try:
        buf = BytesIO()
        # Sauvegarde dans le buffer mémoire (pas de fichier disque)
        # facecolor='#2b2b2b' doit correspondre à votre fond
        plt.savefig(buf, format='png', dpi=150, facecolor='#2b2b2b', bbox_inches='tight')
        buf.seek(0)  # Remet le curseur au début

        # Lecture de l'image depuis le buffer pour OpenCV/Numpy
        # On utilise cv2.imdecode pour obtenir directement du BGR/BGRA
        file_bytes = np.asarray(bytearray(buf.read()), dtype=np.uint8)
        img_array = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)
        
        # Si l'image a un canal alpha (transparence), on peut le gérer ou convertir en BGR
        if img_array.shape[2] == 4:
             # Optionnel : convertir en BGR si vous n'avez pas besoin de transparence
             # img_array = cv2.cvtColor(img_array, cv2.COLOR_BGRA2BGR)
             pass

        return img_array

    finally:
        # TRES IMPORTANT : Fermer la figure pour éviter la fuite de mémoire et le crash
        plt.close(fig)
        plt.close('all') # Sécurité supplémentaire
        buf.close()
'''



'''# --- EXEMPLE D'UTILISATION ---
    test_data = {
        "FRONT":  ["ROUGE"]*9,
        "LEFT":   ["BLEU"]*9,
        "RIGHT":  ["VERT"]*9,
        "BOTTOM": ["JAUNE"]*9
    }
    dessiner_patron_complet_avec_gap(test_data)

'''    

# après on peut charger l'image retournée dans un GUI ou autre


# Intégrer cette fonction dans le fichier contenant les autres

def process_single_scan_and_draw(img_bgr: np.ndarray, face_nom: str, current_patron_data: Dict[str, List[str]]):
    """
    Traite une seule image de face, met à jour le patron complet et génère
    l'image du patron 2D mis à jour (avec espacement).
    
    :param img_bgr: Image OpenCV (BGR) de la face scannée.
    :param face_nom: Nom de la face scannée (e.g., "FRONT").
    :param current_patron_data: L'état actuel du patron complet (peut contenir des faces "MANQUANT").
    :return: Tuple[List[str], np.ndarray] -> (liste_couleurs_de_la_face, image_patron_mis_a_jour)
    """
    
    # 1. Détection et Normalisation
    # Note : Le passage direct de l'image (sans sauvegarde/re-lecture) est le plus rapide
    face_normalisee = detecter_normaliser_face(img_bgr)
    
    if face_normalisee is None:
        raise ValueError(f"Impossible de détecter le triangle sur la face {face_nom}")
        
    # 2. Extraction des couleurs (retourne un dict {1: 'R', 2: 'V'...})
    couleurs_dict, _ = analyser_couleurs_normalisee(face_normalisee)
    
    # 3. Conversion en liste ordonnée [1, 2, ..., 9]
    liste_couleurs = [couleurs_dict.get(i, "INCONNU") for i in range(1, 10)]
    
    # 4. Mise à jour du patron complet
    # Assurez-vous d'avoir initialisé toutes les faces comme 'MANQUANT' dans la session
    current_patron_data[face_nom] = liste_couleurs
    
    print(f"Face {face_nom} scannée : {liste_couleurs}")
    
    # 5. Génération de l'image du patron 2D mis à jour
    image_patron_mis_a_jour = dessiner_patron_complet_avec_gap(current_patron_data)
    
    return liste_couleurs, image_patron_mis_a_jour