/**
 * Enemy.js — IA do inimigo com comportamentos táticos + CHARGE ATTACK.
 *
 * 5 estados: APPROACH, CIRCLE, ATTACK, RETREAT, CHARGE.
 *
 * Melhorias:
 *   - CHARGE state: carrega e investe no jogador (tachi-ai!)
 *   - Tenta empurrar o jogador para FORA da arena (posicionamento inteligente)
 *   - Reage a ser empurrado perto da borda (entra em pânico)
 *   - Combos de soco (alternância esquerda/direita)
 *   - Esquiva lateral quando vê soco vindo
 */
import { lerp, clamp, len2D } from '../engine/MathUtils.js';
import { chargeUp, releaseCharge } from './Physics.js';
import { setExpression, EXPR_ATTACK, EXPR_CHARGING } from './Entity.js';

const AI_APPROACH = 0;
const AI_CIRCLE   = 1;
const AI_ATTACK   = 2;
const AI_RETREAT  = 3;
const AI_CHARGE   = 4;   // NOVO: investida pesada

const STATE_DURATION = {
    [AI_APPROACH]: [50, 100],
    [AI_CIRCLE]:   [60, 150],
    [AI_ATTACK]:   [40, 80],
    [AI_RETREAT]:  [30, 70],
    [AI_CHARGE]:   [40, 80],
};

export class EnemyAI {
    constructor() {
        this.state        = AI_APPROACH;
        this.stateTimer   = 0;
        this.stateDuration = 90;
        this.circleDir    = 1;
        this.attackArm    = 'left';
        this.comboCount   = 0;       // quantos socos seguidos
        this.dodgeCooldown = 0;
        this.currentTarget = null;   // alvo atual (pode ser player ou outro inimigo)
        this.targetChangeTimer = 0;  // timer para trocar de alvo
    }

    update(enemy, player, allEnemies, gameTime, arenaRadius) {
        const e = enemy;

        // ── HITSTUN: enquanto atordoado, não age (só interpola braços) ──
        if (e.hitstunTimer > 0) {
            this._retractArms(e);
            this._lerpArms(e, 0.25); // interpola mais rápido durante hitstun
            return;
        }

        // Escolher alvo (player ou outro inimigo próximo)
        this.targetChangeTimer--;
        if (!this.currentTarget || this.targetChangeTimer <= 0) {
            this.currentTarget = this._chooseTarget(e, player, allEnemies);
            this.targetChangeTimer = _randRange(120, 240); // 2-4 segundos entre mudanças de alvo
        }

        const target = this.currentTarget || player;
        const dx   = target.pos[0] - e.pos[0];
        const dz   = target.pos[2] - e.pos[2];
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        const nx   = dx / dist;
        const nz   = dz / dist;

        const moveForce = e.onGround ? 0.028 : 0.008; // mais rápido que antes

        // Yaw: olhar para o alvo
        const targetYaw = Math.atan2(nx, nz);
        e.rot[1] = lerp(e.rot[1], targetYaw, 0.10);

        // Timer de estado
        this.stateTimer++;
        if (this.stateTimer >= this.stateDuration) {
            // Com sistema de damage: quanto mais damage, mais desesperado (retreat)
            const damageRatio = clamp(e.damage / 150, 0, 1); // 0 = sem dano, 1 = muito dano
            this._transition(dist, damageRatio, e, target, arenaRadius);
        }

        // Dodge cooldown
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;

        // ── DODGE: esquivar de soco ──────────────────────
        const targetPunching = target.arms.left.currentExt > 2.5 || target.arms.right.currentExt > 2.5;
        if (targetPunching && dist < 5 && this.dodgeCooldown <= 0 && this.state !== AI_CHARGE) {
            // Esquiva lateral rápida
            const perpX = -nz * this.circleDir;
            const perpZ =  nx * this.circleDir;
            e.vel[0] += perpX * moveForce * 3.0;
            e.vel[2] += perpZ * moveForce * 3.0;
            this.dodgeCooldown = 30; // ~0.5s entre esquivas
        }

        // ── POSICIONAMENTO INTELIGENTE ───────────────────
        // Tenta empurrar o alvo para fora: posiciona-se entre
        // o alvo e o centro da arena
        const targetEdge = Math.sqrt(target.pos[0] ** 2 + target.pos[2] ** 2);
        const enemyEdge  = Math.sqrt(e.pos[0] ** 2 + e.pos[2] ** 2);

        // Se o inimigo está mais perto da borda que o alvo, corrigir posição
        if (enemyEdge > arenaRadius * 0.55 && enemyEdge > targetEdge) {
            const toCenterX = -e.pos[0] / (enemyEdge || 1);
            const toCenterZ = -e.pos[2] / (enemyEdge || 1);
            const urgency = clamp((enemyEdge - arenaRadius * 0.5) / (arenaRadius * 0.5), 0, 1);
            e.vel[0] += toCenterX * moveForce * (1.0 + urgency * 3.0);
            e.vel[2] += toCenterZ * moveForce * (1.0 + urgency * 3.0);
        }

        // Borda: pânico e recua
        if (enemyEdge > arenaRadius * 0.75) {
            const toCenterX = -e.pos[0] / (enemyEdge || 1);
            const toCenterZ = -e.pos[2] / (enemyEdge || 1);
            e.vel[0] += toCenterX * moveForce * 4.0;
            e.vel[2] += toCenterZ * moveForce * 4.0;
        }

        // Comportamento por estado
        switch (this.state) {
            case AI_APPROACH:
                this._doApproach(e, nx, nz, dist, moveForce);
                this._retractArms(e);
                break;
            case AI_CIRCLE:
                this._doCircle(e, nx, nz, dist, moveForce);
                this._retractArms(e);
                break;
            case AI_ATTACK:
                this._doAttack(e, nx, nz, dist, moveForce, gameTime);
                break;
            case AI_RETREAT:
                this._doRetreat(e, nx, nz, moveForce);
                this._retractArms(e);
                break;
            case AI_CHARGE:
                this._doCharge(e, nx, nz, dist, moveForce, gameTime);
                break;
        }

        // Interpola braços
        this._lerpArms(e, 0.12);
    }

    /**
     * Escolhe um alvo para atacar: pode ser o player ou outro inimigo.
     * Aumentado foco em outros inimigos para combates mais dinâmicos.
     */
    _chooseTarget(enemy, player, allEnemies) {
        const candidates = [player];
        
        // Adiciona outros inimigos como possíveis alvos
        allEnemies.forEach(otherEnemy => {
            if (otherEnemy !== enemy) {
                candidates.push(otherEnemy);
            }
        });

        // Se há múltiplos inimigos, 60% de chance de focar em outro inimigo (aumenta confronto)
        if (allEnemies.length > 1 && Math.random() < 0.6) {
            // Filtra apenas outros inimigos (remove player)
            const otherEnemies = candidates.filter(c => c.isEnemy);
            if (otherEnemies.length > 0) {
                // Escolhe aleatório entre os inimigos
                return otherEnemies[Math.floor(Math.random() * otherEnemies.length)];
            }
        }

        // 30% de chance de focar no player
        if (Math.random() < 0.3) {
            return player;
        }

        // Caso contrário, escolhe o alvo mais próximo
        let closestTarget = player;
        let minDist = Infinity;

        candidates.forEach(candidate => {
            const dx = candidate.pos[0] - enemy.pos[0];
            const dz = candidate.pos[2] - enemy.pos[2];
            const dist = dx * dx + dz * dz;
            if (dist < minDist) {
                minDist = dist;
                closestTarget = candidate;
            }
        });

        return closestTarget;
    }

    _transition(dist, damageRatio, enemy, target, arenaRadius) {
        const weights = [];
        const targetEdge = Math.sqrt(target.pos[0] ** 2 + target.pos[2] ** 2);
        const targetNearEdge = targetEdge > arenaRadius * 0.5;

        if (dist > 6) {
            weights.push({ s: AI_APPROACH, w: 4 }); // mais agressivo (3 → 4)
            weights.push({ s: AI_CHARGE,   w: 2 }); // carga de longe!
            weights.push({ s: AI_CIRCLE,   w: 1 });
        } else if (dist > 3.5) {
            weights.push({ s: AI_ATTACK,   w: 5 + (1 - damageRatio) * 2 }); // muito mais agressivo (3 → 5)
            weights.push({ s: AI_CHARGE,   w: targetNearEdge ? 4 : 1 }); // charge se alvo perto da borda!
            weights.push({ s: AI_CIRCLE,   w: 1 });
            weights.push({ s: AI_RETREAT,  w: 1.0 * damageRatio }); // menos retreat
        } else {
            weights.push({ s: AI_ATTACK,   w: 6 + (1 - damageRatio) * 3 }); // muito agressivo (4 → 6)
            weights.push({ s: AI_CHARGE,   w: targetNearEdge ? 3 : 0.5 });
            weights.push({ s: AI_CIRCLE,   w: 1 });
            weights.push({ s: AI_RETREAT,  w: 1.5 * damageRatio }); // menos retreat
        }

        const total = weights.reduce((s, w) => s + w.w, 0);
        let r = Math.random() * total;
        for (const w of weights) {
            r -= w.w;
            if (r <= 0) { this.state = w.s; break; }
        }

        const [min, max] = STATE_DURATION[this.state] || [50, 100];
        this.stateDuration = _randRange(min, max);
        this.stateTimer = 0;
        this.circleDir  = Math.random() > 0.5 ? 1 : -1;
        this.attackArm  = Math.random() > 0.5 ? 'left' : 'right';
        this.comboCount = 0;
    }

    _doApproach(e, nx, nz, dist, force) {
        if (dist > 4.0) {
            e.vel[0] += nx * force * 1.1;
            e.vel[2] += nz * force * 1.1;
        }
    }

    _doCircle(e, nx, nz, dist, force) {
        const perpX = -nz * this.circleDir;
        const perpZ =  nx * this.circleDir;
        const targetDist = 4.5;
        const radialForce = (dist - targetDist) * force * 0.6;
        e.vel[0] += perpX * force * 0.9 + nx * radialForce;
        e.vel[2] += perpZ * force * 0.9 + nz * radialForce;
    }

    _doAttack(e, nx, nz, dist, force, gameTime) {
        if (dist > 3.0) {
            e.vel[0] += nx * force * 1.4;
            e.vel[2] += nz * force * 1.4;
        }

        // Expressão de ataque
        setExpression(e, EXPR_ATTACK, 15);

        const localAngle = Math.atan2(nx, nz) - e.rot[1];
        const cycle = Math.sin(gameTime * 6.0); // mais rápido = socos mais ágeis (4.0 → 6.0)

        // Combo: alterna braços
        if (this.comboCount > 3) {
            // Pausa breve entre combos
            this._retractArms(e);
            if (this.comboCount > 5) this.comboCount = 0;
            this.comboCount++;
            return;
        }

        // Soco mais breve e rápido (como o do player)
        const punchExt = 1.5 + Math.max(0, Math.abs(cycle)) * 1.5; // 1.5..3.0 (antes: 2.0..4.5)

        if (cycle > 0) {
            e.arms.left.targetRot = [clamp(-0.2, -1.2, 1.2), localAngle * 0.7];
            e.arms.left.targetExt = punchExt;
            e.arms.right.targetRot = [0, 0];
            e.arms.right.targetExt = 0.8;
            if (cycle > 0.9) this.comboCount++;
        } else {
            e.arms.right.targetRot = [clamp(-0.2, -1.2, 1.2), -localAngle * 0.7];
            e.arms.right.targetExt = punchExt;
            e.arms.left.targetRot = [0, 0];
            e.arms.left.targetExt = 0.8;
            if (cycle < -0.9) this.comboCount++;
        }
    }

    _doRetreat(e, nx, nz, force) {
        e.vel[0] -= nx * force * 1.0;
        e.vel[2] -= nz * force * 1.0;
    }

    _doCharge(e, nx, nz, dist, force, gameTime) {
        // Fase 1: carregar (primeiros 60% do tempo)
        const chargePhase = this.stateTimer / this.stateDuration;

        if (chargePhase < 0.6) {
            // Plantar os pés, carregar
            chargeUp(e, 1 / 60);
            setExpression(e, EXPR_CHARGING, 5);

            // Se aproximar lentamente enquanto carrega
            if (dist > 3) {
                e.vel[0] += nx * force * 0.3;
                e.vel[2] += nz * force * 0.3;
            }
            this._retractArms(e);
        } else if (chargePhase < 0.65) {
            // Liberar a carga!
            if (e.isCharging) {
                const pow = releaseCharge(e);
                // Marcar que acabou de fazer uma investida — usado por Physics para
                // transformar o efeito em ATORDOAMENTO em vez de repulsão, e aplicar cooldown maior
                if (pow > 0) {
                    e._justCharged = pow;
                    // Cooldown extra para evitar spam de charges pelo CPU
                    e.chargeCooldown += 90; // ~1.5s extra
                }
                setExpression(e, EXPR_ATTACK, 30);
            }
            // Braços para frente no impacto
            e.arms.left.targetRot = [0, 0.3];
            e.arms.left.targetExt = 3.5;
            e.arms.right.targetRot = [0, -0.3];
            e.arms.right.targetExt = 3.5;
        } else {
            // Pós-charge: recovery
            this._retractArms(e);
        }
    }

    _retractArms(e) {
        e.arms.left.targetRot  = [0, 0];
        e.arms.left.targetExt  = 0.8;
        e.arms.right.targetRot = [0, 0];
        e.arms.right.targetExt = 0.8;
    }

    _lerpArms(e, lag) {
        ['left', 'right'].forEach(side => {
            const arm = e.arms[side];
            arm.prevExt = arm.currentExt;
            const tR = arm.targetRot || [0, 0];
            // Interpolação mais rápida para socos ágeis (0.12 → 0.25)
            const fastLag = 0.25;
            arm.currentRot[0] = lerp(arm.currentRot[0], tR[0], fastLag);
            arm.currentRot[1] = lerp(arm.currentRot[1], tR[1], fastLag);
            arm.currentExt    = lerp(arm.currentExt, arm.targetExt, fastLag);
        });
    }
}

function _randRange(min, max) {
    return Math.floor(min + Math.random() * (max - min));
}
