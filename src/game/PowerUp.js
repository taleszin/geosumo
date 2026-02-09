/**
 * PowerUp.js — Sistema de Power-Ups para GEO SUMO.
 *
 * 4 power-ups baseados em exagerar as propriedades físicas do jogo:
 *   - TANQUE:  massa 3x + estabilidade (cinza metálico)
 *   - NITRO:   velocidade 1.5x + braços rápidos (amarelo elétrico)
 *   - TITÃ:    tamanho 1.5x + alcance maior (roxo)
 *   - IMPACTO: força de soco 2.5x + lift explosivo (vermelho)
 *
 * Spawns em "Risk Zones": centro (King of the Hill) ou borda (zona de perigo).
 * Apenas um power-up ativo por vez na arena.
 * Power-ups duram ~8 segundos com feedback visual contínuo.
 */
import * as SFX from '../audio/SFX.js';

// ═══════════════════════════════════════════════════════════
// Definições dos power-ups
// ═══════════════════════════════════════════════════════════

export const PU_TANK    = 'tank';
export const PU_NITRO   = 'nitro';
export const PU_TITAN   = 'titan';
export const PU_IMPACT  = 'impact';

const POWERUP_DEFS = {
    [PU_TANK]: {
        name: 'TANQUE',
        icon: '🛡',
        color: [0.45, 0.45, 0.5, 1.0],   // cinza metálico
        glowColor: [0.6, 0.6, 0.7, 0.6],
        duration: 8.0,
        desc: 'Massa ×3 — Imovível',
    },
    [PU_NITRO]: {
        name: 'NITRO',
        icon: '⚡',
        color: [1.0, 0.9, 0.0, 1.0],     // amarelo elétrico
        glowColor: [1.0, 1.0, 0.0, 0.6],
        duration: 7.0,
        desc: 'Velocidade ×1.5',
    },
    [PU_TITAN]: {
        name: 'TITÃ',
        icon: '👊',
        color: [0.6, 0.0, 0.9, 1.0],     // roxo
        glowColor: [0.7, 0.2, 1.0, 0.6],
        duration: 7.0,
        desc: 'Tamanho ×1.5',
    },
    [PU_IMPACT]: {
        name: 'IMPACTO',
        icon: '💥',
        color: [1.0, 0.1, 0.05, 1.0],    // vermelho brilhante
        glowColor: [1.0, 0.2, 0.0, 0.6],
        duration: 6.0,
        desc: 'Força ×2.5',
    },
};

const ALL_TYPES = [PU_TANK, PU_NITRO, PU_TITAN, PU_IMPACT];

// ═══════════════════════════════════════════════════════════
// Estado do sistema
// ═══════════════════════════════════════════════════════════

// Item flutuante na arena (apenas 1 por vez)
let activeItem = null;   // { type, pos, spawnTime, bobPhase }

// Efeito ativo em uma entidade (apenas 1 por entidade)
// Map: entity ref → { type, timer, originalMass, originalSize }
let activeBuffs = new Map();

// Temporizador para próximo spawn (reduzido para aumentar ocorrências)
let spawnCooldown = 6.0; // espera X segundos antes do primeiro spawn (base menor para mais frequência)

// ═══════════════════════════════════════════════════════════
// API pública
// ═══════════════════════════════════════════════════════════

/**
 * Reseta o sistema (novo round).
 */
export function resetPowerUps() {
    activeItem = null;
    // Remover todos os buffs ativos
    activeBuffs.forEach((buff, ent) => _removeBuff(ent));
    activeBuffs.clear();
    // Mais frequente no início: 6-9s
    spawnCooldown = 6.0 + Math.random() * 3.0; // 6-9s para primeiro spawn (mais provável com mais jogadores)
}

/**
 * Retorna o item ativo na arena (ou null).
 */
export function getActiveItem() {
    return activeItem;
}

/**
 * Retorna info do buff ativo de uma entidade (ou null).
 */
export function getEntityBuff(ent) {
    return activeBuffs.get(ent) || null;
}

/**
 * Retorna a definição de um power-up pelo tipo.
 */
export function getPowerUpDef(type) {
    return POWERUP_DEFS[type] || null;
}

/**
 * Update principal — chame todo frame.
 * @param {number} dt - delta time em segundos
 * @param {object} player - entidade do jogador
 * @param {Array} enemies - array de inimigos
 * @param {number} arenaRadius - raio atual da arena
 * @param {number} gameTime - tempo de jogo  
 * @returns {{ collected: string|null, collector: object|null }} evento de coleta
 */
export function updatePowerUps(dt, player, enemies, arenaRadius, gameTime) {
    let result = { collected: null, collector: null };

    // ── Tick buffs ativos ──────────────────────────────
    for (const [ent, buff] of activeBuffs) {
        buff.timer -= dt;
        if (buff.timer <= 0) {
            _removeBuff(ent);
            activeBuffs.delete(ent);
        }
    }

    // ── Spawn logic ────────────────────────────────────
    if (!activeItem) {
        // Acelera o cooldown proporcionalmente ao número de lutadores na arena
        // Mais lutadores = mais disputa = spawn mais frequente
        const fighters = 1 + enemies.length; // player + inimigos
        const rateMult = 1 + enemies.length * 0.35; // +35% por inimigo
        spawnCooldown -= dt * rateMult;
        if (spawnCooldown <= 0) {
            _spawnItem(arenaRadius, gameTime);
        }
    }

    // ── Colisão com item ───────────────────────────────
    if (activeItem) {
        activeItem.age = (activeItem.age || 0) + dt;
        
        // Verificar coleta por todos os lutadores
        const allEnts = [player, ...enemies];
        for (const ent of allEnts) {
            if (!ent || ent.lives <= 0) continue;
            const dx = ent.pos[0] - activeItem.pos[0];
            const dz = ent.pos[2] - activeItem.pos[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist < ent.size + 1.2) {
                // COLETOU!
                result.collected = activeItem.type;
                result.collector = ent;
                _applyBuff(ent, activeItem.type);
                activeItem = null;
                // Reaparecimento um pouco mais frequente após coleta: 8-12s
                spawnCooldown = 8.0 + Math.random() * 4.0; // 8-12s para próximo
                break;
            }
        }
        
        // Timeout — item desaparece se ninguém pegar em 15s
        if (activeItem && activeItem.age > 15.0) {
            activeItem = null;
            // Reaparecimento mais rápido após timeout: 4-8s
            spawnCooldown = 4.0 + Math.random() * 4.0;
        }
    }

    return result;
}

/**
 * Retorna os multiplicadores ativos de uma entidade para o sistema de física.
 * @param {object} ent
 * @returns {{ massMult, forceMult, speedMult, armSpeedMult, impactMult, liftMult, frictionOverride }}
 */
export function getBuffMultipliers(ent) {
    const defaults = {
        massMult: 1.0,
        forceMult: 1.0,
        speedMult: 1.0,
        armSpeedMult: 1.0,
        impactMult: 1.0,
        liftMult: 1.0,
        frictionOverride: null,
        sizeMult: 1.0,
    };

    const buff = activeBuffs.get(ent);
    if (!buff) return defaults;

    switch (buff.type) {
        case PU_TANK:
            return {
                ...defaults,
                massMult: 3.0,
                forceMult: 0.75,        // leve redução de velocidade (peso)
                frictionOverride: 0.95, // quase não desliza
            };
        case PU_NITRO:
            return {
                ...defaults,
                speedMult: 1.5,
                armSpeedMult: 2.0,      // braços 2x mais rápidos
            };
        case PU_TITAN:
            return {
                ...defaults,
                sizeMult: 1.5,
                impactMult: 1.3,        // força base levemente aumentada
            };
        case PU_IMPACT:
            return {
                ...defaults,
                impactMult: 2.5,
                liftMult: 3.0,          // lift explosivo
            };
    }

    return defaults;
}

// ═══════════════════════════════════════════════════════════
// Internos
// ═══════════════════════════════════════════════════════════

function _spawnItem(arenaRadius, gameTime) {
    const type = ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)];
    
    // Risk zone logic: 60% centro, 40% borda perigosa
    let x, z;
    if (Math.random() < 0.6) {
        // Centro: "King of the Hill" — todos convergem
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * arenaRadius * 0.3;
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
    } else {
        // Borda: zona de perigo — recompensa pelo risco
        const angle = Math.random() * Math.PI * 2;
        const dist = arenaRadius * (0.65 + Math.random() * 0.2); // 65-85% do raio
        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
    }

    activeItem = {
        type,
        pos: [x, 0, z],
        spawnTime: gameTime,
        age: 0,
        bobPhase: Math.random() * Math.PI * 2,
    };
    
    SFX.playPowerUpSpawn();
}

function _applyBuff(ent, type) {
    // Remover buff anterior se existir
    if (activeBuffs.has(ent)) {
        _removeBuff(ent);
    }

    const def = POWERUP_DEFS[type];

    const buff = {
        type,
        timer: def.duration,
        originalMass: ent.mass,
        originalSize: ent.size,
    };

    // Aplicar mudanças diretas na entidade
    switch (type) {
        case PU_TANK:
            ent.mass *= 3.0;
            break;
        case PU_TITAN:
            ent.size *= 1.5;
            ent.mass = ent.size * ent.size * ent.size; // recalcula massa
            break;
        // NITRO e IMPACT não alteram propriedades base — operam via multiplicadores
    }

    activeBuffs.set(ent, buff);
}

function _removeBuff(ent) {
    const buff = activeBuffs.get(ent);
    if (!buff) return;

    // Restaurar valores originais
    ent.mass = buff.originalMass;
    ent.size = buff.originalSize;
}
