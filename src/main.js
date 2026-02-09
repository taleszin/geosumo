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
import { initInput, getInput, isTouchActive }            from './engine/Input.js';
import * as SFX                                           from './audio/SFX.js';
import * as Haptic                                        from './engine/Haptic.js';
import { Camera }                                        from './engine/Camera.js';
import { lerp, clamp }                                   from './engine/MathUtils.js';

// ── Game ──────────────────────────────────────────────────────
import { makePlayerEntity, makeEnemyEntity, START_DAMAGE,
         setExpression, tickExpression,
         EXPR_NORMAL, EXPR_ATTACK, EXPR_HURT,
         EXPR_STUNNED, EXPR_CHARGING }                   from './game/Entity.js';
import { updateEntityPhysics, checkArmGround,
         checkArmHit, bodyCollision, GROUND_Y,
         setDifficulty }                                from './game/Physics.js';
import { updatePlayerMovement, updatePlayerArms }        from './game/Player.js';
import { EnemyAI }                                       from './game/Enemy.js';
import { ARENA_RADIUS, checkArenaEdge, setArenaRadius,
         drawArena, drawShadow }                         from './game/Arena.js';
import { drawEntity, drawEntityPreview }                 from './game/EntityRenderer.js';

// ── Customization ─────────────────────────────────────────────
import { SHAPE_IDS, COLOR_IDS, EYE_IDS, MOUTH_IDS,
         getShape, getColor, getEyes, getMouth,
         cycleOption, defaultCustomization,
         randomCustomization }                           from './data/Customization.js';

// ═════════════════════════════════════════════════════════════
// Config de desenvolvimento (toggle para acelerar testes)
// ═════════════════════════════════════════════════════════════
const DEV = {
    hideRound: true, // set to true to hide round HUD during tests
};

// ═════════════════════════════════════════════════════════════
// Estado global
// ═════════════════════════════════════════════════════════════

let phase    = 'menu';      // 'menu' | 'customize' | 'countdown' | 'fight' | 'win' | 'lose'
let round    = 1;
let gameTime = 0;
let slowMo   = 1.0;

let player   = null;
let enemies  = [];     // array de inimigos (1-4)
let enemyAIs = [];     // array de IAs para cada inimigo
let camera   = null;
let numEnemies = 1;    // número escolhido de adversários (1-4)
let numLives   = 3;    // número de vidas por lutador (1-5) - Smash Bros style
let difficulty = 1;    // dificuldade: 0=Fácil, 1=Médio, 2=Difícil

// Customização do jogador
let playerCustom = defaultCustomization();
let enemyCustom  = null; // será definido ao apertar ALEATÓRIO ou gerado automaticamente

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
const $roundInfo    = document.getElementById('round-info');
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
const $custScreen      = document.getElementById('customize-screen');
const $custShapeDisp   = document.getElementById('cust-shape-display');
const $custColorDisp   = document.getElementById('cust-color-display');
const $custEyesDisp    = document.getElementById('cust-eyes-display');
const $custMouthDisp   = document.getElementById('cust-mouth-display');
const $custEnemyDisp   = document.getElementById('cust-enemy-display');
const $custLivesDisp   = document.getElementById('cust-lives-display');
const $custDifficultyDisp = document.getElementById('cust-difficulty-display');
const $custDesc        = document.getElementById('cust-desc');
const $custFightBtn    = document.getElementById('cust-fight-btn');
const $custRandomBtn   = document.getElementById('cust-random-btn');

// HP bar containers (will be generated dynamically)
const $hpBars = document.getElementById('hp-bars');

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
    // Resume on first click/touch (sincroniza com política de autoplay dos navegadores)
    document.addEventListener('click',     () => SFX.resume(), { once: true });
    document.addEventListener('touchstart', () => SFX.resume(), { once: true });

    _initCustomizeUI();
    _updatePreviewEntity();

    showStateScreen('GEO SUMO', 'GEOMETRIC BRAWLER — EMPURRE PARA FORA', '[ TOQUE OU CLIQUE PARA PERSONALIZAR ]', '#0ff');
    $hud.style.display = 'none';
    // Aplicar flag de dev: esconder contagem do round para testes rápidos
    if (typeof DEV !== 'undefined' && DEV.hideRound && $roundInfo) {
        $roundInfo.style.display = 'none';
    }

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

        if (player && enemies.length > 0) {
            useObjShader();
            drawShadow(player);
            enemies.forEach(enemy => drawShadow(enemy));
            drawEntity(player, gameTime);
            enemies.forEach(enemy => drawEntity(enemy, gameTime));
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

    // Se a flag de dev estiver ativa, suprima a contagem visual e o som
    if (typeof DEV !== 'undefined' && DEV.hideRound) {
        $stateTitle.textContent = '';
        // garantir estilo consistente caso o elemento seja mostrado por engano
        $stateTitle.style.color = '';
        $stateTitle.style.fontSize = '';
        $stateSub.textContent = '';
        $stateHint.textContent = '';
    } else {
        $stateTitle.textContent = countdownText;
        $stateTitle.style.color = countdownTimer <= 0 ? '#0f0' : '#0ff';
        $stateTitle.style.fontSize = countdownTimer <= 0 ? '5rem' : '6rem';
        $stateSub.textContent = '';
        $stateHint.textContent = '';
    }

    // Play tick when stage changes (skip sons em modo dev)
    if (countdownText !== _lastCountdownStage) {
        _lastCountdownStage = countdownText;
        if (!(typeof DEV !== 'undefined' && DEV.hideRound)) {
            SFX.playCountdownTick(countdownText === 'FIGHT!' ? 'FIGHT' : countdownText);
        }
    }

    if (countdownTimer <= -0.5) {
        phase = 'fight';
        $stateScreen.style.display = 'none';
    }

    // Camera segue durante countdown
    if (player && enemies.length > 0) {
        camera.update(player.pos, player.rot[1], enemies[0].pos);
    }
}

// ═════════════════════════════════════════════════════════════
// Fight Phase
// ═════════════════════════════════════════════════════════════

function _updateFight(dt) {
    const input = getInput();

    // 1. Player com feedback de charge
    const moveResult = updatePlayerMovement(player, input, 0);
    updatePlayerArms(player, input, isTouchActive());

    // Movement SFX level
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

    // 2. Atualizar todos os inimigos e suas IAs
    enemies.forEach((enemy, idx) => {
        enemyAIs[idx].update(enemy, player, enemies, gameTime, ARENA_RADIUS);
        updateEntityPhysics(enemy);
        tickExpression(enemy);
        checkArmGround(enemy, 'left');
        checkArmGround(enemy, 'right');
    });

    // 3. Física do player
    updateEntityPhysics(player);
    tickExpression(player);
    checkArmGround(player, 'left');
    checkArmGround(player, 'right');

    // 4. Colisões: player vs cada inimigo
    const shakeCb = (amt) => camera.addShake(amt);
    let maxHitForce = 0;

    enemies.forEach((enemy) => {
        // Braço do player vs corpo do inimigo
        const hitEL = checkArmHit(player, enemy, 'left',  -1, shakeCb, ARENA_RADIUS);
        const hitER = checkArmHit(player, enemy, 'right',  1, shakeCb, ARENA_RADIUS);
        
        // Braço do inimigo vs corpo do player
        const hitPL = checkArmHit(enemy, player, 'left',  -1, shakeCb, ARENA_RADIUS);
        const hitPR = checkArmHit(enemy, player, 'right',  1, shakeCb, ARENA_RADIUS);

        // Expressões dos hits do PLAYER
        if (hitEL || hitER) {
            const force = Math.max(hitEL || 0, hitER || 0);
            if (force > 0.3) {
                setExpression(enemy, EXPR_STUNNED, 40);
            } else {
                setExpression(enemy, EXPR_HURT, 20);
            }
            setExpression(player, EXPR_ATTACK, 15);
            SFX.playImpact(force);
            Haptic.impactPulse(force);
            maxHitForce = Math.max(maxHitForce, force);
            
            // HIT FREEZE EXTRA para socos fortes do player (UX juice!)
            if (force > 0.4) {
                slowMo = Math.min(slowMo, 0.3); // freeze mais forte
                camera.addShake(force * 2.0);   // shake extra
            }
        }
        if (hitPL || hitPR) {
            const force = Math.max(hitPL || 0, hitPR || 0);
            if (force > 0.3) {
                setExpression(player, EXPR_STUNNED, 40);
            } else {
                setExpression(player, EXPR_HURT, 20);
            }
            setExpression(enemy, EXPR_ATTACK, 15);
            SFX.playImpact(force);
            Haptic.heavyPulse();
            maxHitForce = Math.max(maxHitForce, force);
        }

        // Body collision player vs enemy
        const bodyForce = bodyCollision(player, enemy);
        if (bodyForce > 0.1) {
            setExpression(player, EXPR_ATTACK, 10);
            setExpression(enemy, EXPR_ATTACK, 10);
            camera.addShake(bodyForce * 1.5);
            SFX.playBodySlam(bodyForce);
        }
        if (bodyForce > 0.3) {
            const pSpeed = Math.sqrt(player.vel[0] ** 2 + player.vel[2] ** 2);
            const eSpeed = Math.sqrt(enemy.vel[0] ** 2 + enemy.vel[2] ** 2);
            if (pSpeed > eSpeed) {
                setExpression(enemy, EXPR_STUNNED, 30);
            } else {
                setExpression(player, EXPR_STUNNED, 30);
            }
            slowMo = 0.25;
        }
    });

    // 5. Colisões entre inimigos (sem empurrão de body collision)
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            // Braços de um inimigo vs corpo de outro
            const hitI_L = checkArmHit(enemies[i], enemies[j], 'left',  -1, shakeCb, ARENA_RADIUS);
            const hitI_R = checkArmHit(enemies[i], enemies[j], 'right',  1, shakeCb, ARENA_RADIUS);
            const hitJ_L = checkArmHit(enemies[j], enemies[i], 'left',  -1, shakeCb, ARENA_RADIUS);
            const hitJ_R = checkArmHit(enemies[j], enemies[i], 'right',  1, shakeCb, ARENA_RADIUS);

            // Expressões nos hits entre inimigos
            if (hitI_L || hitI_R) {
                const force = Math.max(hitI_L || 0, hitI_R || 0);
                if (force > 0.3) {
                    setExpression(enemies[j], EXPR_STUNNED, 40);
                } else {
                    setExpression(enemies[j], EXPR_HURT, 20);
                }
                setExpression(enemies[i], EXPR_ATTACK, 15);
                SFX.playImpact(force * 0.8); // som um pouco mais baixo para não cansar
                maxHitForce = Math.max(maxHitForce, force);
            }
            if (hitJ_L || hitJ_R) {
                const force = Math.max(hitJ_L || 0, hitJ_R || 0);
                if (force > 0.3) {
                    setExpression(enemies[i], EXPR_STUNNED, 40);
                } else {
                    setExpression(enemies[i], EXPR_HURT, 20);
                }
                setExpression(enemies[j], EXPR_ATTACK, 15);
                SFX.playImpact(force * 0.8);
                maxHitForce = Math.max(maxHitForce, force);
            }

            // Body collision entre inimigos - APENAS SEPARAÇÃO, sem empurrão
            const dx = enemies[j].pos[0] - enemies[i].pos[0];
            const dz = enemies[j].pos[2] - enemies[i].pos[2];
            const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
            const minDist = enemies[i].size + enemies[j].size;

            if (dist < minDist) {
                const overlap = (minDist - dist) * 0.5;
                const nx = dx / dist;
                const nz = dz / dist;
                // Apenas separação física - sem knockback
                enemies[i].pos[0] -= nx * overlap;
                enemies[i].pos[2] -= nz * overlap;
                enemies[j].pos[0] += nx * overlap;
                enemies[j].pos[2] += nz * overlap;
            }
        }
    }

    // Slow-mo em impactos fortes
    if (maxHitForce > 0.15) {
        slowMo = clamp(0.15 + (1.0 - maxHitForce) * 0.5, 0.1, 0.6);
    }

    // 6. Edge warning
    const playerEdge = Math.sqrt(player.pos[0] ** 2 + player.pos[2] ** 2);
    const edgeRatio = playerEdge / ARENA_RADIUS;
    if (edgeRatio > 0.65) {
        edgeWarning = clamp((edgeRatio - 0.65) / 0.35, 0, 1);
    }
    if (edgeWarning > 0.4 && _lastEdgeWarn <= 0.4) {
        SFX.playEdgeWarning(edgeWarning);
        Haptic.warningPulse();
    }
    _lastEdgeWarn = edgeWarning;

    // 7. Verificar ring-outs e gerenciar sistema de vidas (Smash Bros style)
    const playerOut = checkArenaEdge(player);
    
    if (playerOut) {
        player.lives--;
        SFX.playRingOut(); // som de queda
        
        if (player.lives > 0) {
            // Respawn player no centro com dano zerado
            _respawnEntity(player, [0, 0, -4]);
        } else {
            // Game Over
            phase = 'lose';
            $hud.style.display = 'none';
            $stateTitle.style.fontSize = '';
            showStateScreen('DERROTA', `Eliminado no round ${round}`,
                '[ TOQUE OU CLIQUE PARA RECOMEÇAR ]', '#f22');
            SFX.playLose();
            return; // não continuar update
        }
    }
    
    // Verificar queda de inimigos e respawn
    const aliveEnemies = [];
    const aliveAIs = [];
    enemies.forEach((enemy, idx) => {
        const enemyOut = checkArenaEdge(enemy);
        if (enemyOut) {
            enemy.lives--;
            SFX.playRingOut();
            
            if (enemy.lives > 0) {
                // Respawn inimigo numa posição aleatória
                const angle = Math.random() * Math.PI * 2;
                const dist = 6;
                const x = Math.sin(angle) * dist;
                const z = Math.cos(angle) * dist;
                _respawnEntity(enemy, [x, 0, z]);
                aliveEnemies.push(enemy);
                aliveAIs.push(enemyAIs[idx]);
            }
            // Se lives <= 0, não adiciona de volta (eliminado)
        } else {
            aliveEnemies.push(enemy);
            aliveAIs.push(enemyAIs[idx]);
        }
    });
    enemies = aliveEnemies;
    enemyAIs = aliveAIs;

    // Condições de vitória
    if (enemies.length === 0) {
        phase = 'win';
        $hud.style.display = 'none';
        $stateTitle.style.fontSize = '';
        showStateScreen('VITÓRIA!', `Round ${round} completado — ${numEnemies} adversários derrotados!`,
            '[ TOQUE OU CLIQUE PARA CONTINUAR ]', '#0f0');
        SFX.playWin();
    }

    // 8. Cor reage ao dano acumulado
    _updateColorByDamage(player);
    enemies.forEach(enemy => _updateColorByDamage(enemy));

    // 9. Camera follow - foca no inimigo mais próximo
    if (enemies.length > 0) {
        let closestEnemy = enemies[0];
        let minDist = Infinity;
        enemies.forEach(enemy => {
            const dx = enemy.pos[0] - player.pos[0];
            const dz = enemy.pos[2] - player.pos[2];
            const dist = dx * dx + dz * dz;
            if (dist < minDist) {
                minDist = dist;
                closestEnemy = enemy;
            }
        });
        camera.update(player.pos, player.rot[1], closestEnemy.pos);
    }
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
    $custEnemyDisp.textContent = numEnemies === 1 ? '1 adversário' : `${numEnemies} adversários`;
    $custLivesDisp.textContent = numLives === 1 ? '1 vida' : `${numLives} vidas`;
    const diffNames = ['🟢 Fácil', '⚔ Médio', '🔥 Difícil'];
    $custDifficultyDisp.textContent = diffNames[difficulty];

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
                case 'enemies':
                    numEnemies = Math.max(1, Math.min(4, numEnemies + dir));
                    break;
                case 'lives':
                    numLives = Math.max(1, Math.min(5, numLives + dir));
                    break;
                case 'difficulty':
                    difficulty = Math.max(0, Math.min(2, difficulty + dir));
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
        // Aplica ao jogador
        playerCustom.shape = rand.shape;
        playerCustom.color = rand.color;
        playerCustom.eyes  = rand.eyes;
        playerCustom.mouth = rand.mouth;
        // Também gera e salva a customização do inimigo (resultado do mesmo botão ALEATÓRIO)
        enemyCustom = randomCustomization();
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

    // Aplicar dificuldade escolhida
    setDifficulty(difficulty);

    // Ajustar tamanho da arena baseado no número de inimigos
    setArenaRadius(numEnemies);

    // Criar player com número de vidas configurado
    player = makePlayerEntity([0, 0, -4], 1.2, playerCustom);
    player.lives = numLives;
    player.maxLives = numLives;

    // Criar múltiplos inimigos em posições distribuídas em círculo
    enemies = [];
    enemyAIs = [];
    for (let i = 0; i < numEnemies; i++) {
        const angle = (i / numEnemies) * Math.PI * 2 + Math.PI; // começa atrás do player
        const dist = 6 + i * 1.5; // distribui em profundidade também
        const x = Math.sin(angle) * dist;
        const z = Math.cos(angle) * dist;
        const size = 1.2 + round * 0.1;
        
        const enemy = makeEnemyEntity([x, 0, z], size, randomCustomization());
        enemy.lives = numLives;
        enemy.maxLives = numLives;
        enemies.push(enemy);
        enemyAIs.push(new EnemyAI());
    }

    // Snap camera - foca no centro entre player e inimigos
    const centerEnemy = enemies[0];
    camera.snapTo(player.pos, player.rot[1], centerEnemy.pos);

    // Criar barras de HP dinamicamente
    _createDynamicHPBars();

    // Se estamos em modo de desenvolvimento/teste, pule o countdown
    if (typeof DEV !== 'undefined' && DEV.hideRound) {
        phase = 'fight';
        $hud.style.display = 'block';
        $stateScreen.style.display = 'none';
        $roundNum.textContent = round;
        edgeWarning = 0;
        // Garantir que camera esteja aplicada no frame seguinte
        camera.update(player.pos, player.rot[1], centerEnemy.pos);
        return;
    }

    // Countdown normal
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

function _createDynamicHPBars() {
    // Limpa barras anteriores
    $hpBars.innerHTML = '';

    // Barra do player
    const playerContainer = document.createElement('div');
    playerContainer.id = 'hp-player-container';
    playerContainer.className = 'hp-container';
    playerContainer.innerHTML = `
        <span class="hp-label">PLAYER</span>
        <div id="hp-player" class="hp-fill"></div>
    `;
    $hpBars.appendChild(playerContainer);

    // VS text
    const vsText = document.createElement('span');
    vsText.id = 'vs-text';
    vsText.textContent = 'VS';
    $hpBars.appendChild(vsText);

    // Barras dos inimigos
    enemies.forEach((_, idx) => {
        const enemyContainer = document.createElement('div');
        enemyContainer.id = `hp-enemy-container-${idx}`;
        enemyContainer.className = 'hp-container';
        enemyContainer.innerHTML = `
            <span class="hp-label">ENEMY ${idx + 1}</span>
            <div id="hp-enemy-${idx}" class="hp-fill"></div>
        `;
        $hpBars.appendChild(enemyContainer);
    });
}

function updateHUD() {
    if (player) {
        // Sistema de dano %, estilo Smash Bros
        const damagePercent = Math.round(player.damage);
        const $hpPlayerBar = document.getElementById('hp-player');
        if ($hpPlayerBar) {
            // Mostrar porcentagem de dano
            $hpPlayerBar.textContent = `${damagePercent}%`;
            $hpPlayerBar.style.width = '100%'; // sempre 100%, o texto muda
            
            // Cor muda conforme dano acumulado
            if (damagePercent < 50) {
                $hpPlayerBar.style.background = `linear-gradient(90deg, #0ff, #0f0)`;
            } else if (damagePercent < 100) {
                $hpPlayerBar.style.background = `linear-gradient(90deg, #ff0, #f80)`;
            } else {
                $hpPlayerBar.style.background = `linear-gradient(90deg, #f22, #f00)`;
            }
            
            // Centralizar texto
            $hpPlayerBar.style.display = 'flex';
            $hpPlayerBar.style.justifyContent = 'center';
            $hpPlayerBar.style.alignItems = 'center';
            $hpPlayerBar.style.fontSize = '20px';
            $hpPlayerBar.style.fontWeight = 'bold';
            $hpPlayerBar.style.textShadow = '0 0 4px #000';
        }
        
        // Mostrar vidas (stock) do player
        const $playerLabel = document.querySelector('#hp-player-container .hp-label');
        if ($playerLabel) {
            const livesIcons = '♥'.repeat(player.lives) + '♡'.repeat(player.maxLives - player.lives);
            $playerLabel.textContent = `PLAYER ${livesIcons}`;
        }
    }
    
    // Atualizar porcentagens de cada inimigo
    enemies.forEach((enemy, idx) => {
        const damagePercent = Math.round(enemy.damage);
        const $hpEnemyBar = document.getElementById(`hp-enemy-${idx}`);
        if ($hpEnemyBar) {
            $hpEnemyBar.textContent = `${damagePercent}%`;
            $hpEnemyBar.style.width = '100%';
            
            if (damagePercent < 50) {
                $hpEnemyBar.style.background = `linear-gradient(90deg, #f0f, #f0a)`;
            } else if (damagePercent < 100) {
                $hpEnemyBar.style.background = `linear-gradient(90deg, #ff0, #f80)`;
            } else {
                $hpEnemyBar.style.background = `linear-gradient(90deg, #f22, #f00)`;
            }
            
            $hpEnemyBar.style.display = 'flex';
            $hpEnemyBar.style.justifyContent = 'center';
            $hpEnemyBar.style.alignItems = 'center';
            $hpEnemyBar.style.fontSize = '20px';
            $hpEnemyBar.style.fontWeight = 'bold';
            $hpEnemyBar.style.textShadow = '0 0 4px #000';
        }
        
        // Mostrar vidas (stock) do inimigo
        const $enemyLabel = document.querySelector(`#hp-enemy-container-${idx} .hp-label`);
        if ($enemyLabel) {
            const livesIcons = '♥'.repeat(enemy.lives) + '♡'.repeat(enemy.maxLives - enemy.lives);
            $enemyLabel.textContent = `ENEMY ${idx + 1} ${livesIcons}`;
        }
    });

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
function _respawnEntity(ent, pos) {
    // Reseta posição e estado para respawn
    const shape = getShape(ent.custom.shape);
    ent.pos[0] = pos[0];
    ent.pos[1] = GROUND_Y + ent.size * shape.bodyScale[1];
    ent.pos[2] = pos[2];
    ent.vel[0] = 0;
    ent.vel[1] = 0;
    ent.vel[2] = 0;
    ent.rot[0] = 0;
    ent.rot[1] = 0;
    ent.rot[2] = 0;
    ent.damage = START_DAMAGE; // Reseta dano ao respawnar
    ent.hitFlash = 0;
    ent.onGround = true;
    ent.chargeAmount = 0;
    ent.isCharging = false;
    setExpression(ent, EXPR_NORMAL, 0);
    
    // Invulnerabilidade breve (visual flash)
    ent.hitFlash = 1.0;
}
function _updateColorByDamage(ent) {
    // Quanto mais damage, mais vermelho fica (Smash Bros style)
    // 0% = cor normal, 100% = avermelhado, 200%+ = muito vermelho
    const damageRatio = clamp(ent.damage / 150, 0, 1);
    ent.color[0] = lerp(ent.baseColor[0], 1.0, damageRatio);
    ent.color[1] = lerp(ent.baseColor[1], 0.1, damageRatio);
    ent.color[2] = lerp(ent.baseColor[2], 0.1, damageRatio);
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
