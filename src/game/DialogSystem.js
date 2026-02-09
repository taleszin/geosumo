/**
 * DialogSystem.js — Sistema de diálogo com frases e balões de fala.
 * 
 * Features:
 *   - Frases categorizadas por situação (ataque, dor, vitória, taunt)
 *   - Efeito typing (letra por letra)
 *   - Som procedural de "fala" (blip para cada caractere)
 *   - Balões de fala renderizados acima dos lutadores
 */

// ═════════════════════════════════════════════════════════════
// Banco de diálogos - frases genéricas de luta
// ═════════════════════════════════════════════════════════════

const DIALOG_PHRASES = {
    // Quando ataca
    attack: [
        "TOME ISSO!",
        "VAI!",
        "SENTE O PODER!",
        "SEM CHANCES!",
        "ISSO É SUMO!",
        "FORA DA ARENA!",
        "ACABOU PRA TI!",
        "SENTIU?",
        "BOOM!",
        "TE PEGUEI!",
    ],
    
    // Quando leva hit
    hurt: [
        "UAU!",
        "ARG!",
        "ISSO DOI!",
        "VOLTAREl!",
        "NÃO ACABOU!",
        "QUASE!",
        "SORTE!",
        "AI!",
        "MINHA VEZ!",
        "AGORA VAI!",
    ],
    
    // Quando está perdendo
    losing: [
        "AH NÃO!",
        "AI QUE ODIO!",
        "AINDA NÃO!",
        "PRECISO VOLTAR!",
        "SEGURA!",
        "PERAÍ!",
    ],
    
    // Quando está vencendo
    winning: [
        "MUITO FÁCIL!",
        "IZI",
        "DOMINANDO!",
        "QUEM É O MELHOR?",
        "ISSO QUE É LUTA!",
        "ESSE É SEU MELHOR?",
    ],
    
    // Entrando na arena
    intro: [
        "VAMOS NESSA!",
        "BORA!",
        "PREPARADO?",
        "SHOW TIME!",
        "É HORA!",
        "EU ESTOU PRONTO!",
    ],
    
    // Vitória
    victory: [
        "BOOYAH!",
        "VITÓRIA!",
        "SIMBORA!",
        "ISSO AÍ!",
        "FUI EU!",
        "CAMPEÃO!",
        "EASY!",
    ],
    
    // Taunt/provocação
    taunt: [
        "VEM!",
        "É ISSO QUE TEM?",
        "FRACO!",
        "PODE VIR!",
        "CHEGA MAIS!",
        "SHOW!",
    ],
};

// ═════════════════════════════════════════════════════════════
// Dialog State - gerencia balões ativos
// ═════════════════════════════════════════════════════════════

export class DialogBubble {
    constructor(entity, phrase, category) {
        this.entity = entity;
        this.phrase = phrase;
        this.category = category;
        this.fullText = phrase;
        this.currentText = '';
        this.charIndex = 0;
        this.timer = 0;
        this.charsPerFrame = 0.5; // ~30 chars por segundo (60fps / 2)
        this.lifetime = 180; // 3 segundos total
        this.fadingOut = false;
    }

    update(gameTime) {
        this.timer++;
        
        // Typing effect
        if (this.charIndex < this.fullText.length) {
            this.charIndex += this.charsPerFrame;
            this.currentText = this.fullText.substring(0, Math.floor(this.charIndex));
            
            // Trigger som de typing a cada caractere novo
            if (Math.floor(this.charIndex) > Math.floor(this.charIndex - this.charsPerFrame)) {
                playDialogBlip(this.category);
            }
        }
        
        // Fade out após lifetime
        if (this.timer > this.lifetime - 30) {
            this.fadingOut = true;
        }
        
        return this.timer < this.lifetime;
    }

    getAlpha() {
        if (!this.fadingOut) return 1.0;
        const fadeFrames = 30;
        const remaining = this.lifetime - this.timer;
        return remaining / fadeFrames;
    }
}

// Balões ativos por entidade (Map: entity -> DialogBubble)
const _activeBubbles = new Map();

// ═════════════════════════════════════════════════════════════
// API pública
// ═════════════════════════════════════════════════════════════

/**
 * Mostra um diálogo para uma entidade.
 */
export function showDialog(entity, category) {
    // Não spam: cooldown de 2 segundos
    if (_activeBubbles.has(entity)) {
        const existing = _activeBubbles.get(entity);
        if (existing.timer < 120) return; // ainda muito recente
    }

    const phrases = DIALOG_PHRASES[category];
    if (!phrases || phrases.length === 0) return;

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const bubble = new DialogBubble(entity, phrase, category);
    _activeBubbles.set(entity, bubble);
}

/**
 * Update de todos os balões ativos.
 */
export function updateDialogs(gameTime) {
    for (const [entity, bubble] of _activeBubbles) {
        const alive = bubble.update(gameTime);
        if (!alive) {
            _activeBubbles.delete(entity);
        }
    }
}

/**
 * Retorna o balão ativo de uma entidade (se houver).
 */
export function getDialog(entity) {
    return _activeBubbles.get(entity) || null;
}

/**
 * Limpa todos os diálogos (útil ao resetar jogo).
 */
export function clearAllDialogs() {
    _activeBubbles.clear();
}

// ═════════════════════════════════════════════════════════════
// Som procedural de "fala" (blip/beep)
// ═════════════════════════════════════════════════════════════

let _audioContext = null;
let _masterGain = null;

export function initDialogAudio(audioContext, masterGain) {
    _audioContext = audioContext;
    _masterGain = masterGain;
}

/**
 * Toca um "blip" de fala - pitch varia por categoria.
 */
function playDialogBlip(category) {
    if (!_audioContext) return;

    const now = _audioContext.currentTime;
    const osc = _audioContext.createOscillator();
    const gain = _audioContext.createGain();

    // Pitch varia por categoria
    const pitchMap = {
        attack: 300,
        hurt: 180,
        losing: 150,
        winning: 350,
        intro: 250,
        victory: 400,
        taunt: 320,
    };
    const baseFreq = pitchMap[category] || 250;
    const variation = (Math.random() - 0.5) * 40; // ±20Hz de variação
    osc.frequency.value = baseFreq + variation;
    
    // Forma de onda varia por categoria
    const waveMap = {
        attack: 'square',
        hurt: 'sawtooth',
        losing: 'sine',
        winning: 'square',
        intro: 'triangle',
        victory: 'square',
        taunt: 'sawtooth',
    };
    osc.type = waveMap[category] || 'square';

    // Envelope rápido (blip curto)
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.005); // ataque rápido
    gain.gain.linearRampToValueAtTime(0, now + 0.04); // decay

    osc.connect(gain);
    if (_masterGain) {
        gain.connect(_masterGain);
    } else {
        gain.connect(_audioContext.destination);
    }

    osc.start(now);
    osc.stop(now + 0.05);
}

/**
 * Som de "whoosh" quando frase completa aparecer (opcional).
 */
export function playDialogComplete() {
    if (!_audioContext) return;

    const now = _audioContext.currentTime;
    const osc = _audioContext.createOscillator();
    const gain = _audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);

    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);

    osc.connect(gain);
    if (_masterGain) {
        gain.connect(_masterGain);
    } else {
        gain.connect(_audioContext.destination);
    }

    osc.start(now);
    osc.stop(now + 0.15);
}
