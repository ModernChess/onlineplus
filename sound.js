// sound.js - Unified Multi-Channel Audio Manager with Web Audio Boost
const repoBaseUrl = 'https://raw.githubusercontent.com/ModernChess/assets-images/main/';

// Centralized configuration dictionary (infantryMove boost increased to 3.0)
const soundConfigs = {
    infantrySelect: { src: repoBaseUrl + 'sound4-armycharge.mp3', start: 2.0, end: 3.9, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    tankSelect: { src: repoBaseUrl + 'sound7tankstart.mp3', start: 1.5, end: 5.0, fadeDuration: 1.0, volume: 0.8, boost: 1.0 },
    infantryMove: { src: repoBaseUrl + 'sound 3.mp3', start: 3.0, end: 6.0, fadeDuration: 1.0, volume: 1.0, boost: 3.0 }, // BUMPED UP TO 3.0 HERE
    tankMove: { src: repoBaseUrl + 'sound5tankmove.mp3', start: 1, end: 3.5, fadeDuration: 1.0, volume: 0.8, boost: 1.0 },
    ship: { src: repoBaseUrl + 'sound6battleshiphorn.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    planeSelect: { src: repoBaseUrl + 'sound12planestarting.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    planeMove: { src: repoBaseUrl + 'sound13planeflying.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.8, boost: 1.0 },
    mineSelect: { src: repoBaseUrl + 'sound14mines.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    antiAirMove: { src: repoBaseUrl + 'sound15antiairmoving.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.8, boost: 1.0 },
    engineer: { src: repoBaseUrl + 'sound16engineerall.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    antiAirSelect: { src: repoBaseUrl + 'sound17antiairselected.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9, boost: 1.0 },
    frontalAttack: { src: repoBaseUrl + 'tank.mp3', start: 0.8, end: 3.5, fadeDuration: 1.0, volume: 0.95, boost: 1.0 },
    rangedAttack: { src: repoBaseUrl + 'artillery.mp3', start: 0, end: 4.0, fadeDuration: 0.5, volume: 0.95, boost: 1.0 },
    burningCity: { src: repoBaseUrl + 'sound11burningcity.mp3', start: 0, end: 5.0, fadeDuration: 0.5, volume: 0.6, boost: 1.0 }
};

// Track active audio streams in memory to prevent browser garbage collection cut-offs
const activeAudioStreams = [];

// Shared AudioContext for handling volume multipliers past standard browser limits
let sharedAudioContext = null;
function getSharedAudioContext() {
    if (!sharedAudioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            sharedAudioContext = new AudioCtx();
        }
    }
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume();
    }
    return sharedAudioContext;
}

/**
 * Universal sound player function supporting Web Audio gain amplification past 1.0.
 */
export function playSound(soundKey) {
    const config = soundConfigs[soundKey];
    if (!config) {
        console.warn(`Sound config not found for key: ${soundKey}`);
        return;
    }

    const audio = new Audio(config.src);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous'; // Required for Web Audio routing on external URLs

    let targetGainNode = null;
    const boostMultiplier = config.boost || 1.0;

    // If a boost greater than 1.0 is requested, route through Web Audio API
    if (boostMultiplier > 1.0) {
        const ctx = getSharedAudioContext();
        if (ctx) {
            try {
                const sourceNode = ctx.createMediaElementSource(audio);
                targetGainNode = ctx.createGain();
                targetGainNode.gain.value = boostMultiplier;
                
                sourceNode.connect(targetGainNode);
                targetGainNode.connect(ctx.destination);
                audio.volume = config.volume; // Base element volume
            } catch (e) {
                // Fallback if browser blocks or restricts cross-origin routing
                audio.volume = 1.0;
            }
        } else {
            audio.volume = 1.0;
        }
    } else {
        audio.volume = config.volume;
    }

    // Handle both immediate cached metadata and async loading to prevent missed start times
    const applyStartTime = () => {
        if (config.start !== undefined && audio.currentTime !== config.start) {
            audio.currentTime = config.start;
        }
    };

    if (audio.readyState >= 1) {
        applyStartTime();
    } else {
        audio.addEventListener('loadedmetadata', applyStartTime, { once: true });
    }

    activeAudioStreams.push(audio);

    const checkInterval = setInterval(() => {
        let currentTime = audio.currentTime;
        let baseVol = config.volume;

        if (config.end) {
            // Tight 150ms micro-fade window right before the end point to prevent popping/chopping
            const fadeOutWindow = 0.15; 
            const fadeStartTime = config.end - fadeOutWindow;

            if (currentTime >= fadeStartTime && currentTime < config.end) {
                let progress = (config.end - currentTime) / fadeOutWindow;
                if (targetGainNode) {
                    targetGainNode.gain.value = Math.max(0, boostMultiplier * progress);
                } else {
                    audio.volume = Math.max(0, baseVol * progress);
                }
            }

            // Stop playback cleanly once the end timestamp is reached
            if (currentTime >= config.end || audio.paused || audio.ended) {
                audio.pause();
                clearInterval(checkInterval);
                const index = activeAudioStreams.indexOf(audio);
                if (index > -1) activeAudioStreams.splice(index, 1);
            }
        } else if (audio.ended || audio.paused) {
            clearInterval(checkInterval);
            const index = activeAudioStreams.indexOf(audio);
            if (index > -1) activeAudioStreams.splice(index, 1);
        }
    }, 25);

    audio.play().catch(err => {
        clearInterval(checkInterval);
        const index = activeAudioStreams.indexOf(audio);
        if (index > -1) activeAudioStreams.splice(index, 1);
        console.warn(`Audio playback failed for ${soundKey}:`, err);
    });
}

// Clean mapping triggers used across your game engine & renderers
export function triggerSelectSound(unitName) {
    let normalized = (unitName || '').toLowerCase().replace(/[\s-]/g, '');
    if (normalized.includes('infantry')) playSound('infantrySelect');
    else if (normalized.includes('tank')) playSound('tankSelect');
    else if (normalized.includes('plane')) playSound('planeSelect');
    else if (normalized.includes('mine')) playSound('mineSelect');
    else if (normalized.includes('antiair')) playSound('antiAirSelect');
    else if (normalized.includes('ship')) playSound('ship');
    else if (normalized.includes('artillery') || normalized.includes('engineer')) playSound('engineer');
}

export function triggerMoveSound(unitName) {
    let normalized = (unitName || '').toLowerCase().replace(/[\s-]/g, '');
    if (normalized.includes('infantry')) playSound('infantryMove');
    else if (normalized.includes('tank')) playSound('tankMove');
    else if (normalized.includes('plane')) playSound('planeMove');
    else if (normalized.includes('antiair') || normalized.includes('artillery')) playSound('antiAirMove');
    else if (normalized.includes('ship')) playSound('ship');
    else if (normalized.includes('engineer')) playSound('engineer');
}

export function triggerFrontalAttackSound() {
    playSound('frontalAttack');
}

export function triggerRangedAttackSound() {
    playSound('rangedAttack');
}

export function playFireAudioEffect() {
    playSound('burningCity');
}
