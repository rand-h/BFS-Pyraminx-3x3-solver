// ==========================================
// pyraminx_logic.js
// Version finale : Avec Historique Visuel
// ==========================================





class PyraminxGame {
    constructor(performMoveFn, stateObj) {
        this.performMove = performMoveFn; 
        this.state = stateObj;            
        this.moveQueue = [];
        
        // État pour savoir qui tape au clavier (pour l'historique)
        this.simulationMode = 'manual'; // 'manual', 'shuffle', 'algo'
        
        // Attacher aux fonctions globales
        window.scramble = () => this.scramble();
        window.runAlgorithm = () => this.runAlgorithmFromInput();
    }

    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    simulateKeyPress(keyChar, isInverse) {
        const upperChar = keyChar.toUpperCase();
        const code = `Key${upperChar}`;
        const keyCode = upperChar.charCodeAt(0);

        const event = new KeyboardEvent('keydown', {
            key: keyChar, code: code, keyCode: keyCode, which: keyCode,
            ctrlKey: isInverse, metaKey: isInverse,
            bubbles: true, cancelable: true, view: window
        });
        window.dispatchEvent(event);
    }

    // --- FILE D'ATTENTE & HISTORIQUE ---
    
    // Ajout du paramètre 'source'
    addToQueue(key, inverse, source = 'manual') {
        this.moveQueue.push({ key, inverse });
        
        // Mise à jour de l'affichage de l'historique
        this.updateHistoryUI(key, inverse, source);
        
        this.processQueue();
    }

    updateHistoryUI(key, inverse, source) {
        const container = document.getElementById('history-bar');
        if (!container) return;

        // Création du badge
        const badge = document.createElement('div');
        badge.className = `move-badge source-${source}`;
        badge.innerText = key + (inverse ? "'" : "");

        // Ajout à la fin (droite)
        container.appendChild(badge);

        // Défilement : On garde max 15 éléments
        // Si plus de 15, on supprime le premier (celui tout à gauche)
        while (container.children.length > 15) {
            container.removeChild(container.firstChild);
        }
    }

    processQueue() {
        if (this.moveQueue.length > 0) {
            const next = this.moveQueue[0];
            const speed = this.moveQueue.length > 2 ? 0.08 : 0.25;
            const started = this.performMove(next.key, next.inverse, speed);
            if (started) this.moveQueue.shift();
        }
    }

    onAnimationComplete() {
        if (this.moveQueue.length === 0) this.checkSolved();
        this.processQueue();
    }

    // --- ACTIONS ---
    

    // Assurez-vous que la fonction generatePyraminxScramble() est définie quelque part accessible.

    async scramble() {
        // 1. Générer le scramble de manière instantanée
        const scrambleSequence = generatePyraminxScramble();
        
        this.hideBanner();
        document.getElementById('status').innerText = "Mélange en cours...";
        this.simulationMode = 'shuffle';

        // 2. Appliquer la séquence complète des mouvements
        // (Il faudra adapter cette ligne si votre simulateur attend des mouvements individuels)
        const moves = scrambleSequence.split(' ').filter(move => move.length > 0);

        for (const moveString of moves) {
            if (moveString === '|') continue; // Ignorer le séparateur
            
            // Exemple d'analyse de la chaîne de mouvement (ex: "R'" ou "L")
            const key = moveString.charAt(0);
            const modifier = moveString.substring(1); // "'" ou "" ou "2"

            // Déterminer l'inverse (si c'est ' ou 2, ou juste le mouvement standard)
            // Vous devrez peut-être adapter cela à la logique exacte de votre simulateur.
            let inverse = modifier === "'";
            let double = modifier === "2";
            
            // Simuler la touche (vous devrez peut-être mettre à jour simulateKeyPress pour gérer '2')
            // Si votre simulateur ne gère pas '2', vous devez l'envoyer deux fois.
            this.simulateKeyPress(key, inverse);
            if (double) {
                 await this.sleep(100); // Petite pause pour les doubles tours
                 this.simulateKeyPress(key, false); // Un deuxième tour simple
            }
            
            // Enlève le délai de 100 ms par tour, ne laissant qu'une petite pause pour le visuel.
            await this.sleep(50); 
        }
        
        document.getElementById('status').innerText = "Mélange terminé.";
        this.simulationMode = 'manual';
    }


    async runAlgorithmFromInput() {
        const input = document.getElementById('algoInput').value.trim();
        if (!input) return;

        this.hideBanner();
        
        // On change le mode pour l'algo
        this.simulationMode = 'algo';
        
        const moves = input.split(/[\s,]+/);
        for (const m of moves) {
            let key = m.charAt(0);
            let inverse = m.includes("'");
            if (['u','l','r','b','U','L','R','B'].includes(key)) {
                this.simulateKeyPress(key, inverse);
                await this.sleep(250);
            }
        }
        
        this.simulationMode = 'manual';
        document.getElementById('algoInput').value = "";
    }

    // --- UTILITAIRES ---

    checkSolved() {
        const isFaceSolved = (f) => f.every(c => c === f[0]);
        if (isFaceSolved(this.state.FRONT) && isFaceSolved(this.state.LEFT) && 
            isFaceSolved(this.state.RIGHT) && isFaceSolved(this.state.BOTTOM)) {
            const banner = document.getElementById('solved-banner');
            if (banner) banner.style.display = 'block';
            document.getElementById('status').innerText = "RÉSOLU !";
            document.getElementById('status').style.color = "#00ff00";
        } else {
            document.getElementById('status').innerText = "Prêt";
            document.getElementById('status').style.color = "yellow";
        }
    }

    hideBanner() {
        const banner = document.getElementById('solved-banner');
        if(banner) banner.style.display = 'none';
        
        // Optionnel : Vider l'historique quand on recommence un truc ?
        // document.getElementById('history-bar').innerHTML = "";
    }
}


window.PyraminxGame = PyraminxGame;











/**
 * Génère une séquence de mélange Pyraminx conforme WCA (11 mouvements principaux + 4 pointes).
 * Évite les mouvements redondants ou les annulations immédiates.
 * @returns {string} La séquence de mélange complète, par ex. "R' L U R B L' U' B R' L U r' l u b"
 */
function generatePyraminxScramble() {
    const mainFaces = ['R', 'L', 'U', 'B']; // Faces principales
    const mainModifiers = ["", "'"];         // Modificateurs : 1 tour ou 1 tour inverse (pas de '2' en notation WCA)
    const tips = ['r', 'l', 'u', 'b'];       // Pointes
    const mainMoveCount = 11;
    let scramble = [];
    let lastFace = '';

    // 1. Générer les 11 mouvements principaux
    for (let i = 0; i < mainMoveCount; i++) {
        let face;
        
        // Choisir une face différente de la dernière pour éviter les annulations immédiates (R R'...)
        do {
            const randomIndex = Math.floor(Math.random() * mainFaces.length);
            face = mainFaces[randomIndex];
        } while (face === lastFace);

        // Choisir un modificateur aléatoire
        const modifier = mainModifiers[Math.floor(Math.random() * mainModifiers.length)];
        
        scramble.push(face + modifier);
        lastFace = face;
    }

    // 2. Générer les 4 mouvements de pointes (aléatoires)
    let tipMoves = [];
    for (const tipFace of tips) {
        // Choisir un modificateur ('' pour rien, "'" pour un tour, ou '2' si vous les incluez)
        // La notation WCA inclut ' pour l'inverse, mais nous utilisons ici une version simplifiée pour le random.
        // Si vous voulez suivre strictement WCA, utilisez seulement "" ou "'".
        const modifierIndex = Math.floor(Math.random() * 3); // 0=rien, 1=', 2='
        let modifier = '';
        if (modifierIndex === 1) modifier = "'";
        if (modifierIndex === 2) modifier = "2"; // 2 est souvent utilisé dans les pointes

        // Si le mouvement n'est pas "rien", l'ajouter.
        if (modifierIndex !== 0) {
            tipMoves.push(tipFace + modifier);
        }
    }

    // Joindre le tout
    let finalScramble = scramble.join(' ');
    if (tipMoves.length > 0) {
        finalScramble += " " + tipMoves.join(' ');
    }
    
    return finalScramble;
}