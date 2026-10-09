// sound.js - Unified Single-Channel SFX & Isolated BGM Manager
const repoBaseUrl = 'https://raw.githubusercontent.com/ModernChess/assets-images/main/';

const soundConfigs = {
    infantrySelect: { src: repoBaseUrl + 'sound4-armycharge.mp3', start: 2.0, end: 3.9, fadeDuration: 1.0, volume: 0.9 },
    tankSelect: { src: repoBaseUrl + 'sound7tankstart.mp3', start: 1.5, end: 5.0, fadeDuration: 1.0, volume: 0.8 },
    infantryMove: { src: repoBaseUrl + 'sound 3.mp3', start: 3.0, end: 6.0, fadeDuration: 1.0, volume: 1.0 },
    tankMove: { src: repoBaseUrl + 'sound5tankmove.mp3', start: 1, end: 3.5, fadeDuration: 1.0, volume: 0.8 },
    ship: { src: repoBaseUrl + 'sound6battleshiphorn.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9 },
    planeSelect: { src: repoBaseUrl + 'sound12planestarting.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9 },
    planeMove: { src: repoBaseUrl + 'sound13planeflying.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.8 },
    mineSelect: { src: repoBaseUrl + 'sound14mines.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9 },
    antiAirMove: { src: repoBaseUrl + 'sound15antiairmoving.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.8 },
    engineer: { src: repoBaseUrl + 'sound16engineerall.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9 },
    antiAirSelect: { src: repoBaseUrl + 'sound17antiairselected.mp3', start: 0, end: 3.5, fadeDuration: 1.0, volume: 0.9 },
    frontalAttack: { src: repoBaseUrl + 'tank.mp3', start: 0.8, end: 3.5, fadeDuration: 2.3, volume: 0.95 },
    rangedAttack: { src: repoBaseUrl + 'artillery.mp3', start: 0, end: 4.0, fadeDuration: 0.5, volume: 0.95 },
    burningCity: { src: repoBaseUrl + 'sound11burningcity.mp3', start: 0, end: 5.0, fadeDuration: 0.5, volume: 0.6 }
};

const hoiSoundtracks = [
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20No%20Step%20Back%20Bravery%20of%20the%20Minority%20OST.mp3',
    repoBaseUrl + 'Shatter%20the%20Empires%20-%20Hearts%20of%20Iron%204%20Man%20the%20Guns.mp3',
    repoBaseUrl + 'Hearts%20Of%20Iron%204%20Waking%20the%20Tiger%20OST%20Battle%20Of%20Wuhan.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20Soundtrack%20Escalation.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20Soundtrack%20Retribution.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20-%20Days%20of%20Thunder.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20-%20Operation%20Barbarossa.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20Heavy%20Water.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20-%20The%20Attack.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20-%20Bring%20Forth%20the%20Tanks.mp3',
    repoBaseUrl + 'Hearts%20of%20Iron%20IV%20-%20Axis%20Theme.mp3'
];

let currentBGM = null;
let isMatchMusicActive = false;

// Dedicated single element for sound effects to prevent multi-stream decoder lockups
let sfxAudioElement = null;
let sfxInterval = null;

export function playSound(soundKey) {
    const config = soundConfigs[soundKey];
    if (!config) return;

    if (!sfxAudioElement) {
        sfxAudioElement = new Audio();
        sfxAudioElement.preload = 'auto';
    }

    // Stop any currently playing sound effect immediately
    if (sfxInterval) clearInterval(sfxInterval);
    sfxAudioElement.pause();

    sfxAudioElement.src = config.src;
    sfxAudioElement.volume = config.volume;

    const applyStartTime = () => {
        if (config.start !== undefined) {
            sfxAudioElement.currentTime = config.start;
        }
    };

    sfxAudioElement.onloadedmetadata = applyStartTime;
    applyStartTime();

    sfxInterval = setInterval(() => {
        if (!sfxAudioElement) {
            clearInterval(sfxInterval);
            return;
        }

        let currentTime = sfxAudioElement.currentTime;

        if (config.end) {
            const fadeOutWindow = config.fadeDuration !== undefined ? config.fadeDuration : 0.15;
            const fadeStartTime = config.end - fadeOutWindow;

            if (currentTime >= fadeStartTime && currentTime < config.end) {
                let progress = (config.end - currentTime) / fadeOutWindow;
                sfxAudioElement.volume = Math.max(0, config.volume * progress);
            }

            if (currentTime >= config.end || sfxAudioElement.paused || sfxAudioElement.ended) {
                sfxAudioElement.pause();
                clearInterval(sfxInterval);
            }
        } else if (sfxAudioElement.ended || sfxAudioElement.paused) {
            clearInterval(sfxInterval);
        }
    }, 25);

    sfxAudioElement.play().catch(err => {
        clearInterval(sfxInterval);
    });
}

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

// Dedicated, untouched background music channel
export function playRandomMatchMusic() {
    if (!isMatchMusicActive) return;
    if (currentBGM) {
        currentBGM.pause();
        currentBGM = null;
    }

    const randomIndex = Math.floor(Math.random() * hoiSoundtracks.length);
    const selectedTrack = hoiSoundtracks[randomIndex];

    currentBGM = new Audio(selectedTrack);
    currentBGM.volume = 0.5;

    currentBGM.onended = () => {
        if (isMatchMusicActive) {
            playRandomMatchMusic();
        }
    };

    currentBGM.play().catch(err => {
        console.warn("BGM playback blocked/interrupted:", err);
    });
}

export function startMatchMusic() {
    if (isMatchMusicActive && currentBGM && !currentBGM.paused) return;
    isMatchMusicActive = true;
    playRandomMatchMusic();
}

export function stopMatchMusic() {
    isMatchMusicActive = false;
    if (currentBGM) {
        currentBGM.pause();
        currentBGM = null;
    }
}
