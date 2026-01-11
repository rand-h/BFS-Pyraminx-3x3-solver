// ==========================================
// 1. IMPORTATIONS THREE.JS
// ==========================================
import * as THREE from 'three';
// Import TrackballControls pour rotation libre sans axe bloqué
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Si vous n'utilisez pas de texte 3D, vous pouvez commenter les lignes suivantes :
// import { FontLoader } from 'three/addons/loaders/FontLoader.js';
// import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';


// ==========================================
// 2. VARIABLES GLOBALES ET CONSTANTES
// ==========================================
let meshRegistry = {}; // Stocke tous les objets du modèle
let axes = {};         // Vecteurs des axes de rotation (u, l, r, b)
let isAnimating = false;
let activeAnimation = null;
let currentMoveKey = null;
let currentMoveInverse = false;
let game = null; 
let currentOrientation = 'FRONT'; // Pour l'indicateur d'orientation

// Variables Three.js (seront initialisées)
let scene, camera, renderer, controls;
let animationPivot;
let pyraminxGroup;

// Constantes de couleur (utilisées pour l'initialisation)
const COLORS = {
    ROUGE:  new THREE.Color(0xD50F25),
    VERT:   new THREE.Color(0x009D54),
    BLEU:   new THREE.Color(0x0045AD),
    JAUNE:  new THREE.Color(0xFFD500),
    NOIR:   new THREE.Color(0x111111)
};

// MAPPING LOGIQUE (Copie complète de vos mappings)
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
    u: ['u'], l: ['l'], r: ['r'], b: ['b'], 
    U: ['u', 'FL', 'FR', 'LR', 'LFR'], L: ['l', 'FL', 'LB', 'FB', 'LBF'], 
    R: ['r', 'FR', 'FB', 'RB', 'FBR'], B: ['b', 'RB', 'LR', 'LB', 'RBL'] 
};

const currentPiece = { 
    u: 'Piece001_Base_0', l: 'Piece004_Base_0', r: 'Piece002_Base_0', b: 'Piece003_Base_0',
    FL: 'Piece005_Base_0', FR: 'Piece012_Base_0', FB: 'Piece013_Base_0',
    LB: 'Piece010_Base_0', RB: 'Piece014_Base_0', LR: 'Piece008_Base_0',
    LFR: 'Piece009_Base_0', LBF: 'Piece006_Base_0', FBR: 'Piece011_Base_0', RBL: 'Piece007_Base_0'
};

// ... Ajouter ici vos PERMUTATIONS pour le modèle 3D (PERMUTATIONS) ...
// Pour l'instant, nous laissons la logique de permutation vide car elle n'est pas essentielle pour l'affichage statique.


// ==========================================
// 3. FONCTIONS UTILITAIRES DE THREE.JS
// ==========================================


function initPyraminx(root, state) {
    root.traverse((child) => {
        if (child.isMesh) {
            meshRegistry[child.name] = child;
            
            // Couleurs
            if (STICKER_MAP[child.name]) {
                const map = STICKER_MAP[child.name];
                const colorKey = state[map.f][map.i]; // Utilise l'état passé en argument
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

    // Logique de centrage et calcul des axes (laissé pour la complétude)
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
    root.position.sub(centerPos);
    root.updateMatrixWorld(true);
    
    // Simplification des axes pour le rendu seul
    axes = {u: new THREE.Vector3(0, 1, 0), U: new THREE.Vector3(0, 1, 0)}; 
}

function updateAnimation(dt) {
    // Si pas d'animation (mouvement de pièce), cette fonction est vide
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    updateAnimation(delta);
    controls.update(); // <-- C'est ça qui permet la rotation libre
    updateOrientationIndicator();
    renderer.render(scene, camera);
}


// ==========================================
// 4. CHARGEUR GLB
// ==========================================
const loader = new GLTFLoader();

function loadGLB(url, stateToLoad) {
    const statusElement = document.getElementById('status');
    if (statusElement) statusElement.innerText = "Chargement...";
    
    loader.load(url, (gltf) => {
        meshRegistry = {}; // Nettoyage
        
        const root = gltf.scene;
        const allMeshes = [];
        root.traverse(c => { if(c.isMesh) allMeshes.push(c); });
        
        const group = new THREE.Group();
        allMeshes.forEach(m => {
            m.updateMatrixWorld(); 
            m.geometry.applyMatrix4(m.matrixWorld);
            m.position.set(0,0,0);
            m.rotation.set(0,0,0);
            m.scale.set(1,1,1);
            group.add(m);
        });
        
        pyraminxGroup = group;
        scene.add(pyraminxGroup);

        // Initialisation Logique et Couleur
        initPyraminx(pyraminxGroup, stateToLoad);

        // Scale final & Positionnement
        pyraminxGroup.scale.setScalar(3.5);
        pyraminxGroup.rotation.x = THREE.MathUtils.degToRad(-5);
        pyraminxGroup.rotation.y = THREE.MathUtils.degToRad(-35);

        if (statusElement) {
            statusElement.innerText = "Prêt !";
            statusElement.style.color = "#00ff00";
            // Retirer le statut après 1 seconde
            setTimeout(() => statusElement.style.display = 'none', 1000); 
        }
    }, undefined, (error) => {
        console.error('Erreur de chargement GLB:', error);
        if (statusElement) statusElement.innerText = "Erreur de chargement !";
    });
}


// ==========================================
// 5. FONCTION PRINCIPALE EXPOSÉE
// ==========================================
const clock = new THREE.Clock();

/**
 * Initialise le rendu 3D Three.js du Pyraminx dans un conteneur donné.
 * @param {string} containerId - L'ID de l'élément DIV où insérer le renderer.
 * @param {string} glbUrl - Le chemin vers le fichier GLB du Pyraminx.
 * @param {Object} initialState - La matrice de couleurs (ex: {FRONT: [...], ...}).
 */
function init3DPyraminx(containerId, initialState, glbUrl = 'static/model 3D/pyraminx.glb') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Conteneur non trouvé: #${containerId}`);
        return;
    }

    // --- 1. CONFIGURATION DE LA SCÈNE ET DU RENDERER ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    
    // Dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);

    // Vider le conteneur avant d'ajouter le renderer
    container.innerHTML = ''; 
    container.appendChild(renderer.domElement);
    
    // Lumières
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 10, 10);
    scene.add(dirLight);

    // --- 2. CAMÉRA ET CONTRÔLES ---
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2, 9); 

    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 3.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.dynamicDampingFactor = 0.1; 
    controls.target.set(0, 0, 0); // Vise le centre

    // Positionnement initial
    camera.position.setLength(30); 
    camera.fov = 45; 
    camera.updateProjectionMatrix();
    controls.minDistance = 15;
    controls.maxDistance = 60;
    controls.update();
    
    // --- 3. CHARGEMENT DU MODÈLE ---
    loadGLB(glbUrl, initialState); 
    
    // --- 4. DÉMARRAGE ET REDIMENSIONNEMENT ---
    animate();

    window.addEventListener('resize', () => {
        const resizeWidth = container.clientWidth;
        const resizeHeight = container.clientHeight;

        camera.aspect = resizeWidth / resizeHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(resizeWidth, resizeHeight);
        controls.handleResize();
    });
}


window.init3DPyraminx = init3DPyraminx;








// ==========================================
// 6. INDICATEUR ORIENTATION (VERSION CORRIGÉE ET FONCTIONNELLE)
// ==========================================

// On garde une référence aux axes dans le repère LOCAL du modèle (fixe)
const localAxes = {
    u : new THREE.Vector3(-0.0285856477, 5.2804453519, -0.5657498589).normalize(),
    l : new THREE.Vector3(-0.9714693534, -1.0566911728, -2.0706822740).normalize(),
    r : new THREE.Vector3(-0.5476240438, -0.2653662462, 0.8182806445).normalize(),
    b : new THREE.Vector3(0.8612413153, -0.2936992369, 0.0962033114).normalize()

};




function updateOrientationIndicator() {
    if (!pyraminxGroup) return;

    const orientationElement = document.getElementById('orientation');
    
    // On applique la matrice monde du groupe aux axes locaux → on obtient les axes dans le repère monde actuel
    const worldAxes = {
        u: localAxes.u.clone().applyMatrix4(pyraminxGroup.matrixWorld),
        l: localAxes.l.clone().applyMatrix4(pyraminxGroup.matrixWorld),
        r: localAxes.r.clone().applyMatrix4(pyraminxGroup.matrixWorld),
        b: localAxes.b.clone().applyMatrix4(pyraminxGroup.matrixWorld)
    };

    // Direction de la caméra (vers où elle regarde)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir); // déjà dans le bon sens (de la caméra vers l'origine)
    camDir.negate(); // maintenant c'est la direction "vers nous" (comme une normale de face)

    // Normales approximatives des 4 faces principales (moyenne des 3 axes qui la définissent)
    const nFront  = new THREE.Vector3().add(worldAxes.u).add(worldAxes.l).add(worldAxes.r).normalize();
    const nRight = new THREE.Vector3().add(worldAxes.u).add(worldAxes.r).add(worldAxes.b).normalize();
    const nLeft  = new THREE.Vector3().add(worldAxes.u).add(worldAxes.l).add(worldAxes.b).normalize();
    const nBottom= new THREE.Vector3().add(worldAxes.l).add(worldAxes.r).add(worldAxes.b).normalize();

    const faces = [
        { name: "FRONT",  vec: nFront  },
        { name: "RIGHT", vec: nRight },
        { name: "LEFT",  vec: nLeft  },
        { name: "BOTTOM",vec: nBottom}
    ];

    let bestFace = "FRONT";
    let maxDot = -Infinity;

    faces.forEach(face => {
        const dot = camDir.dot(face.vec);
        if (dot > maxDot) {
            maxDot = dot;
            bestFace = face.name;
        }
    });

    currentOrientation = bestFace;

    if (orientationElement) {
        orientationElement.innerText = `Face visible : ${bestFace}`;
        orientationElement.style.color = 
            bestFace === "FRONT" ? "#D50F25" :
            bestFace === "RIGHT" ? "#FFD500" :
            bestFace === "LEFT"  ? "#009D54" : "#0045AD";
    }

    // Debug optionnel
    //console.log("Face détectée :", bestFace, "dot =", maxDot.toFixed(3));
}






/**
 * Estime le temps de résolution.
 * * @param {number} moveCount - Le nombre de mouvements.
 * @param {string} mode - Le profil de résolution ('reading', 'average', 'pro', 'robot').
 * @returns {string} - Le temps formaté (ex: "4.50 s").
 */
function estimateTime(moveCount, mode = 'reading') {
    // TPS = Turns Per Second (Mouvements par seconde)
    const speeds = {
        'reading': 0.8, // Débutant qui lit la solution sur l'écran (lent)
        'average': 3,   // Cuber moyen qui connaît les algo
        'pro': 10,      // Speedcuber (World Class Pyraminxers font ~10+ TPS)
        'robot': 20     // Simulation ou Robot
    };

    const tps = speeds[mode] || speeds['average'];
    
    // Calcul : Temps = Mouvements / Vitesse
    const timeInSeconds = moveCount / tps;

    return timeInSeconds.toFixed(2); // Arrondi à 2 décimales
}





document.addEventListener('DOMContentLoaded', async () => {
    const defaultState = {
        FRONT: Array(9).fill("ROUGE"),
        RIGHT: Array(9).fill("JAUNE"),
        LEFT: Array(9).fill("VERT"),
        BOTTOM: Array(9).fill("BLEU")
    };

    // 🌟 ÉTAPE DE RÉCUPÉRATION ET STOCKAGE TEMPORAIRE
    const savedState = await loadAndValidateSavedState();
    // console.log(savedState); // 'savedState' contient l'état récupéré ou null

    // 🌟 ÉTAPE D'AFFECTATION À LA VARIABLE FINALE
    // Si 'savedState' est vrai (non null), 'state' utilise savedState, sinon 'state' utilise defaultState
    const state = savedState || defaultState; 

    createPyraminxCanvas("patron-2d-display", state);

    init3DPyraminx('pyraminx-3d', state);

    //console.log(state);

    const solution = await solvePyraminx(state);

    document.querySelector('#sequence').innerText = `${solution.sequence || "Already solved or impossible state"}`;

    document.querySelector('#face_to_begin').innerText = `${solution.start_face || "FRONT"}`;

    document.querySelector('#move_count').innerText = `${solution.moveCount || "N/A"} mouvements`;

    document.querySelector('#estimated_time').innerText = `${estimateTime(solution.moveCount) || "N/A"} secondes`;




    // Récupérer le canvas (qui est maintenant dans le DOM et assigné à la variable globale 'canvas')
    // Si 'canvas' est une variable globale :
    if (canvas) {
        canvas.removeEventListener('click', handleCanvasClick);
        //console.log("Écouteur de clic du canvas désactivé.");
    } 
});







