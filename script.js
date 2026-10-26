/* ============================================================
   POTATO RUSH — La mine aux patates  (Édition Exploration)
   Jeu 2D vue du dessus — HTML5 / CSS3 / JavaScript natif
   AUCUNE dépendance : fonctionne hors ligne (index.html)

   Sommaire du fichier :
     A. Constantes & configuration (monde, joueur, armes, ennemis…)
     B. Fonctions utilitaires
     C. Classe PotatoRush
        1. Constructeur + init
        2. Écrans / boucle de jeu
        3. Réinitialisation & carte
        4. Entrées clavier / souris
        5. Mise à jour du jeu
        6. Armes & surchauffe (mécanique personnelle)
        7. Ennemis / boss / obstacles / projectiles
        8. Trésors, score, quêtes
        9. Carnet de Bord (bestiaire / quêtes / progression)
       10. Dessin (pixel art) + caméra + minimap
   ============================================================ */

'use strict';

/* ============================================================
   A. CONSTANTES
   ============================================================ */

/** États possibles de la partie. */
const GAME_STATE = {
    HOME: 'home',
    HOUSE: 'house',
    PLAYING: 'playing',
    PAUSE: 'pause',
    LOGBOOK: 'logbook',
    WIN: 'win',
    LOSE: 'lose'
};

const GAME_CONFIG = {
    /* --- Monde (le monde est plus grand que l'écran : caméra) --- */
    WORLD_W: 3800,
    WORLD_H: 3000,
    VIEW_W: 1200,          // taille du canvas = fenêtre visible
    VIEW_H: 800,

    /* --- Joueur --- */
    PLAYER_SPEED: 210,     // pixels / seconde
    PLAYER_W: 34,
    PLAYER_H: 36,
    START_LIVES: 3,
    INVULN_TIME: 1.5,      // secondes d'invincibilité après un dégât

    /* --- Règles de mission --- */
    GAME_TIME: 210,        // secondes pour finir
    TREASURES_NEEDED: 8,   // trésors à rapporter à Mamie Patate

    /* --- Ennemis --- */
    ENEMY_MAX: 14,
    ENEMY_SPAWN_INTERVAL: 1.75,

    /* --- Mécanique personnelle : SURCHAUFFE --- */
    HEAT: {
        MAX: 100,          // à 100 % l'arme refuse de tirer
        COOL_IDLE: 22,     // points / seconde hors tir
        COOL_FIRING: 8,    // points / seconde pendant le tir
        COOL_OVERHEAT: 45, // points / seconde quand l'arme surchauffe
        RELOCK_AT: 25      // l'arme redevient utilisable sous ce seuil
    }
};

/**
 * Les trois armes à base de pommes de terre.
 * `unlockAt` = nombre de trésors nécessaires pour la débloquer.
 */
const WEAPONS = {
    lance: {
        name: 'Lance-patates', color: '#d2954f',
        cooldown: 0.11, damage: 14, speed: 460, heat: 5,
        unlockAt: 0, desc: 'Rapide mais peu puissante.'
    },
    frite: {
        name: 'Frite-roquette', color: '#ffcc33',
        cooldown: 0.36, damage: 20, splash: 18, splashRadius: 70,
        speed: 290, heat: 10,
        unlockAt: 3, desc: 'Explose à l\u2019impact : touche plusieurs monstres.'
    },
    puree: {
        name: 'Canon à purée', color: '#f2ede0',
        cooldown: 0.28, damage: 16, speed: 370, slow: 2.2, heat: 8,
        unlockAt: 6, desc: 'Ralentit les monstres touchés.'
    }
};

/** Trésors : tout est lié à la pomme de terre. */
const TREASURE_TYPES = {
    classic: { name: 'Pomme de terre', points: 10, color: '#d29b6a' },
    golden: { name: 'Patate dorée', points: 25, color: '#ffd700' },
    sack: { name: 'Sac de patates', points: 15, color: '#b5763f' },
    fries: { name: 'Barquette de frites', points: 20, color: '#ffa93d' },
    chips: { name: 'Paquet de chips', points: 18, color: '#f5e26a' },
    special: { name: 'Pincée de muscade de Mamie', points: 100, color: '#c86bff' }
};

/**
 * Les 4 districts (= "niveaux") de la mine.
 * Ils sont définis par leur tranche verticale dans le monde.
 */
const DISTRICTS = [
    { id: 1, yMin: 0, yMax: 620, name: 'Galerie d\u2019entrée', color: '#3a2412', tint: 'rgba(90,60,30,0.20)' },
    { id: 2, yMin: 620, yMax: 1000, name: 'Caverne profonde', color: '#2a2438', tint: 'rgba(80,60,140,0.22)' },
    { id: 3, yMin: 1000, yMax: 2050, name: 'Sanctuaire du Roi Purée', color: '#3d1a12', tint: 'rgba(150,40,30,0.22)' },
    { id: 4, yMin: 2050, yMax: 3000, name: 'Galeries de cristal', color: '#123039', tint: 'rgba(34,135,150,0.18)' }
];

/* ============================================================
   B. UTILITAIRES
   ============================================================ */

function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y;
}

function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

function rand(min, max) { return min + Math.random() * (max - min); }

function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

/** Teste si un rayon entre deux points coupe un rectangle de roche. */
function segmentHitsRect(x1, y1, x2, y2, rect) {
    const dx = x2 - x1, dy = y2 - y1;
    let near = 0, far = 1;
    const clips = [
        [-dx, x1 - rect.x], [dx, rect.x + rect.w - x1],
        [-dy, y1 - rect.y], [dy, rect.y + rect.h - y1]
    ];
    for (const [p, q] of clips) {
        if (p === 0) {
            if (q < 0) return false;
            continue;
        }
        const t = q / p;
        if (p < 0) near = Math.max(near, t);
        else far = Math.min(far, t);
        if (near > far) return false;
    }
    return true;
}

/* ============================================================
   C. CLASSE PRINCIPALE
   ============================================================ */

class PotatoRush {

    /* ---------- 1. Constructeur + initialisation ---------- */
    constructor() {
        this.state = GAME_STATE.HOME;
        this.dom = {};
        this.ctx = null;
        this.rafId = null;
        this.lastTime = 0;
        this.keys = {};
        this.mouse = { x: GAME_CONFIG.VIEW_W / 2, y: 0 };
        this.firing = false;
        this.elapsed = 0;
        this.coins = Number(localStorage.getItem('potatoRushCoins') || 0);
        this.missions = Number(localStorage.getItem('potatoRushMissions') || 0);
        this.upgrades = JSON.parse(localStorage.getItem('potatoRushUpgrades') || '{"boots":0,"heart":0,"lamp":0}');
        this.weaponId = 'lance';
        this.hubPlayer = { x: 525, y: 420, w: 34, h: 36, angle: -Math.PI / 2, invuln: 0 };
        this.hubShopOpen = false;
        this.hubCameraX = 0;
        this.logbookTab = 'bestiaire';
        this.seen = {};            // entrées du carnet déjà découvertes
        this.init();
    }

    init() {
        /* -- Canvas & contexte -- */
        const canvas = document.getElementById('game-canvas');
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        // Résolution native : les détails restent nets sans agrandir de gros pixels.
        // Le voile doit rester sur son propre calque : destination-out ne doit
        // jamais effacer le décor ni le joueur dessinés sur le canvas principal.
        this.fogCanvas = document.createElement('canvas');
        this.fogCanvas.width = GAME_CONFIG.VIEW_W;
        this.fogCanvas.height = GAME_CONFIG.VIEW_H;
        this.fogCtx = this.fogCanvas.getContext('2d');
        this.fogCtx.imageSmoothingEnabled = false;

        const hubCanvas = document.getElementById('hub-canvas');
        this.hubCtx = hubCanvas.getContext('2d');
        this.hubCtx.imageSmoothingEnabled = false;

        /* -- Éléments de l'interface -- */
        const ids = [
            'game-canvas', 'minimap',
            'home-screen', 'game-screen', 'pause-screen', 'win-screen', 'lose-screen', 'house-screen', 'house-menu-btn', 'coin-value', 'mission-value', 'house-report',
            'hub-canvas', 'hub-hint', 'shop-panel', 'shop-close', 'shop-coins',
            'start-btn', 'resume-btn', 'pause-menu-btn',
            'replay-win', 'win-menu-btn', 'replay-lose', 'lose-menu-btn',
            'score-value', 'life-value', 'timer-value', 'level-value',
            'treasure-value', 'treasure-total', 'special-value',
            'weapon-name', 'weapon-lock-info', 'heat-bar', 'overheat-warning', 'dash-value',
            'objective-bar', 'objective-text', 'toast',
            'final-score-win', 'win-delivered', 'win-time',
            'final-score-lose', 'lose-collected', 'lose-special', 'lose-level', 'lose-reason',
            'logbook-overlay', 'logbook-panel', 'logbook-close', 'logbook-content'
        ];
        for (const id of ids) this.dom[id] = document.getElementById(id);

        /* -- Onglets du carnet -- */
        this.tabs = Array.prototype.slice.call(
            document.querySelectorAll('.logbook-tab'));

        /* -- Événements (une seule fois pour toute la partie) -- */
        window.addEventListener('keydown', (e) => this.onKeyDown(e), false);
        window.addEventListener('keyup', (e) => this.onKeyUp(e), false);
        window.addEventListener('mousemove', (e) => this.onMouseMove(e), false);
        window.addEventListener('mouseup', (e) => this.onMouseUp(e), false);
        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e), false);
        canvas.addEventListener('contextmenu', (e) => e.preventDefault(), false);

        this.safe('start-btn').addEventListener('click', () => this.showHouse('Bienvenue ! La boutique est a gauche, l entree de mine est a droite.'));
        this.safe('house-menu-btn').addEventListener('click', () => this.goHome());
        this.safe('shop-close').addEventListener('click', () => this.closeHubShop());
        for (const button of document.querySelectorAll('.shop-item')) button.addEventListener('click', () => this.buyUpgrade(button.dataset.upgrade));
        this.safe('resume-btn').addEventListener('click', () => this.togglePause());
        this.safe('pause-menu-btn').addEventListener('click', () => this.goHome());
        this.safe('replay-win').addEventListener('click', () => this.startGame());
        this.safe('win-menu-btn').addEventListener('click', () => this.goHome());
        this.safe('replay-lose').addEventListener('click', () => this.startGame());
        this.safe('lose-menu-btn').addEventListener('click', () => this.goHome());
        this.safe('logbook-close').addEventListener('click', () => this.closeLogbook());
        this.safe('minimap').addEventListener('click', () => this.toggleLogbook());

        for (const tab of this.tabs) {
            tab.addEventListener('click', () => {
                this.logbookTab = tab.getAttribute('data-tab');
                this.renderLogbook();
            });
        }

        this.showScreen(GAME_STATE.HOME);
        console.log('\u{1F954} Potato Rush — Édition Exploration prêt !');
    }

    /** Accès sécurisé à un élément (évite les plantages si l'id manque) */
    safe(id) { return this.dom[id]; }

    /* ---------- 2. Écrans & boucle de jeu ---------- */
    showScreen(state) {
        // Le carnet de bord est un OVERLAY par-dessus l'écran de jeu :
        // on affiche donc l'écran de jeu et on ouvre le carnet.
        if (state === GAME_STATE.LOGBOOK) {
            this.dom['logbook-overlay'].classList.remove('hidden');
            this.state = GAME_STATE.LOGBOOK;
            return;
        }

        const map = {
            [GAME_STATE.HOME]: 'home-screen',
            [GAME_STATE.HOUSE]: 'house-screen',
            [GAME_STATE.PLAYING]: 'game-screen',
            [GAME_STATE.PAUSE]: 'pause-screen',
            [GAME_STATE.WIN]: 'win-screen',
            [GAME_STATE.LOSE]: 'lose-screen'
        };
        for (const id of Object.keys(map)) {
            this.dom[map[id]].classList.add('hidden');
        }
        this.dom[map[state]].classList.remove('hidden');
        this.state = state;

        // Le carnet de bord est un overlay : on l'affiche au-dessus du jeu
        if (state === GAME_STATE.LOGBOOK) {
            this.dom['logbook-overlay'].classList.remove('hidden');
        } else {
            this.dom['logbook-overlay'].classList.add('hidden');
        }
    }

    startLoop() {
        if (this.rafId !== null) return;    // jamais deux boucles en parallèle
        this.lastTime = performance.now();

        const step = (now) => {
            this.rafId = requestAnimationFrame(step);
            let dt = clamp((now - this.lastTime) / 1000, 0, 0.05); // aucun temps négatif, pas de saut après un changement d'onglet
            this.lastTime = now;

            // En pause / carnet ouvert, aucune mise à jour (chrono figé)
            if (this.state === GAME_STATE.PLAYING) this.update(dt);
            else if (this.state === GAME_STATE.HOUSE) this.updateHub(dt);
            if (this.state === GAME_STATE.HOUSE) this.drawHub();
            else this.draw();
        };
        this.rafId = requestAnimationFrame(step);
    }

    stopLoop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    startGame() {
        this.hubShopOpen = false;
        this.dom['shop-panel'].classList.add('hidden');
        this.resetGame();
        this.closeLogbook();
        this.showScreen(GAME_STATE.PLAYING);
        // Affiche la première image tout de suite; la boucle prend ensuite le relais.
        this.draw();
        this.startLoop();
        this.toast('Explore les 4 districts et rapporte 8 trésors !', false);
    }

    goHome() {
        this.stopLoop();
        this.closeLogbook();
        this.showScreen(GAME_STATE.HOME);
    }

    showHouse(report) {
        this.stopLoop();
        this.hubPlayer.x = 525;
        this.hubPlayer.y = 430;
        this.hubPlayer.angle = -Math.PI / 2;
        this.hubCameraX = 0;
        this.hubShopOpen = false;
        this.dom['shop-panel'].classList.add('hidden');
        this.dom['house-report'].textContent = report || 'La mine attend ton retour.';
        this.refreshShop();
        this.showScreen(GAME_STATE.HOUSE);
        this.drawHub();
        this.startLoop();
    }

    updateHub(dt) {
        if (this.hubShopOpen) return;
        const p = this.hubPlayer;
        const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
        const shopDistance = dist(pcx, pcy, 220, 365), homeDistance = dist(pcx, pcy, 830, 365);
        if (shopDistance < 135) this.dom['hub-hint'].textContent = 'BOUTIQUE : avance jusqu a la porte pour entrer et acheter une amelioration.';
        else if (homeDistance < 145) this.dom['hub-hint'].textContent = 'ENTREE DE MINE : avance dans le tunnel pour commencer ta prochaine mission.';
        else this.dom['hub-hint'].textContent = 'A / D ou fleches : marcher | W / haut : avancer | boutique a gauche, mine a droite.';
        let dx = (this.isDown('d') ? 1 : 0) - (this.isDown('a') ? 1 : 0);
        let dy = (this.isDown('s') ? 1 : 0) - (this.isDown('w') ? 1 : 0);
        if (!dx && !dy) return;
        const n = Math.hypot(dx, dy) || 1;
        dx = dx / n * 190 * dt; dy = dy / n * 190 * dt;
        this.hubPlayer.angle = Math.atan2(dy, dx);
        const nx = clamp(p.x + dx, 20, 1030), ny = clamp(p.y + dy, 40, 510);
        const inDoor = (x, y, b) => x + p.w > b.x + 92 && x < b.x + 166 && y + p.h > b.y + b.h - 22 && y < b.y + b.h + 46;
        const blocked = (x, y, b) => x + p.w > b.x && x < b.x + b.w && y + p.h > b.y && y < b.y + b.h && !inDoor(x, y, b);
        const shop = { x: 90, y: 190, w: 260, h: 190 }, home = { x: 700, y: 190, w: 260, h: 190 };
        if (!blocked(nx, p.y, shop) && !blocked(nx, p.y, home)) p.x = nx;
        if (!blocked(p.x, ny, shop) && !blocked(p.x, ny, home)) p.y = ny;
        if (inDoor(p.x, p.y, shop)) {
            this.hubShopOpen = true;
            this.dom['shop-panel'].classList.remove('hidden');
        } else if (inDoor(p.x, p.y, home)) this.startGame();
        this.hubCameraX = clamp(p.x + p.w / 2 - 450, 0, 150);
    }

    closeHubShop() {
        this.hubShopOpen = false;
        this.dom['shop-panel'].classList.add('hidden');
        this.hubPlayer.y = 440;
    }

    drawHub() {
        const c = this.hubCtx, cam = this.hubCameraX;
        c.clearRect(0, 0, 900, 540);
        // Ciel, nuages carr\u00e9s et collines en plans d\u00e9cal\u00e9s.
        c.fillStyle = '#83b6c1'; c.fillRect(0, 0, 900, 300);
        c.fillStyle = '#a8d0c9'; c.fillRect(0, 0, 900, 126);
        c.fillStyle = '#d4e5c6'; c.fillRect(0, 126, 900, 4);
        for (let i = 0; i < 7; i++) {
            const x = i * 160 - Math.floor(cam * .18) % 160, y = 208 + (i % 3) * 12;
            c.fillStyle = i % 2 ? '#688f84' : '#789b82';
            c.fillRect(x, y + 26, 86, 84); c.fillRect(x + 16, y + 7, 54, 34); c.fillRect(x + 32, y - 7, 26, 24);
        }
        c.fillStyle = '#edf1ca';
        for (let i = 0; i < 4; i++) { const x = i * 250 + 38 - Math.floor(cam * .1) % 250, y = 70 + (i % 2) * 45; c.fillRect(x, y, 72, 12); c.fillRect(x + 14, y - 10, 38, 10); c.fillRect(x + 61, y + 5, 25, 8); }
        // Herbe en couches, fleurs et vrai chemin reliant les portes.
        c.fillStyle = '#71975b'; c.fillRect(0, 292, 900, 248); c.fillStyle = '#89a95e'; c.fillRect(0, 292, 900, 7); c.fillStyle = '#527447'; c.fillRect(0, 330, 900, 210);
        for (let i = 0; i < 34; i++) { const x = (i * 73 + 19) % 900, y = 308 + (i * 37) % 222; c.fillStyle = i % 3 ? '#a7bd69' : '#e7d17c'; c.fillRect(x, y, 4, 4); if (i % 2 === 0) { c.fillStyle = '#42623f'; c.fillRect(x + 4, y + 3, 4, 3); } }
        c.fillStyle = '#8b7350'; c.fillRect(0, 408, 900, 58); c.fillStyle = '#aa9065'; c.fillRect(0, 412, 900, 4); c.fillRect(0, 458, 900, 4);
        for (let x = 0; x < 900; x += 42) { c.fillStyle = '#705d43'; c.fillRect(x + (Math.floor(x / 42) % 2) * 12, 422 + (Math.floor(x / 42) % 2) * 17, 25, 3); c.fillStyle = '#c0a477'; c.fillRect(x + 6, 429 + (Math.floor(x / 42) % 2) * 17, 13, 2); }
        this.drawHubBuilding(c, 90 - cam, 190, false);
        this.drawHubBuilding(c, 700 - cam, 190, true);
        // Petits arbres du premier plan.
        for (const worldX of [36, 390, 642, 1000]) { const x = worldX - cam; if (x < -55 || x > 930) continue; c.fillStyle = '#493b2a'; c.fillRect(x + 18, 330, 12, 80); c.fillStyle = '#385e43'; c.fillRect(x, 276, 48, 48); c.fillRect(x + 8, 258, 32, 26); c.fillRect(x + 14, 246, 20, 18); c.fillStyle = '#6e9050'; c.fillRect(x + 6, 282, 12, 7); c.fillRect(x + 29, 267, 8, 5); }
        const old = this.player;
        this.player = { ...this.hubPlayer, x: this.hubPlayer.x - cam };
        this.drawPlayer(c);
        this.player = old;
        c.font = 'bold 15px monospace'; c.textAlign = 'center'; c.fillStyle = '#fff0bf';
        c.fillText('\u2190  BOUTIQUE', 220 - cam, 176); c.fillText('ENTREE DE MINE  \u2192', 830 - cam, 176);
    }

    drawHubBuilding(c, x, y, isHome) {
        const doorX = x + 106;
        if (isHome) {
            // Galerie creus?e dans la colline, avec arche, rails et lumi?re au fond.
            c.fillStyle = '#263a31'; c.fillRect(x + 8, y + 62, 244, 218);
            c.fillStyle = '#465344'; c.fillRect(x + 20, y + 84, 220, 174);
            for (let i = 0; i < 30; i++) {
                const bx = x + 15 + (i * 47) % 225, by = y + 75 + (i * 31) % 175;
                c.fillStyle = i % 3 === 0 ? '#73705a' : (i % 2 ? '#555b4b' : '#62614d');
                c.fillRect(bx, by, 8 + (i % 3) * 3, 5 + (i % 2) * 3);
                c.fillStyle = '#85816a'; c.fillRect(bx + 2, by, 4, 2);
            }
            // Bouche noire en arche ? degr?s, ombr?e comme un tunnel profond.
            c.fillStyle = '#151918'; c.fillRect(x + 72, y + 128, 116, 132);
            c.fillRect(x + 84, y + 112, 92, 16); c.fillRect(x + 98, y + 98, 64, 14);
            c.fillStyle = '#292b25'; c.fillRect(x + 82, y + 138, 96, 112);
            c.fillStyle = '#080c0c'; c.fillRect(x + 91, y + 148, 78, 102);
            c.fillStyle = '#5a4128'; c.fillRect(x + 112, y + 170, 34, 38);
            c.fillStyle = '#f0b64f'; c.fillRect(x + 124, y + 176, 12, 19); c.fillStyle = '#fff0a3'; c.fillRect(x + 128, y + 177, 5, 10);
            // Rails qui se resserrent avec la perspective.
            c.fillStyle = '#453d2c'; c.fillRect(x + 105, y + 228, 8, 40); c.fillRect(x + 148, y + 228, 8, 40);
            c.fillStyle = '#9b8052'; c.fillRect(x + 108, y + 232, 5, 32); c.fillRect(x + 148, y + 232, 5, 32);
            for (let i = 0; i < 5; i++) { c.fillStyle = '#6e6044'; c.fillRect(x + 106 + i * 2, y + 232 + i * 7, 48 - i * 4, 3); }
            // Poutres d'?taiement en bois, ?paisses et lisibles.
            c.fillStyle = '#30251e'; c.fillRect(x + 64, y + 118, 16, 148); c.fillRect(x + 180, y + 118, 16, 148);
            c.fillRect(x + 70, y + 101, 120, 18); c.fillRect(x + 82, y + 85, 96, 16);
            c.fillStyle = '#925b35'; c.fillRect(x + 68, y + 122, 8, 138); c.fillRect(x + 184, y + 122, 8, 138);
            c.fillRect(x + 76, y + 105, 104, 8); c.fillRect(x + 88, y + 89, 80, 8);
            c.fillStyle = '#d29a55'; c.fillRect(x + 70, y + 124, 3, 36); c.fillRect(x + 186, y + 124, 3, 36); c.fillRect(x + 80, y + 107, 80, 3);
            // Enseigne, lampes et petit chariot charg? de minerai.
            c.fillStyle = '#30251e'; c.fillRect(x + 79, y + 50, 102, 29); c.fillStyle = '#b98a4c'; c.fillRect(x + 83, y + 54, 94, 21);
            c.fillStyle = '#2d251b'; c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.fillText('MINE', x + 130, y + 70);
            for (const lx of [x + 49, x + 199]) { c.fillStyle = '#39271b'; c.fillRect(lx, y + 132, 8, 24); c.fillStyle = '#df742f'; c.fillRect(lx - 3, y + 121, 14, 13); c.fillStyle = '#ffe180'; c.fillRect(lx, y + 123, 7, 9); }
            c.fillStyle = '#382b20'; c.fillRect(x + 204, y + 218, 36, 25); c.fillStyle = '#9a6239'; c.fillRect(x + 208, y + 222, 28, 15);
            c.fillStyle = '#322820'; c.fillRect(x + 210, y + 241, 7, 7); c.fillRect(x + 229, y + 241, 7, 7);
            c.fillStyle = '#d1a459'; c.fillRect(x + 212, y + 224, 20, 4); c.fillRect(x + 215, y + 230, 13, 5);
            c.fillStyle = '#43523e'; c.fillRect(x + 25, y + 223, 26, 24); c.fillStyle = '#75865a'; c.fillRect(x + 29, y + 219, 18, 7);
            return;
        }
        // Fondation en pierres irr\u00e9guli\u00e8res.
        c.fillStyle = '#25342c'; c.fillRect(x + 12, y + 68, 236, 208); c.fillStyle = '#4c4d3b'; c.fillRect(x + 22, y + 206, 216, 58);
        for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#66634b' : '#595b47'; c.fillRect(x + 24 + (i % 2) * 13 + (i * 19) % 180, y + 210 + Math.floor(i / 2) * 9, 23, 7); }
        // Fa\u00e7ades et poutres : boutique vert sauge, maison ocre chaleureuse.
        c.fillStyle = isHome ? '#c89458' : '#d3b06d'; c.fillRect(x + 28, y + 74, 204, 146); c.fillStyle = isHome ? '#865234' : '#647b50'; c.fillRect(x + 34, y + 80, 192, 8);
        if (isHome) { c.fillStyle = '#70462f'; c.fillRect(x + 44, y + 84, 8, 126); c.fillRect(x + 208, y + 84, 8, 126); c.fillRect(x + 32, y + 150, 196, 6); }
        else { c.fillStyle = '#513d2d'; c.fillRect(x + 42, y + 111, 64, 69); c.fillStyle = '#b5d5c3'; c.fillRect(x + 47, y + 116, 54, 57); c.fillStyle = '#739783'; c.fillRect(x + 50, y + 120, 48, 22); c.fillStyle = '#754c31'; c.fillRect(x + 47, y + 147, 54, 5); c.fillStyle = '#c78b49'; c.fillRect(x + 53, y + 138, 10, 8); c.fillRect(x + 69, y + 136, 12, 10); c.fillRect(x + 86, y + 139, 9, 7); }
        // Fen\u00eatres crois\u00e9es, lumi\u00e8re diff\u00e9rente selon le lieu.
        const winColor = isHome ? '#f6d98c' : '#b8e0d0';
        for (const wx of (isHome ? [x + 130, x + 184] : [x + 130, x + 184])) { c.fillStyle = '#513d2d'; c.fillRect(wx - 2, y + 111, 40, 48); c.fillStyle = winColor; c.fillRect(wx + 3, y + 116, 30, 38); c.fillStyle = '#fff1bd'; c.fillRect(wx + 5, y + 118, 8, 8); c.fillStyle = '#684831'; c.fillRect(wx + 16, y + 116, 4, 38); c.fillRect(wx + 3, y + 134, 30, 4); c.fillStyle = '#503d2a'; c.fillRect(wx - 7, y + 160, 50, 5); }
        // Porte vitree encadree et marche qui montre clairement l'entree.
        c.fillStyle = '#493226'; c.fillRect(doorX, y + 145, 52, 75); c.fillStyle = isHome ? '#8a5635' : '#716043'; c.fillRect(doorX + 5, y + 151, 42, 69); c.fillStyle = '#372b22'; c.fillRect(doorX + 10, y + 157, 31, 63); c.fillStyle = winColor; c.fillRect(doorX + 14, y + 162, 24, 23); c.fillStyle = '#503526'; c.fillRect(doorX + 25, y + 162, 3, 23); c.fillRect(doorX + 14, y + 172, 24, 3); c.fillStyle = '#efc65f'; c.fillRect(doorX + 35, y + 190, 5, 5); c.fillStyle = '#74583a'; c.fillRect(doorX - 8, y + 220, 68, 7); c.fillStyle = '#a58a5e'; c.fillRect(doorX - 4, y + 227, 60, 5);
        // Toit en pignon pixelis\u00e9, avec deux palettes vraiment diff\u00e9rentes.
        const roof = isHome ? '#784534' : '#426b63', roofLight = isHome ? '#b06b46' : '#77a08a';
        c.fillStyle = '#30251f'; c.fillRect(x + 20, y + 54, 220, 20); c.fillRect(x + 40, y + 34, 180, 20); c.fillRect(x + 66, y + 14, 128, 20); c.fillRect(x + 94, y - 4, 72, 20);
        c.fillStyle = roof; c.fillRect(x + 22, y + 50, 216, 16); c.fillRect(x + 42, y + 30, 176, 16); c.fillRect(x + 68, y + 10, 124, 16); c.fillRect(x + 96, y - 8, 68, 16);
        c.fillStyle = roofLight; for (let row = 0; row < 4; row++) { const rx = x + 28 + row * 22, ry = y + 54 - row * 20, rw = 204 - row * 44; for (let q = 0; q < rw; q += 28) c.fillRect(rx + q, ry, 14, 4); }
        c.fillStyle = '#2e2820'; c.fillRect(x + 28, y + 68, 204, 8); c.fillStyle = '#d8b273'; c.fillRect(x + 32, y + 70, 196, 3);
        // Enseigne pos\u00e9e sur la fa\u00e7ade, pas au-dessus du toit.
        c.fillStyle = '#493428'; c.fillRect(x + 54, y + 82, 148, 23); c.fillStyle = isHome ? '#f5d58a' : '#d8e6bd'; c.fillRect(x + 58, y + 84, 140, 18); c.fillStyle = '#35271f'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(isHome ? 'MAISON DE MAMIE' : 'BOUTIQUE', x + 128, y + 97);
        if (isHome) { c.fillStyle = '#5b382b'; c.fillRect(x + 192, y - 23, 24, 43); c.fillStyle = '#bc7c56'; c.fillRect(x + 188, y - 26, 32, 7); const puff = Math.floor(this.elapsed * 2) % 4; c.fillStyle = '#d5dbca'; c.fillRect(x + 202 + puff * 2, y - 44, 12, 7); c.fillRect(x + 210 + puff * 2, y - 52, 9, 6); c.fillStyle = '#f2cc65'; c.fillRect(x + 25, y + 178, 8, 14); c.fillStyle = '#fff0a8'; c.fillRect(x + 27, y + 176, 4, 8); c.fillStyle = '#8d4d37'; c.fillRect(x + 228, y + 202, 18, 17); c.fillStyle = '#52834c'; c.fillRect(x + 231, y + 190, 5, 14); c.fillRect(x + 238, y + 186, 5, 18); c.fillStyle = '#e4c963'; c.fillRect(x + 228, y + 185, 5, 5); }
        else { c.fillStyle = '#46332a'; c.fillRect(x + 35, y + 105, 190, 10); c.fillStyle = '#d8eee0'; c.fillRect(x + 38, y + 115, 184, 7); for (let q = 0; q < 6; q++) { c.fillStyle = q % 2 ? '#a85748' : '#e5d19a'; c.fillRect(x + 38 + q * 31, y + 121, 31, 20); c.fillStyle = '#403129'; c.fillRect(x + 38 + q * 31, y + 139, 31, 4); } c.fillStyle = '#765335'; c.fillRect(x + 4, y + 207, 44, 32); c.fillStyle = '#a97a43'; c.fillRect(x + 8, y + 211, 36, 23); c.fillStyle = '#d7ba77'; c.fillRect(x + 12, y + 215, 9, 8); c.fillRect(x + 26, y + 215, 12, 8); c.fillStyle = '#39734d'; c.fillRect(x + 203, y + 184, 23, 25); c.fillStyle = '#e0bf63'; c.fillRect(x + 207, y + 179, 15, 8); }
    }

    upgradePrice(id) { return ({ boots: 35, heart: 45, lamp: 40 })[id] + (this.upgrades[id] || 0) * 30; }

    refreshShop() {
        this.dom['coin-value'].textContent = this.coins;
        this.dom['shop-coins'].textContent = this.coins;
        this.dom['mission-value'].textContent = this.missions;
        for (const id of ['boots', 'heart', 'lamp']) {
            const price = this.upgradePrice(id);
            document.getElementById(id + '-level').textContent = this.upgrades[id] || 0;
            document.getElementById(id + '-price').textContent = price;
            document.querySelector('[data-upgrade="' + id + '"]').disabled = this.coins < price;
        }
    }

    buyUpgrade(id) {
        const price = this.upgradePrice(id);
        if (this.coins < price) return;
        this.coins -= price;
        this.upgrades[id] = (this.upgrades[id] || 0) + 1;
        localStorage.setItem('potatoRushCoins', this.coins);
        localStorage.setItem('potatoRushUpgrades', JSON.stringify(this.upgrades));
        this.refreshShop();
    }

    togglePause() {
        if (this.state === GAME_STATE.PLAYING) {
            this.showScreen(GAME_STATE.PAUSE);
        } else if (this.state === GAME_STATE.PAUSE) {
            this.lastTime = performance.now();
            this.showScreen(GAME_STATE.PLAYING);
        }
    }

    /* Carnet de bord : ouverture, fermeture, bascule (touche L) */
    toggleLogbook() {
        if (this.state === GAME_STATE.LOGBOOK) {
            this.closeLogbook();
        } else if (this.state === GAME_STATE.PLAYING) {
            this.showScreen(GAME_STATE.LOGBOOK);
            this.renderLogbook();
        }
    }

    closeLogbook() {
        if (this.state === GAME_STATE.LOGBOOK) {
            this.dom['logbook-overlay'].classList.add('hidden');
            this.state = GAME_STATE.PLAYING;
        } else {
            this.dom['logbook-overlay'].classList.add('hidden');
        }
        this.syncTabs();
    }

    syncTabs() {
        for (const tab of this.tabs) {
            tab.classList.toggle('active', tab.getAttribute('data-tab') === this.logbookTab);
        }
    }

    /* ---------- 3. Réinitialisation & carte ---------- */
    resetGame() {
        /* --- Joueur (près de la sortie, en haut de la carte) --- */
        this.player = {
            x: 1140, y: 200,
            w: GAME_CONFIG.PLAYER_W,
            h: GAME_CONFIG.PLAYER_H,
            angle: -Math.PI / 2,
            invuln: 0
        };

        /* --- Données de partie --- */
        this.score = 0;
        this.lives = GAME_CONFIG.START_LIVES + (this.upgrades.heart || 0);
        this.maxLives = this.lives;
        this.playerSpeed = GAME_CONFIG.PLAYER_SPEED * (1 + (this.upgrades.boots || 0) * 0.1);
        this.timeLeft = GAME_CONFIG.GAME_TIME;
        this.collected = 0;
        this.hasSpecial = false;
        this.delivered = 0;
        this.kills = 0;
        this.level = 1;
        this.maxLevel = 1;
        this.lastDistrictId = 1;

        /* --- Armes & surchauffe --- */
        this.weaponId = 'lance';
        this.unlocked = { lance: true, frite: false, puree: false };
        this.heat = 0;
        this.overheated = false;
        this.shootTimer = 0;
        this.lifeHurt = 0;
        this.hurtFlash = 0;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.dashDX = 0;
        this.dashDY = 0;

        /* --- Entités --- */
        this.projectiles = [];
        this.particles = [];
        this.floaters = [];
        this.enemyTimer = 2.0;
        this.elapsed = 0;

        /* --- Caméra --- */
        this.cam = {
            x: 0, y: 0,
            w: GAME_CONFIG.VIEW_W, h: GAME_CONFIG.VIEW_H
        };
        this.updateCamera(true);

        /* --- Carte, trésors, ennemis, boss, obstacles --- */
        this.buildMap();
        this.updateCamera(true);
        this.spawnTreasures();
        this.enemies = [];
        this.spawnInitialEnemies();
        this.boss = this.createBoss();
        this.bossArenaActive = false;
        this.bossReturn = null;
        this.bossPhase = 'locked';
        this.bossGuardsSummoned = false;
        this.bossShots = [];
        this.bossPulse = null;
        this.spawnObstacles();

        /* --- Découverte (carnet de bord) --- */
        this.seen = {};
        this.discover('corrupted');   // les ennemis du départ sont déjà connus

        this.toastTime = 0;
        this.updateHUD();
    }

    /** Creuse un r?seau de salles et de galeries dans une masse rocheuse. */
    buildMap() {
        this.minimapCache = null;
        this.tileSize = 20;
        this.mapCols = Math.ceil(GAME_CONFIG.WORLD_W / this.tileSize);
        this.mapRows = Math.ceil(GAME_CONFIG.WORLD_H / this.tileSize);
        this.cave = Array.from({ length: this.mapRows }, () => Array(this.mapCols).fill(0));
        const roomScale = 2;
        const rooms = [
            { x: 6, y: 5, w: 7, h: 6 }, { x: 6, y: 15, w: 6, h: 5 },
            { x: 18, y: 10, w: 8, h: 6 }, { x: 29, y: 5, w: 7, h: 6 },
            { x: 43, y: 8, w: 9, h: 7 }, { x: 18, y: 23, w: 8, h: 6 },
            { x: 31, y: 22, w: 8, h: 6 }, { x: 46, y: 20, w: 8, h: 6 },
            { x: 7, y: 32, w: 8, h: 6 }, { x: 30, y: 33, w: 9, h: 6 },
            { x: 46, y: 32, w: 9, h: 6 },
            { x: 7, y: 44, w: 9, h: 7 }, { x: 20, y: 48, w: 10, h: 8 },
            { x: 8, y: 60, w: 9, h: 8 }, { x: 35, y: 53, w: 10, h: 8 },
            { x: 53, y: 50, w: 10, h: 8 }, { x: 73, y: 48, w: 9, h: 8 },
            { x: 63, y: 65, w: 10, h: 8 }
        ].map(r => ({ x: r.x * roomScale, y: r.y * roomScale, w: r.w * roomScale, h: r.h * roomScale }));
        const centers = rooms.map(r => ({ x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) }));
        const carve = (x, y) => { if (this.cave[y] && x >= 0 && x < this.mapCols) this.cave[y][x] = 1; };
        const room = r => {
            const cx = r.x + (r.w - 1) / 2, cy = r.y + (r.h - 1) / 2;
            for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
                const nx = (x - cx) / (r.w / 2), ny = (y - cy) / (r.h / 2);
                const edge = 1 + Math.sin(x * 1.31 + y * 1.87) * 0.24 + Math.cos(y * 2.17 - x * 1.4) * 0.16;
                if (nx * nx + ny * ny < edge) carve(x, y);
            }
        };
        const tunnelSegment = (a, b, width, phase) => {
            const dx = b.x - a.x, dy = b.y - a.y;
            const horizontal = Math.abs(dx) >= Math.abs(dy);
            const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const bend = Math.round(Math.sin(t * Math.PI * 2.2 + phase) * Math.sin(t * Math.PI) * 2.1);
                const x = Math.round(a.x + dx * t + (horizontal ? 0 : bend));
                const y = Math.round(a.y + dy * t + (horizontal ? bend : 0));
                const half = Math.floor(width / 2);
                for (let q = -half; q <= half; q++) carve(x + (horizontal ? 0 : q), y + (horizontal ? q : 0));
            }
        };
        const tunnel = (a, b, horizontalFirst, width = 2) => {
            const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
            tunnelSegment(a, corner, width, (a.x + b.y) * .17);
            tunnelSegment(corner, b, width, (b.x + a.y) * .13);
        };
        rooms.forEach(room);
        // Salle du boss séparée de la mine : on y entre par le vieux panneau.
        this.bossArena = { x: 2220, y: 1070, w: 1080, h: 980 };
        const arena = this.bossArena;
        for (let y = Math.floor(arena.y / this.tileSize); y < Math.ceil((arena.y + arena.h) / this.tileSize); y++) {
            for (let x = Math.floor(arena.x / this.tileSize); x < Math.ceil((arena.x + arena.w) / this.tileSize); x++) {
                const cx = (x * this.tileSize + 10 - (arena.x + arena.w / 2)) / (arena.w / 2);
                const cy = (y * this.tileSize + 10 - (arena.y + arena.h / 2)) / (arena.h / 2);
                if (Math.abs(cx) < 0.98 && Math.abs(cy) < 0.98) carve(x, y);
            }
        }
        const midY = arena.y + arena.h / 2;
        this.bossCover = [
            { x: arena.x + 580, y: midY - 235, w: 72, h: 72 },
            { x: arena.x + 580, y: midY + 165, w: 72, h: 72 },
            { x: arena.x + 865, y: midY - 235, w: 72, h: 72 },
            { x: arena.x + 865, y: midY + 165, w: 72, h: 72 }
        ];
        for (const cover of this.bossCover) {
            for (let y = Math.floor(cover.y / this.tileSize); y < Math.ceil((cover.y + cover.h) / this.tileSize); y++) {
                for (let x = Math.floor(cover.x / this.tileSize); x < Math.ceil((cover.x + cover.w) / this.tileSize); x++) {
                    if (this.cave[y]) this.cave[y][x] = 0;
                }
            }
        }
        // Une colonne vert?brale sinueuse relie chaque salle, avec des raccourcis.
        const links = [[0,1],[1,2],[2,3],[3,4],[2,5],[5,6],[6,7],[5,8],[8,9],[9,10],[7,10],[4,7],[1,5],
            [8,11],[11,12],[12,13],[12,14],[14,15],[15,16],[16,17],[14,17]];
        // Galeries volontairement larges : on peut tourner dedans sans accrocher les murs.
        for (const [a, b] of links) tunnel(centers[a], centers[b], (a + b) % 2 === 0, 5);
        // Une galerie secondaire en cul-de-sac donne une vraie branche ? explorer.
        tunnel({ x: 72, y: 22 }, { x: 78, y: 30 }, true, 5);

        // Regroupe les cases de roche par rang?e pour collision et dessin des parois.
        this.walls = [];
        for (let y = 0; y < this.mapRows; y++) {
            let x = 0;
            while (x < this.mapCols) {
                if (this.cave[y][x]) { x++; continue; }
                const start = x;
                while (x < this.mapCols && !this.cave[y][x]) x++;
                this.walls.push({ x: start * this.tileSize, y: y * this.tileSize,
                    w: (x - start) * this.tileSize, h: this.tileSize });
            }
        }
        const pos = c => ({ x: c.x * this.tileSize + this.tileSize / 2, y: c.y * this.tileSize + this.tileSize / 2 });
        this.roomCenters = centers.map(pos);
        this.deliveryZone = { x: this.roomCenters[0].x - 54, y: this.roomCenters[0].y - 46, w: 108, h: 92 };
        this.spawnPoints = Array.from({ length: centers.length - 1 }, (_, i) => pos(centers[i + 1]));
        // Étaiements placés sur les galeries principales, jusque dans les niveaux profonds.
        this.mineSupports = [
            { x: 360, y: 520 }, { x: 520, y: 700 }, { x: 880, y: 420 },
            { x: 880, y: 780 }, { x: 1120, y: 1040 }, { x: 660, y: 1400 },
            { x: 900, y: 1440 }, { x: 1650, y: 1400 }
        ];
        this.mineTorches = this.mineSupports.map(s => ({ x: s.x + 18, y: s.y - 28 }));
        this.minePool = { x: this.roomCenters[8].x + 45, y: this.roomCenters[8].y + 45 };
        this.supplyCaches = [11, 13, 16].map((i, index) => ({
            x: this.roomCenters[i].x, y: this.roomCenters[i].y, taken: false,
            kind: index === 1 ? 'heart' : 'coolant'
        }));
        this.gasVents = [12, 14, 17].map((i, index) => ({
            x: this.roomCenters[i].x + (index - 1) * 52, y: this.roomCenters[i].y + 105,
            phase: index * 1.35
        }));
        // Les tr?sors et le personnage restent dans des salles, jamais dans la roche.
        this.player.x = this.roomCenters[0].x - this.player.w / 2;
        this.player.y = this.roomCenters[0].y - this.player.h / 2;
    }

    /** D?pose les trouvailles dans les salles du r?seau. */
    spawnTreasures() {
        const spots = [1, 2, 4, 6, 8, 12, 14, 17].map(i => this.roomCenters[i]);
        const types = ['classic', 'golden', 'sack', 'fries', 'chips', 'golden', 'fries', 'chips'];
        this.treasures = spots.map((p, i) => ({
            x: p.x - 30, y: p.y - 30, size: 60, type: types[i],
            points: TREASURE_TYPES[types[i]].points, color: TREASURE_TYPES[types[i]].color,
            taken: false, bob: i * 0.7
        }));
    }

    createEnemy(kind, x, y) {
        // Patate corrompue : lente et résistante
        // Champignon mutant : rapide et fragile
        const stats = kind === 'corrupted'
            ? { w: 42, h: 46, hp: 40, speed: 66, points: 15 }
            : kind === 'guard'
                ? { w: 54, h: 60, hp: 190, speed: 88, points: 60 }
                : { w: 34, h: 38, hp: 18, speed: 112, points: 20 };

        return {
            kind: kind, x: x, y: y,
            w: stats.w, h: stats.h,
            hp: stats.hp, maxHp: stats.hp,
            speed: stats.speed,
            points: stats.points,
            slow: 0, flash: 0
        };
    }

    createBoss() {
        const lair = this.bossArena ? { x: this.bossArena.x + this.bossArena.w / 2, y: this.bossArena.y + this.bossArena.h / 2 } : { x: -1000, y: -1000 };
        return {
            x: lair.x - 58, y: lair.y - 52,
            w: 116, h: 104,
            hp: 520, maxHp: 520,
            speed: 96,
            mode: 'chase',     // chase -> telegraph -> dash
            timer: 1.7,
            dx: 0, dy: 1,
            attackIndex: 0,
            flash: 0,
            defeated: false
        };
    }

    spawnInitialEnemies() {
        const p = this.player;
        const sorted = this.spawnPoints.slice(0, 10).sort((a, b) =>
            dist(b.x, b.y, p.x, p.y) - dist(a.x, a.y, p.x, p.y));
        for (let i = 0; i < 4; i++) {
            this.enemies.push(this.createEnemy(i % 2 === 0 ? 'corrupted' : 'mushroom', sorted[i].x, sorted[i].y));
        }
        this.discover('mushroom');
    }

    spawnEnemy() {
        if (this.bossArenaActive || this.enemies.length >= GAME_CONFIG.ENEMY_MAX) return;
        const p = this.player;
        let best = this.spawnPoints[0];
        let bestDist = -1;
        const local = this.spawnPoints.map(sp => ({ sp, d: dist(sp.x, sp.y, p.x + p.w / 2, p.y + p.h / 2) }))
            .filter(item => item.d >= 430 && item.d <= 1050);
        const candidates = local.length ? local : this.spawnPoints.slice(0, 10)
            .map(sp => ({ sp, d: dist(sp.x, sp.y, p.x + p.w / 2, p.y + p.h / 2) }));
        for (const item of candidates) {
            const sp = item.sp;
            const d = item.d;
            if (d > bestDist) { bestDist = d; best = sp; }
        }
        const kind = Math.random() < 0.5 ? 'corrupted' : 'mushroom';
        this.enemies.push(this.createEnemy(kind, best.x, best.y));
    }

    /** Obstacles mobiles (mécanique n°9) : trajectoires prévisibles */
    spawnObstacles() {
        const c = this.roomCenters;
        this.obstacles = [
            { x: c[2].x + 90, y: c[2].y + 20, r: 18, vx: 42, vy: 0, kind: 'rock' },
            { x: c[4].x - 90, y: c[4].y - 20, r: 18, vx: 0, vy: -38, kind: 'rock' },
            { x: c[8].x + 80, y: c[8].y - 20, r: 18, vx: 0, vy: 32, kind: 'rock' },
            { x: c[3].x - 40, y: c[3].y + 50, w: 36, h: 24, dir: 1, speed: 48, kind: 'spike' },
            { x: c[6].x + 20, y: c[6].y - 50, w: 36, h: 24, dir: -1, speed: 42, kind: 'spike' },
            { x: c[9].x + 20, y: c[9].y + 20, w: 36, h: 24, dir: 1, speed: 36, kind: 'spike' }
        ];
    }

    /* Collisions v?rifi?es directement sur la grille de roche. */
    moveWithWalls(e, dx, dy) {
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
        const sx = dx / steps, sy = dy / steps;
        for (let i = 0; i < steps; i++) {
            e.x += sx; if (this.boxHitsWall(e)) e.x -= sx;
            e.y += sy; if (this.boxHitsWall(e)) e.y -= sy;
        }
    }

    pointInWall(x, y) {
        const col = Math.floor(x / this.tileSize), row = Math.floor(y / this.tileSize);
        return !this.cave[row] || !this.cave[row][col];
    }

    hasLineOfSight(x1, y1, x2, y2) {
        const steps = Math.ceil(dist(x1, y1, x2, y2) / 12);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            if (this.pointInWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
        }
        return true;
    }

    boxHitsWall(box) {
        const left = Math.floor(box.x / this.tileSize), right = Math.floor((box.x + box.w - 1) / this.tileSize);
        const top = Math.floor(box.y / this.tileSize), bottom = Math.floor((box.y + box.h - 1) / this.tileSize);
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            if (!this.cave[y] || !this.cave[y][x]) return true;
        }
        return false;
    }

    obstacleRect(ob) {
        if (ob.kind === 'rock') return { x: ob.x - ob.r, y: ob.y - ob.r, w: ob.r * 2, h: ob.r * 2 };
        return { x: ob.x, y: ob.y, w: ob.w, h: ob.h };
    }

    /* ---------- 4. Entrées clavier / souris ---------- */
    isDown(letter) { return this.keys['key:' + letter] === true; }

    onKeyDown(e) {
        const k = (e.key || '').toLowerCase();

        // Empêche le défilement de la page
        if (['w', 'a', 's', 'd', 'e', 'l', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) !== -1) {
            e.preventDefault();
        }

        // Déplacement : on accepte W A S D et les flèches
        if (k === 'w' || e.code === 'KeyW' || e.code === 'ArrowUp') this.keys['key:w'] = true;
        if (k === 'a' || e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys['key:a'] = true;
        if (k === 's' || e.code === 'KeyS' || e.code === 'ArrowDown') this.keys['key:s'] = true;
        if (k === 'd' || e.code === 'KeyD' || e.code === 'ArrowRight') this.keys['key:d'] = true;

        if (e.repeat) return;
        if ((e.code === 'Space' || k === 'shift') && this.state === GAME_STATE.PLAYING) this.tryDash();

        if (k === 'e' || e.code === 'KeyE') {
            if (this.state === GAME_STATE.PLAYING) {
                if (this.nearBossGate()) this.useBossGate();
                else this.switchWeapon();
            }
        }
        if (k === 'l' || e.code === 'KeyL') {
            if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.LOGBOOK) this.toggleLogbook();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            if (this.state === GAME_STATE.LOGBOOK) this.closeLogbook();
            else if (this.state === GAME_STATE.HOUSE && this.hubShopOpen) this.closeHubShop();
            else if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSE) this.togglePause();
        }
    }

    onKeyUp(e) {
        const k = (e.key || '').toLowerCase();
        if (k === 'w' || e.code === 'KeyW' || e.code === 'ArrowUp') this.keys['key:w'] = false;
        if (k === 'a' || e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys['key:a'] = false;
        if (k === 's' || e.code === 'KeyS' || e.code === 'ArrowDown') this.keys['key:s'] = false;
        if (k === 'd' || e.code === 'KeyD' || e.code === 'ArrowRight') this.keys['key:d'] = false;
    }

    onMouseDown(e) {
        if (e.button === 0) { this.firing = true; this.updateMouse(e); }
    }

    onMouseUp(e) {
        if (e.button === 0) this.firing = false;
    }

    onMouseMove(e) { this.updateMouse(e); }

    /** Convertit la position souris (écran) en coordonnées du monde */
    updateMouse(e) {
        const canvas = this.dom['game-canvas'];
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        this.mouse.x = (e.clientX - rect.left) * (GAME_CONFIG.VIEW_W / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (GAME_CONFIG.VIEW_H / rect.height);
    }

    /* ---------- 5. Mise à jour du jeu ---------- */
    update(dt) {
        // Garde-fou : la logique ne tourne qu'en partie
        if (this.state !== GAME_STATE.PLAYING) return;

        this.elapsed += dt;

        /* --- Chronomètre (mécanique n°14) --- */
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.updateHUD();
            this.endGame(false, 'Le temps est écoulé ! La mine s\u2019est refermée\u2026');
            return;
        }

        /* --- Message temporaire --- */
        if (this.toastTime > 0) {
            this.toastTime -= dt;
            if (this.toastTime <= 0) this.dom['toast'].classList.add('hidden');
        }

        /* --- Joueur --- */
        this.updatePlayer(dt);
        const district = this.currentDistrict();
        if (district.id !== this.lastDistrictId) {
            this.lastDistrictId = district.id;
            this.toast(district.id === 4
                ? 'Galeries de cristal : attention, les évents brillent avant d’exploser !'
                : 'Nouvelle zone : ' + district.name + ' !', district.id === 4);
        }
        this.updateHazards();

        /* --- Tir + surchauffe --- */
        this.updateShooting(dt);

        /* --- Entités --- */
        this.updateEnemies(dt);
        this.updateBoss(dt);
        this.updateProjectiles(dt);
        this.updateObstacles(dt);
        this.updatePickups();
        this.updateParticles(dt);

        /* --- Apparition d'ennemis --- */
        this.enemyTimer -= dt;
        if (this.enemyTimer <= 0) {
            this.spawnEnemy();
            this.enemyTimer = GAME_CONFIG.ENEMY_SPAWN_INTERVAL;
        }

        /* --- Caméra + découverte --- */
        this.updateCamera(false);
        this.updateDiscovery();

        /* --- Conditions de fin --- */
        if (this.lives <= 0) {
            this.endGame(false, 'Tes 3 vies sont épuisées\u2026');
            return;
        }
        if (this.missionReady() && this.playerInDeliveryZone()) {
            this.endGame(true, '');
            return;
        }

        this.updateHUD();
    }

    nearBossGate() {
        if (!this.bossArenaActive) {
            const gate = this.roomCenters[10];
            return dist(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, gate.x, gate.y) < 105;
        }
        const exit = { x: this.bossArena.x + 52, y: this.bossArena.y + this.bossArena.h / 2 };
        const throneDoor = { x: this.bossArena.x + 515, y: this.bossArena.y + this.bossArena.h / 2 };
        const px = this.player.x + this.player.w / 2, py = this.player.y + this.player.h / 2;
        return dist(px, py, exit.x, exit.y) < 105 ||
            (this.bossPhase === 'guards' && dist(px, py, throneDoor.x, throneDoor.y) < 105);
    }

    useBossGate() {
        if (this.bossArenaActive && dist(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2,
            this.bossArena.x + 52, this.bossArena.y + this.bossArena.h / 2) < 105) {
            this.bossArenaActive = false;
            if (this.bossReturn) { this.player.x = this.bossReturn.x; this.player.y = this.bossReturn.y; }
            this.updateCamera(true);
            this.toast('Tu as quitté le royaume. Reviens quand tu seras prêt !', false);
            return;
        }
        if (this.bossArenaActive && this.bossPhase === 'guards') {
            const guardsLeft = this.enemies.filter(e => e.kind === 'guard').length;
            if (guardsLeft) {
                this.toast('La porte royale est scellée : élimine les deux gardes patate !', true);
                return;
            }
            this.bossPhase = 'boss';
            this.boss.x = this.bossArena.x + 825;
            this.boss.y = this.bossArena.y + this.bossArena.h / 2 - this.boss.h / 2;
            this.boss.hp = this.boss.maxHp;
            this.boss.defeated = false;
            this.boss.mode = 'chase'; this.boss.timer = 1.2; this.boss.attackIndex = 0;
            this.bossShots = [];
            this.player.x = this.bossArena.x + 650;
            this.player.y = this.bossArena.y + this.bossArena.h / 2 - this.player.h / 2;
            this.updateCamera(true);
            this.toast('Les gardes tombent ! Le Roi surgit du trône. Les colonnes dorées bloquent sa salve : cache-toi derrière elles !', true);
            return;
        }
        if (this.bossArenaActive && this.bossPhase === 'boss') return;
        if (this.collected < GAME_CONFIG.TREASURES_NEEDED) {
            this.toast('Le panneau dit : « Apporte 8 trésors pour ouvrir le sanctuaire ! »', true);
            return;
        }
        this.bossReturn = { x: this.player.x, y: this.player.y };
        this.player.x = this.bossArena.x + 52;
        this.player.y = this.bossArena.y + this.bossArena.h / 2 - this.player.h / 2;
        this.bossArenaActive = true;
        if (this.bossPhase === 'locked') this.bossPhase = 'guards';
        if (this.bossPhase === 'guards' && !this.bossGuardsSummoned) {
            this.enemies.push(this.createEnemy('guard', this.bossArena.x + 300, this.bossArena.y + this.bossArena.h / 2 - 180));
            this.enemies.push(this.createEnemy('guard', this.bossArena.x + 410, this.bossArena.y + this.bossArena.h / 2 + 145));
            this.bossGuardsSummoned = true;
        }
        this.bossShots = [];
        this.updateCamera(true);
        this.toast('Le royaume du Roi Purée ! Bats ses deux gardes, puis franchis la porte du trône.', true);
    }

    /** Caméra fluide qui suit le joueur, bornée sur la carte */
    updateCamera(snap) {
        const p = this.player;
        const cam = this.cam;
        const targetX = p.x + p.w / 2 - cam.w / 2;
        const targetY = p.y + p.h / 2 - cam.h / 2;

        const maxX = GAME_CONFIG.WORLD_W - cam.w;
        const maxY = GAME_CONFIG.WORLD_H - cam.h;

        if (snap) {
            cam.x = clamp(targetX, 0, maxX);
            cam.y = clamp(targetY, 0, maxY);
        } else {
            cam.x += (targetX - cam.x) * 0.12;
            cam.y += (targetY - cam.y) * 0.12;
            cam.x = clamp(cam.x, 0, maxX);
            cam.y = clamp(cam.y, 0, maxY);
        }
    }

    /** District ("niveau") dans lequel se trouve le joueur */
    currentDistrict() {
        const cy = this.player.y + this.player.h / 2;
        for (const d of DISTRICTS) {
            if (cy >= d.yMin && cy < d.yMax) return d;
        }
        return DISTRICTS[DISTRICTS.length - 1];
    }

    updatePlayer(dt) {
        const p = this.player;
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.dashTimer = Math.max(0, this.dashTimer - dt);
        let vx = 0, vy = 0;

        if (this.isDown('w')) vy -= 1;
        if (this.isDown('s')) vy += 1;
        if (this.isDown('a')) vx -= 1;
        if (this.isDown('d')) vx += 1;

        // Normalisation : diagonale = même vitesse
        const len = Math.hypot(vx, vy);
        if (this.dashTimer > 0) {
            this.moveWithWalls(p, this.dashDX * 690 * dt, this.dashDY * 690 * dt);
        } else if (len > 0) {
            vx /= len; vy /= len;
            this.moveWithWalls(p, vx * this.playerSpeed * dt, vy * this.playerSpeed * dt);
            if (this.bossArenaActive && this.bossPhase === 'guards' && this.enemies.some(e => e.kind === 'guard')) {
                p.x = Math.min(p.x, this.bossArena.x + 500);
            }
            p.x = clamp(p.x, 44, GAME_CONFIG.WORLD_W - p.w - 44);
            p.y = clamp(p.y, 44, GAME_CONFIG.WORLD_H - p.h - 48);
        }

        // Visée vers la souris (coordonnées monde)
        const worldMouse = { x: this.cam.x + this.mouse.x, y: this.cam.y + this.mouse.y };
        p.angle = Math.atan2(worldMouse.y - (p.y + p.h / 2), worldMouse.x - (p.x + p.w / 2));

        if (p.invuln > 0) p.invuln -= dt;
        if (this.hurtFlash > 0) this.hurtFlash -= dt;
        if (this.lifeHurt > 0) this.lifeHurt -= dt;

        // Dégâts des obstacles mobiles
        if (p.invuln <= 0) {
            for (const ob of this.obstacles) {
                if (rectsOverlap(p, this.obstacleRect(ob))) { this.hurtPlayer(); break; }
            }
        }
    }

    hurtPlayer() {
        const p = this.player;
        if (p.invuln > 0 || this.dashTimer > 0) return;

        this.lives -= 1;
        p.invuln = GAME_CONFIG.INVULN_TIME;
        this.hurtFlash = 0.35;
        this.lifeHurt = 0.35;

        this.burst(p.x + p.w / 2, p.y + p.h / 2, '#e04b4b', 12);
        if (this.lives > 0) this.toast('Aïe ! Il te reste ' + this.lives + ' vie(s)\u2026', true);
    }

    tryDash() {
        if (this.dashCooldown > 0 || this.dashTimer > 0) return;
        let dx = (this.isDown('d') ? 1 : 0) - (this.isDown('a') ? 1 : 0);
        let dy = (this.isDown('s') ? 1 : 0) - (this.isDown('w') ? 1 : 0);
        if (!dx && !dy) { dx = Math.cos(this.player.angle); dy = Math.sin(this.player.angle); }
        const length = Math.hypot(dx, dy) || 1;
        this.dashDX = dx / length; this.dashDY = dy / length;
        this.dashTimer = 0.19;
        this.dashCooldown = 1.25;
        this.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, '#a8f5ff', 8);
    }

    updateHazards() {
        const p = this.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        for (const vent of this.gasVents) {
            const cycle = (this.elapsed + vent.phase) % 4.6;
            vent.warning = cycle >= 2.9 && cycle < 3.65;
            vent.active = cycle >= 3.65;
            if (vent.active && dist(cx, cy, vent.x, vent.y) < 76) this.hurtPlayer();
        }
    }

    /* ---------- 6. Armes & surchauffe (mécanique personnelle) ----------
       Chaque tir ajoute de la chaleur. À 100 % l'arme SURCHAUFFE :
       plus aucun projectile n'est créé, jusqu'à ce qu'elle refroidisse
       sous le seuil de 25 %.                              ---------- */
    updateShooting(dt) {
        const weapon = WEAPONS[this.weaponId];
        const H = GAME_CONFIG.HEAT;

        if (this.overheated) {
            this.heat -= H.COOL_OVERHEAT * dt;
            if (this.heat <= H.RELOCK_AT) {
                this.heat = H.RELOCK_AT;
                this.overheated = false;
                this.toast(weapon.name + ' est rechargée !', false);
            }
        } else {
            this.heat -= (this.firing ? H.COOL_FIRING : H.COOL_IDLE) * dt;
            if (this.heat < 0) this.heat = 0;
        }

        this.shootTimer -= dt;
        if (this.firing && !this.overheated && this.shootTimer <= 0) {
            this.shootTimer = weapon.cooldown;
            this.fire(weapon);
            this.heat += weapon.heat;

            if (this.heat >= H.MAX) {
                this.heat = H.MAX;
                this.overheated = true;
                this.toast('\u{1F525} ' + weapon.name + ' SURCHAUFFÉE ! Attends le refroidissement\u2026', true);
            }
        }
    }

    fire(weapon) {
        const p = this.player;
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2, a = p.angle;

        this.projectiles.push({
            x: cx + Math.cos(a) * 26,
            y: cy + Math.sin(a) * 26,
            vx: Math.cos(a) * weapon.speed,
            vy: Math.sin(a) * weapon.speed,
            r: weapon.cooldown > 0.2 ? 9 : 7,
            damage: weapon.damage,
            splash: weapon.splash || 0,
            splashRadius: weapon.splashRadius || 0,
            slow: weapon.slow || 0,
            color: weapon.color,
            type: this.weaponId
        });

        // Petit effet de recul
        this.particles.push({
            x: cx + Math.cos(a) * 22, y: cy + Math.sin(a) * 22,
            vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 80,
            life: 0.15, max: 0.15, size: 5, color: '#ffe9b0'
        });
    }

    /** Change d'arme (touche E) — uniquement parmi celles débloquées */
    switchWeapon() {
        const list = Object.keys(WEAPONS).filter(id => this.unlocked[id]);
        const idx = list.indexOf(this.weaponId);
        this.weaponId = list[(idx + 1) % list.length];
        this.toast('Arme : ' + WEAPONS[this.weaponId].name, false);
    }

    checkUnlocks() {
        for (const id of Object.keys(WEAPONS)) {
            const w = WEAPONS[id];
            if (!this.unlocked[id] && this.collected >= w.unlockAt) {
                this.unlocked[id] = true;
                this.toast('\u{1F52B} ' + w.name + ' débloquée ! (touche E)', false);
            }
        }
    }

    /* ---------- 7. Ennemis ---------- */
    updateEnemies(dt) {
        const p = this.player;
        const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;

            // Les monstres ne rep�rent pas la patate � travers les parois.
            if (!this.hasLineOfSight(ecx, ecy, pcx, pcy)) {
                if (e.slow > 0) e.slow = Math.max(0, e.slow - dt);
                if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
                continue;
            }

            let dx = pcx - ecx, dy = pcy - ecy;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                dx /= len; dy /= len;
                const factor = e.slow > 0 ? 0.45 : 1;
                // Les ennemis sont bloqués par les murs : impossible de
                // blesser le joueur "à travers" une paroi.
                this.moveWithWalls(e, dx * e.speed * factor * dt, dy * e.speed * factor * dt);
                if (e.kind === 'guard' && this.bossArenaActive && this.bossPhase === 'guards') {
                    e.x = Math.min(e.x, this.bossArena.x + 500);
                }
            }

            if (e.slow > 0) e.slow -= dt;
            if (e.flash > 0) e.flash -= dt;

            if (rectsOverlap(p, e)) this.hurtPlayer();
        }
    }

    /* ---------- Boss : "Le Roi Purée" ---------- */
    updateBoss(dt) {
        const b = this.boss;
        if (!b || b.defeated || !this.bossArenaActive || this.bossPhase !== 'boss') return;

        const p = this.player;
        const bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
        const playerVisible = this.hasLineOfSight(bcx, bcy, p.x + p.w / 2, p.y + p.h / 2);
        b.timer -= dt;
        if (b.flash > 0) b.flash -= dt;
        if (b.mode === 'chase' && playerVisible) {
            let dx = (p.x + p.w / 2) - bcx, dy = (p.y + p.h / 2) - bcy;
            const len = Math.hypot(dx, dy) || 1;
            this.moveWithWalls(b, dx / len * b.speed * dt, dy / len * b.speed * dt);
            if (b.timer <= 0) {
                const attack = b.attackIndex++ % 3;
                b.dx = dx / len; b.dy = dy / len;
                if (attack === 0) {
                    b.mode = 'telegraph'; b.timer = 0.68;
                    this.toast('⚠ Le Roi Purée prépare sa charge ! Sors de la ligne rouge !', true);
                } else if (attack === 1) {
                    b.mode = 'volley_telegraph'; b.timer = 0.85;
                    this.toast('Il lève son sceptre ! Cache-toi derrière une colonne ou écarte-toi de la salve !', true);
                } else {
                    b.mode = 'stomp_telegraph'; b.timer = 0.9;
                    b.pulseX = p.x + p.w / 2; b.pulseY = p.y + p.h / 2;
                    this.toast('⚠ Le Roi frappe le sol ! Fuis le cercle doré !', true);
                }
            }
        } else if (b.mode === 'telegraph') {
            if (playerVisible) {
                const dx = p.x + p.w / 2 - bcx, dy = p.y + p.h / 2 - bcy, len = Math.hypot(dx, dy) || 1;
                b.dx = dx / len; b.dy = dy / len;
            }
            if (b.timer <= 0) { b.mode = 'dash'; b.timer = 0.48; }
        } else if (b.mode === 'dash') {
            this.moveWithWalls(b, b.dx * 610 * dt, b.dy * 610 * dt);
            if (rectsOverlap(p, b)) this.hurtPlayer();
            if (b.timer <= 0) { b.mode = 'chase'; b.timer = 0.82; }
        } else if (b.mode === 'volley_telegraph') {
            if (b.timer <= 0) {
                const base = Math.atan2(b.dy, b.dx);
                for (let i = -3; i <= 3; i++) {
                    const a = base + i * 0.16;
                    this.bossShots.push({ x: bcx, y: bcy, vx: Math.cos(a) * 290, vy: Math.sin(a) * 290, life: 2.2 });
                }
                b.mode = 'volley'; b.timer = 1.15;
            }
        } else if (b.mode === 'volley') {
            if (b.timer <= 0) { b.mode = 'chase'; b.timer = 0.65; }
        } else if (b.mode === 'stomp_telegraph') {
            if (b.timer <= 0) {
                this.bossPulse = { x: b.pulseX, y: b.pulseY, radius: 18, life: 0.85, hit: false };
                b.mode = 'stomp'; b.timer = 0.85;
            }
        } else if (b.mode === 'stomp') {
            if (this.bossPulse) {
                this.bossPulse.radius += 390 * dt;
                this.bossPulse.life -= dt;
                const d = dist(p.x + p.w / 2, p.y + p.h / 2, this.bossPulse.x, this.bossPulse.y);
                if (!this.bossPulse.hit && Math.abs(d - this.bossPulse.radius) < 28) {
                    this.bossPulse.hit = true; this.hurtPlayer();
                }
                if (this.bossPulse.life <= 0) this.bossPulse = null;
            }
            if (b.timer <= 0) { b.mode = 'chase'; b.timer = 0.65; }
        }

        for (let i = this.bossShots.length - 1; i >= 0; i--) {
            const shot = this.bossShots[i];
            shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
            if (dist(p.x + p.w / 2, p.y + p.h / 2, shot.x, shot.y) < 22) {
                this.hurtPlayer(); shot.life = 0;
            }
            if (shot.life <= 0 || this.pointInWall(shot.x, shot.y)) this.bossShots.splice(i, 1);
        }
    }

    damageBoss(amount) {
        const b = this.boss;
        if (!b || b.defeated || !this.bossArenaActive || this.bossPhase !== 'boss') return false;

        b.hp -= amount;
        b.flash = 0.12;
        this.discover('boss');

        if (b.hp <= 0) {
            b.hp = 0;
            b.defeated = true;
            this.bossPhase = 'cleared';
            this.bossShots = [];
            this.bossPulse = null;
            this.score += 150;
            this.kills++;
            this.burst(b.x + b.w / 2, b.y + b.h / 2, '#ffd700', 45);
            this.burst(b.x + b.w / 2, b.y + b.h / 2, '#e04b4b', 25);

            // La Muscade secrète de Mamie tombe là où le boss est vaincu
            this.treasures.push({
                x: b.x + b.w / 2 - 32, y: b.y + b.h / 2 - 32,
                size: 64, type: 'special',
                points: TREASURE_TYPES.special.points,
                color: TREASURE_TYPES.special.color,
                taken: false, bob: 0, special: true
            });

            this.toast('Le Roi est vaincu ! Récupère la muscade secrète de Mamie : sa pincée rend sa purée inoubliable !', false);
            return true;
        }
        return false;
    }

    /* ---------- Projectiles ---------- */
    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            const steps = 2;   // on avance par petits pas (pas de traversée de mur)
            let destroyed = false;

            for (let s = 0; s < steps && !destroyed; s++) {
                pr.x += (pr.vx * dt) / steps;
                pr.y += (pr.vy * dt) / steps;

                if (pr.x < 0 || pr.y < 0 || pr.x > GAME_CONFIG.WORLD_W || pr.y > GAME_CONFIG.WORLD_H ||
                    this.pointInWall(pr.x, pr.y)) {
                    if (pr.splash > 0) this.explode(pr.x, pr.y, pr.splash, pr.splashRadius);
                    destroyed = true;
                    break;
                }

                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    if (dist(pr.x, pr.y, e.x + e.w / 2, e.y + e.h / 2) < pr.r + e.w / 2) {
                        if (pr.splash > 0) {
                            this.explode(pr.x, pr.y, pr.splash, pr.splashRadius);
                        } else {
                            e.hp -= pr.damage;
                            e.flash = 0.12;
                            if (pr.slow > 0) e.slow = pr.slow;
                            if (e.hp <= 0) this.killEnemy(j);
                        }
                        destroyed = true;
                        break;
                    }
                }
                if (destroyed) break;

                const b = this.boss;
                if (b && !b.defeated && this.bossPhase === 'boss' &&
                    dist(pr.x, pr.y, b.x + b.w / 2, b.y + b.h / 2) < pr.r + b.w / 2) {
                    if (pr.splash > 0) this.explode(pr.x, pr.y, pr.splash, pr.splashRadius);
                    else this.damageBoss(pr.damage);
                    destroyed = true;
                }
            }

            if (destroyed) this.projectiles.splice(i, 1);
        }
    }

    /** Explosion de la Frite-roquette : plusieurs monstres d'un coup */
    explode(x, y, damage, radius) {
        this.burst(x, y, '#ffcc33', 26);
        this.burst(x, y, '#ff6b35', 14);

        for (let j = this.enemies.length - 1; j >= 0; j--) {
            const e = this.enemies[j];
            if (dist(x, y, e.x + e.w / 2, e.y + e.h / 2) < radius) {
                e.hp -= damage;
                e.flash = 0.12;
                if (e.hp <= 0) this.killEnemy(j);
            }
        }
        if (this.boss && dist(x, y, this.boss.x + this.boss.w / 2, this.boss.y + this.boss.h / 2) < radius) {
            this.damageBoss(damage);
        }
    }

    killEnemy(index) {
        const e = this.enemies[index];
        this.score += e.points;
        this.kills++;
        this.burst(e.x + e.w / 2, e.y + e.h / 2, e.kind === 'guard' ? '#e5bd57' : (e.kind === 'corrupted' ? '#a35a1e' : '#9acd32'), 24);
        this.floaters.push({
            x: e.x + e.w / 2, y: e.y, life: 0.85,
            text: '+' + e.points, color: '#ffd700'
        });
        this.enemies.splice(index, 1);
    }

    /* ---------- Obstacles mobiles (mécanique n°9) ---------- */
    updateObstacles(dt) {
        for (const ob of this.obstacles) {
            if (ob.kind === 'rock') {
                const nextX = ob.x + ob.vx * dt;
                const boxX = { x: nextX - ob.r, y: ob.y - ob.r, w: ob.r * 2, h: ob.r * 2 };
                if (this.boxHitsWall(boxX) || nextX < ob.r || nextX > GAME_CONFIG.WORLD_W - ob.r) {
                    ob.vx = -ob.vx;
                } else {
                    ob.x = nextX;
                }
                const nextY = ob.y + ob.vy * dt;
                const boxY = { x: ob.x - ob.r, y: nextY - ob.r, w: ob.r * 2, h: ob.r * 2 };
                if (this.boxHitsWall(boxY) || nextY < ob.r || nextY > GAME_CONFIG.WORLD_H - ob.r) {
                    ob.vy = -ob.vy;
                } else {
                    ob.y = nextY;
                }
            } else {
                const nextX = ob.x + ob.dir * ob.speed * dt;
                const box = { x: nextX, y: ob.y, w: ob.w, h: ob.h };
                if (this.boxHitsWall(box) || nextX < 24 || nextX + ob.w > GAME_CONFIG.WORLD_W - 24) {
                    ob.dir = -ob.dir;
                } else {
                    ob.x = nextX;
                }
            }
        }
    }

    /* ---------- 8. Trésors, score ---------- */
    updatePickups() {
        const p = this.player;
        const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

        for (const cache of this.supplyCaches) {
            if (cache.taken || dist(pcx, pcy, cache.x, cache.y) > 38) continue;
            cache.taken = true;
            if (cache.kind === 'heart') {
                this.lives = Math.min(this.maxLives, this.lives + 1);
                this.toast('Trousse de secours : une vie récupérée !', false);
            } else {
                this.heat = Math.max(0, this.heat - 55);
                this.overheated = false;
                this.toast('Réserve de refroidissement : ton arme est rechargée !', false);
            }
            this.burst(cache.x, cache.y, cache.kind === 'heart' ? '#ff7182' : '#75e9ff', 16);
        }

        for (const t of this.treasures) {
            if (t.taken) continue;
            if (dist(pcx, pcy, t.x + t.size / 2, t.y + t.size / 2) > t.size / 2 + 26) continue;

            t.taken = true;
            this.score += t.points;
            this.burst(t.x + t.size / 2, t.y + t.size / 2, t.color, 18);
            this.floaters.push({
                x: t.x + t.size / 2, y: t.y, life: 0.9,
                text: '+' + t.points, color: t.color
            });

            if (t.type === 'special') {
                this.hasSpecial = true;
                this.toast('Muscade secrète récupérée ! Mamie l’ajoute à sa purée pour la rendre inoubliable !', false);
            } else {
                this.collected++;
                this.checkUnlocks();
            }
        }
    }

    /* ---------- Particules ---------- */
    burst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = rand(40, 170);
            this.particles.push({
                x: x, y: y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: rand(0.28, 0.65), max: 0.65,
                size: rand(2.5, 5.5), color: color
            });
        }
    }

    updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pa = this.particles[i];
            pa.x += pa.vx * dt;
            pa.y += pa.vy * dt;
            pa.vx *= 0.92; pa.vy *= 0.92;
            pa.life -= dt;
            if (pa.life <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            const fl = this.floaters[i];
            fl.y -= 38 * dt;
            fl.life -= dt;
            if (fl.life <= 0) this.floaters.splice(i, 1);
        }
    }

    /* ---------- Mission ---------- */
    missionReady() {
        return this.collected >= GAME_CONFIG.TREASURES_NEEDED && this.hasSpecial;
    }

    playerInDeliveryZone() {
        const z = this.deliveryZone;
        const cx = this.player.x + this.player.w / 2;
        const cy = this.player.y + this.player.h / 2;
        return cx > z.x && cx < z.x + z.w && cy > z.y - 12 && cy < z.y + z.h;
    }

    endGame(won, reason) {
        this.stopLoop();
        this.dom['logbook-overlay'].classList.add('hidden');

        if (won) {
            this.delivered = this.collected;
            this.dom['final-score-win'].textContent = this.score;
            this.dom['win-delivered'].textContent = this.delivered;
            this.dom['win-time'].textContent = Math.ceil(this.timeLeft);
            const reward = 25 + this.collected * 5 + Math.ceil(this.timeLeft / 4);
            this.coins += reward; this.missions++;
            localStorage.setItem('potatoRushCoins', this.coins);
            localStorage.setItem('potatoRushMissions', this.missions);
            this.showHouse('Expédition réussie ! Mamie te donne ' + reward + ' pièces pour tes trouvailles.');
        } else {
            this.dom['final-score-lose'].textContent = this.score;
            this.dom['lose-collected'].textContent = this.collected;
            this.dom['lose-special'].textContent = this.hasSpecial ? 'oui ✅' : 'non ❌';
            this.dom['lose-level'].textContent = this.maxLevel;
            this.dom['lose-reason'].textContent = reason;
            const reward = Math.max(8, this.collected * 3 + Math.floor(this.score / 20));
            this.coins += reward; this.missions++;
            localStorage.setItem('potatoRushCoins', this.coins);
            localStorage.setItem('potatoRushMissions', this.missions);
            this.showHouse('Expédition terminée : ' + reason + ' Mamie a gardé ' + reward + ' pièces pour toi.');
        }
    }

    /* ---------- 9. Carnet de bord ---------- */

    /** Marque une entrée du bestiaire comme découverte */
    discover(entryId) {
        if (!this.seen[entryId]) {
            this.seen[entryId] = true;
            if (this.state === GAME_STATE.LOGBOOK) this.renderLogbook();
        }
    }

    /** Découvre les fiches que le joueur rencontre en explorant */
    updateDiscovery() {
        const p = this.player;
        const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;

        for (const e of this.enemies) {
            if (dist(pcx, pcy, e.x + e.w / 2, e.y + e.h / 2) < 340) this.discover(e.kind);
        }
        for (const ob of this.obstacles) {
            const r = this.obstacleRect(ob);
            if (dist(pcx, pcy, r.x + r.w / 2, r.y + r.h / 2) < 300) this.discover(ob.kind);
        }
        if (this.boss && !this.boss.defeated &&
            dist(pcx, pcy, this.boss.x + this.boss.w / 2, this.boss.y + this.boss.h / 2) < 460) {
            this.discover('boss');
        }
        for (const t of this.treasures) {
            if (t.type === 'golden' && !t.taken &&
                dist(pcx, pcy, t.x + t.size / 2, t.y + t.size / 2) < 260) {
                this.discover('golden');
            }
        }
    }

    /** Données du bestiaire */
    bestiaryData() {
        return [
            {
                id: 'corrupted', icon: '🥔', cls: '',
                name: 'Patate corrompue',
                meta: 'PV 40 · Vitesse lente · Points 15',
                desc: 'Une patate rongée par la moisissure verte. Elle est lente mais encaisse beaucoup de coups. Elle te poursuit dès qu\u2019elle te repère.'
            },
            {
                id: 'mushroom', icon: '🍄', cls: '',
                name: 'Champignon mutant',
                meta: 'PV 18 · Vitesse rapide · Points 20',
                desc: 'Né dans l\u2019humidité de la caverne profonde. Fragile mais rapide : il fonce droit sur toi. La purée le ralentit.'
            },
            {
                id: 'rock', icon: '🪨', cls: '',
                name: 'Roc roulant',
                meta: 'Dégât 1 vie · Rebondit sur les murs',
                desc: 'Un rocher qui dévale les galeries en ligne droite. Sa trajectoire est prévisible : il suffit de l\u2019éviter ou de le contourner.'
            },
            {
                id: 'spike', icon: '⛏️', cls: '',
                name: 'Piège à pointes',
                meta: 'Dégât 1 vie · Aller-retour',
                desc: 'Un piège de mineur qui glisse le long des galeries. Il fait des allers-retours réguliers : observe son rythme, puis passe.'
            },
            {
                id: 'boss', icon: '👑', cls: 'boss',
                name: 'Le Roi Purée',
                meta: 'PV 170 · Charge télégraphiée · 150 points',
                desc: 'Gardien de la Muscade secrète de Mamie, au fond du sanctuaire. Il te poursuit lentement puis prépare une charge : une ligne rouge annonce sa direction, esquive !'
            },
            {
                id: 'golden', icon: '⭐', cls: 'legendary',
                name: 'Patate dorée',
                meta: 'Points 25 · Brillante',
                desc: 'Une patate baignée d\u2019or léger qui brille dans le noir. Elle vaut beaucoup plus que les trésors ordinaires : ne la manque pas !'
            }
        ];
    }

    /** Dessine le contenu du carnet selon l'onglet actif */
    renderLogbook() {
        this.syncTabs();
        const box = this.dom['logbook-content'];
        let html = '';

        if (this.logbookTab === 'bestiaire') {
            html += '<div class="logbook-list">';
            for (const b of this.bestiaryData()) {
                const known = this.seen[b.id];
                const tag = known
                    ? '<span class="tag done">Découvert</span>'
                    : '<span class="tag todo">À découvrir</span>';
                html += '<div class="logbook-entry ' + b.cls + '">' +
                    '<div class="icon">' + (known ? b.icon : '❔') + '</div>' +
                    '<div class="info">' +
                    '<div class="name">' + (known ? b.name : '???') + ' ' + tag + '</div>' +
                    '<div class="meta">' + (known ? b.meta : '') + '</div>' +
                    '<div class="desc">' + (known ? b.desc : 'Explore la mine pour identifier cette créature.') + '</div>' +
                    '</div></div>';
            }
            html += '</div>';
            html += '<div class="logbook-note">Astuce : approche-toi d\u2019un monstre ou touche-le pour compléter sa fiche.</div>';
        }

        if (this.logbookTab === 'quetes') {
            const done = (ok) => ok
                ? '<span class="tag done">Terminé</span>'
                : '<span class="tag todo">En cours</span>';
            const locked = (ok) => ok
                ? '<span class="tag done">Disponible</span>'
                : '<span class="tag locked">Verrouillée</span>';

            html += '<div class="logbook-list">';

            html += '<div class="logbook-entry"><div class="icon">🥔</div><div class="info">' +
                '<div class="name">1. Récolter les trésors ' + done(this.collected >= 8) + '</div>' +
                '<div class="meta">' + Math.min(this.collected, 8) + ' / 8</div>' +
                '<div class="desc">Il y a exactement 8 trésors dans la mine. Récupère-les tous pour ouvrir le royaume du Roi Purée.</div>' +
                '</div></div>';

            html += '<div class="logbook-entry"><div class="icon">📜</div><div class="info">' +
                '<div class="name">2. Vaincre le Roi Purée ' + done(this.hasSpecial) + '</div>' +
                '<div class="meta">Royaume secret — Sanctuaire du Roi Purée</div>' +
                '<div class="desc">Au fond de la mine, le boss garde la Muscade secrète de Mamie. Ramasse-la après l\u2019avoir vaincu.</div>' +
                '</div></div>';

            html += '<div class="logbook-entry"><div class="icon">🏠</div><div class="info">' +
                '<div class="name">3. Rentrer voir Mamie Patate ' + done(this.missionReady()) + '</div>' +
                '<div class="meta">Sortie de la mine — en haut de la carte</div>' +
                '<div class="desc">Avec les 8 trésors ET la Muscade secrète de Mamie, retourne dans la zone verte de Mamie Patate avant la fin du temps.</div>' +
                '</div></div>';

            html += '<div class="logbook-entry"><div class="icon">🔫</div><div class="info">' +
                '<div class="name">Frite-roquette ' + locked(this.unlocked.frite) + '</div>' +
                '<div class="meta">Déblocage : 3 trésors</div>' +
                '<div class="desc">' + WEAPONS.frite.desc + '</div>' +
                '</div></div>';

            html += '<div class="logbook-entry"><div class="icon">🥣</div><div class="info">' +
                '<div class="name">Canon à purée ' + locked(this.unlocked.puree) + '</div>' +
                '<div class="meta">Déblocage : 6 trésors</div>' +
                '<div class="desc">' + WEAPONS.puree.desc + '</div>' +
                '</div></div>';

            html += '</div>';
        }

        if (this.logbookTab === 'progression') {
            const pct = (v, max) => Math.min(100, Math.round((v / max) * 100)) + '%';
            html += '<div class="log-progress">';
            html += this.progressRow('Trésors récupérés', Math.min(this.collected, 8) + ' / 8', pct(this.collected, 8), this.collected >= 8);
            html += this.progressRow('Muscade secrète de Mamie', this.hasSpecial ? 'obtenue' : 'à trouver', this.hasSpecial ? 100 : 0, this.hasSpecial);
            html += this.progressRow('District atteint', this.maxLevel + ' / ' + DISTRICTS.length,
                pct(this.maxLevel, DISTRICTS.length), this.maxLevel >= DISTRICTS.length);
            html += this.progressRow('Monstres vaincus', String(this.kills), pct(this.kills, 20), this.kills >= 20);
            html += this.progressRow('Fiches du bestiaire', Object.keys(this.seen).length + ' / 6', pct(Object.keys(this.seen).length, 6), Object.keys(this.seen).length >= 6);
            html += this.progressRow('Temps restant', Math.ceil(this.timeLeft) + ' s', pct(this.timeLeft, 120), false);
            html += this.progressRow('Score', String(this.score), pct(this.score, 400), false);
            html += '</div>';
            html += '<div class="logbook-note">Prochain objectif : ' + this.objectiveText() + '</div>';
        }

        box.innerHTML = html;
    }

    progressRow(label, value, width, done) {
        return '<div class="row' + (done ? ' done' : '') + '">' +
            '<div class="top"><span>' + label + '</span><b>' + value + '</b></div>' +
            '<div class="bar"><div style="width:' + width + '"></div></div></div>';
    }

    /** Phrase d'objectif utilisée par le HUD et le carnet */
    objectiveText() {
        if (this.nearBossGate()) {
            const px = this.player.x + this.player.w / 2, py = this.player.y + this.player.h / 2;
            if (!this.bossArenaActive) {
                if (this.collected >= GAME_CONFIG.TREASURES_NEEDED) return 'Appuie sur E pour entrer dans le royaume et trouver l’ingrédient secret de Mamie.';
                return 'Panneau du royaume : il faut au moins 8 trésors pour chercher l’ingrédient secret de Mamie.';
            }
            const exitX = this.bossArena.x + 52, midY = this.bossArena.y + this.bossArena.h / 2;
            if (dist(px, py, exitX, midY) < 105) return 'Appuie sur E pour quitter le royaume des patates.';
            if (this.bossPhase === 'guards') return this.enemies.some(e => e.kind === 'guard')
                ? 'La porte du trône est scellée : élimine les deux gardes patate !'
                : 'Appuie sur E pour ouvrir la salle du trône et affronter le Roi Purée.';
            return 'Appuie sur E pour quitter le royaume des patates.';
        }
        const d = this.currentDistrict();
        if (this.bossArenaActive && this.bossPhase === 'guards') return this.enemies.some(e => e.kind === 'guard')
            ? 'Bats les deux gardes en armure, puis approche de la porte du trône.'
            : 'Les gardes sont vaincus ! Approche de la grande porte et appuie sur E.';
        if (this.bossArenaActive && this.bossPhase === 'boss') return 'Charge, salve de sceptre et onde de choc ! Bouge sans arrêt et profite de ses pauses.';
        if (this.bossArenaActive && this.bossPhase === 'cleared' && !this.hasSpecial) return 'Ramasse la muscade secrète de Mamie dans la salle du trône !';
        if (this.collected >= GAME_CONFIG.TREASURES_NEEDED && !this.hasSpecial) return '8 trésors réunis : trouve le panneau au fond de la mine pour entrer dans le sanctuaire.';
        if (this.missionReady()) {
            return 'Tout est prêt ! Retourne voir MAMIE PATATE (zone verte en haut de la carte) !';
        }
        if (this.collected >= GAME_CONFIG.TREASURES_NEEDED) {
            return 'District actuel : ' + d.name + '. Va vaincre le ROI PURÉE et prends la Muscade secrète de Mamie !';
        }
        if (this.hasSpecial) {
            return 'District actuel : ' + d.name + '. Encore ' +
                (GAME_CONFIG.TREASURES_NEEDED - this.collected) + ' trésor(s) à rapporter.';
        }
        return 'District actuel : ' + d.name + ' — trouve ' +
            (GAME_CONFIG.TREASURES_NEEDED - this.collected) + ' trésor(s) de plus (sur 8).';
    }

    /* ---------- Interface (HUD) ---------- */
    toast(msg, bad) {
        const el = this.dom['toast'];
        el.textContent = msg;
        el.classList.remove('hidden');
        el.classList.toggle('bad', !!bad);
        this.toastTime = 2.8;
    }

    updateHUD() {
        const d = this.dom;
        const district = this.currentDistrict();
        if (district.id > this.maxLevel) this.maxLevel = district.id;

        d['score-value'].textContent = this.score;
        d['life-value'].textContent = this.lives > 0 ? '❤'.repeat(this.lives) : '—';
        d['life-value'].classList.toggle('hurt', this.lifeHurt > 0);

        d['timer-value'].textContent = Math.ceil(this.timeLeft);
        d['timer-value'].classList.toggle('danger', this.timeLeft <= 15);

        d['treasure-value'].textContent = Math.min(this.collected, GAME_CONFIG.TREASURES_NEEDED);
        d['treasure-total'].textContent = GAME_CONFIG.TREASURES_NEEDED;
        d['special-value'].textContent = this.hasSpecial ? 'oui ✅' : 'non';
        d['special-value'].classList.toggle('got', this.hasSpecial);
        d['level-value'].textContent = district.id + ' / ' + DISTRICTS.length;
        d['dash-value'].textContent = this.dashCooldown <= 0 ? 'ESQUIVE prête' : 'ESQUIVE ' + this.dashCooldown.toFixed(1) + 's';

        d['weapon-name'].textContent = WEAPONS[this.weaponId].name;
        const locked = [];
        for (const id of Object.keys(WEAPONS)) {
            if (!this.unlocked[id]) locked.push(WEAPONS[id].name + ' (' + WEAPONS[id].unlockAt + ' trésors)');
        }
        d['weapon-lock-info'].textContent = locked.length ? '🔒 ' + locked.join(' · ') : 'Toutes débloquées';

        const pct = clamp(this.heat, 0, 100);
        d['heat-bar'].style.width = pct + '%';
        d['heat-bar'].style.backgroundColor = pct >= 80 ? '#e04b4b' : (pct >= 50 ? '#ffb300' : '#9acd32');
        d['overheat-warning'].classList.toggle('hidden', !this.overheated);

        d['objective-text'].textContent = this.objectiveText();
        d['objective-bar'].classList.toggle('ready', this.missionReady());
    }

    /* ---------- 10. Dessin (pixel art) ---------- */
    draw() {
        const ctx = this.ctx;
        const cam = this.cam;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cam.w, cam.h);
        // --- Sol (coordonn?es ?cran : uniquement la zone visible) ---
        this.drawFloor(ctx);

        ctx.save();
        ctx.translate(-Math.round(cam.x), -Math.round(cam.y));

        this.drawDeliveryZone(ctx);
        this.drawWalls(ctx);
        this.drawMineDetails(ctx);
        this.drawDeepCaveObjects(ctx);
        this.drawTreasures(ctx);
        this.drawObstacles(ctx);
        this.drawEnemies(ctx);
        if (this.bossArenaActive && this.bossPhase === 'boss') this.drawBoss(ctx);
        if (this.bossArenaActive) this.drawBossAttacks(ctx);
        this.drawProjectiles(ctx);
        this.drawPlayer(ctx);
        this.drawParticles(ctx);
        this.drawFloaters(ctx);

        ctx.restore();

        // L'ombre est peinte au-dessus du décor, puis les repères d'interface.
        this.drawFog(ctx);
        this.drawTorchGlows(ctx);
        this.drawVignette(ctx);
        this.drawObjectiveBeacon(ctx);
        this.drawCrosshair(ctx);
        this.drawHurtFlash(ctx);
        this.drawMinimap();
    }

    /** Flèche de repèrage vers le prochain objectif quand il est hors écran. */
    drawDeepCaveObjects(ctx) {
        for (const vent of this.gasVents) {
            const pulse = 0.5 + Math.sin(this.elapsed * 5 + vent.phase) * 0.15;
            ctx.fillStyle = vent.active ? 'rgba(77,237,255,.24)' : 'rgba(36,117,139,.18)';
            ctx.beginPath(); ctx.ellipse(vent.x, vent.y, 58, 24, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = vent.warning ? '#ffd56a' : (vent.active ? '#72edff' : 'rgba(89,196,212,.5)');
            ctx.lineWidth = vent.warning ? 4 : 2;
            ctx.beginPath(); ctx.ellipse(vent.x, vent.y, 42 + pulse * 8, 17 + pulse * 3, 0, 0, Math.PI * 2); ctx.stroke();
            if (vent.warning) {
                ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
                ctx.fillStyle = '#ffe28c'; ctx.fillText('VAPEUR !', vent.x, vent.y - 34);
            }
            if (vent.active) {
                ctx.fillStyle = 'rgba(103,244,255,.24)';
                ctx.fillRect(vent.x - 10, vent.y - 44, 20, 28);
                ctx.fillRect(vent.x - 18, vent.y - 28, 36, 14);
            }
        }
        for (const cache of this.supplyCaches) {
            if (cache.taken) continue;
            const color = cache.kind === 'heart' ? '#ff7387' : '#79eaff';
            ctx.fillStyle = 'rgba(0,0,0,.36)'; ctx.fillRect(cache.x - 18, cache.y + 12, 36, 8);
            ctx.fillStyle = '#302b35'; ctx.fillRect(cache.x - 17, cache.y - 14, 34, 27);
            ctx.fillStyle = '#ad8454'; ctx.fillRect(cache.x - 14, cache.y - 11, 28, 21);
            ctx.fillStyle = color; ctx.fillRect(cache.x - 3, cache.y - 8, 6, 15);
            ctx.fillRect(cache.x - 8, cache.y - 3, 16, 5);
        }
        // Grappes de cristaux : elles signalent visuellement la nouvelle galerie.
        for (const [x, y, color] of [[500, 2320, '#53d6d2'], [920, 2720, '#8ae9ff'], [1580, 2260, '#57b8d0'],
            [2080, 2580, '#70e0dc'], [2730, 2320, '#8ae9ff'], [3220, 2710, '#57b8d0']]) {
            ctx.fillStyle = 'rgba(89,224,233,.12)'; ctx.fillRect(x - 17, y - 20, 34, 40);
            ctx.fillStyle = color;
            ctx.fillRect(x - 4, y - 19, 8, 37); ctx.fillRect(x - 11, y - 8, 7, 22); ctx.fillRect(x + 4, y - 4, 7, 18);
            ctx.fillStyle = '#d8ffff'; ctx.fillRect(x - 2, y - 15, 3, 10);
        }
    }

    drawObjectiveBeacon(ctx) {
        let target, label, color;
        if (this.missionReady()) {
            const z = this.deliveryZone;
            target = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
            label = 'MAMIE'; color = '#b9ef66';
        } else if (this.bossArenaActive && this.bossPhase === 'guards') {
            const guard = this.enemies.find(e => e.kind === 'guard');
            target = guard ? { x: guard.x + guard.w / 2, y: guard.y + guard.h / 2 }
                : { x: this.bossArena.x + 515, y: this.bossArena.y + this.bossArena.h / 2 };
            label = guard ? 'GARDE' : 'PORTE'; color = '#ff8a55';
        } else if (this.bossArenaActive && this.bossPhase === 'boss' && this.boss && !this.boss.defeated) {
            target = { x: this.boss.x + this.boss.w / 2, y: this.boss.y + this.boss.h / 2 };
            label = 'ROI'; color = '#ff8a55';
        } else if (this.bossPhase === 'cleared' && !this.hasSpecial) {
            const spice = this.treasures.find(t => !t.taken && t.type === 'special');
            if (spice) target = { x: spice.x + spice.size / 2, y: spice.y + spice.size / 2 };
            label = 'MUSCADE'; color = '#c86bff';
        } else if (this.collected >= GAME_CONFIG.TREASURES_NEEDED && this.boss && !this.boss.defeated) {
            target = this.roomCenters[10];
            label = 'ROYAUME'; color = '#bf7cff';
        } else {
            const p = this.player;
            let best = Infinity;
            for (const t of this.treasures) {
                if (t.taken || t.type === 'special') continue;
                const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
                const d = dist(p.x + p.w / 2, p.y + p.h / 2, tx, ty);
                if (d < best) { best = d; target = { x: tx, y: ty }; }
            }
            label = 'TRÉSOR'; color = '#ffd75a';
        }
        if (!target) return;

        const sx = target.x - this.cam.x, sy = target.y - this.cam.y;
        const margin = 48;
        const p = this.player;
        const canSeeTarget = this.hasLineOfSight(p.x + p.w / 2, p.y + p.h / 2, target.x, target.y);
        if (canSeeTarget && sx >= margin && sx <= this.cam.w - margin && sy >= margin && sy <= this.cam.h - margin) return;
        const cx = this.cam.w / 2, cy = this.cam.h / 2;
        const angle = Math.atan2(sy - cy, sx - cx);
        const scale = Math.min((cx - margin) / Math.max(1, Math.abs(Math.cos(angle))),
            (cy - margin) / Math.max(1, Math.abs(Math.sin(angle))));
        const x = cx + Math.cos(angle) * scale, y = cy + Math.sin(angle) * scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-9, -10); ctx.lineTo(-5, 0); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = 'bold 13px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, x, y - 26);
        ctx.fillStyle = color; ctx.fillText(label, x, y - 26);
    }

    /** Sol de la mine pré-calculé une fois (terrain + cailloux + limites de district) */
    buildFloorCache() {
        // Sol taill? : nuance continue et petites ?clats, sans damier de gros blocs.
        const W = GAME_CONFIG.WORLD_W, H = GAME_CONFIG.WORLD_H, tile = this.tileSize;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
        let seed = 438291;
        const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
        for (let y = 0; y < this.mapRows; y++) for (let x = 0; x < this.mapCols; x++) {
            if (!this.cave[y][x]) continue;
            const px = x * tile, py = y * tile;
            const palace = px >= this.bossArena.x && px < this.bossArena.x + this.bossArena.w &&
                py >= this.bossArena.y && py < this.bossArena.y + this.bossArena.h;
            const deepCrystal = py >= 2050 && !palace;
            g.fillStyle = palace ? ((x + y) % 2 ? '#4a3433' : '#3c3030')
                : (deepCrystal ? ((x + y) % 2 ? '#24464a' : '#203b41') : '#302f2c');
            g.fillRect(px, py, tile, tile);
            if (palace && (x % 4 === 0 || y % 4 === 0)) {
                g.fillStyle = 'rgba(218,177,102,.22)'; g.fillRect(px, py, tile, 2);
            }
            for (let n = 0; n < 3; n++) {
                const fx = px + 2 + Math.floor(random() * 13), fy = py + 2 + Math.floor(random() * 13);
                g.fillStyle = random() > .52 ? 'rgba(104,99,88,.35)' : 'rgba(11,13,15,.48)';
                g.fillRect(fx, fy, 3 + Math.floor(random() * 5), 2 + Math.floor(random() * 3));
                g.fillStyle = 'rgba(190,173,137,.16)'; g.fillRect(fx + 1, fy, 3, 1);
            }
        }
        // Cristaux rares, en ?clats anguleux distincts du d?cor.
        for (const [x, y, color] of [[66, 45, '#55c7c0'], [98, 25, '#a883da'], [22, 69, '#7dba70'], [70, 71, '#70a9db']]) {
            if (!this.cave[y] || !this.cave[y][x]) continue;
            const px = x * tile + 10, py = y * tile + 10;
            g.fillStyle = 'rgba(80,190,210,.16)'; g.fillRect(px - 8, py - 8, 16, 16);
            g.fillStyle = color; g.fillRect(px - 3, py - 10, 6, 20); g.fillRect(px - 7, py - 4, 14, 8);
            g.fillStyle = '#d1f4e4'; g.fillRect(px - 2, py - 8, 3, 7);
        }
        this.floorCache = c;
    }

    drawFloor(ctx) {
        if (!this.floorCache) this.buildFloorCache();
        const cam = this.cam;
        // On ne recopie que la zone visible (gain de performance important)
        ctx.drawImage(
            this.floorCache,
            Math.round(cam.x), Math.round(cam.y), cam.w, cam.h,   // source (monde)
            0, 0, cam.w, cam.h                                       // destination (écran)
        );
    }

    /** Teinte de district + nom du district affiché au sol */
    drawDistrictBorders(ctx) {
        for (const d of DISTRICTS) {
            ctx.fillStyle = d.tint;
            ctx.fillRect(0, d.yMin, GAME_CONFIG.WORLD_W, d.yMax - d.yMin);

            // Ligne de séparation
            ctx.fillStyle = 'rgba(255,255,255,0.10)';
            ctx.fillRect(0, d.yMin, GAME_CONFIG.WORLD_W, 3);
        }

        // Nom du district
        const d = this.currentDistrict();
        ctx.font = 'bold 34px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillText(d.name, GAME_CONFIG.WORLD_W / 2, d.yMin + 60);
    }

    drawWalls(ctx) {
        const tile = this.tileSize;
        const left = Math.max(0, Math.floor(this.cam.x / tile) - 1);
        const right = Math.min(this.mapCols - 1, Math.ceil((this.cam.x + this.cam.w) / tile) + 1);
        const top = Math.max(0, Math.floor(this.cam.y / tile) - 1);
        const bottom = Math.min(this.mapRows - 1, Math.ceil((this.cam.y + this.cam.h) / tile) + 1);
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            if (this.cave[y][x]) continue;
            const px = x * tile, py = y * tile;
            // Graine fixe pour garder les motifs stables quand la cam?ra bouge.
            const seed = (Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
            const depth = py;
            const palette = depth < 620 ? ['#25282a', '#2b2d2c', '#30302d', '#222527']
                : (depth < 1000 ? ['#252733', '#2b2c38', '#30313b', '#232630']
                    : (depth < 2050 ? ['#302421', '#382925', '#3c2d27', '#2a2220']
                        : ['#17343a', '#1b3d43', '#22464b', '#18383e']));
            ctx.fillStyle = depth < 620 ? '#181b1d' : (depth < 1000 ? '#191b22' : (depth < 2050 ? '#211a19' : '#10272d'));
            ctx.fillRect(px, py, tile, tile);
            const ox = 1 + (seed % 3), oy = 1 + ((seed >>> 4) % 3), rw = 13 + ((seed >>> 8) % 6), rh = 10 + ((seed >>> 12) % 7);
            // Facette principale avec coins cass?s : roche en petits ?clats plut?t qu'un carr? plat.
            ctx.fillStyle = '#101213';
            ctx.beginPath(); ctx.moveTo(px + ox, py + oy + 3); ctx.lineTo(px + ox + 4, py + oy); ctx.lineTo(px + ox + rw - 3, py + oy + 1); ctx.lineTo(px + ox + rw, py + oy + 4); ctx.lineTo(px + ox + rw - 2, py + oy + rh - 2); ctx.lineTo(px + ox + 5, py + oy + rh); ctx.lineTo(px + ox + 1, py + oy + rh - 3); ctx.closePath(); ctx.fill();
            ctx.fillStyle = palette[(seed >>> 16) % palette.length];
            ctx.beginPath(); ctx.moveTo(px + ox + 2, py + oy + 4); ctx.lineTo(px + ox + 5, py + oy + 2); ctx.lineTo(px + ox + rw - 4, py + oy + 3); ctx.lineTo(px + ox + rw - 2, py + oy + 5); ctx.lineTo(px + ox + rw - 4, py + oy + rh - 3); ctx.lineTo(px + ox + 6, py + oy + rh - 2); ctx.lineTo(px + ox + 3, py + oy + rh - 5); ctx.closePath(); ctx.fill();
            // Ar?te ?clair?e et faille int?rieure pour le relief du mat?riau.
            ctx.fillStyle = depth < 620 ? '#55544c' : (depth < 1000 ? '#505361' : (depth < 2050 ? '#685047' : '#55a6ad'));
            ctx.fillRect(px + ox + 5, py + oy + 3, 5 + ((seed >>> 20) % 5), 1);
            ctx.fillRect(px + ox + 2, py + oy + 5, 2, 3);
            ctx.fillStyle = '#171819';
            ctx.fillRect(px + ox + 7, py + oy + rh - 4, 4 + ((seed >>> 24) % 4), 2);
            // Un ?clat secondaire d?cale la trame et casse l'impression de damier.
            if (seed % 3 !== 0) {
                const sx = px + 10 + ((seed >>> 6) % 7), sy = py + 11 + ((seed >>> 10) % 6);
                ctx.fillStyle = depth < 620 ? '#343533' : (depth < 1000 ? '#373844' : '#44332e');
                ctx.fillRect(sx, sy, 5 + (seed % 3), 3);
                ctx.fillStyle = depth < 620 ? '#5a574d' : (depth < 1000 ? '#555765' : '#735447');
                ctx.fillRect(sx + 1, sy, 3, 1);
            }
            // Bords en dents irr?guli?res l? o? la roche tombe sur les galeries.
            if (this.cave[y + 1] && this.cave[y + 1][x] && seed % 3 === 0) {
                ctx.fillStyle = depth < 1000 ? '#181a1c' : (depth < 2050 ? '#211a18' : '#10272d');
                ctx.fillRect(px + 3 + (seed % 8), py + tile - 2, 4, 5 + ((seed >>> 5) % 4));
                if (seed % 2) ctx.fillRect(px + 13, py + tile - 2, 3, 3);
            }
            if (this.cave[y][x + 1] && seed % 4 === 0) {
                ctx.fillStyle = depth < 1000 ? '#191b1d' : (depth < 2050 ? '#211a18' : '#10272d');
                ctx.fillRect(px + tile - 2, py + 4 + ((seed >>> 9) % 7), 4, 4);
            }
        }
    }

    drawMineDetails(ctx) {
        // Portail clairement visible : E sert ici à entrer, pas à changer d'arme.
        const gate = this.roomCenters[10];
        ctx.fillStyle = 'rgba(89,48,174,.17)'; ctx.fillRect(gate.x - 94, gate.y - 102, 188, 190);
        ctx.fillStyle = '#31202d'; ctx.fillRect(gate.x - 78, gate.y - 100, 156, 174);
        ctx.fillStyle = '#c09a55'; ctx.fillRect(gate.x - 68, gate.y - 92, 136, 158);
        ctx.fillStyle = '#170f20'; ctx.fillRect(gate.x - 54, gate.y - 82, 108, 146);
        ctx.fillStyle = 'rgba(145,65,226,.26)'; ctx.fillRect(gate.x - 44, gate.y - 72, 88, 124);
        const portalPulse = Math.floor(this.elapsed * 5) % 2;
        ctx.fillStyle = portalPulse ? '#cb83ff' : '#8d55df';
        ctx.fillRect(gate.x - 4, gate.y - 66, 8, 105);
        ctx.fillRect(gate.x - 32 + portalPulse * 5, gate.y - 42, 5, 6);
        ctx.fillRect(gate.x + 22 - portalPulse * 4, gate.y + 8, 5, 6);
        ctx.fillStyle = '#2b1b24'; ctx.fillRect(gate.x - 4, gate.y + 70, 8, 34);
        ctx.fillStyle = '#4b2c1a'; ctx.fillRect(gate.x - 132, gate.y - 190, 264, 78);
        ctx.fillStyle = '#d3a75d'; ctx.fillRect(gate.x - 126, gate.y - 184, 252, 66);
        ctx.fillStyle = '#382313'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
        ctx.fillText('ROYAUME DES PATATES', gate.x, gate.y - 165);
        ctx.font = '11px monospace';
        ctx.fillText('Min. 8 trésors : ' + Math.min(this.collected, 8) + '/8', gate.x, gate.y - 147);
        ctx.fillText('Le Roi garde le secret de Mamie !', gate.x, gate.y - 132);
        ctx.fillStyle = '#24161e'; ctx.fillRect(gate.x - 86, gate.y + 96, 172, 32);
        ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 15px monospace';
        ctx.fillText('[ E ] ENTRER', gate.x, gate.y + 118);

        // Salle royale : dallage de marbre, tapis rouge, colonnes dorées et trône.
        const a = this.bossArena, midY = a.y + a.h / 2;
        if (this.bossArenaActive) {
        ctx.fillStyle = 'rgba(82,31,47,.86)'; ctx.fillRect(a.x + 450, midY - 48, a.w - 500, 96);
        ctx.fillStyle = 'rgba(215,172,90,.8)'; ctx.fillRect(a.x + 450, midY - 6, a.w - 500, 12);
        for (let i = 0; i < 6; i++) {
            const x = a.x + 180 + i * 155;
            ctx.fillStyle = '#50352a'; ctx.fillRect(x - 24, a.y + 115, 48, a.h - 230);
            ctx.fillStyle = '#b78c50'; ctx.fillRect(x - 17, a.y + 122, 34, a.h - 244);
            ctx.fillStyle = '#f4d68c'; ctx.fillRect(x - 28, a.y + 118, 56, 13); ctx.fillRect(x - 28, a.y + a.h - 131, 56, 13);
            ctx.fillStyle = '#6f1e2c'; ctx.fillRect(x - 31, a.y + 111, 62, 8); ctx.fillRect(x - 31, a.y + a.h - 123, 62, 8);
        }
        // Ces quatre bases de colonnes sont de vrais abris : les projectiles s'y brisent.
        for (const cover of this.bossCover) {
            ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.fillRect(cover.x - 9, cover.y + cover.h - 2, cover.w + 18, 18);
            ctx.fillStyle = '#3b2828'; ctx.fillRect(cover.x - 5, cover.y - 5, cover.w + 10, cover.h + 10);
            ctx.fillStyle = '#b78c50'; ctx.fillRect(cover.x, cover.y, cover.w, cover.h);
            ctx.fillStyle = '#d7b767'; ctx.fillRect(cover.x + 9, cover.y + 8, cover.w - 18, cover.h - 16);
            ctx.fillStyle = '#f0d48b'; ctx.fillRect(cover.x + 13, cover.y + 12, 7, 30);
            ctx.fillStyle = '#7b242d'; ctx.fillRect(cover.x + 5, cover.y + 4, cover.w - 10, 7);
        }
        const tx = a.x + 850, ty = midY - 20;
        ctx.fillStyle = '#25130f'; ctx.fillRect(tx - 82, ty - 70, 164, 165);
        ctx.fillStyle = '#7b242d'; ctx.fillRect(tx - 70, ty - 60, 140, 142);
        ctx.fillStyle = '#c79b4f'; ctx.fillRect(tx - 87, ty + 72, 174, 20);
        ctx.fillStyle = '#e3bd6d'; ctx.fillRect(tx - 70, ty - 54, 140, 8);
        ctx.fillStyle = '#f4d68c'; ctx.fillRect(tx - 12, ty - 48, 24, 28); ctx.fillRect(tx - 6, ty - 64, 12, 16);
        ctx.fillStyle = '#ffcf57'; ctx.fillRect(tx - 5, ty - 60, 10, 11);
        if (this.bossArenaActive) {
            ctx.fillStyle = '#ffdf9b'; ctx.font = 'bold 26px monospace';
            ctx.fillText('PALAIS DU ROI PURÉE', a.x + a.w / 2, a.y + 64);
            const doorX = a.x + 515;
            if (this.bossPhase === 'guards' && this.enemies.some(e => e.kind === 'guard')) {
                ctx.fillStyle = '#382b26'; ctx.fillRect(doorX - 12, midY - 140, 24, 280);
                ctx.fillStyle = '#d3a75d'; ctx.fillRect(doorX - 7, midY - 135, 4, 270); ctx.fillRect(doorX + 3, midY - 135, 4, 270);
            }
        }
        }
        // Charpentes pixelisées qui soutiennent les galeries les plus anciennes.
        for (const s of this.mineSupports) {
            if (s.x < this.cam.x - 50 || s.x > this.cam.x + this.cam.w + 50 || s.y < this.cam.y - 60 || s.y > this.cam.y + this.cam.h + 60) continue;
            ctx.fillStyle = '#24170f';
            ctx.fillRect(s.x - 28, s.y - 34, 8, 68); ctx.fillRect(s.x + 20, s.y - 34, 8, 68);
            ctx.fillRect(s.x - 32, s.y - 38, 64, 8);
            ctx.fillStyle = '#704426';
            ctx.fillRect(s.x - 24, s.y - 30, 4, 56); ctx.fillRect(s.x + 20, s.y - 30, 4, 56);
            ctx.fillRect(s.x - 28, s.y - 34, 56, 4);
            ctx.fillStyle = '#b47a45';
            ctx.fillRect(s.x - 24, s.y - 34, 48, 4); ctx.fillRect(s.x - 20, s.y - 28, 4, 16);
            ctx.fillStyle = '#39281a'; ctx.fillRect(s.x - 28, s.y + 20, 12, 6); ctx.fillRect(s.x + 16, s.y + 20, 12, 6);
        }
        // Petite nappe d'eau dans une salle basse, avec reflets en bandes de pixels.
        const p = this.minePool, wave = Math.floor(this.elapsed * 3) % 3;
        ctx.fillStyle = '#181a1a'; ctx.fillRect(p.x - 6, p.y - 4, 104, 40);
        ctx.fillStyle = '#102538'; ctx.fillRect(p.x - 2, p.y, 96, 32);
        ctx.fillStyle = '#17415a'; ctx.fillRect(p.x + 2, p.y + 4, 84, 20);
        ctx.fillStyle = '#4e9bb0'; ctx.fillRect(p.x + 8 + wave * 8, p.y + 4, 20, 4);
        ctx.fillRect(p.x + 52 - wave * 4, p.y + 16, 28, 4);
        ctx.fillStyle = '#86c5c0'; ctx.fillRect(p.x + 12 + wave * 8, p.y + 4, 8, 2);
        // Une rigole tombe de la roche jusque dans le bassin.
        ctx.fillStyle = '#315b71'; ctx.fillRect(p.x + 86, p.y - 30, 8, 34);
        ctx.fillStyle = '#79bdc2'; ctx.fillRect(p.x + 86, p.y - 26, 4, 24);
        // Veines de mousse au bord de l'eau.
        ctx.fillStyle = '#527448'; ctx.fillRect(p.x - 14, p.y + 28, 12, 6); ctx.fillRect(p.x + 92, p.y + 24, 10, 8);
        ctx.fillStyle = '#7c9c55'; ctx.fillRect(p.x - 10, p.y + 24, 4, 4); ctx.fillRect(p.x + 96, p.y + 20, 4, 4);
        // Flambeaux fixés aux poutres.
        for (const t of this.mineTorches) {
            ctx.fillStyle = '#302319'; ctx.fillRect(t.x, t.y, 4, 16);
            ctx.fillStyle = '#aa6833'; ctx.fillRect(t.x - 2, t.y + 8, 8, 4);
            const flicker = Math.floor(this.elapsed * 8) % 2;
            ctx.fillStyle = '#e85d28'; ctx.fillRect(t.x - 2, t.y - 8 + flicker * 2, 8, 8);
            ctx.fillStyle = '#ffd76c'; ctx.fillRect(t.x, t.y - 8 + flicker * 2, 4, 6);
            ctx.fillStyle = '#fff0b0'; ctx.fillRect(t.x + 1, t.y - 6 + flicker * 2, 2, 3);
        }
    }

    drawTorchGlows(ctx) {
        // Halo pixelisé très local : les torches restent visibles au-delà de la lampe du joueur.
        for (const t of this.mineTorches) {
            const x = t.x - this.cam.x, y = t.y - this.cam.y;
            if (x < -36 || y < -36 || x > this.cam.w + 36 || y > this.cam.h + 36) continue;
            ctx.fillStyle = 'rgba(226,126,47,.08)'; ctx.fillRect(x - 24, y - 24, 48, 48);
            ctx.fillStyle = 'rgba(244,173,76,.12)'; ctx.fillRect(x - 12, y - 16, 28, 28);
            ctx.fillStyle = '#ffc45c'; ctx.fillRect(x, y - 8, 4, 8);
            ctx.fillStyle = '#fff0b0'; ctx.fillRect(x + 1, y - 6, 2, 4);
        }
        for (const [wx, wy] of [[500, 2320], [920, 2720], [1580, 2260], [2080, 2580], [2730, 2320], [3220, 2710]]) {
            const x = wx - this.cam.x, y = wy - this.cam.y;
            if (x < -45 || y < -45 || x > this.cam.w + 45 || y > this.cam.h + 45) continue;
            ctx.fillStyle = 'rgba(70,205,218,.055)'; ctx.fillRect(x - 32, y - 30, 64, 60);
            ctx.fillStyle = 'rgba(105,232,242,.12)'; ctx.fillRect(x - 14, y - 20, 28, 40);
        }
    }

    /** Zone de livraison + Mamie Patate */
    drawDeliveryZone(ctx) {
        const z = this.deliveryZone;
        const ready = this.missionReady();

        ctx.fillStyle = 'rgba(110,190,60,0.32)';
        ctx.fillRect(z.x, z.y, z.w, z.h);

        ctx.strokeStyle = ready ? '#ffd700' : '#9acd32';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(z.x, z.y, z.w, z.h);
        ctx.setLineDash([]);

        if (ready) {
            const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 5);
            ctx.globalAlpha = 0.20 + pulse * 0.30;
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(z.x - 6, z.y - 6, z.w + 12, z.h + 12);
            ctx.globalAlpha = 1;

            // Flèche "rentre ici !"
            const ay = z.y - 26 - pulse * 8;
            const cx = z.x + z.w / 2;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.moveTo(cx, ay + 16);
            ctx.lineTo(cx - 14, ay);
            ctx.lineTo(cx - 5, ay);
            ctx.lineTo(cx - 5, ay - 14);
            ctx.lineTo(cx + 5, ay - 14);
            ctx.lineTo(cx + 5, ay);
            ctx.lineTo(cx + 14, ay);
            ctx.closePath();
            ctx.fill();
        }

        // Chaudron de Mamie
        ctx.fillStyle = '#5a3a25';
        ctx.fillRect(z.x + 26, z.y + 62, 52, 26);
        ctx.fillStyle = '#e0c060';
        ctx.beginPath();
        ctx.ellipse(z.x + 52, z.y + 62, 26, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Fumée
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        for (let i = 0; i < 3; i++) {
            const t = (this.elapsed * 0.8 + i * 0.33) % 1;
            ctx.beginPath();
            ctx.arc(z.x + 52 + Math.sin(t * 6 + i) * 7, z.y + 54 - t * 26, 4 + t * 6, 0, Math.PI * 2);
            ctx.fill();
        }

        this.drawGranny(ctx, z.x + 160, z.y + 58);

        ctx.fillStyle = ready ? '#ffd700' : '#e8f5d8';
        ctx.font = 'bold 18px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SORTIE DE LA MINE — MAMIE PATATE', z.x + z.w / 2, z.y + 26);
    }

    drawGranny(ctx, x, y) {
        ctx.fillStyle = '#d9a066';
        ctx.beginPath();
        ctx.ellipse(x, y, 24, 27, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(x - 8, y - 10, 7, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f5f5f5';            // bonnet
        ctx.beginPath();
        ctx.arc(x, y - 22, 21, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - 21, y - 22, 42, 6);
        ctx.fillStyle = '#2b2b2b';            // lunettes
        ctx.fillRect(x - 17, y - 6, 13, 10);
        ctx.fillRect(x + 4, y - 6, 13, 10);
        ctx.fillRect(x - 4, y - 2, 8, 3);
        ctx.strokeStyle = '#8a4b2a';          // sourire
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y + 9, 9, 0.2, Math.PI - 0.2);
        ctx.stroke();
    }

    drawTreasures(ctx) {
        const px = this.player.x + this.player.w / 2;
        const py = this.player.y + this.player.h / 2;
        for (const t of this.treasures) {
            if (t.taken) continue;
            const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
            if (dist(px, py, tx, ty) > 560 || !this.hasLineOfSight(px, py, tx, ty)) continue;

            const bob = Math.sin(this.elapsed * 3 + t.bob) * 4;
            const cx = Math.round(t.x + t.size / 2);
            const cy = Math.round(t.y + t.size / 2 + bob);
            const r = t.size / 2;

            if (t.type === 'golden') {
                const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 2.3);
                g.addColorStop(0, 'rgba(255,215,0,0.55)');
                g.addColorStop(1, 'rgba(255,215,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(cx, cy, r * 2.3, 0, Math.PI * 2);
                ctx.fill();
            }

            if (t.type === 'classic' || t.type === 'golden') {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.ellipse(cx, cy, r, r * 0.86, 0.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.20)';
                ctx.beginPath();
                ctx.arc(cx - r * 0.3, cy - r * 0.25, 4, 0, Math.PI * 2);
                ctx.arc(cx + r * 0.35, cy + r * 0.2, 3, 0, Math.PI * 2);
                ctx.fill();
                if (t.type === 'golden') {
                    ctx.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx.beginPath();
                    ctx.arc(cx - r * 0.35, cy - r * 0.35, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (t.type === 'sack') {
                ctx.fillStyle = '#a9743f';
                ctx.beginPath();
                ctx.moveTo(cx - r, cy + r);
                ctx.quadraticCurveTo(cx - r * 0.9, cy - r * 0.3, cx - r * 0.4, cy - r * 0.6);
                ctx.lineTo(cx + r * 0.4, cy - r * 0.6);
                ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.3, cx + r, cy + r);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.arc(cx - 11, cy - r * 0.75, 8, 0, Math.PI * 2);
                ctx.arc(cx + 9, cy - r * 0.9, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#6b4a28';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(cx - r * 0.45, cy - r * 0.55);
                ctx.lineTo(cx + r * 0.45, cy - r * 0.55);
                ctx.stroke();
            } else if (t.type === 'fries') {
                ctx.fillStyle = '#e03a3a';
                ctx.beginPath();
                ctx.moveTo(cx - r, cy - r * 0.2);
                ctx.lineTo(cx + r, cy - r * 0.2);
                ctx.lineTo(cx + r * 0.65, cy + r);
                ctx.lineTo(cx - r * 0.65, cy + r);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = t.color;
                for (let i = 0; i < 4; i++) ctx.fillRect(cx - r * 0.6 + i * (r * 0.35), cy - r * 0.9, 7, r * 0.8);
            } else if (t.type === 'chips') {
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.moveTo(cx - r, cy - r * 0.85);
                ctx.quadraticCurveTo(cx, cy - r * 1.2, cx + r, cy - r * 0.85);
                ctx.lineTo(cx + r * 0.8, cy + r);
                ctx.lineTo(cx - r * 0.8, cy + r);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#c9b43a';
                ctx.beginPath();
                ctx.arc(cx - r * 0.3, cy - r * 0.1, 5, 0, Math.PI * 2);
                ctx.arc(cx + r * 0.3, cy + r * 0.15, 5, 0, Math.PI * 2);
                ctx.fill();
            } else if (t.type === 'special') {
                const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 2.8);
                glow.addColorStop(0, 'rgba(200,107,255,.55)');
                glow.addColorStop(1, 'rgba(200,107,255,0)');
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, r * 2.8, 0, Math.PI * 2); ctx.fill();
                // Petit pot à épices en verre : la muscade secrète de Mamie.
                ctx.fillStyle = '#56341f'; ctx.fillRect(cx - r * .72, cy - r * .35, r * 1.44, r * 1.28);
                ctx.fillStyle = '#e3c58c'; ctx.fillRect(cx - r * .64, cy - r * .24, r * 1.28, r * .98);
                ctx.fillStyle = '#7b3c75'; ctx.fillRect(cx - r * .8, cy - r * .52, r * 1.6, r * .25);
                ctx.fillStyle = '#d9a84e'; ctx.fillRect(cx - r * .8, cy - r * .32, r * 1.6, 4);
                ctx.fillStyle = '#9b6231'; ctx.fillRect(cx - r * .42, cy + r * .12, r * .84, r * .43);
                ctx.fillStyle = '#fff0b0'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
                ctx.fillText('M', cx, cy + r * .02);
            }
        }
    }

    drawObstacles(ctx) {
        for (const ob of this.obstacles) {
            const ox = ob.kind === 'rock' ? ob.x : ob.x + ob.w / 2;
            const oy = ob.kind === 'rock' ? ob.y : ob.y + ob.h / 2;
            const px = this.player.x + this.player.w / 2;
            const py = this.player.y + this.player.h / 2;
            if (dist(px, py, ox, oy) > 620 || !this.hasLineOfSight(px, py, ox, oy)) continue;
            if (ob.kind === 'rock') {
                ctx.save();
                ctx.translate(Math.round(ob.x), Math.round(ob.y));
                ctx.rotate(this.elapsed * 2.4);
                ctx.fillStyle = '#7c7c7c';
                ctx.beginPath();
                ctx.arc(0, 0, ob.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#5c5c5c';
                ctx.beginPath();
                ctx.arc(0, 0, ob.r * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#454545';
                ctx.fillRect(-ob.r * 0.5, -4, 5, 5);
                ctx.fillRect(4, 2, 5, 5);
                ctx.restore();
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.ellipse(ob.x, ob.y + ob.r + 4, ob.r * 0.8, ob.r * 0.3, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const gx = Math.round(ob.x), gy = Math.round(ob.y);
                ctx.fillStyle = '#4a4a4a';
                ctx.fillRect(gx, gy + ob.h * 0.4, ob.w, ob.h * 0.6);
                ctx.fillStyle = '#cfd6da';
                for (let i = 0; i < 4; i++) {
                    const sx = gx + 6 + i * (ob.w - 12) / 3;
                    ctx.beginPath();
                    ctx.moveTo(sx - 6, gy + ob.h * 0.45);
                    ctx.lineTo(sx, gy - 6);
                    ctx.lineTo(sx + 6, gy + ob.h * 0.45);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.fillStyle = 'rgba(255,77,77,0.16)';
                ctx.fillRect(gx - 4, gy - 10, ob.w + 8, ob.h + 14);
            }
        }
    }

    drawEnemies(ctx) {
        const px = this.player.x + this.player.w / 2, py = this.player.y + this.player.h / 2;
        const pxSize = 4;
        for (const e of this.enemies) {
            const cx = Math.round(e.x + e.w / 2), cy = Math.round(e.y + e.h / 2);
            if (dist(px, py, cx, cy) > 620 || !this.hasLineOfSight(px, py, cx, cy)) continue;
            const step = Math.floor(this.elapsed * 9 + e.x / 28) % 2;
            const footShift = step ? 3 : -2;
            if (e.slow > 0) {
                ctx.fillStyle = '#4773a055'; ctx.fillRect(cx - 30, cy - 28, 60, 60);
                ctx.fillStyle = '#83b9d8'; ctx.fillRect(cx - 34, cy - 8, 4, 8); ctx.fillRect(cx + 30, cy + 8, 4, 8);
            }
            // Les deux monstres gardent la meme anatomie de patate que le heros : corps, bras, jambes et bottes.
            ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - 25, cy + 30, 50, 5);
            ctx.fillStyle = '#241711';
            ctx.fillRect(cx - 15, cy + 15, 11, 17 + footShift); ctx.fillRect(cx + 4, cy + 15, 11, 17 - footShift);
            ctx.fillStyle = e.kind === 'corrupted' ? '#71442c' : '#71533a';
            ctx.fillRect(cx - 12, cy + 19, 6, 11 + footShift); ctx.fillRect(cx + 6, cy + 19, 6, 11 - footShift);
            ctx.fillStyle = '#2e241d';
            ctx.fillRect(cx - 21, cy + 27 + footShift, 17, 7); ctx.fillRect(cx + 4, cy + 27 - footShift, 17, 7);
            ctx.fillStyle = e.kind === 'corrupted' ? '#a76d45' : '#827451';
            ctx.fillRect(cx - 18, cy + 28 + footShift, 10, 3); ctx.fillRect(cx + 7, cy + 28 - footShift, 10, 3);

            if (e.kind === 'guard') {
                // Gardes patate en armure complète, casque à plume, bouclier et lance.
                ctx.fillStyle = '#251815'; ctx.fillRect(cx - 31, cy - 28, 62, 57);
                ctx.fillStyle = e.flash > 0 ? '#fff' : '#b88748'; ctx.fillRect(cx - 25, cy - 23, 50, 48);
                ctx.fillStyle = '#e4c477'; ctx.fillRect(cx - 28, cy - 20, 8, 43); ctx.fillRect(cx + 20, cy - 20, 8, 43);
                ctx.fillStyle = '#55312b'; ctx.fillRect(cx - 18, cy - 14, 36, 30);
                ctx.fillStyle = '#d5ad61'; ctx.fillRect(cx - 18, cy - 7, 36, 7); ctx.fillRect(cx - 6, cy - 14, 12, 25);
                ctx.fillStyle = '#f1d8a2'; ctx.fillRect(cx - 15, cy - 24, 30, 17);
                ctx.fillStyle = '#2c1b16'; ctx.fillRect(cx - 14, cy - 17, 10, 5); ctx.fillRect(cx + 4, cy - 17, 10, 5);
                ctx.fillStyle = '#7d1f31'; ctx.fillRect(cx - 18, cy - 35, 36, 11); ctx.fillRect(cx - 5, cy - 48, 10, 14);
                ctx.fillStyle = '#e9c66a'; ctx.fillRect(cx - 27, cy - 30, 54, 6); ctx.fillRect(cx - 4, cy - 54, 8, 8);
                ctx.fillStyle = '#493029'; ctx.fillRect(cx - 39, cy - 9, 12, 34); ctx.fillRect(cx + 29, cy - 9, 12, 34);
                ctx.fillStyle = '#cfab65'; ctx.fillRect(cx - 37, cy - 6, 8, 28); ctx.fillRect(cx + 32, cy - 6, 5, 25);
                ctx.fillStyle = '#e9d18a'; ctx.fillRect(cx + 33, cy - 52, 4, 47);
                ctx.beginPath(); ctx.moveTo(cx + 30, cy - 52); ctx.lineTo(cx + 40, cy - 52); ctx.lineTo(cx + 35, cy - 66); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#ad443d'; ctx.fillRect(cx - 5, cy - 1, 10, 5);
            } else if (e.kind === 'corrupted') {
                // Patate moisie : silhouette ronde en marches de pixels, casque fendu et yeux de luciole.
                ctx.fillStyle = '#251710';
                ctx.fillRect(cx - 27, cy - 18, 8, 30); ctx.fillRect(cx + 19, cy - 18, 8, 30);
                ctx.fillStyle = '#65402b';
                ctx.fillRect(cx - 24, cy - 14, 5, 20); ctx.fillRect(cx + 19, cy - 14, 5, 20);
                const rows = [3, 6, 9, 11, 13, 14, 14, 14, 13, 12, 10, 7];
                rows.forEach((count, row) => {
                    const y = cy - 25 + row * pxSize, w = count * pxSize, x = cx - w / 2;
                    ctx.fillStyle = '#21130f'; ctx.fillRect(x - 4, y, w + 8, pxSize);
                    ctx.fillStyle = e.flash > 0 ? '#fff' : (row < 3 ? '#83563a' : (row < 8 ? '#a8663d' : '#8d4e32'));
                    ctx.fillRect(x, y, w, pxSize);
                    if (row > 1 && row < 9) { ctx.fillStyle = row % 2 ? '#c1844d' : '#77402e'; ctx.fillRect(x + 5, y, Math.max(4, w - 14), 2); }
                });
                // Petites taches de peau et verrues vertes.
                ctx.fillStyle = '#58743e'; ctx.fillRect(cx - 20, cy - 17, 7, 6); ctx.fillRect(cx + 16, cy - 25, 8, 7); ctx.fillRect(cx + 20, cy + 8, 7, 6);
                ctx.fillStyle = '#c0b768'; ctx.fillRect(cx - 18, cy - 16, 3, 2); ctx.fillRect(cx + 18, cy - 24, 3, 2);
                // Casque cuivre de mineur, cabosse et lampe verte.
                ctx.fillStyle = '#30241c'; ctx.fillRect(cx - 16, cy - 34, 32, 8); ctx.fillRect(cx - 10, cy - 39, 20, 6);
                ctx.fillStyle = '#a85d36'; ctx.fillRect(cx - 12, cy - 33, 24, 5); ctx.fillRect(cx - 20, cy - 28, 40, 4);
                ctx.fillStyle = '#93d46a'; ctx.fillRect(cx - 3, cy - 32, 7, 5); ctx.fillStyle = '#e4ffad'; ctx.fillRect(cx - 1, cy - 31, 3, 3);
                // Yeux expressifs, sourcils, cicatrice et bouche en dents de pixels.
                ctx.fillStyle = '#f1d7a7'; ctx.fillRect(cx - 17, cy - 7, 12, 11); ctx.fillRect(cx + 5, cy - 7, 12, 11);
                ctx.fillStyle = '#e8e17e'; ctx.fillRect(cx - 12, cy - 4, 6, 7); ctx.fillRect(cx + 8, cy - 4, 6, 7);
                ctx.fillStyle = '#321d15'; ctx.fillRect(cx - 10, cy - 3, 3, 5); ctx.fillRect(cx + 10, cy - 3, 3, 5);
                ctx.fillStyle = '#3c2018'; ctx.fillRect(cx - 19, cy - 11, 14, 4); ctx.fillRect(cx + 5, cy - 11, 14, 4);
                ctx.fillStyle = '#3a1d19'; ctx.fillRect(cx - 9, cy + 9, 18, 7); ctx.fillStyle = '#d8bc8e'; ctx.fillRect(cx - 6, cy + 9, 12, 3);
                ctx.fillStyle = '#6c3428'; ctx.fillRect(cx + 17, cy - 1, 4, 12); ctx.fillRect(cx + 13, cy + 5, 4, 4);
            } else {
                // Petit mycologue : corps de patate, bras courts, champignon-turban et bottes.
                ctx.fillStyle = '#201b15'; ctx.fillRect(cx - 23, cy - 7, 12, 19); ctx.fillRect(cx + 11, cy - 7, 12, 19);
                ctx.fillStyle = '#9b7545'; ctx.fillRect(cx - 20, cy - 3, 8, 12); ctx.fillRect(cx + 12, cy - 3, 8, 12);
                ctx.fillStyle = '#171613'; ctx.fillRect(cx - 14, cy - 10, 28, 34); ctx.fillRect(cx - 20, cy, 40, 17);
                ctx.fillStyle = e.flash > 0 ? '#fff' : '#dfc99d'; ctx.fillRect(cx - 10, cy - 7, 20, 26);
                ctx.fillStyle = '#b7935d'; ctx.fillRect(cx - 8, cy + 7, 16, 5); ctx.fillRect(cx - 4, cy + 14, 8, 4);
                // Grand chapeau dessine comme une touffe de pixels, avec rebord et pois.
                ctx.fillStyle = '#202418'; ctx.fillRect(cx - 28, cy - 20, 56, 16); ctx.fillRect(cx - 20, cy - 28, 40, 9); ctx.fillRect(cx - 11, cy - 34, 22, 8);
                ctx.fillStyle = e.flash > 0 ? '#fff' : '#547c43'; ctx.fillRect(cx - 25, cy - 19, 50, 11); ctx.fillRect(cx - 18, cy - 26, 36, 8); ctx.fillRect(cx - 9, cy - 32, 18, 7);
                ctx.fillStyle = '#8cad56'; ctx.fillRect(cx - 18, cy - 23, 9, 4); ctx.fillRect(cx + 7, cy - 17, 10, 4); ctx.fillRect(cx - 2, cy - 30, 6, 4);
                ctx.fillStyle = '#d4dfa1'; ctx.fillRect(cx - 15, cy - 22, 4, 3); ctx.fillRect(cx + 10, cy - 16, 4, 3);
                // Yeux, petit sourire et branchies sous le chapeau.
                ctx.fillStyle = '#f2e6c9'; ctx.fillRect(cx - 12, cy - 3, 8, 9); ctx.fillRect(cx + 4, cy - 3, 8, 9);
                ctx.fillStyle = '#29351f'; ctx.fillRect(cx - 8, cy, 3, 5); ctx.fillRect(cx + 7, cy, 3, 5);
                ctx.fillStyle = '#563b2a'; ctx.fillRect(cx - 5, cy + 11, 10, 3); ctx.fillStyle = '#fbdfa0'; ctx.fillRect(cx - 3, cy + 11, 6, 2);
                ctx.fillStyle = '#8f9f65'; ctx.fillRect(cx - 12, cy - 7, 24, 2); ctx.fillRect(cx - 8, cy - 4, 2, 3); ctx.fillRect(cx + 6, cy - 4, 2, 3);
            }
            if (e.hp < e.maxHp) {
                const pct = e.hp / e.maxHp;
                ctx.fillStyle = '#151212'; ctx.fillRect(cx - 22, cy - 45, 44, 7);
                ctx.fillStyle = pct > .5 ? '#8ccb58' : '#e5a04d'; ctx.fillRect(cx - 20, cy - 43, 40 * pct, 3);
            }
        }
    }

    drawBossAttacks(ctx) {
        const b = this.boss;
        if (b && b.mode === 'stomp_telegraph') {
            const pulse = Math.floor(this.elapsed * 8) % 2 ? 'rgba(255,195,50,.22)' : 'rgba(255,195,50,.42)';
            ctx.fillStyle = pulse;
            ctx.beginPath(); ctx.arc(b.pulseX, b.pulseY, 92, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffd15a'; ctx.lineWidth = 5; ctx.stroke();
        }
        if (b && b.mode === 'volley_telegraph') {
            const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            ctx.strokeStyle = 'rgba(255,203,92,.8)'; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
            for (let i = -3; i <= 3; i++) {
                const angle = Math.atan2(b.dy, b.dx) + i * .16;
                ctx.beginPath(); ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * 330, cy + Math.sin(angle) * 330); ctx.stroke();
            }
            ctx.setLineDash([]);
        }
        for (const shot of this.bossShots) {
            ctx.fillStyle = '#5d1724'; ctx.beginPath(); ctx.arc(shot.x, shot.y, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffcc63'; ctx.beginPath(); ctx.arc(shot.x - 3, shot.y - 3, 7, 0, Math.PI * 2); ctx.fill();
        }
        if (this.bossPulse) {
            ctx.strokeStyle = '#ffd15a'; ctx.lineWidth = 10; ctx.globalAlpha = Math.max(0, this.bossPulse.life / .85);
            ctx.beginPath(); ctx.arc(this.bossPulse.x, this.bossPulse.y, this.bossPulse.radius, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    drawBoss(ctx) {
        const b = this.boss;
        if (!b || b.defeated || !this.bossArenaActive || this.bossPhase !== 'boss') return;

        const cx = Math.round(b.x + b.w / 2);
        const cy = Math.round(b.y + b.h / 2);
        const px = this.player.x + this.player.w / 2;
        const py = this.player.y + this.player.h / 2;
        if (dist(px, py, cx, cy) > 700 || !this.hasLineOfSight(px, py, cx, cy)) return;

        
        if (b.mode === 'telegraph') {
            ctx.strokeStyle = 'rgba(224,75,75,0.9)';
            ctx.lineWidth = 8;
            ctx.setLineDash([18, 12]);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + b.dx * 320, cy + b.dy * 320);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Roi Pur?e : ?norme patate en armure de mine, couronne carr?e et moustache.
        // Roi Pur?e : g?ant patate en armure, avec vraies jambes et silhouette bomb?e.
        const bodyColor = b.flash > 0 ? '#fff' : '#80533a';
        const stride = Math.floor(this.elapsed * 5) % 2 ? 4 : -2;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - 62, cy + 58, 124, 10);
        ctx.fillStyle = '#211713';
        ctx.fillRect(cx - 39, cy + 34, 26, 24 + stride); ctx.fillRect(cx + 13, cy + 34, 26, 24 - stride);
        ctx.fillStyle = '#583725'; ctx.fillRect(cx - 33, cy + 39, 14, 18 + stride); ctx.fillRect(cx + 19, cy + 39, 14, 18 - stride);
        ctx.fillStyle = '#2a2018'; ctx.fillRect(cx - 48, cy + 54 + stride, 38, 13); ctx.fillRect(cx + 10, cy + 54 - stride, 38, 13);
        ctx.fillStyle = '#a96b43'; ctx.fillRect(cx - 40, cy + 56 + stride, 23, 5); ctx.fillRect(cx + 17, cy + 56 - stride, 23, 5);
        // Long manteau royal rouge, bordé d'or et posé sur ses épaules.
        ctx.fillStyle = '#3b1421'; ctx.fillRect(cx - 72, cy - 14, 20, 75); ctx.fillRect(cx + 52, cy - 14, 20, 75);
        ctx.fillStyle = '#9a263c'; ctx.fillRect(cx - 67, cy - 10, 11, 65); ctx.fillRect(cx + 56, cy - 10, 11, 65);
        ctx.fillStyle = '#e7c06a'; ctx.fillRect(cx - 72, cy + 44, 20, 6); ctx.fillRect(cx + 52, cy + 44, 20, 6);
        // Petits bras et manchettes de m?tal sous la silhouette.
        ctx.fillStyle = '#211713'; ctx.fillRect(cx - 65, cy - 6, 23, 53); ctx.fillRect(cx + 42, cy - 6, 23, 53);
        ctx.fillStyle = bodyColor; ctx.fillRect(cx - 59, cy, 14, 37); ctx.fillRect(cx + 45, cy, 14, 37);
        ctx.fillStyle = '#b47a45'; ctx.fillRect(cx - 64, cy + 34, 24, 12); ctx.fillRect(cx + 40, cy + 34, 24, 12);
        // Corps en rang?es de pixels, avec un liser? sombre et des facettes de peau.
        const bossRows = [5, 8, 10, 12, 14, 15, 16, 16, 15, 14, 12, 9];
        bossRows.forEach((count, row) => {
            const y = cy - 48 + row * 8, w = count * 8, x = cx - w / 2;
            ctx.fillStyle = '#211713'; ctx.fillRect(x - 8, y, w + 16, 8);
            ctx.fillStyle = bodyColor; ctx.fillRect(x, y, w, 8);
            ctx.fillStyle = row < 5 ? '#a96b43' : '#855035';
            ctx.fillRect(x + 8, y, Math.max(8, w - 24), 3);
        });
        // Armure de mineur, rivets, sangle et plaques de cuivre.
        ctx.fillStyle = '#5d2029'; ctx.fillRect(cx - 42, cy + 15, 84, 18);
        ctx.fillStyle = '#c79b4f'; ctx.fillRect(cx - 38, cy + 18, 76, 11);
        ctx.fillStyle = '#fff0a1'; ctx.fillRect(cx - 8, cy + 17, 16, 13);
        ctx.fillStyle = '#fff8cf'; ctx.fillRect(cx - 3, cy + 20, 6, 7);
        ctx.fillStyle = '#b77c45'; ctx.fillRect(cx - 43, cy + 19, 5, 5); ctx.fillRect(cx + 38, cy + 19, 5, 5);
        ctx.fillStyle = '#d89c58'; ctx.fillRect(cx - 34, cy - 30, 18, 8); ctx.fillRect(cx + 16, cy + 4, 15, 8); ctx.fillRect(cx - 10, cy + 37, 17, 5);
        // Couronne forg?e en escalier, lampe ambr?e au centre.
        ctx.fillStyle = '#392617'; ctx.fillRect(cx - 36, cy - 60, 72, 20);
        ctx.fillStyle = '#d8a744'; ctx.fillRect(cx - 32, cy - 56, 64, 16);
        ctx.fillRect(cx - 32, cy - 68, 12, 16); ctx.fillRect(cx - 8, cy - 76, 16, 24); ctx.fillRect(cx + 20, cy - 68, 12, 16);
        ctx.fillStyle = '#fff0a1'; ctx.fillRect(cx - 4, cy - 64, 8, 8);
        // Regard braise, sourcils ?pais, grosse moustache et bouche carr?e.
        ctx.fillStyle = '#f2d8a4'; ctx.fillRect(cx - 28, cy - 12, 20, 20); ctx.fillRect(cx + 8, cy - 12, 20, 20);
        ctx.fillStyle = '#b83e32'; ctx.fillRect(cx - 20, cy - 8, 12, 12); ctx.fillRect(cx + 12, cy - 8, 12, 12);
        ctx.fillStyle = '#24130f'; ctx.fillRect(cx - 32, cy - 20, 28, 8); ctx.fillRect(cx + 4, cy - 20, 28, 8);
        ctx.fillStyle = '#271411'; ctx.fillRect(cx - 20, cy + 20, 40, 12); ctx.fillStyle = '#e6c48f'; ctx.fillRect(cx - 12, cy + 20, 24, 4);

        // Barre de vie
        const barW = 170;
        const barX = cx - barW / 2;
        const barY = b.y - 40;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(barX - 3, barY - 3, barW + 6, 22);
        ctx.fillStyle = '#3a1414';
        ctx.fillRect(barX, barY, barW, 16);
        const pct = Math.max(0, b.hp / b.maxHp);
        ctx.fillStyle = pct > 0.5 ? '#e04b4b' : '#ff8c42';
        ctx.fillRect(barX, barY, barW * pct, 16);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 16px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LE ROI PURÉE', cx, barY - 10);
    }

    drawProjectiles(ctx) {
        for (const pr of this.projectiles) {
            const x = Math.round(pr.x), y = Math.round(pr.y);
            if (pr.type === 'frite') {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.atan2(pr.vy, pr.vx));
                ctx.fillStyle = pr.color;
                ctx.fillRect(-12, -5, 24, 10);
                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.fillRect(-12, 2, 24, 3);
                ctx.restore();
            } else if (pr.type === 'puree') {
                ctx.fillStyle = pr.color;
                ctx.beginPath();
                ctx.arc(x, y, pr.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.beginPath();
                ctx.arc(x - 3, y - 3, pr.r * 0.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = pr.color;
                ctx.beginPath();
                ctx.ellipse(x, y, pr.r + 2, pr.r - 1, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.beginPath();
                ctx.arc(x + 2, y - 2, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawPlayer(ctx) {
        const p = this.player, cx = Math.round(p.x + p.w / 2), cy = Math.round(p.y + p.h / 2);
        const pixel = 4;
        ctx.save();
        if (p.invuln > 0 && Math.floor(this.elapsed * 14) % 2 === 0) ctx.globalAlpha = .45;
        // Ombre carr?e et petites chaussures visibles sous la patate.
        ctx.fillStyle = '#100d0a'; ctx.fillRect(cx - 20, cy + 24, 40, 4);
        ctx.fillStyle = '#5a3524'; ctx.fillRect(cx - 16, cy + 20, 12, 8); ctx.fillRect(cx + 4, cy + 20, 12, 8);
        ctx.fillStyle = '#a96b3c'; ctx.fillRect(cx - 20, cy + 24, 16, 4); ctx.fillRect(cx + 4, cy + 24, 16, 4);
        // Sac de mineur derri?re le corps.
        ctx.fillStyle = '#21493f'; ctx.fillRect(cx - 24, cy - 8, 8, 24); ctx.fillRect(cx - 20, cy + 8, 8, 8);
        ctx.fillStyle = '#39745d'; ctx.fillRect(cx - 20, cy - 4, 4, 12);
        // Corps patate, silhouette bomb?e en marches de pixels (pas un personnage humain).
        const rows = [6, 8, 10, 12, 14, 14, 14, 14, 14, 12, 10, 8];
        rows.forEach((count, row) => {
            const y = cy - 20 + row * pixel, x = cx - count * pixel / 2;
            ctx.fillStyle = '#21140e'; ctx.fillRect(x - pixel, y, count * pixel + pixel * 2, pixel);
            ctx.fillStyle = '#9d5932'; ctx.fillRect(x, y, count * pixel, pixel);
            if (row > 0 && row < 10) {
                ctx.fillStyle = row < 4 ? '#d19455' : '#bb7541';
                ctx.fillRect(x + pixel, y, Math.max(pixel, (count - 2) * pixel), pixel);
            }
        });
        // Deux petites jambes et chaussures d?passent du bas de la silhouette.
        ctx.fillStyle = '#21140e'; ctx.fillRect(cx - 16, cy + 20, 12, 12); ctx.fillRect(cx + 4, cy + 20, 12, 12);
        ctx.fillStyle = '#71442c'; ctx.fillRect(cx - 12, cy + 20, 8, 8); ctx.fillRect(cx + 4, cy + 20, 8, 8);
        ctx.fillStyle = '#a96b3c'; ctx.fillRect(cx - 20, cy + 28, 16, 4); ctx.fillRect(cx + 4, cy + 28, 16, 4);
        // Reflets et taches de peau comme sur une vraie petite patate.
        ctx.fillStyle = '#e4ad6b'; ctx.fillRect(cx - 12, cy - 12, 8, 4); ctx.fillRect(cx - 16, cy - 8, 4, 8);
        ctx.fillStyle = '#784328'; ctx.fillRect(cx + 12, cy + 8, 4, 4); ctx.fillRect(cx - 4, cy + 16, 4, 4); ctx.fillRect(cx + 4, cy - 4, 4, 4);
        // Visage souriant : yeux sombres et bouche claire, dans l'esprit de la r?f?rence.
        ctx.fillStyle = '#21130d'; ctx.fillRect(cx - 12, cy - 4, 4, 4); ctx.fillRect(cx + 8, cy - 4, 4, 4);
        ctx.fillRect(cx - 8, cy + 4, 16, 4); ctx.fillStyle = '#f3e9d2'; ctx.fillRect(cx - 8, cy + 4, 16, 3);
        ctx.fillStyle = '#d86643'; ctx.fillRect(cx - 4, cy + 8, 8, 2);
        // Casque de mineur trapu et lampe jaune carr?e.
        ctx.fillStyle = '#3b2919'; ctx.fillRect(cx - 16, cy - 28, 32, 8); ctx.fillRect(cx - 12, cy - 32, 24, 4);
        ctx.fillStyle = '#d49a3e'; ctx.fillRect(cx - 12, cy - 28, 24, 4); ctx.fillRect(cx - 20, cy - 24, 40, 4);
        ctx.fillStyle = '#fff0a1'; ctx.fillRect(cx - 4, cy - 28, 8, 4); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, cy - 28, 3, 2);
        // Bras et fusil ? patates point? vers le curseur.
        ctx.fillStyle = '#c47a45'; ctx.fillRect(cx + 12, cy + 4, 8, 8);
        ctx.save(); ctx.translate(cx + 18, cy + 6); ctx.rotate(p.angle);
        ctx.fillStyle = '#2a211b'; ctx.fillRect(-2, -4, 28, 8);
        ctx.fillStyle = WEAPONS[this.weaponId].color; ctx.fillRect(8, -4, 18, 4);
        ctx.fillStyle = '#81502d'; ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = '#ead08b'; ctx.fillRect(20, -4, 6, 4);
        ctx.restore();
        if (this.upgrades.lamp > 0) {
            ctx.fillStyle = '#ffe69b'; ctx.globalAlpha = .3;
            ctx.fillRect(cx + 20, cy - 28, 40 + this.upgrades.lamp * 12, 8);
        }
        ctx.restore();
    }

    drawParticles(ctx) {
        for (const pa of this.particles) {
            ctx.globalAlpha = Math.max(0, pa.life / pa.max);
            ctx.fillStyle = pa.color;
            ctx.fillRect(Math.round(pa.x), Math.round(pa.y), Math.round(pa.size), Math.round(pa.size));
        }
        ctx.globalAlpha = 1;
    }

    drawFloaters(ctx) {
        ctx.font = 'bold 22px Trebuchet MS, sans-serif';
        ctx.textAlign = 'center';
        for (const fl of this.floaters) {
            ctx.globalAlpha = Math.min(1, fl.life * 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineWidth = 5;
            ctx.strokeText(fl.text, fl.x, fl.y);
            ctx.fillStyle = fl.color;
            ctx.fillText(fl.text, fl.x, fl.y);
        }
        ctx.globalAlpha = 1;
    }

    /* Brume noire : ombre r?ellement port?e par les murs. */
    drawFog(ctx) {
        const cam = this.cam;
        const pxS = this.player.x + this.player.w / 2 - cam.x;
        const pyS = this.player.y + this.player.h / 2 - cam.y;
        const radius = 660 + ((this.upgrades && this.upgrades.lamp) || 0) * 70;
        const rays = 240, points = new Array(rays);
        // Rays follow the cave grid, so light stops at rock instead of leaking through walls.
        for (let i = 0; i < rays; i++) {
            const angle = -Math.PI + i / rays * Math.PI * 2;
            const dx = Math.cos(angle), dy = Math.sin(angle);
            let d = 0;
            while (d < radius) {
                d += 10;
                if (this.pointInWall(this.player.x + this.player.w / 2 + dx * d,
                    this.player.y + this.player.h / 2 + dy * d)) break;
            }
            points[i] = { x: pxS + dx * Math.min(d, radius), y: pyS + dy * Math.min(d, radius) };
        }
        const fog = this.fogCtx;
        fog.clearRect(0, 0, cam.w, cam.h);
        fog.globalCompositeOperation = 'source-over';
        fog.fillStyle = 'rgba(2,4,7,.46)'; fog.fillRect(0, 0, cam.w, cam.h);
        fog.globalCompositeOperation = 'destination-out';
        fog.fillStyle = '#000'; fog.beginPath(); fog.moveTo(pxS, pyS);
        for (const point of points) fog.lineTo(point.x, point.y);
        fog.closePath(); fog.fill();
        fog.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.fogCanvas, 0, 0, cam.w, cam.h);

        // Four stepped light bands replace the soft blurred spotlight with chunky pixel-art falloff.
        ctx.save(); ctx.beginPath(); ctx.moveTo(pxS, pyS);
        for (const point of points) ctx.lineTo(point.x, point.y);
        ctx.closePath(); ctx.clip();
        const cell = 24, left = Math.max(0, Math.floor((pxS - radius) / cell) * cell);
        const top = Math.max(0, Math.floor((pyS - radius) / cell) * cell);
        for (let y = top; y < Math.min(cam.h, pyS + radius); y += cell) {
            for (let x = left; x < Math.min(cam.w, pxS + radius); x += cell) {
                const d = Math.hypot(x + cell / 2 - pxS, y + cell / 2 - pyS) / radius;
                const alpha = d < .56 ? 0 : d < .70 ? .025 : d < .84 ? .06 : d < .96 ? .11 : .17;
                if (!alpha) continue;
                ctx.fillStyle = `rgba(3,5,8,${alpha})`; ctx.fillRect(x, y, cell, cell);
            }
        }
        ctx.restore();
    }

    drawCrosshair(ctx) {
        const x = Math.round(this.mouse.x), y = Math.round(this.mouse.y);
        if (x < 0 || y < 0 || x > this.cam.w || y > this.cam.h) return;

        ctx.strokeStyle = this.overheated ? '#e04b4b' : 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y);
        ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
        ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4);
        ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    drawHurtFlash(ctx) {
        if (!(this.hurtFlash > 0)) return;
        ctx.fillStyle = 'rgba(224,0,0,' + (this.hurtFlash * 0.45) + ')';
        ctx.fillRect(0, 0, this.cam.w, this.cam.h);
    }

    /** Léger vignetta + lignes de balayage rétro */
    drawVignette(ctx) {
        const w = this.cam.w, h = this.cam.h;
        // Bordure d'ombre en marches de pixels, sans flou ni lignes de balayage.
        ctx.fillStyle = 'rgba(0,0,0,.09)';
        ctx.fillRect(0, 0, w, 18); ctx.fillRect(0, h - 18, w, 18);
        ctx.fillRect(0, 0, 18, h); ctx.fillRect(w - 18, 0, 18, h);
        ctx.fillStyle = 'rgba(0,0,0,.045)';
        ctx.fillRect(18, 0, w - 36, 10); ctx.fillRect(18, h - 10, w - 36, 10);
        ctx.fillRect(0, 18, 10, h - 36); ctx.fillRect(w - 10, 18, 10, h - 36);
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        for (const [x, y] of [[0,0],[w-48,0],[0,h-48],[w-48,h-48]]) ctx.fillRect(x, y, 48, 48);
    }

    /** Minimap : carte complète + repères */
    drawMinimap() {
        const mm = this.dom['minimap'];
        if (!mm || mm.classList.contains('hidden')) return;
        const g = mm.getContext('2d');
        if (!g) return;

        const W = GAME_CONFIG.WORLD_W, H = GAME_CONFIG.WORLD_H;
        const sx = mm.width / W, sy = mm.height / H;

        g.clearRect(0, 0, mm.width, mm.height);
        if (this.minimapCache) {
            g.drawImage(this.minimapCache, 0, 0);
        } else {
            g.fillStyle = 'rgba(8,5,2,0.85)';
            g.fillRect(0, 0, mm.width, mm.height);
            for (const d of DISTRICTS) {
                g.fillStyle = d.color;
                g.fillRect(0, d.yMin * sy, mm.width, (d.yMax - d.yMin) * sy);
            }
            g.fillStyle = 'rgba(255,255,255,0.30)';
            for (const w of this.walls) {
                g.fillRect(w.x * sx, w.y * sy, Math.max(1, w.w * sx), Math.max(1, w.h * sy));
            }
            const z = this.deliveryZone;
            g.fillStyle = 'rgba(154,205,50,0.55)';
            g.fillRect(z.x * sx, z.y * sy, z.w * sx, z.h * sy);
            const gate = this.roomCenters[10];
            g.fillStyle = '#bf7cff'; g.fillRect(gate.x * sx - 3, gate.y * sy - 4, 6, 8);
            g.fillStyle = '#ffe08a'; g.fillRect(gate.x * sx - 1, gate.y * sy - 3, 2, 6);
            this.minimapCache = document.createElement('canvas');
            this.minimapCache.width = mm.width; this.minimapCache.height = mm.height;
            this.minimapCache.getContext('2d').drawImage(mm, 0, 0);
        }

        // Objets et monstres connus dans la zone visible, jamais à travers les murs.
        const pcx = this.player.x + this.player.w / 2;
        const pcy = this.player.y + this.player.h / 2;
        for (const t of this.treasures) {
            if (t.taken) continue;
            const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
            if (dist(pcx, pcy, tx, ty) > 520 || !this.hasLineOfSight(pcx, pcy, tx, ty)) continue;
            g.fillStyle = t.type === 'golden' ? '#ffe680' :
                (t.type === 'special' ? '#ff66ff' : '#8fa8c8');
            const s = t.type === 'golden' || t.type === 'special' ? 4 : 3;
            g.fillRect((t.x + t.size / 2) * sx - s / 2, (t.y + t.size / 2) * sy - s / 2, s, s);
        }

        for (const cache of this.supplyCaches) {
            if (cache.taken) continue;
            g.fillStyle = cache.kind === 'heart' ? '#ff7182' : '#79eaff';
            g.fillRect(cache.x * sx - 2, cache.y * sy - 2, 4, 4);
        }

        // Ennemis
        g.fillStyle = '#ff5555';
        for (const e of this.enemies) {
            const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
            if (dist(pcx, pcy, ex, ey) > 520 || !this.hasLineOfSight(pcx, pcy, ex, ey)) continue;
            g.fillRect((e.x + e.w / 2) * sx - 1, (e.y + e.h / 2) * sy - 1, 3, 3);
        }

        // Boss
        if (this.bossArenaActive && this.bossPhase === 'boss' && this.boss && !this.boss.defeated) {
            const bx = this.boss.x + this.boss.w / 2, by = this.boss.y + this.boss.h / 2;
            if (dist(pcx, pcy, bx, by) <= 650 && this.hasLineOfSight(pcx, pcy, bx, by)) {
                g.fillStyle = '#ffd700';
                g.fillRect(bx * sx - 3, by * sy - 3, 7, 7);
            }
        }

        // Cadre de la caméra
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 1;
        g.strokeRect(this.cam.x * sx, this.cam.y * sy, this.cam.w * sx, this.cam.h * sy);

        // Joueur
        g.fillStyle = '#5cff5c';
        const px = (this.player.x + this.player.w / 2) * sx;
        const py = (this.player.y + this.player.h / 2) * sy;
        g.fillRect(px - 2, py - 2, 5, 5);
    }
}

/* ============================================================
   DÉMARRAGE
   ============================================================ */
window.addEventListener('DOMContentLoaded', function () {
    new PotatoRush();
});


