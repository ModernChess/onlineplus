// renderer-helpers.js - Helper modules with local repoBaseUrl, sound effects, and combat animation rendering
import { 
    cols, rows, 
    colLetterToIndex, goldCoreList, goldList, artList, tList, rbList, bbList, navList, bbcList, rbcList 
} from './game-config.js';
import { getPendingUnitType, isTileValidForTeam } from './deployment.js';
import { triggerFrontalAttackSound, triggerRangedAttackSound } from './sound.js';

let smokeParticles = [];
let tileFlagAnimations = new Map();
let tileFireTimestamps = new Map();
let previousTileCapturesState = {};
let capturesInitialized = false; 

// Active combat animation arrays
let activeExplosions = [];
let activeProjectiles = [];

// Local constant asset repository base URL
const repoBaseUrl = 'https://raw.githubusercontent.com/ModernChess/assets-images/main/';

// Independent audio player for burning tiles so multiple fires never conflict or cut each other off
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
    infantry: 'rgba(0, 128, 0, 0.35)',     
    ship: 'rgba(128, 0, 128, 0.35)',         
    antiair: 'rgba(0, 255, 255, 0.35)',      
    engineer: 'rgba(0, 0, 0, 0.35)',         
    mine: 'rgba(255, 0, 0, 0.35)',           
    tank: 'rgba(128, 128, 128, 0.35)',       
    plane: 'rgba(0, 0, 255, 0.35)',          
    artillery: 'rgba(255, 165, 0, 0.35)'     
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

export function spawnSmokeTrail(unit, prevX, prevY, cellSize) {
    let dx = unit.animX - prevX;
    let dy = unit.animY - prevY;
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        smokeParticles.push({
            x: unit.animX + cellSize / 2 + (Math.random() - 0.5) * 10,
            y: unit.animY + cellSize / 2 + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            radius: cellSize * 0.12,
            maxRadius: cellSize * 0.38,
            life: 1.0,
            decay: 0.03 + Math.random() * 0.02
        });
    }
}

export function drawSmokeParticles(ctx) {
    ctx.save();
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        let p = smokeParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.radius += (p.maxRadius - p.radius) * 0.05;
        p.life -= p.decay;
        p.alpha = Math.max(0, p.life * 0.3);

        if (p.life <= 0) {
            smokeParticles.splice(i, 1);
        } else {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

export function triggerFrontalExplosion(gridX, gridY, getRenderCoordinatesFunc, canvas, localTeam) {
    triggerFrontalAttackSound(); // Play tank.mp3
    let pos = getRenderCoordinatesFunc(gridX, gridY, canvas.width, localTeam);
    let centerX = pos.x + pos.cellSize / 2;
    let centerY = pos.y + pos.cellSize / 2;

    activeExplosions.push({
        x: centerX,
        y: centerY,
        cellSize: pos.cellSize,
        startTime: performance.now(),
        duration: 600,
        type: 'frontal',
        particles: createExplosionParticles(centerX, centerY, pos.cellSize)
    });
}

export function triggerFarDestructionTrails(attackerX, attackerY, targetX, targetY, getRenderCoordinatesFunc, canvas, localTeam) {
    triggerRangedAttackSound(); // Play artillery.mp3
    let startPos = getRenderCoordinatesFunc(attackerX, attackerY, canvas.width, localTeam);
    let endPos = getRenderCoordinatesFunc(targetX, targetY, canvas.width, localTeam);

    let startX = startPos.x + startPos.cellSize / 2;
    let startY = startPos.y + startPos.cellSize / 2;
    let targetXCenter = endPos.x + endPos.cellSize / 2;
    let targetYCenter = endPos.y + endPos.cellSize / 2;

    for (let i = 0; i < 3; i++) {
        activeProjectiles.push({
            startX: startX + (Math.random() - 0.5) * 4,
            startY: startY + (Math.random() - 0.5) * 4,
            targetX: targetXCenter + (Math.random() - 0.5) * 10,
            targetY: targetYCenter + (Math.random() - 0.5) * 10,
            startTime: performance.now() + (i * 80),
            duration: 450,
            cellSize: endPos.cellSize,
            gridX: targetX,
            gridY: targetY
        });
    }
}

function createExplosionParticles(x, y, cellSize) {
    let particles = [];
    let count = 24;
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = (Math.random() * 3 + 1) * (cellSize / 30);
        let colors = ['#e74c3c', '#e67e22', '#f1c40f', '#ffffff', '#333333'];
        
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.random() * (cellSize * 0.15) + 2,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    return particles;
}

export function drawCombatAnimations(ctx, canvas) {
    let now = performance.now();

    ctx.save();
    for (let i = activeProjectiles.length - 1; i >= 0; i--) {
        let p = activeProjectiles[i];
        let elapsed = now - p.startTime;

        if (elapsed < 0) continue;

        let progress = elapsed / p.duration;
        if (progress >= 1.0) {
            activeExplosions.push({
                x: p.targetX,
                y: p.targetY,
                cellSize: p.cellSize,
                startTime: now,
                duration: 600,
                type: 'realistic',
                particles: createExplosionParticles(p.targetX, p.targetY, p.cellSize)
            });
            activeProjectiles.splice(i, 1);
            continue;
        }

        let currX = p.startX + (p.targetX - p.startX) * progress;
        let currY = p.startY + (p.targetY - p.startY) * progress;
        let heightArc = Math.sin(progress * Math.PI) * (p.cellSize * 1.5);
        currY -= heightArc;

        let scaleFactor = 0.4 + 2.6 * Math.sin(progress * Math.PI);
        let currentRadius = 1.5 * scaleFactor;

        ctx.strokeStyle = 'rgba(243, 156, 18, 0.7)';
        ctx.lineWidth = Math.max(1, 2.0 * scaleFactor);
        ctx.beginPath();
        ctx.moveTo(p.startX, p.startY);
        ctx.lineTo(currX, currY);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 8 * scaleFactor;
        ctx.beginPath();
        ctx.arc(currX, currY, currentRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.restore();

    ctx.save();
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        let ex = activeExplosions[i];
        let elapsed = now - ex.startTime;
        let progress = elapsed / ex.duration;

        if (progress >= 1.0) {
            activeExplosions.splice(i, 1);
            continue;
        }

        let alpha = 1.0 - progress;
        ctx.globalAlpha = alpha;

        let shockwaveRadius = (ex.cellSize * 1.2) * progress;
        ctx.strokeStyle = `rgba(231, 76, 60, ${1 - progress})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, shockwaveRadius, 0, Math.PI * 2);
        ctx.stroke();

        if (ex.particles) {
            ex.particles.forEach(pt => {
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.vx *= 0.92;
                pt.vy *= 0.92;
                
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, Math.max(0.5, pt.radius * (1 - progress)), 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }
    ctx.restore();
}

export function drawCapturedTileBadges(ctx, canvas, tileCaptures, getRenderCoordinatesFunc, localTeam) {
    if (!tileCaptures) return;
    ctx.save();
    for (let key in tileCaptures) {
        let tileInfo = tileCaptures[key];
        if (tileInfo && tileInfo.capturedBy && tileInfo.type !== 'gold core linked') {
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

    for (let key in tileCaptures) {
        let tileInfo = tileCaptures[key];
        if (tileInfo && tileInfo.capturedBy && tileInfo.type !== 'gold core linked') {
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
            
            // Trigger dedicated independent audio instance for this specific fire
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

    let typeKey = activePendingType.toLowerCase();
    let fillColor = unitColors[typeKey] || 'rgba(33, 150, 243, 0.35)';
    let strokeColor = unitBorderColors[typeKey] || '#2196F3';

    ctx.save();
    for (let gx = 0; gx < cols; gx++) {
        for (let gy = 0; gy < rows; gy++) {
            let key = `${gx},${gy}`;

            if (isTileValidForTeam(key, activePendingType, localTeam)) {
                let isOccupied = units.some(u => Number(u.gridX) === gx && Number(u.gridY) === gy);
                if (isOccupied) continue;

                let pos = getRenderCoordinatesFunc(gx, gy, canvas.width, localTeam);
                
                ctx.fillStyle = fillColor;
                ctx.fillRect(pos.x + 2, pos.y + 2, pos.cellSize - 4, pos.cellSize - 4);

                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(pos.x + 2, pos.y + 2, pos.cellSize - 4, pos.cellSize - 4);
            }
        }
    }
    ctx.restore();
}
