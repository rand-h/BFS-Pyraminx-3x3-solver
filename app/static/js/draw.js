// --- CONSTANTES DE COULEURS ET D'ÉTAT ---
const COLORS = {
    // Couleurs utilisées pour le dessin sur le Canvas (standard)
    "ROUGE": "#e74c3c", "VERT": "#2ecc71", "BLEU": "#3498db", "JAUNE": "#f1c40f",
    "ORANGE": "#e67e22", "BLANC": "#ecf0f1", "INCONNU": "#7f8c8d", "MANQUANT": "#999",
    "ERREUR": "#333", "FOND": "#2b2b2b"
};

// État actuel du Pyraminx (chaque face a 9 stickers) - Déclaré avec const
const state = {
    FRONT: Array(9).fill("MANQUANT"),
    RIGHT: Array(9).fill("MANQUANT"),
    LEFT: Array(9).fill("MANQUANT"),
    BOTTOM: Array(9).fill("MANQUANT")
};

// --- VARIABLES GLOBALES CORRIGÉES (Déclarées avec let, initialisées à null) ---
const stickerMap = [];
let canvas = null; // ✅ CORRECTION : Initialisation pour la création dynamique
let ctx = null;    // ✅ CORRECTION : Initialisation pour la création dynamique
const FACES = ["FRONT" ,"RIGHT" , "LEFT", "BOTTOM"];
let facesScannedCount = 0;
const TOTAL_FACES = 4;
let manualEditEnabled = false; // Désactivé par défaut


// --- CONSTANTES GÉOMÉTRIQUES ---
const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 450;
const S = 200;
const H = S * Math.sqrt(3) / 2;
const GAP = 20;
const s = S / 3.0;
const h = H / 3.0;


// =======================================================================================
// PARTIE GÉOMÉTRIQUE ET DESSIN DU PATRON 2D
// =======================================================================================

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
        [[-s/2, 2*h], [-s, h], [0, h]], 
        
        [[-s/2, 2*h], [s/2, 2*h], [0, h]],                   // 1 (Sticker 3)
                          // 2 (Sticker 2)
        [[s/2, 2*h], [0, h], [s, h]],                       // 3 (Sticker 4)
        [[-s, h], [-1.5*s, 0], [-0.5*s, 0]],                // 4 (Sticker 5)
        [[-s, h], [0, h], [-0.5*s, 0]],                   // 5 (Sticker 6)
        [[0, h], [-0.5*s, 0], [0.5*s, 0]],                   // 6 (Sticker 7)
        [[0, h], [s, h], [0.5*s, 0]],                      // 7 (Sticker 8)
        [[s, h], [0.5*s, 0], [1.5*s, 0]],                 // 8 (Sticker 9)
    ];
}

function getTransformedFaceGeometry(faceName) {
    if (!canvas) return []; 
    
    const trisBase = generateBaseTriangles();
    const pivotTop = [0, H];
    const cos30 = Math.sqrt(3) / 2.0;
    const sin30 = 0.5;

    const INITIAL_OFFSET_X = canvas.width / 2;
    const TOTAL_PATRON_HEIGHT = 2 * H + GAP;
    const MARGIN_TOP = -140;

    let rawFace;
    let dx = 0;
    let dy = 0;
    let flipY = true;
    
    // --- DÉPLACEMENTS ---
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
            rawFace = trisBase.map(t => rotate(t, 0, pivotTop)); 
            dx = -S - GAP * cos30 + 20;
            dy = GAP * sin30 + H - 183;
            break;
        case "RIGHT":
            rawFace = trisBase.map(t => rotate(t, 0, pivotTop)); 
            dx = S + GAP * cos30 - 20;
            dy = GAP * sin30 + H - 183 ;
            break;
        default:
            return [];
    }
    
    // Correction de l'Inversion Y + Translation
    let correctedTriangles = rawFace;
    if (flipY) {
        correctedTriangles = correctedTriangles.map(t => t.map(([x, y]) => [x, -y]));
        correctedTriangles = correctedTriangles.map(t => translate(t, 0, TOTAL_PATRON_HEIGHT));
    }
    
    const GLOBAL_X_TRANSLATE = INITIAL_OFFSET_X;
    const GLOBAL_Y_TRANSLATE = MARGIN_TOP; 

    const transformedTriangles = correctedTriangles.map(t => translate(t, GLOBAL_X_TRANSLATE + dx, GLOBAL_Y_TRANSLATE + dy));
    
    // Enregistrement dans stickerMap
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

function drawSticker(coords, color) {
    if (!ctx) return; // ✅ VÉRIFICATION
    
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

function drawPyraminxPatron() {
    // ✅ CORRECTION : Vérification des variables globales
    if (!canvas) {
        console.error("Le canvas n'est pas prêt. Appel à createPyraminxCanvas() manquant ou prématuré.");
        //return; 
    }

    if (!ctx) {
        // Tente de récupérer le contexte si le canvas est là mais ctx est null (après un appel initial `initScanSession`)
        ctx = canvas.getContext("2d");
        if (!ctx) return;
    }
    
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
        
        // Texte (numéros et initiales)
        const coords = sticker.coords;
        const cx = (coords[0][0] + coords[1][0] + coords[2][0]) / 3;
        const cy = (coords[0][1] + coords[1][1] + coords[2][1]) / 3;
        
        ctx.font = "bold 15px Arial";
        ctx.fillStyle = (colorName === "JAUNE" || colorName === "BLANC") ? "black" : "white";
        ctx.textAlign = "center";
        ctx.fillText(sticker.sticker - 1, cx, cy + 4);

        if (sticker.sticker === 1) {
            ctx.font = "bold 30px Arial";
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            
            let dyOffset = (sticker.face === "BOTTOM") ? 40 : -20;
            ctx.fillText(sticker.face[0], cx, cy + dyOffset);
        }
    });

    // Mise à jour du bouton 3D
    const goTo3DButton = document.getElementById('goTo3DButton');
    if (goTo3DButton) {
        goTo3DButton.disabled = facesScannedCount !== TOTAL_FACES;
    }
}


// --- GESTION DU CLIC ---
// La gestion du clic doit également vérifier si ctx est prêt
function handleCanvasClick(event) {
    if (!ctx || !canvas) return; // ✅ VÉRIFICATION

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    let clickedSticker = null;

    // Logique de détection de clic (inchangée)
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
            // Logique d'édition manuelle (inchangée)
            const currentColor = state[faceName][stickerNumber - 1];
            const colorCycle = ["MANQUANT", "ROUGE", "VERT", "BLEU", "JAUNE"];
            const currentIndex = colorCycle.indexOf(currentColor);
            const nextIndex = (currentIndex + 1) % colorCycle.length;
            state[faceName][stickerNumber - 1] = colorCycle[nextIndex];
            drawPyraminxPatron();
        } else {
            // Logique de scan (inchangée)
            if (typeof launchScanForFace === 'function') {
                launchScanForFace(faceName);
            }
        }
    }
}


// --- FONCTION DE MISE À JOUR DE L'ÉTAT GLOBALE (appelée par Flask/Scan) ---
function updateFace(faceName, nineColors) {
    if (state.hasOwnProperty(faceName)) {
        const wasScanned = state[faceName].some(c => c !== "MANQUANT");
        state[faceName] = nineColors;
        
        if (!wasScanned && !nineColors.includes("MANQUANT") && !nineColors.includes("INCONNU")) {
            facesScannedCount++;
        }
    }
    
    drawPyraminxPatron();

    // S'assurer que canvas n'est pas null avant d'accéder à style
    if (canvas) {
        canvas.style.transform = "scale(1.01)";
        setTimeout(() => canvas.style.transform = "scale(1.0)", 100);
    }
}


// --- FONCTIONS DE CRÉATION DYNAMIQUE DU CANVAS ---

function applyScalingStyles(bgColor = 'transparent') {
    if (!document.getElementById('pyraminxCanvas')) return;
    
    const canvasStyle = document.getElementById('pyraminxCanvas').style;
    canvasStyle.backgroundColor = bgColor; 

    const cssText = `
        #pyraminxCanvasContainer {
            width: 100%;
        }

        #patron-2d-display { 
            /* S'assurer que le conteneur a des limites claires s'il n'en a pas déjà via Bootstrap */
            width: 100%; 
            height: auto;
            display: flex;

            align-item: center;
            justify-content: center;
            overflow-x : hidden;
        }

        #pyraminxCanvas {
            max-width: ${CANVAS_WIDTH}px;
            width: 100%;
            
            max-height: 90vh;

            aspect-ratio: ${CANVAS_WIDTH} / ${CANVAS_HEIGHT}; 
            
            height: auto; 
            display: block; 
        }
    `;

    let styleElement = document.getElementById('pyraminxCanvasStyles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'pyraminxCanvasStyles';
        document.head.appendChild(styleElement);
    }
    styleElement.textContent = cssText;
}





// NOTE IMPORTANTE :
// Dans votre HTML, le conteneur est <div id="patron-2d-display" style="width: auto;">
// "width: auto;" permet au div de s'ajuster. Assurez-vous que ce div est contenu 
// dans un parent qui lui donne une contrainte de largeur (comme un conteneur Bootstrap).






function createPyraminxCanvas(containerId, initialState, backgroundColor = 'transparent') {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error(`Conteneur non trouvé avec l'ID: ${containerId}`);
        return false;
    }
    
    // Supprimer tout ancien canvas s'il existe
    const existingCanvas = document.getElementById("pyraminxCanvas");
    if (existingCanvas) {
        existingCanvas.remove();
    }
    
    const newCanvas = document.createElement('canvas');
    newCanvas.id = "pyraminxCanvas";
    newCanvas.width = CANVAS_WIDTH;
    newCanvas.height = CANVAS_HEIGHT;
    container.appendChild(newCanvas);
    
    // ✅ Mise à jour des variables globales
    canvas = newCanvas; 
    ctx = canvas.getContext("2d"); 
    
    applyScalingStyles(backgroundColor);

    // Initialisation de l'état (basé sur initialState)
    if (initialState && typeof initialState === 'object') {
        Object.keys(state).forEach(face => {
            if (initialState[face] && Array.isArray(initialState[face]) && initialState[face].length === 9) {
                state[face] = initialState[face];
            }
        });
    }
    
    // Dessiner le patron avec le nouvel état
    drawPyraminxPatron();
    
    // ✅ Rattachement de l'événement de clic au NOUVEAU canvas
    canvas.addEventListener('click', handleCanvasClick); 
    
    return true;
}


// --- FONCTION D'INITIALISATION GLOBALE ---

function initPyraminxColors(savedData) {
    let atLeastOneFace = false;
    facesScannedCount = 0; 

    Object.entries(savedData).forEach(([faceName, colors]) => {
        if (colors && Array.isArray(colors) && colors.length === 9 && FACES.includes(faceName)) {
            state[faceName] = colors;
            if (!colors.includes("MANQUANT") && !colors.includes("INCONNU")) {
                facesScannedCount++;
            }
            atLeastOneFace = true;
        }
    });

    if (atLeastOneFace || facesScannedCount === 0) {
        drawPyraminxPatron();
        console.log(`Pyraminx initialisé avec ${facesScannedCount}/${TOTAL_FACES} faces scannées.`);
    }
}


function initScanSession(set_state = state) {
    // Le drawPyraminxPatron initial est géré par createPyraminxCanvas

    // drawPyraminxPatron(); // Ligne commentée car elle est maintenant dans createPyraminxCanvas

    const savedPyraminxState = set_state;

    initPyraminxColors(savedPyraminxState);
    
    setupManualEditSwitch();

    console.log("Session de scan initialisée.");
}




// --- GESTION DU SWITCH ---
function setupManualEditSwitch() {
    let container = document.getElementById('manualEditToggleArea');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'manualEditToggleArea';
        const messageText = document.getElementById('messageText');
        if (messageText && messageText.parentNode) {
            messageText.parentNode.insertBefore(container, messageText.nextSibling);
        } else {
            document.body.prepend(container);
        }
        container.style.margin = '10px 0';
        container.style.textAlign = 'center';
    }
    
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


// Exposer les fonctions importantes
window.updateFace = updateFace;
window.initPyraminxColors = initPyraminxColors;
window.drawPyraminxPatron = drawPyraminxPatron; 
window.createPyraminxCanvas = createPyraminxCanvas;






// -------------------------------------------------------------
// FIN PARTIE RENDERER
// -------------------------------------------------------------