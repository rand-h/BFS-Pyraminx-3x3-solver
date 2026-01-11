const COLORS = {
        // Couleurs utilisées pour le dessin sur le Canvas (standard)
        "ROUGE": "#e74c3c", "VERT": "#2ecc71", "BLEU": "#3498db", "JAUNE": "#f1c40f",
        "ORANGE": "#e67e22", "BLANC": "#ecf0f1", "INCONNU": "#7f8c8d", "MANQUANT": "#999",
        "ERREUR": "#333", "FOND": "#2b2b2b"
};

// État actuel du Pyraminx (chaque face a 9 stickers)
const state = {
        FRONT: Array(9).fill("MANQUANT"),
        RIGHT: Array(9).fill("MANQUANT"),
        LEFT: Array(9).fill("MANQUANT"),
        BOTTOM: Array(9).fill("MANQUANT")
};

const stickerMap = [];
const canvas = document.getElementById("pyraminxCanvas");
const ctx = canvas.getContext("2d");
const FACES = ["FRONT", "LEFT", "RIGHT", "BOTTOM"];
// ... (autres références DOM) ...
let facesScannedCount = 0;
const TOTAL_FACES = 4;


// --- NOUVELLE VARIABLE GLOBALE ---
let manualEditEnabled = false; // Désactivé par défaut
// --- NOUVELLE VARIABLE GLOBALE ---


// --- CONSTANTES GÉOMÉTRIQUES CORRIGÉES ---
const S = 200;
const H = S * Math.sqrt(3) / 2;
const GAP = 20; // 20px comme dans le Python
const s = S / 3.0;
const h = H / 3.0;

if (canvas) {
        canvas.width = 750;
        canvas.height = 450;
}


// =======================================================================================
// PARTIE GÉOMÉTRIQUE ET DESSIN DU PATRON 2D
// =======================================================================================

// --- Fonctions utilitaires (Rotation, Translation, generateBaseTriangles) inchangées ---

function rotate(points, angleDeg, center = [0, 0]) {
        const angleRad = angleDeg * Math.PI / 180;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        const [cx, cy] = center;
        const newPoints = [];

        for (const [x, y] of points) {
                const tx = x - cx;
                const ty = y - cy;
                const rx = tx * cosA - ty * sinA;
                const ry = tx * sinA + ty * cosA;
                newPoints.push([rx + cx, ry + cy]);
        }
        return newPoints;
}

function translate(points, dx, dy) {
        const newPoints = [];
        for (const [x, y] of points) {
                newPoints.push([x + dx, y + dy]);
        }
        return newPoints;
}

function generateBaseTriangles() {
        return [
                [[0, H], [-s/2, 2*h], [s/2, 2*h]],                   // 0 (Sticker 1)
                 [[-s/2, 2*h], [-s, h], [0, h]],                     // 1 (Sticker 2)                                // 
                [[-s/2, 2*h], [s/2, 2*h], [0, h]],                   // 2 (Sticker 3)
                                  
                [[s/2, 2*h], [0, h], [s, h]],                       // 3 (Sticker 4)
                [[-s, h], [-1.5*s, 0], [-0.5*s, 0]],                // 4 (Sticker 5)
                [[-s, h], [0, h], [-0.5*s, 0]],                   // 5 (Sticker 6)
                [[0, h], [-0.5*s, 0], [0.5*s, 0]],                   // 6 (Sticker 7)
                [[0, h], [s, h], [0.5*s, 0]],                      // 7 (Sticker 8)
                [[s, h], [0.5*s, 0], [1.5*s, 0]],                 // 8 (Sticker 9)
        ];
}

// --- 2. Calcul de la Géométrie + RÉPLICATION EXACTE DU PYTHON ---
function getTransformedFaceGeometry(faceName) {
        const trisBase = generateBaseTriangles();
        const pivotTop = [0, H];
        const cos30 = Math.sqrt(3) / 2.0;
        const sin30 = 0.5;

        // Décalage pour centrer le patron complet (4 faces) horizontalement
        const INITIAL_OFFSET_X = canvas.width / 2;
        const TOTAL_PATRON_HEIGHT = 2 * H + GAP;
        const MARGIN_TOP = -140;

        let rawFace;
        let dx = 0;
        let dy = 0;
        let flipY = true;
        
        // --- RÉPLICATION STRICTE DES DÉPLACEMENTS DU PYTHON ---
        switch (faceName) {
                case "FRONT":
                        rawFace = trisBase;
                        break;
                case "BOTTOM":
                        rawFace = trisBase.map(t => rotate(t, 180, [0, 0]));
                        dx = 0;
                        dy = -GAP + 35;
                        break;
                case "LEFT":
                        // CORRECTION : Rotation de -60 degrés (dans le sens anti-horaire)
                        rawFace = trisBase.map(t => rotate(t, 0, pivotTop));
                        dx = -GAP * cos30 - 180;
                        dy = GAP * sin30 - 10;
                        break;
                case "RIGHT":
                        // CORRECTION : Rotation de +60 degrés (dans le sens horaire)
                        rawFace = trisBase.map(t => rotate(t, 0, pivotTop));
                        dx = GAP * cos30 + 180;
                        dy = GAP * sin30 - 10;
                        break;
                default:
                        return [];
        }
        
        // 1. Correction de l'Inversion Y
        let correctedTriangles = rawFace;
        if (flipY) {
                correctedTriangles = correctedTriangles.map(t => t.map(([x, y]) => [x, -y]));
                correctedTriangles = correctedTriangles.map(t => translate(t, 0, TOTAL_PATRON_HEIGHT));
        }
        
        // 2. Translation finale (Centrage global du patron L-F-R)
        const GLOBAL_X_TRANSLATE = INITIAL_OFFSET_X;
        const GLOBAL_Y_TRANSLATE = MARGIN_TOP;  

        // Appliquer le déplacement trigonométrique + le centrage global
        const transformedTriangles = correctedTriangles.map(t => translate(t, GLOBAL_X_TRANSLATE + dx, GLOBAL_Y_TRANSLATE + dy));
        
        // Enregistrement des données dans la carte globale (pour le clic)
        transformedTriangles.forEach((coords, i) => {
                const stickerId = i + 1;
                stickerMap.push({
                        id: `${faceName}_${stickerId}`,
                        face: faceName,
                        sticker: stickerId,
                        coords: coords
                });
        });

        return transformedTriangles;
}

// --- 3. Fonction de dessin d'un sticker (inchangée) ---

function drawSticker(coords, color) {
        ctx.beginPath();
        ctx.moveTo(coords[0][0], coords[0][1]);
        ctx.lineTo(coords[1][0], coords[1][1]);
        ctx.lineTo(coords[2][0], coords[2][1]);
        ctx.closePath();

        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 1;
        ctx.stroke();
}

// --- 4. Fonction principale de dessin du patron ---

function drawPyraminxPatron() {
        ctx.fillStyle = COLORS["FOND"];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        stickerMap.length = 0;

        FACES.forEach(faceName => {
                getTransformedFaceGeometry(faceName);
        });
        
        stickerMap.forEach(sticker => {
                const colorName = state[sticker.face][sticker.sticker - 1];
                const color = COLORS[colorName] || COLORS["INCONNU"];
                
                drawSticker(sticker.coords, color);
                
                // Numéros de sticker et initiales de la face
                const coords = sticker.coords;
                const cx = (coords[0][0] + coords[1][0] + coords[2][0]) / 3;
                const cy = (coords[0][1] + coords[1][1] + coords[2][1]) / 3;
                
                ctx.font = "bold 15px Arial";
                ctx.fillStyle = (colorName === "JAUNE" || colorName === "BLANC") ? "black" : "white";
                ctx.textAlign = "center";
                ctx.fillText(sticker.sticker - 1, cx, cy + 4);


                if (sticker.sticker === 1) {
                        // Afficher l'initiale de la face au centre du triangle 1
                        ctx.font = "bold 30px Arial";
                        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";


                        if (sticker.face[0] == "B") {
                                ctx.fillText(sticker.face[0], cx, cy + 40); // Décalage pour ne pas recouvrir le numéro 1
                        
                        }
                
                        ctx.fillText(sticker.face[0], cx, cy - 20); // Décalage pour ne pas recouvrir le numéro 1
                        

                }
        });

        // Optionnel: Mettre à jour le bouton de fin
        const goTo3DButton = document.getElementById('goTo3DButton');
        if (goTo3DButton) {
                if (facesScannedCount === TOTAL_FACES) {
                        goTo3DButton.disabled = false;
                } else {
                        goTo3DButton.disabled = true;
                }
        }
}


// =======================================================================================
// PARTIE INTERACTIVITÉ (Clic et Mise à Jour)
// =======================================================================================

// --- Gestion du Clic sur le Canvas (Hit Testing) ---

canvas.addEventListener('click', handleCanvasClick);

// Ajout pour une meilleure réactivité sur mobile (évite d'attendre le 'click')
canvas.addEventListener('touchstart', function(e) {
    if(e.cancelable) e.preventDefault(); // Empêche le scroll quand on tape sur le canvas
    
    // On simule un événement de clic avec les coordonnées du premier doigt
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("click", {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}, {passive: false});
// =======================================================================================
// CORRECTION : GESTION DU CLIC ADAPTATIVE (SMARTPHONE & REDIMENSIONNEMENT)
// =======================================================================================

function handleCanvasClick(event) {
        // 1. Récupérer la taille VISUELLE du canvas (ce que l'utilisateur voit)
        const rect = canvas.getBoundingClientRect();

        // 2. Récupérer les coordonnées du clic par rapport à la fenêtre
        // Note: Si c'est un événement tactile (touch), il faut gérer différemment, 
        // mais le 'click' standard fonctionne généralement sur mobile après un court délai.
        const clientX = event.clientX;
        const clientY = event.clientY;

        // 3. CALCULER LE FACTEUR D'ÉCHELLE (Ratio entre taille interne et taille affichée)
        // C'est l'étape qui manquait :
        const scaleX = canvas.width / rect.width;   // ex: 750 / 375 = 2
        const scaleY = canvas.height / rect.height; // ex: 450 / 225 = 2

        // 4. Appliquer l'échelle aux coordonnées du clic
        const clickX = (clientX - rect.left) * scaleX;
        const clickY = (clientY - rect.top) * scaleY;

        let clickedSticker = null;

        // Le reste de la logique de détection reste identique, car clickX/Y sont maintenant
        // convertis dans le système de coordonnées de 750x450 pixels du canvas.
        for (const sticker of stickerMap) {
                const coords = sticker.coords;

                ctx.beginPath();
                ctx.moveTo(coords[0][0], coords[0][1]);
                ctx.lineTo(coords[1][0], coords[1][1]);
                ctx.lineTo(coords[2][0], coords[2][1]);
                ctx.closePath();

                if (ctx.isPointInPath(clickX, clickY)) {
                        clickedSticker = sticker;
                        break;
                }
        }

        if (clickedSticker) {
                const faceName = clickedSticker.face;
                const stickerNumber = clickedSticker.sticker;

                if (manualEditEnabled) {
                        console.log(`Clic pour édition manuelle sur ${clickedSticker.id}`);
                        
                        const currentColor = state[faceName][stickerNumber - 1];
                        // Cycle incluant les couleurs standard + MANQUANT pour corriger une erreur
                        const colorCycle = ["MANQUANT", "ROUGE", "VERT", "BLEU", "JAUNE"];
                        
                        // Si la couleur actuelle n'est pas dans le cycle (ex: INCONNU), on repart du début
                        let currentIndex = colorCycle.indexOf(currentColor);
                        if (currentIndex === -1) currentIndex = -1;

                        const nextIndex = (currentIndex + 1) % colorCycle.length;
                        const newColorName = colorCycle[nextIndex];
                        
                        state[faceName][stickerNumber - 1] = newColorName;
                        
                        // IMPORTANT : Mettre à jour le compteur global
                        // On recalcule tout pour être sûr
                        let totalValid = 0;
                        FACES.forEach(f => {
                            if (!state[f].includes("MANQUANT") && !state[f].includes("INCONNU")) {
                                totalValid++;
                            }
                        });
                        facesScannedCount = totalValid;

                        // Mettre à jour l'UI (bouton 3D) si dispo
                        const goTo3DButton = document.getElementById('goTo3DButton');
                        if (goTo3DButton) goTo3DButton.disabled = (facesScannedCount !== TOTAL_FACES);
                        
                        drawPyraminxPatron();
                } else {
                        // Mode Scan
                        console.log(`Clic détecté sur ${faceName}. Lancement du scan.`);
                        if (typeof launchScanForFace === 'function') {
                                launchScanForFace(faceName);
                        }
                }
        }
}

/*/
function handleCanvasClick(event) {
        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        let clickedSticker = null;

        for (const sticker of stickerMap) {
                const coords = sticker.coords;

                ctx.beginPath();
                ctx.moveTo(coords[0][0], coords[0][1]);
                ctx.lineTo(coords[1][0], coords[1][1]);
                ctx.lineTo(coords[2][0], coords[2][1]);
                ctx.closePath();

                if (ctx.isPointInPath(clickX, clickY)) {
                        clickedSticker = sticker;
                        break;
                }
        }

        if (clickedSticker) {
                const faceName = clickedSticker.face;
                const stickerNumber = clickedSticker.sticker;

                // --- 🌟 LOGIQUE CLÉ : Vérifier si l'édition manuelle est active ---
                if (manualEditEnabled) {
                            console.log(`Clic pour édition manuelle sur ${clickedSticker.id}`);
                            
                            const currentColor = state[faceName][stickerNumber - 1];
                            const colorCycle = ["MANQUANT", "ROUGE", "VERT", "BLEU", "JAUNE"];
                            const currentIndex = colorCycle.indexOf(currentColor);
                            const nextIndex = (currentIndex + 1) % colorCycle.length;
                            const newColorName = colorCycle[nextIndex];
                            
                            // Mettre à jour l'état du sticker unique
                            state[faceName][stickerNumber - 1] = newColorName;
                            
                            // Mise à jour de facesScannedCount (si vous la gérez manuellement)
                            // Note: Il est recommandé d'appeler checkCompletionAndShowSaveButton()
                            
                            drawPyraminxPatron();
                } else {
                        // --- LOGIQUE DE PRODUCTION (LANCER LE SCAN) ---
                        console.log(`Clic détecté sur ${faceName}. Lancement du scan.`);
                        
                        // Assurez-vous que la fonction launchScanForFace est définie dans scan.js et est globale (window.launchScanForFace)
                        if (typeof launchScanForFace === 'function') {
                                launchScanForFace(faceName);
                        } else {
                                console.warn("La fonction launchScanForFace n'est pas définie ou n'est pas globale (window).");
                        }
                }
        }
}

/*/

// --- FONCTION DE MISE À JOUR DE L'ÉTAT GLOBALE (appelée par Flask) ---

/**
    * Met à jour l'état de la face scannée et redessine le patron.
    * @param {string} faceName - Nom de la face ("FRONT", "LEFT", etc.).
    * @param {Array<string>} nineColors - Liste des 9 couleurs de la face scannée.
    */
function updateFace(faceName, nineColors) {
        if (state.hasOwnProperty(faceName)) {
                const wasScanned = state[faceName].some(c => c !== "MANQUANT");
                
                state[faceName] = nineColors;
                
                // On vérifie si la face devient complète (ne contient plus "MANQUANT")
                if (!wasScanned && !nineColors.includes("MANQUANT") && !nineColors.includes("INCONNU")) {
                        facesScannedCount++;
                }
        }
        
        drawPyraminxPatron();

        canvas.style.transform = "scale(1.01)";
        setTimeout(() => canvas.style.transform = "scale(1.0)", 100);
}


// =======================================================================================
// FONCTION D'INITIALISATION DES COULEURS (quand on recharge la page avec des données)
// =======================================================================================
function initPyraminxColors(savedData) {
        let atLeastOneFace = false;
        facesScannedCount = 0; // Réinitialiser le compteur avant de compter

        Object.entries(savedData).forEach(([faceName, colors]) => {
                if (
                        colors &&
                        Array.isArray(colors) &&
                        colors.length === 9 &&
                        FACES.includes(faceName)
                ) {
                        state[faceName] = colors;

                        // On compte comme scannée seulement si aucune couleur "MANQUANT" ou "INCONNU"
                        if (!colors.includes("MANQUANT") && !colors.includes("INCONNU")) {
                                facesScannedCount++;
                        }
                        atLeastOneFace = true;
                }
        });

        // Redessine seulement si on a reçu au moins une face valide
        if (atLeastOneFace || facesScannedCount === 0) { // Redessiner même s'il n'y a rien pour le cas 'default'
                drawPyraminxPatron();
                console.log(`Pyraminx initialisé avec ${facesScannedCount}/${TOTAL_FACES} faces scannées.`);
        }
}


function initScanSession(set_state = state) {
        // 1. D'abord on dessine le patron vide (au cas où)
        drawPyraminxPatron();

        // 2. Ensuite on charge les données sauvegardées
        const savedPyraminxState = set_state;

        initPyraminxColors(savedPyraminxState);
        
        // 3. Création du switch de modification manuelle
        setupManualEditSwitch();

        console.log("Session de scan initialisée.");
}


// --- 🌟 NOUVELLE FONCTION : GESTION DU SWITCH ---
function setupManualEditSwitch() {
        // Récupère le conteneur où placer le switch (doit exister dans le HTML)
        let container = document.getElementById('manualEditToggleArea');
        
        if (!container) {
                // Si le conteneur n'existe pas, on le crée et l'ajoute au body (ou à un élément parent connu)
                container = document.createElement('div');
                container.id = 'manualEditToggleArea';
                // On va supposer que vous avez une 'messageText' area pour l'ajouter à proximité.
                // Si vous avez une zone de contrôle spécifique, utilisez-la (ex: document.getElementById('controls') )
                const messageText = document.getElementById('messageText');
                if (messageText && messageText.parentNode) {
                        messageText.parentNode.insertBefore(container, messageText.nextSibling);
                } else {
                        document.body.prepend(container);
                }
                container.style.margin = '10px 0';
                container.style.textAlign = 'center';
        }
        
        // Contenu du switch (utilise des classes Bootstrap pour l'esthétique si elles sont disponibles)
        container.innerHTML = `
                <div class="form-check form-switch d-inline-block p-1 border rounded shadow-sm">
                        <input class="form-check-input" type="checkbox" id="manualEditSwitch" ${manualEditEnabled ? 'checked' : ''}>
                        <label class="form-check-label ms-2 fw-bold" for="manualEditSwitch">
                                Activer l'édition manuelle des couleurs
                        </label>
                </div>
        `;
        
        const editSwitch = document.getElementById('manualEditSwitch');
        if (editSwitch) {
                editSwitch.addEventListener('change', (e) => {
                        manualEditEnabled = e.target.checked;
                        console.log(`Édition manuelle: ${manualEditEnabled ? 'Activée' : 'Désactivée'}`);
                });
        }
}


initScanSession();

// Exposer les fonctions importantes si elles sont utilisées ailleurs (par scan.js)
window.updateFace = updateFace;
window.initPyraminxColors = initPyraminxColors;
window.drawPyraminxPatron = drawPyraminxPatron; // Utile pour forcer un redessin
                                                

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Définir le CSS comme une chaîne de caractères
        const cssText = `
                #pyraminxCanvasContainer {
                        /* Le conteneur assure le centrage (grâce à Bootstrap d-flex justify-content-center) */
                        width: 100%; /* S'assurer qu'il prend toute la largeur disponible pour le centrage */
                }
                        #pyraminxCanvas {
                        /* Définir une largeur maximale et une largeur relative à l'écran */
                        max-width: 750px; /* Taille maximale de référence (largeur définie dans le HTML) */
                        width: 100vw; /* Utiliser 90% de la largeur du viewport pour le scaling */
                                
                        /* 🌟 PROPRIÉTÉ CLÉ : Maintenir le ratio d'aspect 750:450 */
                        aspect-ratio: 750 / 450; 
                                
                        height: auto; /* La hauteur s'adapte pour maintenir le ratio */
                        display: block; /* S'assurer que le canvas est bien géré */
                }
        `;

    // 2. Créer l'élément <style>
    const styleElement = document.createElement('style');

    // 3. Insérer le texte CSS dans l'élément <style>
    styleElement.textContent = cssText;

    // 4. Ajouter l'élément <style> au <head> du document
    document.head.appendChild(styleElement);

});


