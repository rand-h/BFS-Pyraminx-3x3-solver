// --- CONFIGURATION À AJUSTER ---

// Bornes HSV pour la détection du Pyraminx.


const DEFAULT_IMAGE_URL = "test_pyraminx.jpg";


const LOWER_HSV = [0, 50, 50];    
const UPPER_HSV = [180, 255, 255]; 
const MARGIN = 50; // Marge de zoom en pixels
const MAX_PROCESS_DIM = 1000; // Redimensionne les images plus grandes que 1000px




// --- VARIABLES GLOBALES ÉDITEUR ---
let editorCanvas, ctxEditor;
let currentImg = null; // L'image OpenCV redimensionnée (sans transparence)
let trianglePoints = []; // Les 3 sommets {x, y}
let isDragging = false;
let dragIndex = -1;
const HANDLE_RADIUS = 10;


let baseImage = null; // <--- NOUVEAU : Stocke l'image originale non tournée
let currentRotationStep = 0; // 0, 90, 180, 270
let currentFineRotation = 0; // Valeur du slider



// Ajouter ceci pour éviter les erreurs si utils.js cherche la clé
const SESSION_KEY_STORAGE = 'pyraminx_active_session_key';
if (!localStorage.getItem(SESSION_KEY_STORAGE)) {
    // Si pas de session, on ne peut pas vraiment faire grand chose, mais on évite le crash
    console.warn("Attention: Pas de session active détectée dans l'éditeur.");
}



/**
 * Fonction commune : Lance l'éditeur à partir d'un élément Image chargé.
 * Utilisé par l'upload de fichier ET par l'image par défaut.
 */

function startSessionWithImage(imgElement) {
    try {
        let tempMat = cv.imread(imgElement);
        
        // Redimensionnement
        if (tempMat.cols > MAX_PROCESS_DIM || tempMat.rows > MAX_PROCESS_DIM) {
            let ratio = MAX_PROCESS_DIM / Math.max(tempMat.cols, tempMat.rows);
            let dsize = new cv.Size(Math.round(tempMat.cols * ratio), Math.round(tempMat.rows * ratio));
            cv.resize(tempMat, tempMat, dsize, 0, 0, cv.INTER_LINEAR);
        }

        // --- MODIFICATION ICI ---
        // 1. On nettoie les anciennes images
        if (baseImage) baseImage.delete();
        if (currentImg) currentImg.delete();

        // 2. On stocke l'image de base (référence absolue)
        baseImage = tempMat.clone();
        
        // 3. On initialise currentImg comme une copie de baseImage
        currentImg = baseImage.clone();
        tempMat.delete();

        // 4. Reset des valeurs de rotation UI
        currentRotationStep = 0;
        currentFineRotation = 0;
        document.getElementById('rotateSlider').value = 0;
        document.getElementById('rotateValue').innerText = "0°";
        // -------------------------

        // Trouver le triangle sur l'image actuelle
        trianglePoints = detectAutoTriangle(currentImg);

        document.getElementById('editorContainer').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        
        initEditor();
        document.getElementById('statusMessage').textContent = "Ajustez le triangle si nécessaire.";
        
    } catch(e) {
        console.error("Erreur session:", e);
    }
}

/*/
function startSessionWithImage(imgElement) {
    try {
        // 1. Charger et préparer l'image (redimensionnement)
        let tempMat = cv.imread(imgElement);
        
        // Redimensionnement initial si trop grand
        if (tempMat.cols > MAX_PROCESS_DIM || tempMat.rows > MAX_PROCESS_DIM) {
            let ratio = MAX_PROCESS_DIM / Math.max(tempMat.cols, tempMat.rows);
            let dsize = new cv.Size(Math.round(tempMat.cols * ratio), Math.round(tempMat.rows * ratio));
            cv.resize(tempMat, tempMat, dsize, 0, 0, cv.INTER_LINEAR);
        }

        // Stocker l'image courante
        if(currentImg) currentImg.delete();
        currentImg = tempMat.clone();
        tempMat.delete();

        // 2. Trouver le triangle suggéré automatiquement
        trianglePoints = detectAutoTriangle(currentImg);

        // 3. Initialiser l'éditeur interactif
        document.getElementById('editorContainer').style.display = 'block';
        document.getElementById('results').style.display = 'none';
        
        initEditor();
        document.getElementById('statusMessage').textContent = "Ajustez le triangle si nécessaire.";
        
    } catch(e) {
        console.error("Erreur lors du démarrage de la session:", e);
        document.getElementById('statusMessage').textContent = "Erreur lors du chargement de l'image.";
    }
}

/*/


/**
 * Tente de charger l'image par défaut définie dans la configuration.
 */
async function loadDefaultImage() {
    let saved_photo = await getImageFromServer("pyraminxSavedImages");

    console.log(saved_photo);

    // Si la configuration est vide ou nulle, on ne fait rien
    if (!saved_photo) {
        if (!DEFAULT_IMAGE_URL || DEFAULT_IMAGE_URL.trim() === "") {
            console.log("Aucune image par défaut configurée.");
            return;
        }
    }

    

    console.log("Chargement de l'image par défaut : " + DEFAULT_IMAGE_URL);
    document.getElementById('statusMessage').textContent = "Chargement...";

    const imgElement = new Image();
    
    // IMPORTANT : Permet de manipuler l'image dans le Canvas (CORS)
    // Si l'image vient d'un autre domaine, le serveur doit autoriser le CORS.
    imgElement.crossOrigin = "Anonymous"; 

    imgElement.onload = function() {
        console.log("Image par défaut chargée.");
        startSessionWithImage(imgElement);
    };

    imgElement.onerror = function() {
        console.warn("Impossible de charger l'image par défaut (Vérifiez le chemin).");
        document.getElementById('statusMessage').textContent = "Prêt. Sélectionnez une image.";
    };

    imgElement.src = saved_photo || DEFAULT_IMAGE_URL;
}







function handleFileSelect(evt) {
    const file = evt.target.files[0];
    if (file) {
        document.getElementById('statusMessage').textContent = "Chargement du fichier...";
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgElement = document.createElement('img');
            imgElement.onload = function() {
                startSessionWithImage(imgElement);
            };
            imgElement.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Version compatible OpenCV.js standard
 * Utilise boundingRect au lieu de minEnclosingTriangle pour éviter le crash.
 */
function detectAutoTriangle(src) {
    let img = src.clone();
    let hsv = new cv.Mat();
    let mask = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    let points = [];

    try {
        // 1. Conversion HSV
        cv.cvtColor(img, hsv, cv.COLOR_RGB2HSV);
        
        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(LOWER_HSV[0], LOWER_HSV[1], LOWER_HSV[2]));
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(UPPER_HSV[0], UPPER_HSV[1], UPPER_HSV[2]));
        
        cv.inRange(hsv, low, high, mask);
        
        // 2. Nettoyage (Dilate/Erode) pour avoir une forme pleine
        let kernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

        // 3. Trouver les contours
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
            // Trouver le plus grand contour
            let maxArea = 0;
            let maxIdx = -1;
            for (let i = 0; i < contours.size(); i++) {
                let area = cv.contourArea(contours.get(i));
                if (area > maxArea) {
                    maxArea = area;
                    maxIdx = i;
                }
            }

            if (maxIdx >= 0) {
                // --- CORRECTIF ICI ---
                // Au lieu de minEnclosingTriangle (qui manque), on utilise boundingRect
                let rect = cv.boundingRect(contours.get(maxIdx));

                // On génère un triangle isocèle basé sur la boîte englobante
                // Point 1 : Milieu Haut
                // Point 2 : Bas Gauche
                // Point 3 : Bas Droite
                points = [
                    { x: rect.x + (rect.width / 2), y: rect.y },               // Sommet
                    { x: rect.x - 20 + rect.width / 5 , y: rect.y + rect.height - rect.height / 5},                    // Bas Gauche
                    { x: rect.x + rect.width - rect.width / 5, y: rect.y + rect.height - rect.height / 5}        // Bas Droite
                ];
            }
        }

        // Nettoyage mémoire des objets temporaires de la boucle
        low.delete(); high.delete(); kernel.delete();

    } catch(err) {
        console.error("Erreur dans detectAutoTriangle:", err);
    }

    // Fallback : Si aucun contour trouvé ou erreur, on met un triangle par défaut au centre
    if (points.length !== 3) {
        let w = src.cols;
        let h = src.rows;
        points = [
            { x: w / 2, y: h * 0.2 },
            { x: w * 0.2, y: h * 0.5 },
            { x: w * 0.5, y: h * 0.5 }
        ];
    }

    // Nettoyage final
    img.delete(); hsv.delete(); mask.delete();
    contours.delete(); hierarchy.delete();

    return points;
}







function initEditor() {
    editorCanvas = document.getElementById('editorCanvas');
    ctxEditor = editorCanvas.getContext('2d');
    
    // Ajuster la taille du canvas à l'image
    editorCanvas.width = currentImg.cols;
    editorCanvas.height = currentImg.rows;

    // --- SOURIS (PC) ---
    editorCanvas.onmousedown = handleMouseDown;
    editorCanvas.onmousemove = handleMouseMove;
    editorCanvas.onmouseup = handleMouseUp;

    // --- TACTILE (MOBILE/TABLETTE) ---
    // Note: { passive: false } est crucial pour empêcher le scroll de page pendant le drag
    editorCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    editorCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    editorCanvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    drawEditor();
}








// --- Gestion événements TACTILES (Touch) ---

// Fonction utilitaire pour récupérer la position du premier doigt
function getTouchPos(evt) {
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;
    
    // On prend le premier doigt (touches[0])
    const touch = evt.touches[0];
    
    return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
    };
}

function handleTouchStart(evt) {
    // Empêcher le navigateur de simuler un clic souris ou de scroller
    if(evt.cancelable) evt.preventDefault(); 
    
    const pos = getTouchPos(evt);
    
    // Vérifier si on touche un point (avec une zone un peu plus large pour le doigt)
    // On utilise un rayon un peu plus grand (* 6 au lieu de * 4) pour faciliter la prise en main
    for (let i = 0; i < 3; i++) {
        let dx = pos.x - trianglePoints[i].x;
        let dy = pos.y - trianglePoints[i].y;
        if (dx*dx + dy*dy < HANDLE_RADIUS * HANDLE_RADIUS * 6) { 
            isDragging = true;
            dragIndex = i;
            return;
        }
    }
}

function handleTouchMove(evt) {
    // Empêcher le scroll de la page quand on bouge le doigt sur le canvas
    if(evt.cancelable) evt.preventDefault(); 

    if (isDragging) {
        const pos = getTouchPos(evt);
        
        // Limites de l'image
        let x = Math.max(0, Math.min(currentImg.cols, pos.x));
        let y = Math.max(0, Math.min(currentImg.rows, pos.y));
        
        trianglePoints[dragIndex] = { x: x, y: y };
        drawEditor();
    }
}

function handleTouchEnd(evt) {
    if(evt.cancelable) evt.preventDefault();
    isDragging = false;
    dragIndex = -1;
}












function drawEditor() {
    // 1. Dessiner l'image de fond
    // On doit afficher currentImg sur le canvas. 
    // OpenCV.js a cv.imshow, mais il écrase le context 2D parfois. 
    // On va utiliser imshow pour le fond, puis dessiner par dessus.
    cv.imshow('editorCanvas', currentImg);

    // 2. Dessiner le Triangle
    ctxEditor.beginPath();
    ctxEditor.moveTo(trianglePoints[0].x, trianglePoints[0].y);
    ctxEditor.lineTo(trianglePoints[1].x, trianglePoints[1].y);
    ctxEditor.lineTo(trianglePoints[2].x, trianglePoints[2].y);
    ctxEditor.closePath();
    
    ctxEditor.lineWidth = 3;
    ctxEditor.strokeStyle = '#00FF00'; // Ligne verte
    ctxEditor.stroke();

    // 3. Dessiner les poignées (points)
    ctxEditor.fillStyle = 'red';
    for (let p of trianglePoints) {
        ctxEditor.beginPath();
        ctxEditor.arc(p.x, p.y, HANDLE_RADIUS, 0, 2 * Math.PI);
        ctxEditor.fill();
        ctxEditor.stroke();
    }
}

// --- Gestion événements souris ---

function getMousePos(evt) {
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

function handleMouseDown(evt) {
    const pos = getMousePos(evt);
    // Vérifier si on clique sur un point
    for (let i = 0; i < 3; i++) {
        let dx = pos.x - trianglePoints[i].x;
        let dy = pos.y - trianglePoints[i].y;
        if (dx*dx + dy*dy < HANDLE_RADIUS * HANDLE_RADIUS * 4) { // *4 pour marge d'erreur
            isDragging = true;
            dragIndex = i;
            return;
        }
    }
}

function handleMouseMove(evt) {
    if (isDragging) {
        const pos = getMousePos(evt);
        // Limites de l'image
        let x = Math.max(0, Math.min(currentImg.cols, pos.x));
        let y = Math.max(0, Math.min(currentImg.rows, pos.y));
        
        trianglePoints[dragIndex] = { x: x, y: y };
        drawEditor();
    } else {
        // Changer curseur si survol
        const pos = getMousePos(evt);
        let hover = false;
        for (let i = 0; i < 3; i++) {
            let dx = pos.x - trianglePoints[i].x;
            let dy = pos.y - trianglePoints[i].y;
            if (dx*dx + dy*dy < HANDLE_RADIUS * HANDLE_RADIUS * 4) hover = true;
        }
        editorCanvas.style.cursor = hover ? 'move' : 'default';
    }
}

function handleMouseUp(evt) {
    isDragging = false;
    dragIndex = -1;
}










/**
 * Fonction principale : Version CORRIGÉE COLORIMÉTRIE
 * Reconstruit l'image finale en RGBA pour un affichage web correct.
 */
function processPyraminxImage(src) {
    // --- 1. Initialisation ---
    let img = src.clone(); 
    let maskedImg = new cv.Mat();
    let zoomedImg = new cv.Mat();
    
    // Matrices de traitement
    let imgBgr = new cv.Mat();
    let hsv = new cv.Mat();
    let maskColor = new cv.Mat();
    let maskClean = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    let kernel = new cv.Mat();
    let binaryMask = new cv.Mat();
    
    // Matrices "Lourdes" pour inRange
    let lowMat = new cv.Mat();
    let highMat = new cv.Mat();
    
    // Gestion des canaux
    let bgrVector = new cv.MatVector();
    let rgbaVector = new cv.MatVector(); // Renommé pour la clarté
    let b = null, g = null, r = null;

    try {
        // --- Conversion RGBA -> BGR pour le traitement interne ---
        // OpenCV préfère travailler en BGR pour la détection
        if (img.channels() === 4) {
            cv.cvtColor(img, imgBgr, cv.COLOR_RGBA2BGR);
            img.delete(); 
            img = imgBgr.clone(); 
        }

        // --- Redimensionnement ---
        let imgHeight = img.rows;
        let imgWidth = img.cols;
        if (imgWidth > MAX_PROCESS_DIM || imgHeight > MAX_PROCESS_DIM) {
            const ratio = MAX_PROCESS_DIM / Math.max(imgWidth, imgHeight);
            let dsize = new cv.Size(Math.round(imgWidth * ratio), Math.round(imgHeight * ratio));
            cv.resize(img, img, dsize, 0, 0, cv.INTER_LINEAR);
        }
        
        imgHeight = img.rows;
        imgWidth = img.cols;

        // --- 2. Détection (HSV) ---
        cv.cvtColor(img, hsv, cv.COLOR_BGR2HSV);
        
        let lowScalar = new cv.Scalar(LOWER_HSV[0], LOWER_HSV[1], LOWER_HSV[2]);
        let highScalar = new cv.Scalar(UPPER_HSV[0], UPPER_HSV[1], UPPER_HSV[2]);
        
        lowMat = new cv.Mat(imgHeight, imgWidth, hsv.type(), lowScalar);
        highMat = new cv.Mat(imgHeight, imgWidth, hsv.type(), highScalar);
        
        cv.inRange(hsv, lowMat, highMat, maskColor);
        
        // --- 3. Nettoyage et Contours ---
        kernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(maskColor, maskClean, cv.MORPH_CLOSE, kernel);
        cv.morphologyEx(maskClean, maskClean, cv.MORPH_OPEN, kernel);
        
        cv.findContours(maskClean, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() === 0) {
            return { imgProcessed: img.clone(), maskedImg: img.clone(), zoomedImg: img.clone() };
        }

        // Plus grand contour
        let maxArea = 0;
        let largestContourIndex = -1;
        for (let i = 0; i < contours.size(); ++i) {
            let contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area > maxArea) {
                maxArea = area;
                largestContourIndex = i;
            }
        }
        let largestContour = contours.get(largestContourIndex);

        // Masque Alpha
        binaryMask = cv.Mat.zeros(imgHeight, imgWidth, cv.CV_8U);
        let tempContourVector = new cv.MatVector();
        tempContourVector.push_back(largestContour);
        cv.drawContours(binaryMask, tempContourVector, 0, new cv.Scalar(255), cv.FILLED);
        tempContourVector.delete();

        // --- 4. Transparence (C'EST ICI QUE LA CORRECTION EST APPLIQUÉE) ---
        
        // L'image 'img' est actuellement en format BGR interne d'OpenCV.
        cv.split(img, bgrVector);
        
        // On récupère les canaux individuels
        b = bgrVector.get(0); // Bleu
        g = bgrVector.get(1); // Vert
        r = bgrVector.get(2); // Rouge
        
        // CORRECTION : On reconstruit dans l'ordre RGBA pour le web
        // Au lieu de faire B, G, R, A... on fait R, G, B, A.
        rgbaVector.push_back(r); // Rouge en premier !
        rgbaVector.push_back(g); // Vert
        rgbaVector.push_back(b); // Bleu en troisième !
        rgbaVector.push_back(binaryMask); // Alpha (Transparence)
        
        // Fusionner en une image RGBA
        cv.merge(rgbaVector, maskedImg);

        // --- 5. Zoom ---
        let rect = cv.boundingRect(largestContour);
        let x1 = Math.max(0, rect.x - MARGIN);
        let y1 = Math.max(0, rect.y - MARGIN);
        let x2 = Math.min(imgWidth, rect.x + rect.width + MARGIN);
        let y2 = Math.min(imgHeight, rect.y + rect.height + MARGIN);
        
        let rectZoom = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
        zoomedImg = maskedImg.roi(rectZoom);
        
        // CLONES pour le retour
        let res1 = img.clone();
        // Convertir aussi l'image de debug "processed" en RGB pour l'affichage
        cv.cvtColor(res1, res1, cv.COLOR_BGR2RGB); 
        
        let res2 = maskedImg.clone();
        let res3 = zoomedImg.clone();

        return { imgProcessed: res1, maskedImg: res2, zoomedImg: res3 };

    } catch (err) {
        console.error("Erreur OpenCV interne:", err);
        return { imgProcessed: src.clone(), maskedImg: src.clone(), zoomedImg: src.clone() };
    } finally {
        // --- Nettoyage Total ---
        if(img && !img.isDeleted()) img.delete();
        if(maskedImg && !maskedImg.isDeleted()) maskedImg.delete();
        if(zoomedImg && !zoomedImg.isDeleted()) zoomedImg.delete();
        if(imgBgr && !imgBgr.isDeleted()) imgBgr.delete();
        
        if(hsv && !hsv.isDeleted()) hsv.delete();
        if(maskColor && !maskColor.isDeleted()) maskColor.delete();
        if(maskClean && !maskClean.isDeleted()) maskClean.delete();
        if(binaryMask && !binaryMask.isDeleted()) binaryMask.delete();
        if(kernel && !kernel.isDeleted()) kernel.delete();
        
        if(lowMat && !lowMat.isDeleted()) lowMat.delete();
        if(highMat && !highMat.isDeleted()) highMat.delete();
        
        if(contours && !contours.isDeleted()) contours.delete();
        if(hierarchy && !hierarchy.isDeleted()) hierarchy.delete();

        if(b && !b.isDeleted()) b.delete();
        if(g && !g.isDeleted()) g.delete();
        if(r && !r.isDeleted()) r.delete();
        if(bgrVector && !bgrVector.isDeleted()) bgrVector.delete();
        if(rgbaVector && !rgbaVector.isDeleted()) rgbaVector.delete();
    }
}





/**
 * Affiche la Matrice sur le Canvas.
 */
function displayImage(mat, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (mat && canvas) {
        // On efface le canvas pour voir la transparence (le damier de fond si CSS présent)
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const maxDisplayWidth = 400;
        let displayMat = mat;
        
        if (mat.cols > maxDisplayWidth) {
            const ratio = maxDisplayWidth / mat.cols;
            displayMat = new cv.Mat();
            cv.resize(mat, displayMat, new cv.Size(0, 0), ratio, ratio, cv.INTER_AREA);
        }
        
        cv.imshow(canvasId, displayMat);
        if (displayMat !== mat) {
            displayMat.delete();
        }
    }
}









/**
 * Cette fonction sera appelée automatiquement quand l'utilisateur clique sur "Valider".
 * @param {string} dataURL - L'image en format base64 (pour affichage <img src="...">)
 * @param {Blob} blob - L'image en format binaire (pour envoi vers un serveur/API)
 */
function onProcessingComplete(dataURL, blob) {
    console.log("Image terminée et reçue !");
    
    // EXEMPLE 1 : Téléchargement automatique
    // const link = document.createElement('a');
    // link.download = 'pyraminx_crop.png';
    // link.href = dataURL;
    // link.click();

    // EXEMPLE 2 : Envoi vers un serveur (si besoin)
    // const formData = new FormData();
    // formData.append('image', blob, 'pyraminx.png');
    // fetch('/upload', { method: 'POST', body: formData });
    
    // EXEMPLE 3 : Juste retourner la data pour autre chose
    return dataURL; 
}



document.getElementById('validateBtn').addEventListener('click', function() {
    if (!currentImg) return;
    
    // --- Créer le masque final basé sur le triangle ---
    let mask = cv.Mat.zeros(currentImg.rows, currentImg.cols, cv.CV_8U);
    
    let ptsArr = [
        trianglePoints[0].x, trianglePoints[0].y,
        trianglePoints[1].x, trianglePoints[1].y,
        trianglePoints[2].x, trianglePoints[2].y
    ];
    let ptsMat = cv.matFromArray(3, 1, cv.CV_32SC2, ptsArr);
    
    cv.fillConvexPoly(mask, ptsMat, new cv.Scalar(255));
    
    // --- Création de l'image finale RGBA ---
    let finalImg = new cv.Mat();
    let imgRGB = new cv.Mat();
    
    if(currentImg.channels() === 4) {
        cv.cvtColor(currentImg, imgRGB, cv.COLOR_RGBA2RGB);
    } else {
        imgRGB = currentImg.clone();
    }
    
    let rgbaPlanes = new cv.MatVector();
    let rgbPlanes = new cv.MatVector();
    cv.split(imgRGB, rgbPlanes);
    
    rgbaPlanes.push_back(rgbPlanes.get(0)); // R
    rgbaPlanes.push_back(rgbPlanes.get(1)); // G
    rgbaPlanes.push_back(rgbPlanes.get(2)); // B
    rgbaPlanes.push_back(mask);             // A
    
    cv.merge(rgbaPlanes, finalImg);
    
    // --- Zoom (Crop) ---
    let xMin = Math.min(trianglePoints[0].x, trianglePoints[1].x, trianglePoints[2].x);
    let xMax = Math.max(trianglePoints[0].x, trianglePoints[1].x, trianglePoints[2].x);
    let yMin = Math.min(trianglePoints[0].y, trianglePoints[1].y, trianglePoints[2].y);
    let yMax = Math.max(trianglePoints[0].y, trianglePoints[1].y, trianglePoints[2].y);
    
    let x1 = Math.max(0, xMin - MARGIN);
    let y1 = Math.max(0, yMin - MARGIN);
    let x2 = Math.min(currentImg.cols, xMax + MARGIN);
    let y2 = Math.min(currentImg.rows, yMax + MARGIN);
    
    let rect = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
    let zoomedImg = finalImg.roi(rect);

    // --- Affichage ---
    document.getElementById('editorContainer').style.display = 'none';
    document.getElementById('results').style.display = 'flex';
    
    displayImage(currentImg, 'originalCanvas');
    displayImage(finalImg, 'maskedCanvas');
    
    // On affiche zoomedImg sur le canvas final
    displayImage(zoomedImg, 'zoomedCanvas'); 

    // ============================================================
    // --- EXTRACTION ET RETOUR (La partie importante) ---
    // ============================================================
    
    // 1. Récupérer le canvas où l'image finale (zoomed) est dessinée
    const finalCanvas = document.getElementById('zoomedCanvas');
    
    // 2. Extraire en DataURL (String base64) - Rapide et facile
    const dataURL = finalCanvas.toDataURL('image/png');
    
    // 3. Extraire en Blob (Fichier binaire) - Mieux pour l'upload
    finalCanvas.toBlob(function(blob) {
        // C'est ici qu'on "renvoie" l'image vers votre fonction externe
        onProcessingComplete(dataURL, blob);

        document.getElementById('valider_image').addEventListener('click', async () => {
            await saveImageToServer("Modified_image", blob);

            // Si l'URL est : http://site.com/edit?s=ma_super_data_secrète

            const params = new URLSearchParams(window.location.search);
            const monTexte = params.get('s'); 

            // [NOUVEAU] Récupérer le backup qu'on a reçu
            const backupPayload = params.get('backup');

            //console.log(monTexte); // Affiche : "ma_super_data_secrète"

            let old_url_date = monTexte;

            const key = "hello, just to encrypt the url"; 
            const decrypted_text = await decrypt(old_url_date, key);

            const [scanned_face, image_storage_k] = decrypted_text.split(':');
       
            const image_storage_key = "Modified_image"; // Ou votre variable globale

            // 2. Préparation de la chaîne "payload"
            const url_data = `${scanned_face}:${image_storage_key}`;

            // 3. Chiffrement (Fonction utilitaire plus bas)
            const encryptedData = await encrypt(url_data, key);

            const safeUrlParam = encodeURIComponent(encryptedData);

            // 5. Redirection
            // [MODIFICATION] On renvoie le backup dans l'URL de retour
            if (backupPayload) {
                window.location.href = `/scan?s=${safeUrlParam}&backup=${backupPayload}`;
            } else {
                window.location.href = `/scan?s=${safeUrlParam}`;
            }

        });

    }, 'image/png');

    // ============================================================

    document.getElementById('statusMessage').textContent = "Traitement terminé !";

    // Nettoyage Mémoire OpenCV (Très important)
    mask.delete(); ptsMat.delete(); finalImg.delete();
    imgRGB.delete(); rgbaPlanes.delete(); rgbPlanes.delete(); zoomedImg.delete();
});



// --- FONCTION POUR REFAIRE LE CADRAGE ---

document.getElementById('retryBtn').addEventListener('click', function() {
    // 1. Cacher les résultats
    document.getElementById('results').style.display = 'none';
    
    // 2. Réafficher l'éditeur
    document.getElementById('editorContainer').style.display = 'block';
    
    // 3. Mettre à jour le message
    document.getElementById('statusMessage').textContent = "Mode édition : Ajustez les points.";
    
    // (Optionnel) On redessine l'éditeur pour être sûr qu'il est propre
    drawEditor();
});




// ============================================================
// --- LOGIQUE DE ROTATION (NOUVEAU) ---
// ============================================================

// Écouteurs d'événements pour les boutons
document.getElementById('rotateLeftBtn').addEventListener('click', () => updateRotation(-90));
document.getElementById('rotateRightBtn').addEventListener('click', () => updateRotation(90));
document.getElementById('resetRotationBtn').addEventListener('click', () => resetRotation());

// Écouteur pour le slider (changement en temps réel)
document.getElementById('rotateSlider').addEventListener('input', function(e) {
    currentFineRotation = parseInt(e.target.value);
    document.getElementById('rotateValue').innerText = currentFineRotation + "°";
    applyRotation();
});

function updateRotation(step) {
    currentRotationStep = (currentRotationStep + step) % 360;
    applyRotation();
}

function resetRotation() {
    currentRotationStep = 0;
    currentFineRotation = 0;
    document.getElementById('rotateSlider').value = 0;
    document.getElementById('rotateValue').innerText = "0°";
    applyRotation();
}

/**
 * Applique la rotation cumulée (Step + Fine) sur l'image de BASE
 * et met à jour currentImg et l'éditeur.
 */
function applyRotation() {
    if (!baseImage) return;

    let angle = currentRotationStep + currentFineRotation;
    let src = baseImage;
    let dst = new cv.Mat();
    
    // 1. Calculer le centre
    let center = new cv.Point(src.cols / 2, src.rows / 2);

    // 2. Obtenir la matrice de rotation
    let M = cv.getRotationMatrix2D(center, angle, 1);

    // 3. Calculer la nouvelle taille du cadre (Bounding Box)
    // Pour éviter que l'image ne soit rognée quand on tourne
    let cos = Math.abs(M.doubleAt(0, 0));
    let sin = Math.abs(M.doubleAt(0, 1));
    let newWidth = Math.round((src.rows * sin) + (src.cols * cos));
    let newHeight = Math.round((src.rows * cos) + (src.cols * sin));

    // 4. Ajuster la matrice de transformation pour centrer l'image
    M.doublePtr(0, 2)[0] += (newWidth / 2) - center.x;
    M.doublePtr(1, 2)[0] += (newHeight / 2) - center.y;

    // 5. Appliquer la rotation
    // BorderConstant remplit les vides en noir (ou blanc si vous préférez)
    cv.warpAffine(src, dst, M, new cv.Size(newWidth, newHeight), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

    // 6. Mettre à jour l'image courante
    if (currentImg) currentImg.delete();
    currentImg = dst.clone(); // dst sera supprimé par le garbage collector ou manuellement si besoin

    // 7. Redétecter le triangle automatiquement sur la nouvelle orientation
    // C'est mieux pour l'UX : le triangle suit le Pyraminx
    trianglePoints = detectAutoTriangle(currentImg);

    // 8. Réinitialiser l'affichage
    // On doit redimensionner le canvas HTML car l'image a changé de taille
    initEditor(); 
    
    // Nettoyage
    M.delete(); dst.delete();
}





