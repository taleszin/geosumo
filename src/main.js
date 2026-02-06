/**
 * main.js — Ponto de entrada do GEO SUMO.
 *
 * Fluxo: MENU → CUSTOMIZE → FIGHT → WIN/LOSE → (loop)
 *
 * Melhorias UX:
 *   - Expressões faciais dinâmicas (ataque, dor, desnorteamento)
 *   - Charge/dash com Shift/Espaço → investida sumo (tachi-ai)
 *   - Indicador de borda da arena (tela pisca vermelho)
 *   - Slow-mo em impactos fortes
 *   - Countdown antes do round
 *   - HP bars com cores dinâmicas
 *   - Indicador de charge na HUD
 */
import './style.css';

// ── Engine ────────────────────────────────────────────────────
import { initRenderer, initArenaPlane, resizeViewport,
         beginFrame, useObjShader, endObjShader, getMV } from './engine/Renderer.js';
import { initInput, getInput }                           from './engine/Input.js';
import * as SFX                                           from './audio/SFX.js';
import { Camera }                                        from './engine/Camera.js';
import { lerp, clamp }                                   from './engine/MathUtils.js';

// ── Game ──────────────────────────────────────────────────────
import { makePlayerEntity, makeEnemyEntity, MAX_HP,
         setExpression, tickExpression,
         EXPR_NORMAL, EXPR_ATTACK, EXPR_HURT,
         EXPR_STUNNED, EXPR_CHARGING }                   from './game/Entity.js';
import { updateEntityPhysics, checkArmGround,
         checkArmHit, bodyCollision, GROUND_Y }          from './game/Physics.js';
import { updatePlayerMovement, updatePlayerArms }        from './game/Player.js';
import { EnemyAI }                                       from './game/Enemy.js';
import { ARENA_RADIUS, checkArenaEdge,
         drawArena, drawShadow }                         from './game/Arena.js';
import { drawEntity, drawEntityPreview }                 from './game/EntityRenderer.js';

// ── Customization ─────────────────────────────────────────────
import { SHAPE_IDS, COLOR_IDS, EYE_IDS, MOUTH_IDS,
         getShape, getColor, getEyes, getMouth,
         cycleOption, defaultCustomization,
         randomCustomization }                           from './data/Customization.js';

// ═════════════════════════════════════════════════════════════
// Estado global
// ═════════════════════════════════════════════════════════════

let phase    = 'menu';      // 'menu' | 'customize' | 'countdown' | 'fight' | 'win' | 'lose'
let round    = 1;
let gameTime = 0;
let slowMo   = 1.0;

let player  = null;
let enemy   = null;
let enemyAI = null;
let camera  = null;

// Customização do jogador
let playerCustom = defaultCustomization();

// Preview entity
let previewEntity = null;

// FPS
let fpsFrames  = 0;
let fpsTime    = 0;
let fpsCurrent = 60;
let lastTime   = 0;

// Countdown state
let countdownTimer = 0;
let countdownText  = '';
let _lastCountdownStage = null;

// Edge warning overlay
let edgeWarning = 0; // 0..1, intensidade do aviso de borda
let _lastEdgeWarn = 0; // usado para evitar spam de SFX

// ── DOM refs ──────────────────────────────────────────────────
const $canvas       = /** @type {HTMLCanvasElement} */ (document.getElementById('glcanvas'));
const $hpPlayer     = document.getElementById('hp-player');
const $hpEnemy      = document.getElementById('hp-enemy');
const $roundNum     = document.getElementById('round-num');
const $dbgPos       = document.getElementById('dbg-pos');
const $dbgVel       = document.getElementById('dbg-vel');
const $dbgFps       = document.getElementById('dbg-fps');
const $stateScreen  = document.getElementById('state-screen');
const $stateTitle   = document.getElementById('state-title');
const $stateSub     = document.getElementById('state-sub');
const $stateHint    = document.getElementById('state-hint');
const $hud          = document.getElementById('hud');

// Customization DOM
const $custScreen    = document.getElementById('customize-screen');
const $custShapeDisp = document.getElementById('cust-shape-display');
const $custColorDisp = document.getElementById('cust-color-display');
const $custEyesDisp  = document.getElementById('cust-eyes-display');
const $custMouthDisp = document.getElementById('cust-mouth-display');
const $custDesc      = document.getElementById('cust-desc');
const $custFightBtn  = document.getElementById('cust-fight-btn');
const $custRandomBtn = document.getElementById('cust-random-btn');

// ═════════════════════════════════════════════════════════════
// Bootstrap
// ═════════════════════════════════════════════════════════════

function boot() {
    $canvas.width  = window.innerWidth;
    $canvas.height = window.innerHeight;

    const gl = initRenderer($canvas);
    if (!gl) return;

    initArenaPlane(ARENA_RADIUS);
    window.addEventListener('resize', resizeCanvas);

    camera = new Camera();
    initInput(() => phase, onStateClick);

    // Audio init — cria AudioContext e prepara os sintetizadores.
    SFX.init();
    // Resume on first click (sincroniza com política de autoplay dos navegadores)
    document.addEventListener('click', () => SFX.resume(), { once: true });

    _initCustomizeUI();
    _updatePreviewEntity();

    showStateScreen('GEO SUMO', 'GEOMETRIC BRAWLER — EMPURRE PARA FORA', '[ CLIQUE PARA PERSONALIZAR ]', '#0ff');
    $hud.style.display = 'none';

    lastTime = performance.now();
    requestAnimationFrame(tick);
}

// ═════════════════════════════════════════════════════════════
// Game Loop
// ═════════════════════════════════════════════════════════════

function tick(now) {
    requestAnimationFrame(tick);

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    // FPS
    fpsFrames++;
    const elapsed = now - fpsTime;
    if (elapsed >= 500) {
        fpsCurrent = Math.round((fpsFrames * 1000) / elapsed);
        fpsFrames = 0;
        fpsTime = now;
    }

    // Slow-mo decay
    slowMo = lerp(slowMo, 1.0, 0.06);
    if (slowMo > 0.98) slowMo = 1.0;

    gameTime += dt * slowMo;

    // Edge warning decay
    edgeWarning *= 0.92;
    if (edgeWarning < 0.01) edgeWarning = 0;

    // ── UPDATE ──
    if (phase === 'fight') {
        _updateFight(dt);
    } else if (phase === 'countdown') {
        _updateCountdown(dt);
    }

    // ── RENDER ──
    const aspect = $canvas.width / $canvas.height;
    beginFrame(aspect);

    if (phase === 'customize') {
        _renderCustomize();
    } else {
        camera.apply(getMV());
        drawArena(gameTime);

        if (player && enemy) {
            useObjShader();
            drawShadow(player);
            drawShadow(enemy);
            drawEntity(player, gameTime);
            drawEntity(enemy, gameTime);
            endObjShader();
        }
    }

    // Edge warning overlay
    if (edgeWarning > 0.01) {
        $canvas.style.boxShadow = `inset 0 0 ${60 * edgeWarning}px ${20 * edgeWarning}px rgba(255,30,30,${edgeWarning * 0.5})`;
    } else {
        $canvas.style.boxShadow = 'none';
    }

    // HUD
    if (phase === 'fight' || phase === 'countdown') {
        updateHUD();
    }
}

// ═════════════════════════════════════════════════════════════
// Countdown Phase (3, 2, 1, FIGHT!)
// ═════════════════════════════════════════════════════════════

function _updateCountdown(dt) {
    countdownTimer -= dt;

    if (countdownTimer > 2.0) {
        countdownText = '3';
    } else if (countdownTimer > 1.0) {
        countdownText = '2';
    } else if (countdownTimer > 0.0) {
        countdownText = '1';
    } else {
        countdownText = 'FIGHT!';
    }

    $stateTitle.textContent = countdownText;
    $stateTitle.style.color = countdownTimer <= 0 ? '#0f0' : '#0ff';
    $stateTitle.style.fontSize = countdownTimer <= 0 ? '5rem' : '6rem';
    $stateSub.textContent = '';
    $stateHint.textContent = '';

    // Play tick when stage changes
    if (countdownText !== _lastCountdownStage) {
        _lastCountdownStage = countdownText;
        SFX.playCountdownTick(countdownText === 'FIGHT!' ? 'FIGHT' : countdownText);
    }

    if (countdownTimer <= -0.5) {
        phase = 'fight';
        $stateScreen.style.display = 'none';
    }

    // Camera segue durante countdown
    if (player && enemy) {
        camera.update(player.pos, player.rot[1], enemy.pos);
    }
}

// ═════════════════════════════════════════════════════════════
// Fight Phase
// ═════════════════════════════════════════════════════════════

function _updateFight(dt) {
    const input = getInput();
    const camYaw = camera.getYaw();

    // 1. Player com feedback de charge
    const moveResult = updatePlayerMovement(player, input, camYaw);
    updatePlayerArms(player, input);

    // Movement SFX level (dependendo da velocidade)
    const hSpeed = Math.sqrt(player.vel[0] ** 2 + player.vel[2] ** 2);
    SFX.setMovementLevel(Math.min(1, hSpeed / 0.9));

    // Player attack expression quando soca
    if (input.lClick && player.arms.left.currentExt > 2.0) {
        setExpression(player, EXPR_ATTACK, 10);
    }
    if (input.rClick && player.arms.right.currentExt > 2.0) {
        setExpression(player, EXPR_ATTACK, 10);
    }

    // Charge shake
    if (moveResult.charging && player.chargeAmount > 0.5) {
        camera.addShake(player.chargeAmount * 0.3);
    }
    // Dash release shake
    if (moveResult.dashPower > 0) {
        camera.addShake(moveResult.dashPower * 3.0);
        setExpression(player, EXPR_ATTACK, 20);
        SFX.playDash(moveResult.dashPower);
    }

    // 2. Enemy AI
    enemyAI.update(enemy, player, gameTime, ARENA_RADIUS);

    // 3. Física
    updateEntityPhysics(player);
    updateEntityPhysics(enemy);

    // 4. Tick expressões
    tickExpression(player);
    tickExpression(enemy);

    // 5. Colisão braço vs chão
    checkArmGround(player, 'left');
    checkArmGround(player, 'right');
    checkArmGround(enemy,  'left');
    checkArmGround(enemy,  'right');

    // 6. Colisão braço vs corpo (com EXPRESSÕES)
    const shakeCb = (amt) => camera.addShake(amt);
    const hitEL = checkArmHit(player, enemy, 'left',  -1, shakeCb, ARENA_RADIUS);
    const hitER = checkArmHit(player, enemy, 'right',  1, shakeCb, ARENA_RADIUS);
    const hitPL = checkArmHit(enemy, player, 'left',  -1, shakeCb, ARENA_RADIUS);
    const hitPR = checkArmHit(enemy, player, 'right',  1, shakeCb, ARENA_RADIUS);

    // Expressões baseadas nos hits
    if (hitEL || hitER) {
        // Inimigo foi atingido
        const force = Math.max(hitEL || 0, hitER || 0);
        if (force > 0.3) {
            setExpression(enemy, EXPR_STUNNED, 40);
        } else {
            setExpression(enemy, EXPR_HURT, 20);
        }
        setExpression(player, EXPR_ATTACK, 15);
        SFX.playImpact(force);
    }
    if (hitPL || hitPR) {
        // Jogador foi atingido
        const force = Math.max(hitPL || 0, hitPR || 0);
        if (force > 0.3) {
            setExpression(player, EXPR_STUNNED, 40);
        } else {
            setExpression(player, EXPR_HURT, 20);
        }
        setExpression(enemy, EXPR_ATTACK, 15);
        SFX.playImpact(force);
    }

    // Slow-mo em impactos fortes
    const maxHitForce = Math.max(hitEL || 0, hitER || 0, hitPL || 0, hitPR || 0);
    if (maxHitForce > 0.15) {
        slowMo = clamp(0.15 + (1.0 - maxHitForce) * 0.5, 0.1, 0.6);
    }


    // 7. Body collision com expressão de body slam
    const bodyForce = bodyCollision(player, enemy);
    if (bodyForce > 0.1) {
        // Ambos fazem cara de esforço
        setExpression(player, EXPR_ATTACK, 10);
        setExpression(enemy, EXPR_ATTACK, 10);
        camera.addShake(bodyForce * 1.5);
        SFX.playBodySlam(bodyForce);
    }
    if (bodyForce > 0.3) {
        // Body slam! Stunned para quem levou pior
        const pSpeed = Math.sqrt(player.vel[0] ** 2 + player.vel[2] ** 2);
        const eSpeed = Math.sqrt(enemy.vel[0] ** 2 + enemy.vel[2] ** 2);
        if (pSpeed > eSpeed) {
            setExpression(enemy, EXPR_STUNNED, 30);
        } else {
            setExpression(player, EXPR_STUNNED, 30);
        }
        slowMo = 0.25;
    }

    // 8. Arena edge → win/lose + EDGE WARNING
    const playerEdge = Math.sqrt(player.pos[0] ** 2 + player.pos[2] ** 2);
    const edgeRatio = playerEdge / ARENA_RADIUS;
    if (edgeRatio > 0.65) {
        edgeWarning = clamp((edgeRatio - 0.65) / 0.35, 0, 1);
    }
    // Edge warning SFX when crosses threshold
    if (edgeWarning > 0.4 && _lastEdgeWarn <= 0.4) {
        SFX.playEdgeWarning(edgeWarning);
    }
    _lastEdgeWarn = edgeWarning;

    const playerOut = checkArenaEdge(player);
    const enemyOut  = checkArenaEdge(enemy);

    if (enemyOut || enemy.hp <= 0) {
        phase = 'win';
        $hud.style.display = 'none';
        $stateTitle.style.fontSize = '';
        showStateScreen('VITÓRIA!', `Round ${round} completado`,
            '[ CLIQUE PARA PRÓXIMO ROUND ]', '#0f0');
        SFX.playWin();
    } else if (playerOut || player.hp <= 0) {
        phase = 'lose';
        $hud.style.display = 'none';
        $stateTitle.style.fontSize = '';
        showStateScreen('DERROTA', `Eliminado no round ${round}`,
            '[ CLIQUE PARA RECOMEÇAR ]', '#f22');
        SFX.playLose();
    }

    // 9. Cor reage ao HP
    _updateColorByHP(player);
    _updateColorByHP(enemy);

    // 10. Camera follow
    camera.update(player.pos, player.rot[1], enemy.pos);
}

// ═════════════════════════════════════════════════════════════
// Customization Phase
// ═════════════════════════════════════════════════════════════

function _renderCustomize() {
    const previewPos = [0, GROUND_Y + 1.5, 0];
    camera.snapTo(previewPos, 0, previewPos);
    camera.apply(getMV());

    drawArena(gameTime);

    if (previewEntity) {
        useObjShader();
        drawShadow(previewEntity);
        drawEntityPreview(previewEntity, gameTime);
        endObjShader();
    }
}

function _updatePreviewEntity() {
    const palette = getColor(playerCustom.color);
    const shape   = getShape(playerCustom.shape);
    const s = 1.5;

    previewEntity = {
        pos:       [0, GROUND_Y + s * shape.bodyScale[1], 0],
        vel:       [0, 0, 0],
        rot:       [0, 0, 0],
        size:      s,
        mass:      1,
        hp:        100,
        maxHp:     100,
        hitFlash:  0,
        color:     palette.body.slice(),
        baseColor: palette.body.slice(),
        onGround:  true,
        custom:    { ...playerCustom },
        expression:     0,
        expressionTimer: 0,
        chargeAmount:   0,
        isCharging:     false,
        _hitCdL:   0,
        _hitCdR:   0,
        arms: {
            left:  { currentExt: 0.8, targetExt: 0.8, currentRot: [0,0], targetRot: [0,0], prevExt: 0.8, color: palette.armL.slice() },
            right: { currentExt: 0.8, targetExt: 0.8, currentRot: [0,0], targetRot: [0,0], prevExt: 0.8, color: palette.armR.slice() },
        },
    };
}

function _updateCustomizeDisplay() {
    const shape = getShape(playerCustom.shape);
    const color = getColor(playerCustom.color);
    const eyes  = getEyes(playerCustom.eyes);
    const mouth = getMouth(playerCustom.mouth);

    $custShapeDisp.textContent = `${shape.icon} ${shape.name}`;
    $custColorDisp.textContent = `${color.icon} ${color.name}`;
    $custEyesDisp.textContent  = `${eyes.icon} ${eyes.name}`;
    $custMouthDisp.textContent = `${mouth.icon} ${mouth.name}`;

    const r = Math.round(color.body[0] * 255);
    const g = Math.round(color.body[1] * 255);
    const b = Math.round(color.body[2] * 255);
    $custColorDisp.style.color = `rgb(${r},${g},${b})`;
    $custColorDisp.style.textShadow = `0 0 10px rgb(${r},${g},${b})`;

    $custDesc.textContent = shape.desc;
    _updatePreviewEntity();
}

function _initCustomizeUI() {
    document.querySelectorAll('.cust-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cat = btn.dataset.cat;
            const dir = parseInt(btn.dataset.dir);

            // UI feedback sonoro
            SFX.playNavigate();

            switch (cat) {
                case 'shape':
                    playerCustom.shape = cycleOption(SHAPE_IDS, playerCustom.shape, dir);
                    break;
                case 'color':
                    playerCustom.color = cycleOption(COLOR_IDS, playerCustom.color, dir);
                    break;
                case 'eyes':
                    playerCustom.eyes = cycleOption(EYE_IDS, playerCustom.eyes, dir);
                    break;
                case 'mouth':
                    playerCustom.mouth = cycleOption(MOUTH_IDS, playerCustom.mouth, dir);
                    break;
            }
            _updateCustomizeDisplay();
        });
    });

    $custFightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        SFX.playStart();
        startCountdown();
    });

    $custRandomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        SFX.playRandomize();
        const rand = randomCustomization();
        playerCustom.shape = rand.shape;
        playerCustom.color = rand.color;
        playerCustom.eyes  = rand.eyes;
        playerCustom.mouth = rand.mouth;
        _updateCustomizeDisplay();
    });

    document.addEventListener('keydown', (e) => {
        if (phase !== 'customize') return;
        if (e.key === 'Enter') {
            SFX.playStart();
            startCountdown();
        }
        else if (e.key === 'r' || e.key === 'R') {
            SFX.playRandomize();
            const rand = randomCustomization();
            playerCustom.shape = rand.shape;
            playerCustom.color = rand.color;
            playerCustom.eyes  = rand.eyes;
            playerCustom.mouth = rand.mouth;
            _updateCustomizeDisplay();
        }
    });
}

function enterCustomize() {
    phase = 'customize';
    $stateScreen.style.display = 'none';
    $hud.style.display = 'none';
    $custScreen.style.display = 'flex';
    _updateCustomizeDisplay();
}

function exitCustomize() {
    $custScreen.style.display = 'none';
}

// ═════════════════════════════════════════════════════════════
// Game State Management
// ═════════════════════════════════════════════════════════════

function startCountdown() {
    exitCustomize();

    // Criar entidades
    player = makePlayerEntity([0, 0, -4], 1.2, playerCustom);
    enemy = makeEnemyEntity([0, 0, 4], 1.2 + round * 0.1);
    enemyAI = new EnemyAI();

    // Snap camera
    camera.snapTo(player.pos, player.rot[1], enemy.pos);

    // Countdown
    phase = 'countdown';
    countdownTimer = 3.0;
    $hud.style.display = 'block';
    $stateScreen.style.display = 'flex';
    $stateTitle.style.fontSize = '6rem';
    $roundNum.textContent = round;

    edgeWarning = 0;
}

function nextRound() {
    round++;
    startCountdown();
}

function onStateClick(currentPhase) {
    SFX.playClick();
    switch (currentPhase) {
        case 'menu':
            round = 1;
            enterCustomize();
            break;
        case 'win':
            nextRound();
            break;
        case 'lose':
            round = 1;
            enterCustomize();
            break;
    }
}

// ═════════════════════════════════════════════════════════════
// HUD
// ═════════════════════════════════════════════════════════════

function showStateScreen(title, sub, hint, color) {
    $stateScreen.style.display = 'flex';
    $stateTitle.textContent    = title;
    $stateTitle.style.color    = color;
    $stateSub.textContent      = sub;
    $stateHint.textContent     = hint;
}

function updateHUD() {
    if (player) {
        const hpP = clamp(player.hp / player.maxHp, 0, 1);
        $hpPlayer.style.width = `${hpP * 100}%`;
        // Cor da barra muda conforme HP
        if (hpP > 0.5) {
            $hpPlayer.style.background = `linear-gradient(90deg, #0ff, #0f0)`;
        } else if (hpP > 0.25) {
            $hpPlayer.style.background = `linear-gradient(90deg, #ff0, #f80)`;
        } else {
            $hpPlayer.style.background = `linear-gradient(90deg, #f22, #f00)`;
        }
    }
    if (enemy) {
        const hpE = clamp(enemy.hp / enemy.maxHp, 0, 1);
        $hpEnemy.style.width = `${hpE * 100}%`;
        if (hpE > 0.5) {
            $hpEnemy.style.background = `linear-gradient(90deg, #f0f, #f0a)`;
        } else if (hpE > 0.25) {
            $hpEnemy.style.background = `linear-gradient(90deg, #ff0, #f80)`;
        } else {
            $hpEnemy.style.background = `linear-gradient(90deg, #f22, #f00)`;
        }
    }
    if (player) {
        $dbgPos.textContent = `POS: ${player.pos[0].toFixed(1)}, ${player.pos[1].toFixed(1)}, ${player.pos[2].toFixed(1)}`;
        const spd = Math.sqrt(player.vel[0] ** 2 + player.vel[2] ** 2);
        $dbgVel.textContent = `VEL: ${spd.toFixed(2)}`;

        // Charge indicator
        if (player.isCharging) {
            const pct = Math.round(player.chargeAmount * 100);
            $dbgVel.textContent = `⚡ CHARGE: ${pct}%`;
            $dbgVel.style.color = player.chargeReady ? '#0f0' : '#ff0';
        } else {
            $dbgVel.style.color = '';
        }
    }
    $dbgFps.textContent = `FPS: ${fpsCurrent}`;
}

// ═════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════

function _updateColorByHP(ent) {
    const ratio = ent.hp / ent.maxHp;
    ent.color[0] = lerp(1.0, ent.baseColor[0], ratio);
    ent.color[1] = lerp(0.1, ent.baseColor[1], ratio);
    ent.color[2] = lerp(0.1, ent.baseColor[2], ratio);
}

function resizeCanvas() {
    $canvas.width  = window.innerWidth;
    $canvas.height = window.innerHeight;
    resizeViewport($canvas.width, $canvas.height);
}

// ═════════════════════════════════════════════════════════════
// GO!
// ═════════════════════════════════════════════════════════════
boot();
