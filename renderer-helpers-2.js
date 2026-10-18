// renderer-helpers-2.js - Handles tile capture badges, flag animations, fires, smoke, and deployment overlays
import { cols, rows } from './game-config.js';
import { getPendingUnitType, isTileValidForTeam } from './deployment.js';

let tileFlagAnimations = new Map();
let tileFireTimestamps = new Map();
let previousTileCapturesState = {};
let capturesInitialized = false; 

const repoBaseUrl = 'https://raw.githubusercontent.com/ModernChess/assets-images/main/';

function playFireAudioEffect() {
    const audio = new Audio(repoBaseUrl + 'sound11burningcity.mp3');
    audio.preload = 'auto';
    audio.currentTime = 0;
    audio.volume = 0;

    const startTime = 0;
    const endTime = 5.0;
    const maxVolume = 0.2;
    const fadeOutDuration = 0.5;

    const checkInterval = setInterval(() => {
        let currentTime = audio.currentTime;

        if (currentTime >= startTime && currentTime <= endTime) {
            let currentVol = maxVolume;
            let fadeOutStart = endTime - fadeOutDuration;

            if (currentTime > fadeOutStart && currentTime < endTime) {
                let progress = (endTime - currentTime) / fadeOutDuration;
                currentVol = maxVolume * progress;
            }

            audio.volume = Math.max(0, Math.min(maxVolume, currentVol));
        }

        if (currentTime >= endTime || audio.paused) {
            audio.pause();
            clearInterval(checkInterval);
        }
    }, 50);

    audio.play().catch(err => {
        clearInterval(checkInterval);
        console.log("Audio autoplay restricted:", err);
    });
}

export const unitColors = {
    infantry: 'rgba(0, 128, 0, 0.20)',     
    ship: 'rgba(128, 0, 128, 0.20)',         
    antiair: 'rgba(0, 255, 255, 0.20)',      
    engineer: 'rgba(0, 0, 0, 0.20)',         
    mine: 'rgba(255, 0, 0, 0.20)',           
    tank: 'rgba(128, 128, 128, 0.20)',       
    plane: 'rgba(0, 0, 255, 0.20)',          
    artillery: 'rgba(255, 165, 0, 0.20)'     
};

export const unitBorderColors = {
    infantry: '#008000',
    ship: '#800080',
    antiair: '#00ffff',
    engineer: '#000000',
    mine: '#ff0000',
    tank: '#808080',
    plane: '#0000ff',
    artillery: '#ffa500'
};

export function drawCapturedTileBadges(ctx, canvas, tileCaptures, getRenderCoordinatesFunc, localTeam) {
    if (!tileCaptures) return;
    ctx.save();
    for (let key in tileCaptures) {
        let tileInfo = tileCaptures[key];
        const excludedTypes = ['gold core linked', 'artillery', 'tank', 'port'];
        if (tileInfo && tileInfo.capturedBy && !excludedTypes.includes(tileInfo.type)) {
            let parts = key.split(',');
            if (parts.length === 2) {
                let gx = parseInt(parts[0], 10);
                let gy = parseInt(parts[1], 10);
                let pos = getRenderCoordinatesFunc(gx, gy, canvas.width, localTeam);

                let size = pos.cellSize * 0.375;
                let squareX = pos.x + (pos.cellSize - size) / 2;
                let squareY = pos.y + (pos.cellSize - size) / 2;

                let opaqueColor = tileInfo.capturedBy === 'blue' ? '#00e5ff' : '#ff4081';

                ctx.strokeStyle = opaqueColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(squareX, squareY, size, size);

                let padding = 2;
                let outerSize = size + (padding * 2);
                let outerX = squareX - padding;
                let outerY = squareY - padding;

                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.strokeRect(outerX, outerY, outerSize, outerSize);
            }
        }
    }
    ctx.restore();
}

export function initializeTileCapturesState(initialRemoteData) {
    previousTileCapturesState = JSON.parse(JSON.stringify(initialRemoteData || {}));
    tileFireTimestamps.clear();
    tileFlagAnimations.clear();
    capturesInitialized = true;
}

export function drawCapturedTileFireAndSmoke(ctx, canvas, tileCaptures, getRenderCoordinatesFunc, localTeam) {
    if (!tileCaptures) return;
    let now = performance.now();

    if (!capturesInitialized) {
        previousTileCapturesState = JSON.parse(JSON.stringify(tileCaptures));
        capturesInitialized = true;
        return; 
    }

    const excludedTypes = ['gold core linked', 'artillery', 'tank', 'port'];

    for (let key in tileCaptures) {
        let tileInfo = tileCaptures[key];
        if (tileInfo && tileInfo.capturedBy && !excludedTypes.includes(tileInfo.type)) {
            let prevTile = previousTileCapturesState[key];
            if (!prevTile || prevTile.capturedBy !== tileInfo.capturedBy) {
                if (!tileFlagAnimations.has(key) && !tileFireTimestamps.has(key)) {
                    tileFlagAnimations.set(key, now);
                }
            }
        }
    }
    
    previousTileCapturesState = JSON.parse(JSON.stringify(tileCaptures));

    ctx.save();

    for (let [key, flagStartTime] of tileFlagAnimations.entries()) {
        let tileInfo = tileCaptures[key];
        if (!tileInfo || !tileInfo.capturedBy) {
            tileFlagAnimations.delete(key);
            continue;
        }

        let elapsed = now - flagStartTime;
        let duration = 500;

        if (elapsed < duration) {
            let parts = key.split(',');
            if (parts.length === 2) {
                let gx = parseInt(parts[0], 10);
                let gy = parseInt(parts[1], 10);
                let pos = getRenderCoordinatesFunc(gx, gy, canvas.width, localTeam);
                let cx = pos.x + pos.cellSize / 2;
                let cy = pos.y + pos.cellSize / 2;
                let cellSize = pos.cellSize;

                let progress = elapsed / duration;
                let startDistance = cellSize * 2.5; 
                let dropOffset = (1 - Math.cos(progress * Math.PI * 0.5)) * startDistance;
                let renderY = cy - startDistance + dropOffset;

                ctx.save();
                ctx.fillStyle = tileInfo.capturedBy === 'blue' ? '#2980b9' : '#c0392b';
                ctx.fillRect(cx - 1, renderY, 2, cellSize * 1.4);
                
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath();
                ctx.moveTo(cx + 1, renderY);
                ctx.lineTo(cx + 13, renderY + 6);
                ctx.lineTo(cx + 1, renderY + 12);
                ctx.fill();
                ctx.restore();
            }
        } else {
            tileFlagAnimations.delete(key);
            tileFireTimestamps.set(key, now);
            playFireAudioEffect();
        }
    }

    for (let [key, fireStartTime] of tileFireTimestamps.entries()) {
        let tileInfo = tileCaptures[key];
        if (!tileInfo || !tileInfo.capturedBy) {
            tileFireTimestamps.delete(key);
            continue;
        }

        let fireElapsed = now - fireStartTime;
        let fireDuration = 5000;

        if (fireElapsed < fireDuration) {
            let parts = key.split(',');
            if (parts.length === 2) {
                let gx = parseInt(parts[0], 10);
                let gy = parseInt(parts[1], 10);
                let pos = getRenderCoordinatesFunc(gx, gy, canvas.width, localTeam);
                let cx = pos.x + pos.cellSize / 2;
                let cy = pos.y + pos.cellSize / 2;
                let cellSize = pos.cellSize;

                let fireAlpha = 0.85;
                if (fireElapsed < 600) {
                    fireAlpha = (fireElapsed / 600) * 0.85;
                } else if (fireDuration - fireElapsed < 1000) {
                    fireAlpha = ((fireDuration - fireElapsed) / 1000) * 0.85;
                }

                ctx.save();
                ctx.globalAlpha = fireAlpha;

                let pulse = Math.sin(now * 0.015) * 3;

                ctx.fillStyle = '#d35400';
                ctx.beginPath();
                ctx.moveTo(cx - cellSize * 0.35, cy + cellSize * 0.3);
                ctx.quadraticCurveTo(cx - cellSize * 0.45, cy - cellSize * 0.1, cx - cellSize * 0.15 + pulse * 0.1, cy - cellSize * 0.5);
                ctx.quadraticCurveTo(cx, cy - cellSize * 0.75 + pulse * 0.2, cx + cellSize * 0.15 - pulse * 0.1, cy - cellSize * 0.5);
                ctx.quadraticCurveTo(cx + cellSize * 0.45, cy - cellSize * 0.1, cx + cellSize * 0.35, cy + cellSize * 0.3);
                ctx.closePath();
                ctx.fill();

                let grad = ctx.createLinearGradient(cx, cy - cellSize * 0.85, cx, cy + cellSize * 0.2);
                grad.addColorStop(0.0, '#fff200'); 
                grad.addColorStop(0.4, '#f1c40f'); 
                grad.addColorStop(0.8, '#e67e22'); 
                grad.addColorStop(1.0, '#d35400'); 

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(cx - cellSize * 0.2, cy + cellSize * 0.2);
                ctx.quadraticCurveTo(cx - cellSize * 0.25, cy - cellSize * 0.2, cx - cellSize * 0.05, cy - cellSize * 0.85 + pulse);
                ctx.quadraticCurveTo(cx, cy - cellSize * 0.95 + pulse, cx + cellSize * 0.05, cy - cellSize * 0.85 + pulse);
                ctx.quadraticCurveTo(cx + cellSize * 0.25, cy - cellSize * 0.2, cx +cellSize * 0.2, cy + cellSize * 0.2);
                ctx.closePath();
                ctx.fill();

                ctx.restore();

                let smokeParticlesCount = 5;
                for (let i = 0; i < smokeParticlesCount; i++) {
                    let particleCycle = (fireElapsed + i * 1000) % fireDuration;
                    let pProgress = particleCycle / fireDuration;
                    
                    let smokeX = cx + Math.sin(pProgress * Math.PI * 3 + i) * 14;
                    let smokeY = cy - (pProgress * cellSize * 5.2); 
                    let baseAlpha = Math.max(0, 1 - pProgress);
                    
                    let overallFade = fireDuration - fireElapsed < 1000 ? (fireDuration - fireElapsed) / 1000 : (fireElapsed < 600 ? fireElapsed / 600 : 1.0);
                    let smokeAlpha = baseAlpha * 0.45 * overallFade;
                    
                    let smokeRadius = cellSize * (0.18 + pProgress * 0.3); 

                    ctx.fillStyle = `rgba(110, 110, 110, ${smokeAlpha})`;
                    ctx.beginPath();
                    ctx.arc(smokeX, smokeY, smokeRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        } else {
            tileFireTimestamps.delete(key);
        }
    }

    ctx.restore();
}

export function drawDeploymentOverlay(ctx, canvas, tileCaptures, units, getRenderCoordinatesFunc, localTeam) {
    let activePendingType = getPendingUnitType();
    if (!activePendingType) return;

    let now = performance.now();
    let typeKey = activePendingType.toLowerCase();
    let baseFillColor = unitColors[typeKey] || 'rgba(33, 150, 243, 0.20)';
    let baseStrokeColor = unitBorderColors[typeKey] || '#2196F3';

    let globalSinePulse = Math.sin(now * 0.002); 
    let dynamicInset = 2.2 - (globalSinePulse * 0.6); 

    ctx.save();
    for (let gx = 0; gx < cols; gx++) {
        for (let gy = 0; gy < rows; gy++) {
            let key = `${gx},${gy}`;

            if (isTileValidForTeam(key, activePendingType, localTeam)) {
                let isOccupied = units.some(u => Number(u.gridX) === gx && Number(u.gridY) === gy);
                if (isOccupied) continue;

                let pos = getRenderCoordinatesFunc(gx, gy, canvas.width, localTeam);

                let rectX = pos.x + dynamicInset;
                let rectY = pos.y + dynamicInset;
                let rectSize = pos.cellSize - (dynamicInset * 2);

                ctx.save();
                ctx.fillStyle = baseFillColor;
                ctx.fillRect(rectX, rectY, rectSize, rectSize);

                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([]);
                ctx.strokeRect(rectX, rectY, rectSize, rectSize);

                ctx.strokeStyle = baseStrokeColor;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(rectX, rectY, rectSize, rectSize);
                
                ctx.restore();
            }
        }
    }
    ctx.restore();
}
