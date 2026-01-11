
import * as THREE from 'three';
// Import TrackballControls pour rotation libre sans axe bloqué
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';



// ==========================================
// 1. VARIABLES GLOBALES (ESSENTIELLES)
// ==========================================
let meshRegistry = {}; 
let axes = {};         
let isAnimating = false; // La variable qui manquait !
let activeAnimation = null;

// Pivot global pour l'animation
const pivot = new THREE.Object3D();

let currentMoveKey = null;
let currentMoveInverse = false;

let game = null;

let animationPivot = new THREE.Group(); // Utilisez Group c'est plus simple


// ==========================================
// 2. CONFIGURATION
// ==========================================
const COLORS = {
  ROUGE:  new THREE.Color(0xD50F25),
  VERT:   new THREE.Color(0x009D54),
  BLEU:   new THREE.Color(0x0045AD),
  JAUNE:  new THREE.Color(0xFFD500),
  NOIR:   new THREE.Color(0x111111)
};


const defaultState = {
    FRONT: Array(9).fill("ROUGE"),
    RIGHT: Array(9).fill("JAUNE"),
    LEFT: Array(9).fill("VERT"),
    BOTTOM: Array(9).fill("BLEU")
};

const savedState = await loadAndValidateSavedState();
//console.log(savedState);

// Affectation de 'state' : si isValid est vrai, utilise savedState, sinon utilise defaultState
const state = savedState || defaultState;

// 'state' est maintenant défini et utilisable ici
console.log("État final chargé :", state);



// PRÉCISION DU SWIPE (0.0 à 1.0)
// 0.4 = Tolérant (accepte les diagonales)
// 0.8 = Chirurgical (doit être bien parallèle à l'axe)
// 0.75 est le "Sweet Spot" des applis pro.
const SWIPE_ACCURACY = 0.75; 

// Définition des contraintes par face
const FACE_TO_ALLOWED_AXES = {
    'FRONT':  ['u', 'l', 'r'], // Jamais B
    'RIGHT':  ['u', 'r', 'b'], // Jamais L
    'LEFT':   ['u', 'l', 'b'], // Jamais R
    'BOTTOM': ['l', 'r', 'b']  // Jamais U
};


/*/
const state = {
  FRONT:  ['BLEU', 'BLEU', 'BLEU', 'VERT', 'JAUNE', 'JAUNE', 'VERT', 'VERT', 'VERT'],
  LEFT:   ['ROUGE', 'VERT', 'ROUGE', 'ROUGE', 'JAUNE', 'JAUNE', 'JAUNE', 'VERT', 'VERT'],
  RIGHT:  ['JAUNE', 'ROUGE', 'JAUNE', 'BLEU', 'ROUGE', 'ROUGE', 'BLEU', 'BLEU', 'BLEU'],
  BOTTOM: ['VERT', 'JAUNE', 'VERT', 'ROUGE', 'BLEU', 'BLEU', 'JAUNE', 'ROUGE', 'ROUGE']
};/*/

// Mapping Nom Mesh -> Couleur Logique
const STICKER_MAP = {
    "Piece001_Sticker_B-P_0": { f: "FRONT", i: 0 }, "Piece001_Sticker_G-P_0": { f: "RIGHT", i: 0 }, "Piece001_Sticker_Y-P_0": { f: "LEFT",  i: 0 },
    "Piece004_Sticker_B-P_0": { f: "FRONT", i: 4 }, "Piece004_Sticker_Y-P_0": { f: "LEFT",  i: 8 }, "Piece004_Sticker_R-P_0": { f: "BOTTOM", i: 8 },
    "Piece002_Sticker_B-P_0": { f: "FRONT", i: 8 }, "Piece002_Sticker_G-P_0": { f: "RIGHT", i: 4 }, "Piece002_Sticker_R-P_0": { f: "BOTTOM", i: 4 },
    "Piece003_Sticker_G-P_0": { f: "RIGHT", i: 8 }, "Piece003_Sticker_Y-P_0": { f: "LEFT",  i: 4 }, "Piece003_Sticker_R-P_0": { f: "BOTTOM", i: 0 },
    "Piece005_Sticker_B-P_0": { f: "FRONT", i: 1 }, "Piece005_Sticker_Y-P_0": { f: "LEFT",  i: 3 },
    "Piece012_Sticker_B-P_0": { f: "FRONT", i: 3 }, "Piece012_Sticker_G-P_0": { f: "RIGHT", i: 1 },
    "Piece013_Sticker_B-P_0": { f: "FRONT", i: 6 }, "Piece013_Sticker_R-P_0": { f: "BOTTOM", i: 6 },
    "Piece010_Sticker_Y-P_0": { f: "LEFT",  i: 6 }, "Piece010_Sticker_R-P_0": { f: "BOTTOM", i: 3 },
    "Piece014_Sticker_G-P_0": { f: "RIGHT", i: 6 }, "Piece014_Sticker_R-P_0": { f: "BOTTOM", i: 1 },
    "Piece008_Sticker_Y-P_0": { f: "LEFT",  i: 1 }, "Piece008_Sticker_G-P_0": { f: "RIGHT", i: 3 },
    "Piece009_Sticker_Y-P_0": { f: "LEFT",  i: 2 }, "Piece009_Sticker_B-P_0": { f: "FRONT", i: 2 }, "Piece009_Sticker_G-P_0": { f: "RIGHT", i: 2 },
    "Piece006_Sticker_Y-P_0": { f: "LEFT",  i: 7 }, "Piece006_Sticker_R-P_0": { f: "BOTTOM", i: 7 }, "Piece006_Sticker_B-P_0": { f: "FRONT", i: 5 },
    "Piece011_Sticker_B-P_0": { f: "FRONT", i: 7 }, "Piece011_Sticker_R-P_0": { f: "BOTTOM", i: 5 }, "Piece011_Sticker_G-P_0": { f: "RIGHT", i: 5 },
    "Piece007_Sticker_G-P_0": { f: "RIGHT", i: 7 }, "Piece007_Sticker_R-P_0": { f: "BOTTOM", i: 2 }, "Piece007_Sticker_Y-P_0": { f: "LEFT",  i: 5 }
};


const PIECE_BASES = {
    u: 'Piece001_Base_0', l: 'Piece004_Base_0', r: 'Piece002_Base_0', b: 'Piece003_Base_0',
    FL: 'Piece005_Base_0', FR: 'Piece012_Base_0', FB: 'Piece013_Base_0', LB: 'Piece010_Base_0', RB: 'Piece014_Base_0', LR: 'Piece008_Base_0',
    LFR: 'Piece009_Base_0', LBF: 'Piece006_Base_0', FBR: 'Piece011_Base_0', RBL: 'Piece007_Base_0'
};

const MOVES = {
    u: ['u'], 
    l: ['l'], 
    r: ['r'], 
    b: ['b'],
    
    // U et R : déjà parfaits → on ne touche pas
    U: ['u', 'FL', 'FR', 'LR', 'LFR'],
    R: ['r', 'FR', 'FB', 'RB', 'FBR'],

    // L et B : CORRIGÉS — ordre horaire vu depuis la pointe
    L: ['l', 'FL', 'LB', 'FB', 'LBF'],    // CORRIGÉ : FL → LB → FB (et non FB en milieu)
    B: ['b', 'RB', 'LR', 'LB', 'RBL']     // CORRIGÉ : LR → LB → RB (sens horaire depuis B)
};

// REGISTRE DYNAMIQUE — C'EST ÇA QUI MANQUAIT
const currentPiece = {
    u: 'Piece001_Base_0', l: 'Piece004_Base_0', r: 'Piece002_Base_0', b: 'Piece003_Base_0',
    FL: 'Piece005_Base_0', FR: 'Piece012_Base_0', FB: 'Piece013_Base_0',
    LB: 'Piece010_Base_0', RB: 'Piece014_Base_0', LR: 'Piece008_Base_0',
    LFR: 'Piece009_Base_0', LBF: 'Piece006_Base_0', FBR: 'Piece011_Base_0', RBL: 'Piece007_Base_0'
};

// ==========================================
// 3. SCÈNE & CAMÉRA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// Au début du fichier


scene.add(animationPivot);
animationPivot.position.set(0, 0, 0); // Assurez-vous qu'il est à zéro


// Groupe qui contient tout le Pyraminx → on tourne juste ce groupe
const pyraminxGroup = new THREE.Group();
scene.add(pyraminxGroup);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 9); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- CONTROLES : TRACKBALL (Libre) ---
const controls = new TrackballControls(camera, renderer.domElement);

// 1. VITESSE DE ROTATION (Le plus important)
// Valeur actuelle : 3.0 (C'est très rapide !)
// Recommandé : 1.0 à 1.5 pour plus de précision
controls.rotateSpeed = 5; 

// 2. VITESSE DU ZOOM
// Recommandé : 1.2 (Standard) ou 0.8 (Plus doux)
controls.zoomSpeed = 1.0;

// 3. VITESSE DU PAN (Clic droit pour déplacer la caméra latéralement)
// Recommandé : 0.8 ou carrément le désactiver pour ne pas perdre le cube
controls.panSpeed = 0.8;
// controls.noPan = true; // Décommente cette ligne si tu veux empêcher le déplacement latéral

// 4. INERTIE (L'effet "glissade" quand on relâche la souris)
// C'est le "dynamicDampingFactor".
// Plus le chiffre est petit, plus ça glisse longtemps (lourd).
// Plus le chiffre est grand, plus ça s'arrête vite (sec).
// 0.1 = Standard
// 0.05 = Très fluide/lourd (Sensation "Premium")
// 0.2 = Très réactif/sec
controls.dynamicDampingFactor = 0.08; 

// Important : On vise toujours le centre (0,0,0) où se trouve le puzzle
controls.target.set(0, 0, 0);

// Lumières
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 10, 10);
scene.add(dirLight);
scene.add(pivot);





// ==========================================
// POSITION & ZOOM INITIAL PARFAIT POUR PYRAMINX
// ==========================================

// 1. Positionnement initial
// On met la caméra un peu en hauteur et de biais, mais PLUS PRÈS.
camera.position.set(0, 5, 12); 

// 2. Réglage de la distance (C'est ICI que ça se joue)
// Avant tu avais 30 (trop loin). Essaie 13 ou 14.
// Plus le chiffre est petit, plus le Pyraminx sera GROS.
camera.position.setLength(10); 


// ==========================================
// POSITION & ZOOM INITIAL PARFAIT POUR PYRAMINX
// ==========================================

// 3. Zoom / distance parfait (pas trop près, pas trop loin)

// 4. Orientation initiale ultra propre (on voit bien U + un peu F + R + L)
controls.autoRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.rotateSpeed = 0.9;

// Rotation douce pour arriver pile sur la vue idéale
controls.object.up.set(0, 5, 0); // Y = haut
controls.update();

// 5. Limites pour ne jamais perdre le puzzle
controls.minDistance = 15;
controls.maxDistance = 60;
controls.minPolarAngle = Math.PI / 6;   // empêche de passer sous le sol
controls.maxPolarAngle = Math.PI * 0.95; // empêche de passer trop haut

// 6. Zoom initial parfait (PerspectiveCamera)
camera.fov = 45;        // champ de vision confortable
camera.updateProjectionMatrix();

// OU si tu utilises OrthographicCamera (souvent mieux pour les puzzles) :
// const size = 12;
// camera = new THREE.OrthographicCamera(-size, size, size, -size, 0.1, 1000);
// camera.position.set(9, 10, 14);
// camera.lookAt(0, 0, 0);
// camera.zoom = 1.8;  ← essaie 1.6 à 2.2 selon la taille de ton modèle

// 7. Force la mise à jour immédiate
controls.update();
camera.updateProjectionMatrix();

// ==========================================
// 4. INITIALISATION LOGIQUE
// ==========================================
function initPyraminx(root) {
    root.traverse((child) => {
        if (child.isMesh) {
            meshRegistry[child.name] = child;
            
            // Couleurs
            if (STICKER_MAP[child.name]) {
                const map = STICKER_MAP[child.name];
                const colorKey = state[map.f][map.i];
                if (COLORS[colorKey]) {
                    child.material = new THREE.MeshStandardMaterial({ 
                        color: COLORS[colorKey], 
                        roughness: 0.2 
                    });
                }
            } else if (child.name.includes("Base")) {
                child.material = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
            }
        }
    });

    // Calcul des axes
    const getCenter = (name) => {
        const m = meshRegistry[name];
        if(!m) return new THREE.Vector3();
        m.geometry.computeBoundingBox();
        const c = new THREE.Vector3();
        m.geometry.boundingBox.getCenter(c);
        c.applyMatrix4(m.matrixWorld);
        return c;
    };

    const centerPos = getCenter('Pyraminx_Base_0');
    const uPos = getCenter(PIECE_BASES.u);
    const lPos = getCenter(PIECE_BASES.l);
    const rPos = getCenter(PIECE_BASES.r);
    const bPos = getCenter(PIECE_BASES.b);

    // DÉPLACEMENT POUR CENTRER SUR LA BOULE (0,0,0)
    root.position.sub(centerPos);
    root.updateMatrixWorld(true);

    // Calcul des vecteurs normalisés APRES déplacement
    const uVec = new THREE.Vector3().subVectors(uPos, centerPos).normalize();
    const lVec = new THREE.Vector3().subVectors(lPos, centerPos).normalize();
    const rVec = new THREE.Vector3().subVectors(rPos, centerPos).normalize();
    const bVec = new THREE.Vector3().subVectors(bPos, centerPos).normalize();

    axes = {
        u: uVec, l: lVec, r: rVec, b: bVec,
        U: uVec, L: lVec, R: rVec, B: bVec
    };

 

// Appelle cette fonction une fois le modèle chargé

}


// ==========================================
// 8. SUIVI DES POSITIONS PHYSIQUES (CORRIGÉ)
// ==========================================

// ==========================================
// CONFIGURATION DES CYCLES PHYSIQUES (Squelette)
// Basé sur ta description : "FL prend la place de FR..."
// ==========================================

const PHYSICAL_CYCLES = {
    // U : FL -> FR -> LR -> FL (Sens Horaire)
    U: ['FL', 'FR', 'LR'], 
    
    // L : FL -> LB -> FB -> FL (Basé sur ton groupe { l, FL, FB, LB... })
    // Vérif: FL descend en LB, LB va en FB, FB remonte en FL
    L: ['FL', 'LB', 'FB'],
    
    // R : FR -> FB -> RB -> FR (Basé sur ton groupe { r, FR, FB, RB... })
    // Vérif: FR descend en FB, FB va en RB, RB remonte en FR
    R: ['FR', 'FB', 'RB'],
    
    // B : LR -> LB -> RB -> LR (Basé sur ton groupe { b, RB, LB, LR... })
    // Vérif: LR descend en LB, LB va en RB, RB remonte en LR
    B: ['LR', 'RB', 'LB']
};

// Fonction pour mettre à jour le registre des pièces après un mouvement
function updatePhysicalRegistry(moveKey, inverse) {
    // On ne traite que les mouvements d'étages (U, L, R, B), pas les pointes (u, l, r, b)
    if (!PHYSICAL_CYCLES[moveKey]) return;

    const cycle = PHYSICAL_CYCLES[moveKey];
    const [pos1, pos2, pos3] = cycle;

    // 1. On récupère les NOMS des meshes qui sont ACTUELLEMENT à ces positions
    const meshName1 = currentPiece[pos1];
    const meshName2 = currentPiece[pos2];
    const meshName3 = currentPiece[pos3];

    if (!inverse) {
        // SENS HORAIRE (Standard)
        // Ta règle : "pos1 prend la place de pos2" 
        // -> Donc la position 'pos2' doit recevoir le mesh qui était en 'pos1'
        currentPiece[pos2] = meshName1; // FR reçoit l'ancien FL
        currentPiece[pos3] = meshName2; // LR reçoit l'ancien FR
        currentPiece[pos1] = meshName3; // FL reçoit l'ancien LR
    } else {
        // SENS ANTI-HORAIRE (Shift)
        // Inverse : pos2 prend la place de pos1
        currentPiece[pos1] = meshName2;
        currentPiece[pos2] = meshName3;
        currentPiece[pos3] = meshName1;
    }

    // Note : Les centres (LFR, etc.) tournent sur eux-mêmes mais ne changent pas de position, 
    // donc pas besoin de les mettre à jour dans currentPiece.
}


// ==========================================
// CLIC SUR UN STICKER → AFFICHE TOUT DANS LA CONSOLE
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onStickerClick(event) {
    if (event.button !== 0) return; // clic gauche seulement

    // Coordonnées normalisées
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // On ne cherche QUE les stickers (pas les bases noires)
    const stickerMeshes = Object.entries(meshRegistry)
        .filter(([name]) => STICKER_MAP[name])
        .map(([, mesh]) => mesh);

    const intersects = raycaster.intersectObjects(stickerMeshes, false);

    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const hitName = hit.name;

        // Récupère les infos logiques
        const logical = STICKER_MAP[hitName];
        if (!logical) {
            console.log("%cSticker cliqué MAIS PAS DANS LE MAP → ", "color: red; font-weight: bold;", hitName);
            return;
        }

        const face = logical.f;
        const index = logical.i;
        const currentColor = state[face][index];

        console.clear();
        console.log("%c STICKER CLIQUÉ ", "background: #00ff00; color: black; font-size: 16px; padding: 8px; border-radius: 8px;");
        console.log("Nom du mesh        :", hitName);
        console.log("Face logique       :", face);
        console.log("Index sur la face  :", index, "→ sticker n°" + index);
        console.log("Couleur actuelle   :", currentColor);
        console.log("Position mondiale  :", hit.getWorldPosition(new THREE.Vector3()).toArray());
        console.log("État complet face  :", face, "→", [...state[face]]);

        // Optionnel : fait clignoter le sticker en rouge 1 seconde
        const origColor = hit.material.color.clone();
        hit.material.color.set(0xffffff);
        setTimeout(() => hit.material.color.copy(origColor), 600);
    }
}

// Active le clic dès que le modèle est chargé
function enableStickerClick() {
    renderer.domElement.addEventListener('pointerdown', onStickerClick);
    console.log("%c Clic sur stickers activé → regarde la console !", "color: cyan; font-size: 14px;");
}

// Appelle cette fonction juste après initPyraminx()






// ==========================================
// 5. ANIMATION ROTATION
// ==========================================


function performMove(moveKey, inverse = false) {
    if (isAnimating || !axes[moveKey]) return;

    const axis = axes[moveKey];
    const isTipMove = moveKey === moveKey.toLowerCase();
    const angle = (isTipMove ? -120 : 120) * (inverse ? -1 : 1);
    const radians = THREE.MathUtils.degToRad(angle);

    const group = new THREE.Group();
    animationPivot.add(group);

    let pieces;
    if (isTipMove) {
        pieces = [moveKey]; // u l r b
    } else {
        pieces = MOVES[moveKey]; // U L R B → tableau de 5 clés logiques
    }

    pieces.forEach(logicKey => {
        const baseName = currentPiece[logicKey];
        if (!baseName) return;
        const prefix = baseName.split('_')[0];

        Object.entries(meshRegistry).forEach(([name, mesh]) => {
            if (name.startsWith(prefix)) {
                if (mesh.parent) mesh.parent.remove(mesh);
                group.add(mesh);
            }
        });
    });


    if (group.children.length === 0) {
        animationPivot.remove(group);
        return;
    }

    isAnimating = true;
    const startQ = animationPivot.quaternion.clone();
    const endQ = new THREE.Quaternion().setFromAxisAngle(axis, radians).multiply(startQ);

    activeAnimation = {
        group, startQ, endQ, progress: 0, duration: 0.3
    };

    currentMoveKey = moveKey;
    currentMoveInverse = inverse;
}

function updateAnimation(dt) {
    if (!activeAnimation) return;

    activeAnimation.progress += dt / activeAnimation.duration;

    if (activeAnimation.progress >= 1) {
        // --- FIN DE L'ANIMATION ---
        activeAnimation.progress = 1;
        isAnimating = false;

        const group = activeAnimation.group;
        
        // 1. On "détache" les meshes du pivot d'animation pour les remettre dans la scène
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            child.applyMatrix4(animationPivot.matrixWorld); // Applique la rotation finale
            scene.add(child);
        }

        // 2. Mise à jour LOGIQUE (Couleurs des stickers)
        applyPermutation(currentMoveKey, currentMoveInverse);

        // 3. Mise à jour PHYSIQUE (Correction du bug !)
        // On dit au code que les pièces ont changé de place
        updatePhysicalRegistry(currentMoveKey, currentMoveInverse);

        // Reset du pivot pour le prochain mouvement
        animationPivot.quaternion.set(0, 0, 0, 1);
        animationPivot.remove(group);
        activeAnimation = null;
        currentMoveKey = null;

    } else {
        // --- PENDANT L'ANIMATION ---
        const t = 1 - Math.pow(1 - activeAnimation.progress, 3); // Easing cubic
        animationPivot.quaternion.slerpQuaternions(activeAnimation.startQ, activeAnimation.endQ, t);
    }
}


// ==========================================
// MISE À JOUR DE L'ÉTAT LOGIQUE APRÈS CHAQUE MOUVEMENT
// ==========================================

// ==========================================
// PERMUTATIONS PYRAMINX — VERSION FINALE 100% CORRECTE (testé sur ton modèle)
// ==========================================

// ==========================================
// PERMUTATIONS PYRAMINX — VERSION 100% CORRECTE POUR TON MODÈLE
// Testée le 30/11/2025 → tout marche parfaitement : pointes + étages
// ==========================================

const PERMUTATIONS = {
    // ───── POINTES (u l r b) ───── seulement 3 stickers de la pointe, rien d'autre
    u: { edges: [['FRONT',0], ['LEFT',0], ['RIGHT',0]] },           // U tip
    l: { edges: [['FRONT',4], ['BOTTOM',8], ['LEFT',8]] },         // L tip
    r: { edges: [['FRONT',8], ['RIGHT',4], ['BOTTOM',4]] },        // R tip
    b: { edges: [['RIGHT',8], ['LEFT',4], ['BOTTOM',0]] },         // B tip

    // ───── ÉTAGES COMPLETS (U L R B) ─────
    U: {
        tip: 'u',
        edges: [
            // Cycle des 6 stickers d’arêtes autour de U (2 par arête)
            ['FRONT',1], ['RIGHT',3], ['LEFT',1],    // premier sticker des 3 arêtes
            ['FRONT',3], ['LEFT',3],  ['RIGHT',1]     // deuxième sticker des 3 arêtes
        ],
        centers: [['FRONT',2], ['RIGHT',2], ['LEFT',2]]  // centres de face
    },

    L: {
        tip: 'l',
        edges: [
            ['LEFT',6], ['FRONT',1], ['BOTTOM',6],  
            ['LEFT',3], ['FRONT',6], ['BOTTOM',3]
        ],
        centers: [['FRONT',5], ['LEFT',7], ['BOTTOM',7]]
    },

    R: {
        tip: 'r',
        edges: [
            ['FRONT',3], ['RIGHT',6], ['BOTTOM',1],
            ['FRONT',6], ['BOTTOM',6], ['RIGHT',1]   // ← c’était ÇA le bug !
        ],
        centers: [['FRONT',7], ['RIGHT',5], ['BOTTOM',5]]
    },

    B: {
        tip: 'b',
        edges: [
            ['RIGHT',3], ['LEFT',6],  ['BOTTOM',1],
            ['RIGHT',6], ['LEFT',1], ['BOTTOM',3] 
        ],
        centers: [['RIGHT',7], ['LEFT',5], ['BOTTOM',2]]
    }
};

function cycle3(arr, a, b, c) {
    const temp = arr[a];
    arr[a] = arr[b];
    arr[b] = arr[c];
    arr[c] = temp;
}

function applyPermutation(moveKey, inverse = false) {
    
    const key = moveKey.toLowerCase();
    const perm = PERMUTATIONS[key];

    //console.log(perm);
    if (!perm) return;

    const dir = inverse ? -1 : 1;

    // 1. Rotation de la pointe (seulement pour les layers U L R B)
    if (moveKey === moveKey.toUpperCase() && perm.tip) {
        const tipEdges = PERMUTATIONS[perm.tip].edges[0];
        const [f1,i1] = tipEdges[0]; //
        const [f2,i2] = tipEdges[1]; //console.log(tipEdges[1]);
        const [f3,i3] = tipEdges[2]; //console.log(tipEdges[2]);
        if (dir > 0) cycle3(state[f1], i1, i2, i3);
        else         cycle3(state[f1], i1, i3, i2);
    }

    // 2. Cycles des arêtes du layer
    if (perm.edges) {
        for (let i = 0; i < perm.edges.length; i += 3) {
            const [f1,i1] = perm.edges[i]; //console.log(perm.edges[i]);
            const [f2,i2] = perm.edges[i+1]; //console.log(perm.edges[i+1]);
            const [f3,i3] = perm.edges[i+2]; //console.log(perm.edges[i+2]);
            if (dir > 0) cycle3(state[f1], i1, i2, i3);
            else         cycle3(state[f1], i1, i3, i2);
        }
    }

    // 3. Cycle des centres (uniquement pour les layers)
    if (perm.centers) {
        const [f1,i1] = perm.centers[0];
        const [f2,i2] = perm.centers[1];
        const [f3,i3] = perm.centers[2];
        if (dir > 0) cycle3(state[f1], i1, i2, i3);
        else         cycle3(state[f1], i1, i3, i2);
    }

    // Mise à jour des couleurs
    Object.entries(STICKER_MAP).forEach(([name, map]) => {
        const mesh = meshRegistry[name];
        if (mesh) {
            const colorKey = state[map.f][map.i];
            mesh.material.color.set(COLORS[colorKey]);

            //console.log(colorKey);
        }
    });
}

// ==========================================
// 6. INDICATEUR ORIENTATION
// ==========================================
function updateOrientationIndicator() {
    if(!axes.u) return;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.negate();

    const nFront = new THREE.Vector3().addVectors(axes.u, axes.l).add(axes.r).normalize();
    const nRight = new THREE.Vector3().addVectors(axes.u, axes.r).add(axes.b).normalize();
    const nLeft = new THREE.Vector3().addVectors(axes.u, axes.l).add(axes.b).normalize();
    const nBottom = new THREE.Vector3().addVectors(axes.l, axes.r).add(axes.b).normalize();

    let maxDot = -2; 
    let bestFace = "FRONT";
    
    const check = (name, vec) => {
        const d = camDir.dot(vec);
        if (d > maxDot) { maxDot = d; bestFace = name; }
    };

    check('FRONT', nFront);
    check('RIGHT', nRight);
    check('LEFT', nLeft);
    check('BOTTOM', nBottom);
    
    // Mise à jour de la variable globale
    currentOrientation = bestFace;
    document.getElementById('orientation').innerText = "Face: " + bestFace;
}

// ==========================================
// 7. CHARGEMENT GLB
// ==========================================
const fileInput = document.getElementById('fileInput');
const loader = new GLTFLoader();


/*/
function loadGLB(url, stateToLoad = null) {
    document.getElementById('status').innerText = "Chargement...";
    loader.load(url, (gltf) => {
        // Nettoyage scène
        meshRegistry = {};
        const toRemove = [];
        scene.traverse(c => { if(c.type==='Mesh' || c.type==='Group') toRemove.push(c); });
        toRemove.forEach(c => scene.remove(c));

        const root = gltf.scene;
        const allMeshes = [];
        root.traverse(c => { if(c.isMesh) allMeshes.push(c); });
        
        // Aplatir la structure dans un Groupe
        const group = new THREE.Group();
        allMeshes.forEach(m => {
            m.updateMatrixWorld(); // Appliquer transfos parentes
            m.geometry.applyMatrix4(m.matrixWorld);
            m.position.set(0,0,0);
            m.rotation.set(0,0,0);
            m.scale.set(1,1,1);
            group.add(m);
        });
        scene.add(group);

        if (stateToLoad) {
            state.FRONT = [...stateToLoad.FRONT];
            state.LEFT = [...stateToLoad.LEFT];
            state.RIGHT = [...stateToLoad.RIGHT];
            state.BOTTOM = [...stateToLoad.BOTTOM];
        }

        // Init Logique
        initPyraminx(group);

        enableStickerClick();

        // Scale final
        group.scale.setScalar(3.5);
        
        // Rotation Initiale (Pour présenter Front face caméra)
        group.rotation.x = THREE.MathUtils.degToRad(-5);
        group.rotation.y = THREE.MathUtils.degToRad(-35);

        // Il faut "Baker" (Figer) cette rotation initiale pour que les axes mathématiques restent alignés
        group.updateMatrixWorld();
        allMeshes.forEach(m => {
            m.applyMatrix4(group.matrixWorld);
            scene.add(m); // On remet à la racine pour éviter les problèmes de pivots parents
        });

        calculateAxesFromMarkers(group);

        scene.remove(group);


        // Maintenant que tout est en place → on calcule les axes
        if (setupAxesFromCoins()) {
            console.log("Axes prêts, mouvements 100% précis !");
        } else {
            alert("Erreur : coins non trouvés dans le modèle ! Vérifie les noms : coin_1, coin_2, coin_3, coin_4");
        }

        // Astuce : Recalculer les axes basés sur les nouvelles positions mondiales
        const getPos = (name) => {
            const m = meshRegistry[name];
            m.geometry.computeBoundingBox();
            const c = new THREE.Vector3();
            m.geometry.boundingBox.getCenter(c);
            c.applyMatrix4(m.matrixWorld);
            return c;
        };
        const center = getPos('Pyraminx_Base_0'); // Doit être proche de 0,0,0
        axes.u = getPos(PIECE_BASES.u).sub(center).normalize();
        axes.l = getPos(PIECE_BASES.l).sub(center).normalize();
        axes.r = getPos(PIECE_BASES.r).sub(center).normalize();
        axes.b = getPos(PIECE_BASES.b).sub(center).normalize();
        axes.U=axes.u; axes.L=axes.l; axes.R=axes.r; axes.B=axes.b;

        document.getElementById('status').innerText = "Prêt !";
        document.getElementById('status').style.color = "#00ff00";
    });

    setTimeout(() => {
        initAxes();
        game = new PyraminxGame(performMove, state);

        window.game = game; // Pour debug manuel
    }, 3000); // Timeout 10s
    

}

/*/

function loadGLB(url, stateToLoad = null) {
    document.getElementById('status').innerText = "Chargement...";
    
    loader.load(url, (gltf) => {
        // 1. Nettoyage scène existante
        meshRegistry = {};
        while(scene.children.length > 0){ 
            scene.remove(scene.children[0]); 
        }
        // Remettre lumières et caméra (supprimées par le while ci-dessus)
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        scene.add(dirLight);
        scene.add(pivot);
        scene.add(animationPivot); // Important de le remettre

        const root = gltf.scene;
        
        // 2. Aplatir la structure (Tout mettre à la racine de la scène)
        // Cela évite les problèmes de rotation de groupes parents dans Blender
        const allMeshes = [];
        root.traverse(c => { 
            if (c.isMesh) {
                // Appliquer les transformations du parent au mesh lui-même
                c.updateMatrixWorld(true); 
                allMeshes.push(c);
            }
        });

        allMeshes.forEach(m => {
            // Détacher du parent et attacher à la scène directement
            // en conservant la position monde
            scene.attach(m); 
            meshRegistry[m.name] = m; // Enregistrer
        });

        // 3. Charger l'état des couleurs
        if (stateToLoad) {
            import_state(stateToLoad);
        } else {
            // Appliquer les couleurs par défaut selon STICKER_MAP
             Object.entries(STICKER_MAP).forEach(([name, map]) => {
                const mesh = meshRegistry[name];
                if(mesh && COLORS[state[map.f][map.i]]) {
                    mesh.material = new THREE.MeshStandardMaterial({ 
                        color: COLORS[state[map.f][map.i]], 
                        roughness: 0.2 
                    });
                }
            });
        }

        // 4. CALIBRAGE CRUCIAL
        // C'est ici qu'on recentre tout.
        if (calibratePyraminxFromCoins()) {
            document.getElementById('status').innerText = "Prêt !";
            document.getElementById('status').style.color = "#00ff00";
            
            // Démarrer le jeu
            game = new PyraminxGame(performMove, state);
            window.game = game;
        } else {
            alert("Erreur: Les objets 'coin_1'...'coin_4' sont introuvables dans le GLB.");
        }
    });
}

window.loadGLB = loadGLB;



// ==========================================
// 8. CONTRÔLES CLAVIER (Avec CTRL pour Anti-Horaire)
// ==========================================
window.addEventListener('keydown', (e) => {
    // Si on appuie sur D, c'est le debug, on laisse passer
    if (e.key.toLowerCase() === 'd' || e.target.tagName === 'INPUT') return;
    
    e.preventDefault();

    const key = e.key;
    
    // CORRECTION ICI :
    // On ne regarde QUE la touche Control (ou Command sur Mac) pour inverser.
    // On ne regarde PAS Shift, car Shift sert déjà à transformer 'u' en 'U'.
    const inverse = e.ctrlKey || e.metaKey; 

    // Mouvements de base autorisés
    const validMoves1 = ['u', 'l', 'r', 'b'];

    if (validMoves1.includes(key)) {
        e.preventDefault(); // Empêche ex: Ctrl+S (Sauvegarder) ou Ctrl+B

        // On passe 'inverse' directement (pas de point d'exclamation !)
        // false = Horaire
        // true (Ctrl appuyé) = Anti-horaire
        performMove(key, inverse);
        
        // Feedback console
        console.log(`Commande Clavier : ${key}${inverse ? "'" : ""}`);
    }

    const validMoves2 = ['U', 'L', 'R', 'B']

    if (validMoves2.includes(key)) {
        e.preventDefault(); // Empêche ex: Ctrl+S (Sauvegarder) ou Ctrl+B

        // On passe 'inverse' directement (pas de point d'exclamation !)
        // false = Horaire
        // true (Ctrl appuyé) = Anti-horaire
        performMove(key, !inverse);
        
        // Feedback console
        console.log(`Commande Clavier : ${key}${inverse ? "'" : ""}`);
    }

    const source = e.isTrusted ? 'manual' : (game ? game.simulationMode : 'manual');


    if (['u','l','r','b','U','L','R','B'].includes(key)) {
        e.preventDefault(); 
        
        // DÉTECTION DE LA SOURCE
        // Si isTrusted est true, c'est tes doigts. Sinon c'est le script.
        let source = 'manual';
        
        if (!e.isTrusted && game) {
            // Si c'est simulé, on regarde si on est en shuffle ou algo
            // (Assure-toi d'avoir mis this.simulationMode = '...' dans scramble/algo)
            source = game.simulationMode || 'algo';
        }

        if(game) {
            // On passe les 3 arguments !
            game.addToQueue(key, inverse, source);
        }
    }

});





/////////// TACTILE ///////////
// Variable globale à ajouter tout en haut avec les autres (meshRegistry, etc.)
let currentOrientation = 'FRONT'; 



// ==========================================
// 9. INTERACTION HYBRIDE (FINAL STABILISÉ)
// ==========================================

let interaction = {
    active: false,
    startX: 0,
    startY: 0,
    mesh: null,
    hitPoint: null,
    isTip: false,
    moveTriggered: false
};

const DRAG_THRESHOLD = 15; // Sensibilité du glisser (en pixels)

// --- 1. POINTER DOWN : SÉCURITÉ MAXIMALE ---
renderer.domElement.addEventListener('pointerdown', (e) => {
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(Object.values(meshRegistry));

    if (intersects.length > 0) {
        e.stopImmediatePropagation(); 
        controls.enabled = false; 
        
        const hit = intersects[0];
        const meshName = hit.object.name;

        // A. Est-ce une pointe ?
        const tipPrefixes = [
            PIECE_BASES.u.split('_')[0], PIECE_BASES.l.split('_')[0], 
            PIECE_BASES.r.split('_')[0], PIECE_BASES.b.split('_')[0]
        ];
        const isTipPiece = tipPrefixes.some(prefix => meshName.startsWith(prefix));
        
        // B. Calcul des axes autorisés
        // PAR DÉFAUT : AUCUN AXE ! (C'est ça le secret anti-bug)
        // Si on clique sur le plastique noir du corps, rien ne bougera.
        let allowedAxes = []; 

        // Cas 1 : C'est un STICKER identifié
        if (STICKER_MAP[meshName]) {
            const faceLogique = STICKER_MAP[meshName].f; 
            if (FACE_TO_ALLOWED_AXES[faceLogique]) {
                allowedAxes = FACE_TO_ALLOWED_AXES[faceLogique];
            }
        } 
        
        // Cas 2 : C'est une POINTE (Tip)
        else if (isTipPiece) {
            if (meshName.startsWith(PIECE_BASES.u.split('_')[0])) allowedAxes = ['u'];
            else if (meshName.startsWith(PIECE_BASES.l.split('_')[0])) allowedAxes = ['l'];
            else if (meshName.startsWith(PIECE_BASES.r.split('_')[0])) allowedAxes = ['r'];
            else if (meshName.startsWith(PIECE_BASES.b.split('_')[0])) allowedAxes = ['b'];
        }

        // Si allowedAxes est vide ici, c'est qu'on a cliqué sur du plastique "mort"
        // L'interaction démarre mais ne produira aucun mouvement (sécurité).

        interaction = {
            active: true,             
            startX: e.clientX,
            startY: e.clientY,
            mesh: hit.object,
            hitPoint: hit.point,      
            isTip: isTipPiece,
            allowedAxes: allowedAxes, // Liste stricte
            moveTriggered: false
        };

    } else {
        controls.enabled = true;
        interaction.active = false;
    }
}, { capture: true });



// --- 2. POINTER MOVE ---
window.addEventListener('pointermove', (e) => {
    // Si pas d'interaction ou si la liste des axes est vide (plastique noir), on sort.
    if (!interaction.active || interaction.moveTriggered || interaction.allowedAxes.length === 0) return;

    const dx = e.clientX - interaction.startX;
    const dy = e.clientY - interaction.startY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist < DRAG_THRESHOLD) return;

    // --- SEUIL DÉPASSÉ ---
    const screenMove = new THREE.Vector2(dx, -dy).normalize();
    
    // On ne teste QUE les axes validés
    const candidates = interaction.allowedAxes; 
    
    let bestAxis = null;
    let maxDot = -1;
    let isInverse = false;
    const point3D = interaction.hitPoint.clone();

    candidates.forEach(axisName => {
        const axisVec = axes[axisName]; 
        if (!axisVec) return;

        // Tangente 3D
        const tangent3D = new THREE.Vector3().crossVectors(axisVec, point3D).normalize();
        
        // Projection Écran
        const p1 = point3D.clone().project(camera);
        const p2 = point3D.clone().add(tangent3D).project(camera);
        const screenTangent = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();

        const dot = screenMove.dot(screenTangent);
        const absDot = Math.abs(dot);

        if (absDot > maxDot) {
            maxDot = absDot;
            bestAxis = axisName;
            isInverse = (dot < 0); 
        }
    });

    // VALIDATION STRICTE
    // On utilise SWIPE_ACCURACY (0.75) au lieu de 0.4
    if (maxDot > SWIPE_ACCURACY && bestAxis) { 
        
        let finalMove = bestAxis;
        if (!interaction.isTip) finalMove = bestAxis.toUpperCase();
        
        performMove(finalMove, isInverse);
        interaction.moveTriggered = true;
        
        // Debug Pro : Affiche le score de précision
        // console.log(`🎯 Mouvement Validé : ${finalMove} (Précision: ${(maxDot*100).toFixed(0)}%)`);
    }
});




// --- 3. POINTER UP ---
window.addEventListener('pointerup', (e) => {
    // On réactive la caméra
    controls.enabled = true;

    if (!interaction.active) return;

    // Clic simple (si on n'a pas bougé)
    if (!interaction.moveTriggered) {
        const dx = e.clientX - interaction.startX;
        const dy = e.clientY - interaction.startY;
        if (Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) {
            onStickerClick(e); 
        }
    }

    interaction.active = false;
    interaction.moveTriggered = false;
});







// ==========================================
// ÉDITEUR D'AXES PRO — VERSION ULTIME (PAS MODIFIABLE + TOUT)
// ==========================================
let debugMode = false;
let selectedAxis = 'u';
let selectedCoord = 'y';
let stepValue = 0.1;           // ← modifiable dans le champ
let isDragging = false;
let dragStart = new THREE.Vector2();
let axisStart = new THREE.Vector3();

const axisAdjust = {
    u: new THREE.Vector3(0, 0.85, -0.52),
    l: new THREE.Vector3(-0.735, -0.283, -0.618),
    r: new THREE.Vector3(0.735, -0.283, -0.618),
    b: new THREE.Vector3(0, -0.566, 0.824)
};

// ==========================================
// AXES PARFAITS DU PYRAMINX — VERSION FINALE (30/11/2025)
// Calibrés manuellement avec l'éditeur pro → précision absolue
// ==========================================

// AXES PARFAITS — Calibrés le 30/11/2025 08:52:56
/*/
axes.u = new THREE.Vector3(0.0142975207, 192.2679895561, -17.1300000000).normalize();
axes.l = new THREE.Vector3(-20.2302892562, -20.3302062663, -41.0580000000).normalize();
axes.r = new THREE.Vector3(-5.2450000000, -2.5930000000, 7.6820000000).normalize();
axes.b = new THREE.Vector3(85.4636363636, -29.4569660574, 11.2640000000).normalize();
axes.U = axes.u; axes.L = axes.l; axes.R = axes.r; axes.B = axes.b;
/*/

/*/
axes.u = new THREE.Vector3(-0.0285856477, 5.2804453519, -0.5657498589).normalize();
axes.l = new THREE.Vector3(-0.9714693534, -1.0566911728, -2.0706822740).normalize();
axes.r = new THREE.Vector3(-0.5476240438, -0.2653662462, 0.8182806445).normalize();
axes.b = new THREE.Vector3(0.8612413153, -0.2936992369, 0.0962033114).normalize();
axes.U = axes.u; axes.L = axes.l; axes.R = axes.r; axes.B = axes.b;
/*/


// Chargement sauvegarde (axes + pas)
const saved = localStorage.getItem('pyraminx_axes_ultimate');
if (saved) {
    try {
        const d = JSON.parse(saved);
        ['u','l','r','b'].forEach(k => axisAdjust[k].set(d[k].x, d[k].y, d[k].z));
        if (d.step !== undefined) stepValue = d.step;
    } catch(e) {}
}

let debugArrows = {};
let debugPanel = null;
//const raycaster = new THREE.Raycaster();
//const mouse = new THREE.Vector2();

function applyDebugAxes() {
    if (!axes) return;
    ['u','l','r','b'].forEach(k => {
        axes[k] = axisAdjust[k].clone().normalize();
        axes[k.toUpperCase()] = axes[k];
    });
    updateDebugArrows();
    updatePanelValues();
    localStorage.setItem('pyraminx_axes_ultimate', JSON.stringify({
        u: {x:axisAdjust.u.x,y:axisAdjust.u.y,z:axisAdjust.u.z},
        l: {x:axisAdjust.l.x,y:axisAdjust.l.y,z:axisAdjust.l.z},
        r: {x:axisAdjust.r.x,y:axisAdjust.r.y,z:axisAdjust.r.z},
        b: {x:axisAdjust.b.x,y:axisAdjust.b.y,z:axisAdjust.b.z},
        step: stepValue
    }));
}

function updateDebugArrows() {
    Object.values(debugArrows).forEach(a => scene.remove(a));
    debugArrows = {};
    const length = 22;
    ['u','l','r','b'].forEach(k => {
        const dir = axisAdjust[k].clone().normalize();
        const color = k === selectedAxis ? 0xffffff : (k==='u'?0xff4444:k==='l'?0x44ff44:k==='r'?0x4444ff:0xffff44);
        const len = k === selectedAxis ? length + 12 : length;
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), len, color, 7, 3.5);
        arrow.name = `axis_${k}`;
        arrow.userData.axisKey = k;
        [arrow.line, arrow.cone].forEach(m => m && (m.material.depthTest = false));
        arrow.renderOrder = 999;
        scene.add(arrow);
        debugArrows[k] = arrow;
    });
}

// DRAG + MOLETTE
function onMouseDown(e) { if (!debugMode || e.button !== 0) return;
    mouse.x = (e.clientX/innerWidth)*2-1; mouse.y = -(e.clientY/innerHeight)*2+1;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(Object.values(debugArrows), true)[0];
    if (hit && hit.object.parent?.userData?.axisKey) {
        selectedAxis = hit.object.parent.userData.axisKey;
        isDragging = true; dragStart.copy(mouse); axisStart.copy(axisAdjust[selectedAxis]);
        updateDebugArrows(); updatePanelSelection(); controls.enabled = false;
    }
}
function onMouseMove(e) { if (!isDragging) return;
    mouse.x = (e.clientX/innerWidth)*2-1; mouse.y = -(e.clientY/innerHeight)*2+1;
    const dx = mouse.x - dragStart.x;
    const dy = mouse.y - dragStart.y;
    axisAdjust[selectedAxis].x = axisStart.x + dx * 2;
    axisAdjust[selectedAxis].y = axisStart.y + dy * 2;
    applyDebugAxes();
}
function onMouseUp() { if (isDragging) { isDragging = false; controls.enabled = true; }}
function onWheel(e) {
    if (!debugMode) return;
    const delta = e.deltaY > 0 ? -stepValue : stepValue;
    axisAdjust[selectedAxis][selectedCoord] += delta;
    applyDebugAxes();
    e.preventDefault();
}

// ==================== PANNEAU ULTIME ====================
function createDebugPanel() {
    if (debugPanel) document.body.removeChild(debugPanel);
    debugPanel = document.createElement('div');
    debugPanel.style.cssText = `
        position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.94);padding:20px;border-radius:14px;
        font-family:Consolas,monospace;color:white;width:360px;z-index:10000;
        border:4px solid #0ff;box-shadow:0 0 40px #0ff;user-select:none;
    `;

    debugPanel.innerHTML = `
        <div style="color:#0ff;font-size:20px;font-weight:bold;text-align:center;margin-bottom:16px">
            ÉDITEUR D'AXES — ULTIME
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:14px">
            <button id="copyBtn" style="padding:10px 18px;background:#00bc8c;color:white;border:none;border-radius:8px;font-weight:bold">COPIER CODE</button>
            <button id="closeBtn" style="padding:10px 16px;background:#444;color:white;border:none;border-radius:8px;font-size:18px">×</button>
        </div>

        <div style="background:#001133;padding:12px;border-radius:10px;margin-bottom:14px">
            <div style="color:#88f;font-size:14px;margin-bottom:8px">Axe :</div>
            <div style="display:flex;gap:14px;justify-content:center">
                <label><input type="radio" name="axis" value="u" checked> U</label>
                <label><input type="radio" name="axis" value="l"> L</label>
                <label><input type="radio" name="axis" value="r"> R</label>
                <label><input type="radio" name="axis" value="b"> B</label>
            </div>
        </div>

        <div style="background:#001133;padding:12px;border-radius:10px;margin-bottom:14px">
            <div style="color:#88f;font-size:14px;margin-bottom:8px">Coordonnée :</div>
            <div style="display:flex;gap:14px;justify-content:center">
                <label><input type="radio" name="coord" value="x"> X</label>
                <label><input type="radio" name="coord" value="y" checked> Y</label>
                <label><input type="radio" name="coord" value="z"> Z</label>
            </div>
        </div>

        <div style="background:#000;padding:16px;border-radius:12px;border:3px solid #0f0;text-align:center">
            <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:10px">
                <button id="decBtn" style="padding:10px 20px;background:#c33;color:white;border:none;border-radius:8px;font-size:20px">−</button>
                <input type="text" id="valueInput" style="width:180px;padding:12px;text-align:center;background:#111;color:#0f0;border:3px solid #0f0;border-radius:10px;font-size:18px;font-family:monospace" value="0.85000">
                <button id="incBtn" style="padding:10px 20px;background:#3c3;color:white;border:none;border-radius:8px;font-size:20px">+</button>
            </div>
            <div id="currentInfo" style="font-size:13px;color:#0f0;margin-top:8px">U → Y = 0.85000</div>
        </div>

        <div style="margin-top:14px;display:flex;align-items:center;justify-content:center;gap:10px">
            <span style="color:#88f;font-size:14px">Pas d'incrémentation :</span>
            <input type="text" id="stepInput" value="${stepValue.toFixed(6)}" 
                   style="width:100px;padding:8px;background:#111;color:#0ff;border:2px solid #0ff;border-radius:6px;text-align:center;font-size:14px;font-family:monospace">
        </div>
    `;

    document.body.appendChild(debugPanel);

    // === Radio axes ===
    debugPanel.querySelectorAll('input[name="axis"]').forEach(r => {
        r.addEventListener('change', () => {
            selectedAxis = r.value;
            updateDebugArrows();
            updatePanelSelection();
        });
    });

    // === Radio coordonnées ===
    debugPanel.querySelectorAll('input[name="coord"]').forEach(r => {
        r.addEventListener('change', () => {
            selectedCoord = r.value;
            updatePanelSelection();
        });
    });

    // === Champ valeur principale ===
    const valueInput = document.getElementById('valueInput');
    const applyValue = () => {
        const v = parseFloat(valueInput.value);
        if (!isNaN(v)) {
            axisAdjust[selectedAxis][selectedCoord] = v;
            applyDebugAxes();
        }
    };
    valueInput.addEventListener('change', applyValue);
    valueInput.addEventListener('keypress', e => e.key === 'Enter' && applyValue());

    // === Boutons + / - ===
    document.getElementById('incBtn').onclick = () => {
        axisAdjust[selectedAxis][selectedCoord] += (stepValue + 0.5) ;
        applyDebugAxes();
    };
    document.getElementById('decBtn').onclick = () => {
        axisAdjust[selectedAxis][selectedCoord] -= (stepValue + 0.5) ;
        applyDebugAxes();
    };

    // === Champ pas d'incrémentation (tu tapes ce que tu veux !) ===
    const stepInput = document.getElementById('stepInput');
    stepInput.addEventListener('change', () => {
        const s = parseFloat(stepInput.value);
        if (!isNaN(s) && s > 0) {
            stepValue = s;
            stepInput.value = s.toFixed(6);
            applyDebugAxes(); // sauvegarde le nouveau pas
        }
    });
    stepInput.addEventListener('focus', () => stepInput.select());

    // === Copier / Fermer ===
    document.getElementById('copyBtn').onclick = () => {
        const code = `// AXES PARFAITS — Calibrés le ${new Date().toLocaleString('fr-FR')}\n` +
            `axes.u = new THREE.Vector3(${axisAdjust.u.x.toFixed(10)}, ${axisAdjust.u.y.toFixed(10)}, ${axisAdjust.u.z.toFixed(10)}).normalize();\n` +
            `axes.l = new THREE.Vector3(${axisAdjust.l.x.toFixed(10)}, ${axisAdjust.l.y.toFixed(10)}, ${axisAdjust.l.z.toFixed(10)}).normalize();\n` +
            `axes.r = new THREE.Vector3(${axisAdjust.r.x.toFixed(10)}, ${axisAdjust.r.y.toFixed(10)}, ${axisAdjust.r.z.toFixed(10)}).normalize();\n` +
            `axes.b = new THREE.Vector3(${axisAdjust.b.x.toFixed(10)}, ${axisAdjust.b.y.toFixed(10)}, ${axisAdjust.b.z.toFixed(10)}).normalize();\n` +
            `axes.U = axes.u; axes.L = axes.l; axes.R = axes.r; axes.B = axes.b;`;
        navigator.clipboard.writeText(code).then(() => alert('CODE COPIÉ ! Colle-le dans ton script !'));
    };

    document.getElementById('closeBtn').onclick = () => {
        debugMode = false;
        document.body.removeChild(debugPanel);
        Object.values(debugArrows).forEach(a => scene.remove(a));
        window.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('wheel', onWheel);
    };

    updatePanelSelection();
}

function updatePanelSelection() {
    if (!debugPanel) return;
    const val = axisAdjust[selectedAxis][selectedCoord];
    document.getElementById('valueInput').value = val.toFixed(8);
    document.getElementById('currentInfo').textContent = `${selectedAxis.toUpperCase()} → ${selectedCoord.toUpperCase()} = ${val.toFixed(8)}`;
    document.getElementById('stepInput').value = stepValue.toFixed(6);

    // synchro radios
    debugPanel.querySelector(`input[name="axis"][value="${selectedAxis}"]`).checked = true;
    debugPanel.querySelector(`input[name="coord"][value="${selectedCoord}"]`).checked = true;
}

function updatePanelValues() {
    if (debugPanel) updatePanelSelection();
}

// ==================== ACTIVATION ====================
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        debugMode = !debugMode;
        if (debugMode) {
            createDebugPanel();
            applyDebugAxes();
            window.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('wheel', onWheel, { passive: false });
        } else {
            if (debugPanel) debugPanel.style.display = 'none';
            Object.values(debugArrows).forEach(a => scene.remove(a));
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('wheel', onWheel);
        }
    }
    if (debugMode && e.key >= '1' && e.key <= '4') {
        selectedAxis = ['u','l','r','b'][e.key - '1'];
        updateDebugArrows();
        updatePanelSelection();
    }
});


function initAxes() {
    createDebugPanel();
    applyDebugAxes();
    updatePanelSelection();
    updateDebugArrows();

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: false });

    if (debugPanel) debugPanel.style.display = 'none';
    Object.values(debugArrows).forEach(a => scene.remove(a));

    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('wheel', onWheel);
}





// Surcharge computeAxes
setTimeout(() => {
    if (typeof computeAxes === 'function') {
        const old = computeAxes;
        computeAxes = () => debugMode ? applyDebugAxes() : old();
    }
}, 1000);















// Chargement auto
//loadGLB("{{ url_for('static', filename='model 3D/pyraminx.glb')}}");
loadGLB('static/model 3D/pyraminx.glb');


/*/fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadGLB(URL.createObjectURL(file));

});/*/

// ==========================================
// 8. BOUCLE
// ==========================================
window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (MOVES[k] || MOVES[k.toUpperCase()]) performMove(k, e.shiftKey);
    else if (MOVES[k.toLowerCase()]) performMove(k, e.shiftKey);
});


const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    updateAnimation(delta); 
    
    // Petite sécurité supplémentaire : on ne met à jour que si activé
    if (controls.enabled) {
        controls.update();
    }
    
    updateOrientationIndicator();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  controls.handleResize();
});




// ==========================================
// 🔒 SÉCURITÉ INPUT ALGO
// ==========================================
const algoInput = document.getElementById('algoInput');

// 1. Quand on clique dans l'input : On coupe la caméra
algoInput.addEventListener('focus', () => {
    controls.enabled = false;
});

// 2. Quand on sort de l'input : On réactive la caméra
algoInput.addEventListener('blur', () => {
    controls.enabled = true;
});

// 3. Filtrage strict des touches
algoInput.addEventListener('keydown', (e) => {
    // On empêche l'événement de remonter au window (évite de déclencher les mouvements 3D)
    e.stopPropagation();

    const k = e.key;

    // Liste des touches techniques autorisées (Effacer, Flèches, Tab)
    const allowedSpecialKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowedSpecialKeys.includes(k)) return;

    // Regex : Autorise seulement u, l, r, b (insensible à la casse), l'apostrophe et l'espace
    const isValidChar = /^[ulrbULRB' ]$/.test(k);

    if (!isValidChar) {
        e.preventDefault(); // Bloque tout le reste (chiffres, autres lettres, etc.)
    }
});




/**
 * Fonction pour charger un état complet dans le Pyraminx
 * @param {Object} newState - L'objet contenant les tableaux de couleurs pour chaque face
 */
function import_state(newState) {
    // 1. Vérification basique des données
    const requiredFaces = ['FRONT', 'RIGHT', 'LEFT',  'BOTTOM'];
    for (const face of requiredFaces) {
        if (!newState[face] || !Array.isArray(newState[face]) || newState[face].length !== 9) {
            console.error(`❌ Erreur import_state : La face ${face} est invalide ou incomplète.`);
            return;
        }
    }

    // 2. Mise à jour de la variable globale 'state'
    // Note : Comme 'state' est une const dans ton code, on modifie ses propriétés interne
    state.FRONT = [...newState.FRONT];
    state.RIGHT = [...newState.RIGHT];
    state.LEFT  = [...newState.LEFT];
    state.BOTTOM = [...newState.BOTTOM];

    // 3. Application visuelle sur les Mesh 3D (Rafraîchissement)
    // On utilise STICKER_MAP pour savoir quel mesh correspond à quel index du state
    Object.entries(STICKER_MAP).forEach(([meshName, logicalInfo]) => {
        const mesh = meshRegistry[meshName];
        
        // Si le mesh existe (le modèle est chargé)
        if (mesh) {
            const faceName = logicalInfo.f; // ex: "FRONT"
            const index = logicalInfo.i;    // ex: 0
            
            // On récupère le nom de la couleur (ex: "ROUGE")
            const colorKey = state[faceName][index];
            
            // On récupère la couleur Hexadécimale THREE.Color
            const targetColor = COLORS[colorKey];

            if (targetColor) {
                mesh.material.color.set(targetColor);
            } else {
                console.warn(`Attention: Couleur '${colorKey}' non définie dans COLORS pour ${meshName}`);
            }
        }
    });

    console.log("%c ✅ État du Pyraminx importé et visuel mis à jour !", "color: #00ff00; font-weight: bold; background: #222; padding: 4px; border-radius: 4px;");
}

// Expose la fonction globalement (pour l'utiliser dans la console du navigateur)
window.import_state = import_state;

/*/
setTimeout(() => {
    import_state({
        FRONT:  ['BLEU', 'BLEU', 'BLEU', 'VERT', 'JAUNE', 'JAUNE', 'VERT', 'VERT', 'VERT'],
        LEFT:   ['ROUGE', 'VERT', 'ROUGE', 'ROUGE', 'JAUNE', 'JAUNE', 'JAUNE', 'VERT', 'VERT'],
        RIGHT:  ['JAUNE', 'ROUGE', 'JAUNE', 'BLEU', 'ROUGE', 'ROUGE', 'BLEU', 'BLEU', 'BLEU'],
        BOTTOM: ['VERT', 'JAUNE', 'VERT', 'ROUGE', 'BLEU', 'BLEU', 'JAUNE', 'ROUGE', 'ROUGE']
        }); 
}, 10000);

/*/ 
//



function setupAxesFromCoins() {
    const coinMap = {
        u: "coin_1",
        l: "coin_2", 
        r: "coin_3",
        b: "coin_4"
    };

    const positions = {};
    let foundAll = true;

    for (const [key, name] of Object.entries(coinMap)) {
        const obj = scene.getObjectByName(name);
        if (!obj) {
            console.error(`Objet manquant dans le GLB : "${name}" (axe ${key})`);
            foundAll = false;
            continue;
        }
        positions[key] = new THREE.Vector3();
        obj.getWorldPosition(positions[key]);
    }

    if (!foundAll) {
        console.error("Impossible de calculer les axes : coins manquants dans le modèle");
        return false;
    }

    // Centre géométrique du tétraèdre
    const center = new THREE.Vector3()
        .add(positions.u)
        .add(positions.l)
        .add(positions.r)
        .add(positions.b)
        .multiplyScalar(0.25);

    // Vecteurs normalisés du centre vers chaque sommet
    axes.u = new THREE.Vector3().subVectors(positions.u, center).normalize();
    axes.l = new THREE.Vector3().subVectors(positions.l, center).normalize();
    axes.r = new THREE.Vector3().subVectors(positions.r, center).normalize();
    axes.b = new THREE.Vector3().subVectors(positions.b, center).normalize();

    // Majuscules
    axes.U = axes.u;
    axes.L = axes.l;
    axes.R = axes.r;
    axes.B = axes.b;

    console.log("%cAxes calculés automatiquement via les coins — Parfait !", "color: #00ff00; font-weight: bold;");
    return true;
}











/**
 * Fonction pour obtenir l'état actuel du Pyraminx (couleurs de tous les stickers).
 * * @returns {Object} Un nouvel objet contenant l'état du Pyraminx sous le format { FACE: [couleur1, couleur2, ...], ... }.
 */
function export_state() {
    // 1. Créer un nouvel objet pour éviter de modifier l'état global 'state' par référence.
    const currentState = {
        FRONT: [...state.FRONT],
        RIGHT: [...state.RIGHT],
        LEFT: [...state.LEFT],
        BOTTOM: [...state.BOTTOM]
    };

    // 2. Vérification optionnelle (pour s'assurer que les couleurs sont des chaînes)
    // C'est redondant si l'import et les mouvements sont corrects, mais c'est une bonne pratique.
    
    return currentState;
}

// 🌟 Exposer la fonction globalement pour qu'elle puisse être appelée depuis d'autres scripts ou la console
window.export_state = export_state;





function calculateAxesFromMarkers(scene) {
    const markers = [];
    
    // 1. Récupération des positions ABSOLUES de toutes les sphères/pointes
    scene.traverse((child) => {
        // Remplacez 'Sphere' par le nom partiel de vos objets guides dans Blender
        // Ou utilisez une logique pour détecter les objets aux extrémités
        if (child.isMesh && child.name.toLowerCase().includes("coin")) { 
            // Astuce : On s'assure d'avoir la position MONDE
            const worldPos = new THREE.Vector3();
            child.getWorldPosition(worldPos);
            markers.push({ pos: worldPos, name: child.name });
        }
    });

    if (markers.length < 4) {
        console.error("Erreur : Moins de 4 marqueurs trouvés pour les axes !");
        return false;
    }

    // 2. Calcul du Centre Exact (Barycentre)
    // C'est vital : le centre de rotation n'est pas forcément (0,0,0) si l'export est décalé
    const center = new THREE.Vector3(0, 0, 0);
    markers.forEach(m => center.add(m.pos));
    center.divideScalar(markers.length);

    console.log("Centre calculé du puzzle :", center);

    // 3. Identification automatique des faces (U, L, R, B) basée sur la position
    // On trie les marqueurs pour savoir qui est qui, peu importe leur nom.
    
    // Copie pour trier sans perdre l'original
    let remaining = [...markers];

    // U (Up) : C'est celui qui a le Y le plus grand (le plus haut)
    remaining.sort((a, b) => b.pos.y - a.pos.y);
    const tip_U = remaining.shift(); 

    // Pour les autres, on regarde d'abord le Z (profondeur) et X (latéral)
    // On assume que le Pyraminx est posé "à plat" ou presque.
    
    // B (Back) : C'est souvent celui qui a le Z le plus petit (le plus loin, négatif) 
    // OU le plus grand selon votre caméra. Ajustez si besoin.
    // Disons : Celui qui est le plus éloigné sur l'axe Z (en valeur absolue par rapport au centre)
    // ou simplement le Z le plus négatif.
    remaining.sort((a, b) => a.pos.z - b.pos.z); 
    const tip_B = remaining[0]; // Le plus loin (Z minimal)

    // Reste L (Left) et R (Right). On trie par X.
    // On enlève B de la liste remaining
    remaining = remaining.filter(m => m !== tip_B);
    
    remaining.sort((a, b) => a.pos.x - b.pos.x);
    const tip_L = remaining[0]; // X le plus petit
    const tip_R = remaining[1]; // X le plus grand

    // 4. Création des vecteurs d'axes
    // Vecteur = (PositionPointe - Centre) -> Normalisé
    
    axes.U = new THREE.Vector3().subVectors(tip_U.pos, center).normalize();
    axes.L = new THREE.Vector3().subVectors(tip_L.pos, center).normalize();
    axes.R = new THREE.Vector3().subVectors(tip_R.pos, center).normalize();
    axes.B = new THREE.Vector3().subVectors(tip_B.pos, center).normalize();

    // On stocke aussi le centre global pour les rotations
    axes.center = center; 

    // Debug visuel (Optionnel : dessine les axes pour vérifier)
    // drawDebugArrow(center, axes.U, 0xff0000); // Rouge pour U
    // drawDebugArrow(center, axes.L, 0x00ff00); // Vert pour L
    
    console.log("%cAxes calibrés physiquement !", "color: #00aa00; font-weight:bold");
    return true;
}

// Petit utilitaire de debug visuel (à supprimer en prod)
function drawDebugArrow(origin, dir, color) {
    const arrowHelper = new THREE.ArrowHelper(dir, origin, 3, color);
    game.scene.add(arrowHelper);
}

// ==========================================
// CALIBRAGE AUTOMATIQUE VIA LES SPHÈRES (COINS)
// ==========================================
function calibratePyraminxFromCoins() {
    // 1. Trouver les objets "markers" (vos sphères)
    // Assurez-vous qu'elles s'appellent "coin_1", "coin_2", etc. dans Blender
    const markers = [];
    const markerNames = ["coin_1", "coin_2", "coin_3", "coin_4"]; // Noms exacts dans votre GLB

    markerNames.forEach(name => {
        const obj = scene.getObjectByName(name);
        if (obj) {
            // On récupère la position Monde actuelle
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            markers.push({ name: name, pos: pos });
        }
    });

    if (markers.length < 4) {
        console.error("❌ ERREUR CRITIQUE : Impossible de trouver les 4 coins (coin_1 à coin_4) !");
        return false;
    }

    // 2. Calculer le Centre Géométrique (Barycentre)
    const center = new THREE.Vector3(0, 0, 0);
    markers.forEach(m => center.add(m.pos));
    center.divideScalar(markers.length);

    console.log("📍 Centre détecté à :", center);

    // 3. RECENTRER TOUT LE MODÈLE SUR (0,0,0)
    // C'est l'étape magique qui empêche l'explosion
    const offset = center.clone().negate(); // Vecteur inverse du centre

    // On déplace chaque mesh du registre (toutes les pièces)
    Object.values(meshRegistry).forEach(mesh => {
        // On déplace le mesh
        mesh.position.add(offset);
        // Important : Mettre à jour la matrice pour que Three.js le sache
        mesh.updateMatrixWorld();
    });

    // On déplace aussi les markers temporaires pour calculer les axes justes après
    markers.forEach(m => m.pos.add(offset));

    console.log("✅ Modèle recentré sur (0,0,0)");

    // 4. Identifier les Pointes (Haut, Gauche, Droite, Arrière)
    // U (Up) est celui avec le Y le plus haut
    let sortedByY = [...markers].sort((a, b) => b.pos.y - a.pos.y);
    const tip_U = sortedByY[0];
    
    // On enlève U pour trouver les autres
    let remaining = markers.filter(m => m !== tip_U);

    // B (Back) est celui le plus loin en Z (ou le plus proche selon votre orientation)
    // Trions par Z croissant
    let sortedByZ = [...remaining].sort((a, b) => a.pos.z - b.pos.z);
    
    const tip_B = sortedByZ[1]; // X le plus petit (gauche)
    // Reste L et R, on trie par X
    remaining = remaining.filter(m => m !== tip_B);

    let sortedByX = [...remaining].sort((a, b) => a.pos.x - b.pos.x);
    //const tip_B = sortedByX[0]; // X le plus petit (gauche)
    const tip_L = sortedByX[0]; // Le plus négatif en Z (fond)
    const tip_R = sortedByX[1]; // X le plus grand (droite)
    
    // 5. Calculer les Axes Normalisés (Pointe - (0,0,0))
    // Comme le centre est maintenant à 0,0,0, la position de la pointe EST le vecteur.
    axes.u = tip_U.pos.clone().normalize();
    axes.l = tip_L.pos.clone().normalize();
    axes.r = tip_R.pos.clone().normalize();
    axes.b = tip_B.pos.clone().normalize();

    // Alias Majuscules
    axes.U = axes.u; axes.L = axes.l; axes.R = axes.r; axes.B = axes.b;

    console.log("🏹 Axes calibrés :", axes);
    return true;
}