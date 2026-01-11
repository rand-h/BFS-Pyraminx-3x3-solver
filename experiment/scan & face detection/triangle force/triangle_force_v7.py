import cv2
import numpy as np
import matplotlib.pyplot as plt
import os
import glob

# --- CONFIGURATION ---
INPUT_FOLDER = "train"
OUTPUT_FOLDER = "debug_v7_triangle_force"

# On garde les réglages stricts qui fonctionnent bien
MIN_SATURATION = 130 
MIN_VALUE = 100 

def get_strict_mask(hsv, lower_h, upper_h, sat_min, val_min):
    lower = np.array([lower_h, sat_min, val_min])
    upper = np.array([upper_h, 255, 255])
    return cv2.inRange(hsv, lower, upper)

def process_force_triangle(img_path, save_path):
    img = cv2.imread(img_path)
    if img is None: return

    # 1. Redimensionnement (RPi1)
    target_width = 600
    scale = target_width / img.shape[1]
    width = int(img.shape[1] * scale)
    height = int(img.shape[0] * scale)
    img_small = cv2.resize(img, (width, height), interpolation=cv2.INTER_NEAREST)
    img_display = cv2.cvtColor(img_small, cv2.COLOR_BGR2RGB)

    # 2. HSV + Flou médian (Important pour lisser les couleurs)
    blurred = cv2.medianBlur(img_small, 7)
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

    # 3. Détection Couleurs Strictes (Comme V6)
    mask_r1 = get_strict_mask(hsv, 0, 8, MIN_SATURATION, MIN_VALUE)
    mask_r2 = get_strict_mask(hsv, 172, 180, MIN_SATURATION, MIN_VALUE)
    mask_red = mask_r1 | mask_r2
    mask_yellow = get_strict_mask(hsv, 22, 32, 160, MIN_VALUE) 
    mask_green = get_strict_mask(hsv, 40, 85, MIN_SATURATION, MIN_VALUE)
    mask_blue = get_strict_mask(hsv, 90, 105, MIN_SATURATION, MIN_VALUE)

    combined_mask = mask_red | mask_yellow | mask_green | mask_blue

    # 4. Nettoyage
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask_clean = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)
    # Une petite dilatation pour être sûr que les bords se touchent
    mask_clean = cv2.dilate(mask_clean, kernel, iterations=1)
    
    # 5. Trouver le plus gros objet
    contours, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    final_mask = np.zeros_like(mask_clean)
    status = "Vide"
    triangle_contour = None # Pour l'affichage debug
    
    if contours:
        # Trier pour trouver le plus grand
        sorted_contours = sorted(contours, key=cv2.contourArea, reverse=True)
        largest_contour = sorted_contours[0]
        area = cv2.contourArea(largest_contour)

        if area > (width * height * 0.01):
            # --- LE CHANGEMENT MAJEUR EST ICI ---
            
            # Au lieu de Hull, on calcule le triangle englobant minimum
            # retval est l'aire, triangle_points sont les 3 sommets (en float)
            retval, triangle_points = cv2.minEnclosingTriangle(largest_contour)
            
            # Convertir les points float en entiers pour pouvoir dessiner
            triangle_int = np.int32(triangle_points)
            
            # On dessine ce triangle parfait sur le masque
            # Note: on met le triangle dans une liste [] car drawContours attend une liste de contours
            cv2.drawContours(final_mask, [triangle_int], 0, 255, thickness=cv2.FILLED)
            
            triangle_contour = triangle_int # Sauvegarde pour le plot
            status = "OK - Triangle Forcé"
        else:
            status = "Trop petit"

    # Résultat
    result_img = cv2.bitwise_and(img_display, img_display, mask=final_mask)

    # --- DEBUG PLOT ---
    titles = ['Original', 'Couleurs Nettoyées', 'Masque Final (Triangle)', 'Resultat']
    images = [img_display, mask_clean, final_mask, result_img]

    plt.figure(figsize=(12, 6))
    for i in range(4):
        plt.subplot(1, 4, i+1)
        if len(images[i].shape) == 2:
            plt.imshow(images[i], cmap='gray')
            # Sur le masque des couleurs, on dessine le triangle trouvé en rouge pour voir
            if i == 1 and triangle_contour is not None:
                 # On doit convertir en RGB pour dessiner en couleur sur une image grise
                 temp_img = cv2.cvtColor(images[i], cv2.COLOR_GRAY2RGB)
                 cv2.drawContours(temp_img, [triangle_contour], 0, (255, 0, 0), 2)
                 plt.imshow(temp_img)
        else:
            plt.imshow(images[i])
        plt.title(titles[i])
        plt.axis('off')

    plt.suptitle(f"{os.path.basename(img_path)} - {status}")
    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()
    print(f"Traîté : {save_path}")

# --- LANCEMENT ---
if not os.path.exists(OUTPUT_FOLDER): os.makedirs(OUTPUT_FOLDER)
files = glob.glob(os.path.join(INPUT_FOLDER, "*"))
for f in files:
    if f.lower().endswith(('.jpg', '.jpeg', '.png')):
        process_force_triangle(f, os.path.join(OUTPUT_FOLDER, "debug_" + os.path.basename(f)))