// game-renderer.js - Handles Canvas Drawing, Map Background Rendering, Unit Visuals, Glide Animations, Tile Highlighting, and Stalemate Badges
import { 
    cols, rows, 
    mapImg, mapLoaded 
} from './game-config.js';
import { applyCameraTransform } from './viewport.js';
import { getUnitRange, getShowUnitRange } from './unit-movement.js';
import { getSuperunitsForTeam, getUnitMacroRangeTiles } from './combat-mechanics.js';
import { tileCaptures } from './team-logic.js';
import { spawnSmokeTrail, drawSmokeParticles, drawCombatAnimations } from './renderer-helpers.js';
import { drawCapturedTileBadges, drawCapturedTileFireAndSmoke, drawDeploymentOverlay } from './renderer-helpers-2.js';
import { drawUnitsAndBadges } from './game-renderer-2.js';

let superunitBadgeCache = new Map();
let cachedUnitsForDeployment = [];
let activeDestructionAlerts = []; 
let activeDeploymentAlerts = [];
let activeMovementTrails = []; 

export function triggerDestructionAlert(gridX, gridY, team) {
    activeDestructionAlerts.push({
        x: gridX,
        y: gridY,
        team: team,
        startTime: performance.now()
    });
}

export function triggerDeploymentAlert(gridX, gridY, team) {
    activeDeploymentAlerts.push({
        x: gridX,
        y: gridY,
        team: team,
        startTime: performance.now()
    });
}

export function triggerMovementArrowTrail(fromX, fromY, toX, toY, team) {
    activeMovementTrails.push({
        fromX: fromX,
        fromY: fromY,
        toX: toX,
        toY: toY,
        team: team,
        startTime: performance.now()
    });
}

window.triggerDestructionAlert = triggerDestructionAlert;
window.triggerDeploymentAlert = triggerDeploymentAlert;
window.triggerMovementArrowTrail = triggerMovementArrowTrail;

export function drawMovementArrowTrails(ctx, canvas, localTeam) {
    if (!activeMovementTrails || activeMovementTrails.length === 0) return;
    let now = performance.now();
    let duration = 30000;

    ctx.save();
    for (let i = activeMovementTrails.length - 1; i >= 0; i--) {
        let trail = activeMovementTrails[i];
        let elapsed = now - trail.startTime;

        if (elapsed >= duration) {
            activeMovementTrails.splice(i, 1);
            continue;
        }

        let startPos = getRenderCoordinates(trail.fromX, trail.fromY, canvas.width, localTeam);
        let endPos = getRenderCoordinates(trail.toX, trail.toY, canvas.width, localTeam);

        let startX = startPos.x + startPos.cellSize / 2;
        let startY = startPos.y + startPos.cellSize / 2;
        let endX = endPos.x + endPos.cellSize / 2;
        let endY = endPos.y + endPos.cellSize / 2;

        let alpha = Math.max(0, 1 - (elapsed / duration));
        ctx.globalAlpha = alpha;

        let dx = endX - startX;
        let dy = endY - startY;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx);

        if (dist > 0) {
            let stripeWidth = 4.5; 
            let numSegments = Math.max(4, Math.floor(dist / 10));
            
            for (let s = 0; s < numSegments; s++) {
                let r1 = s / numSegments;
                let r2 = (s + 1) / numSegments;
                
                let segStartX = startX + dx * r1;
                let segStartY = startY + dy * r1;
                let segEndX = startX + dx * r2;
                let segEndY = startY + dy * r2;

                ctx.strokeStyle = (s % 2 === 0) ? '#f1c40f' : '#111111';
                ctx.lineWidth = stripeWidth;
                ctx.lineCap = 'butt';

                ctx.beginPath();
                ctx.moveTo(segStartX, segStartY);
                ctx.lineTo(segEndX, segEndY);
                ctx.stroke();
            }
        }

        if (dist > 0) {
            let numArrows = Math.max(4, Math.floor(dist / 22));
            for (let step = 1; step <= numArrows; step++) {
                let ratio = step / (numArrows + 1);
                let offsetPulse = ((now / 350) % 1) * (1 / numArrows);
                let currentRatio = Math.min(0.96, Math.max(0.04, ratio + offsetPulse));
                
                let curX = startX + dx * currentRatio;
                let curY = startY + dy * currentRatio;

                ctx.save();
                ctx.translate(curX, curY);
                ctx.rotate(angle);

                ctx.fillStyle = '#f1c40f';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1.5;

                ctx.beginPath();
                ctx.moveTo(2, 0);
                ctx.lineTo(-9, -5);
                ctx.lineTo(-9, 5);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(endX, endY, startPos.cellSize * 0.38, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

export function drawDestructionAlerts(canvas, localTeam) {
    let container = document.getElementById('canvas-container');
    if (!container) return;

    let existingOverlays = container.querySelectorAll('.canvas-alert-overlay');
    existingOverlays.forEach(el => el.remove());

    let now = performance.now();
    let duration = 8000;
    let scaleX = canvas.clientWidth / canvas.width;
    let scaleY = canvas.clientHeight / canvas.height;
    let cam = window.currentCameraState || { x: 0, y: 0, zoom: 1 };

    let isBlinkVisible = Math.floor(now / 250) % 2 === 0;

    for (let i = activeDestructionAlerts.length - 1; i >= 0; i--) {
        let alertObj = activeDestructionAlerts[i];
        let elapsed = now - alertObj.startTime;

        if (elapsed >= duration || alertObj.team !== localTeam) {
            if (elapsed >= duration) activeDestructionAlerts.splice(i, 1);
            continue;
        }

        let pos = getRenderCoordinates(alertObj.x, alertObj.y, canvas.width, localTeam);
        let worldX = (pos.x + pos.cellSize / 2) * cam.zoom + cam.x;
        let worldY = pos.y * cam.zoom + cam.y; 

        let screenX = worldX * scaleX;
        let screenY = worldY * scaleY;

        let overlay = document.createElement('div');
        overlay.className = 'canvas-alert-overlay';
        overlay.style.left = `${screenX}px`;
        overlay.style.top = `${screenY}px`;
        overlay.style.opacity = isBlinkVisible ? '1' : '0.2';
        
        overlay.innerHTML = `
            <div class="destruction-beacon">
                <div class="destruction-exclamation">❗</div>
            </div>
        `;
        container.appendChild(overlay);
    }

    for (let i = activeDeploymentAlerts.length - 1; i >= 0; i--) {
        let depObj = activeDeploymentAlerts[i];
        let elapsed = now - depObj.startTime;

        if (elapsed >= duration || depObj.team === localTeam) {
            if (elapsed >= duration) activeDeploymentAlerts.splice(i, 1);
            continue;
        }

        let pos = getRenderCoordinates(depObj.x, depObj.y, canvas.width, localTeam);
        let worldX = (pos.x + pos.cellSize / 2) * cam.zoom + cam.x;
        let worldY = pos.y * cam.zoom + cam.y;

        let screenX = worldX * scaleX;
        let screenY = worldY * scaleY;

        let overlay = document.createElement('div');
        overlay.className = 'canvas-alert-overlay';
        overlay.style.left = `${screenX}px`;
        overlay.style.top = `${screenY}px`;
        overlay.style.opacity = isBlinkVisible ? '1' : '0.2';

        overlay.innerHTML = `
            <div class="deployment-beacon-circle" title="Enemy Unit Deployed Here!">
                ❗
            </div>
        `;
        container.appendChild(overlay);
    }
}

export function updateRendererUnits(units) {
    if (Array.isArray(units)) {
        cachedUnitsForDeployment = units;
    }
}

export function getUnitAtCoordinate(gx, gy) {
    return cachedUnitsForDeployment.find(u => Number(u.gridX) === Number(gx) && Number(u.gridY) === Number(gy)) || null;
}

export function getRenderCoordinates(gridX, gridY, canvasWidth, localTeam) {
    let cellSize = canvasWidth / cols;
    let renderX = gridX;
    let renderY = gridY;

    if (localTeam === 'red') {
        renderX = cols - 1 - gridX;
        renderY = rows - 1 - gridY;
    }

    return { x: renderX * cellSize, y: renderY * cellSize, cellSize: cellSize };
}

window.getRenderCoordinates = getRenderCoordinates;

export function drawGameScene(ctx, canvas, units, selectedUnit, localTeam, legalMoves = [], selectionAnimStartTime = null, stagedMove = null) {
    if (!ctx || !canvas) return;
    
    updateRendererUnits(units);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    applyCameraTransform(ctx);

    let boardWidth = canvas.width;
    let boardHeight = boardWidth * (rows / cols);

    ctx.save();
    if (localTeam === 'red') {
        ctx.translate(boardWidth / 2, boardHeight / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-boardWidth / 2, -boardHeight / 2);
    }
    if (mapLoaded && mapImg && mapImg.complete) {
        ctx.drawImage(mapImg, 0, 0, boardWidth, boardHeight);
    }
    ctx.restore();

    drawCapturedTileBadges(ctx, canvas, tileCaptures, getRenderCoordinates, localTeam);
    drawCapturedTileFireAndSmoke(ctx, canvas, tileCaptures, getRenderCoordinates, localTeam);
    drawSmokeParticles(ctx);
    drawDeploymentOverlay(ctx, canvas, tileCaptures, units, getRenderCoordinates, localTeam);

    drawCombatAnimations(ctx, canvas);
    drawMovementArrowTrails(ctx, canvas, localTeam);

    if (selectedUnit && legalMoves && legalMoves.length > 0) {
        ctx.save();
        legalMoves.forEach(m => {
            let movePos = getRenderCoordinates(m.c, m.r, canvas.width, localTeam);
            let px = movePos.x + 4;
            let py = movePos.y + 4;
            let pSize = movePos.cellSize - 8;

            let isStaged = stagedMove && stagedMove.c === m.c && stagedMove.r === m.r;

            if (isStaged) {
                ctx.save();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 5;
                ctx.setLineDash([]);
                ctx.strokeRect(px, py, pSize, pSize);

                ctx.strokeStyle = '#00ff66';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.strokeRect(px, py, pSize, pSize);
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = '#ff8000';
                ctx.fillRect(px, py, pSize, pSize);

                let centerX = movePos.x + movePos.cellSize / 2;
                let centerY = movePos.y + movePos.cellSize / 2;
                let radius = movePos.cellSize * 0.18;

                ctx.fillStyle = '#e74c3c';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;

                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        });
        ctx.restore();
    }

    let detectedUnitIds = new Set();
    units.forEach(unit => {
        if (getShowUnitRange(unit.id)) {
            let rangeTiles = getUnitMacroRangeTiles(unit);
            rangeTiles.forEach(tile => {
                let found = units.find(u => u.gridX === tile.c && u.gridY === tile.r);
                if (found && found.id !== unit.id) {
                    detectedUnitIds.add(found.id);
                }
            });
        }
    });

    let now = performance.now();
    units.forEach(unit => {
        if (getShowUnitRange(unit.id)) {
            ctx.save();
            let rangeVal = getUnitRange(unit);
            
            if (rangeVal > 0) {
                let unitNameLower = (unit.name || '').toLowerCase();
                let footprintColor = '#2196F3'; 
                let glowColor = '#2196F3';

                if (unitNameLower.includes('artillery')) {
                    footprintColor = '#ffa500'; 
                    glowColor = '#ff8c00';
                } else if (unitNameLower.includes('ship') || (unit.type && unit.type.includes('naval'))) {
                    footprintColor = '#8b5cf6'; 
                    glowColor = '#7c3aed';
                } else if (unitNameLower.includes('engineer')) {
                    footprintColor = '#10b981'; 
                    glowColor = '#059669';
                } else if (unitNameLower.includes('mine')) {
                    footprintColor = '#ef4444'; 
                    glowColor = '#dc2626';
                } else if (unitNameLower.includes('antiair')) {
                    footprintColor = '#06b6d4'; 
                    glowColor = '#0891b2';
                } else {
                    footprintColor = '#ec4899'; 
                    glowColor = '#db2777';
                }

                let macroSize = 2;
                let unitMCol = Math.floor(unit.gridX / macroSize);
                let unitMRow = Math.floor(unit.gridY / macroSize);

                let directions = [
                    { dc: 0, dr: -1 }, { dc: 0, dr: 1 },   
                    { dc: -1, dr: 0 }, { dc: 1, dr: 0 },   
                    { dc: -1, dr: -1 }, { dc: 1, dr: -1 }, 
                    { dc: -1, dr: 1 }, { dc: 1, dr: 1 }
                ];

                let targetMacroSquares = new Set();

                directions.forEach(dir => {
                    for (let step = 1; step <= rangeVal; step++) {
                        let targetMCol = unitMCol + (dir.dc * step);
                        let targetMRow = unitMRow + (dir.dr * step);

                        let startGridX = targetMCol * macroSize;
                        let startGridY = targetMRow * macroSize;

                        if (startGridX < 0 || startGridX >= cols || startGridY < 0 || startGridY >= rows) {
                            break;
                        }

                        targetMacroSquares.add(`${targetMCol},${targetMRow}`);
                    }
                });

                targetMacroSquares.forEach(coordStr => {
                    let [targetMCol, targetMRow] = coordStr.split(',').map(Number);

                    let startGridX = targetMCol * macroSize;
                    let startGridY = targetMRow * macroSize;
                    let endGridX = Math.min(cols - 1, startGridX + macroSize - 1);
                    let endGridY = Math.min(rows - 1, startGridY + macroSize - 1);

                    let pos1 = getRenderCoordinates(startGridX, startGridY, canvas.width, localTeam);
                    let pos2 = getRenderCoordinates(endGridX, endGridY, canvas.width, localTeam);

                    let rectX = Math.min(pos1.x, pos2.x) + 3;
                    let rectY = Math.min(pos1.y, pos2.y) + 3;
                    let maxRendererX = Math.max(pos1.x + pos1.cellSize, pos2.x + pos2.cellSize);
                    let maxRendererY = Math.max(pos1.y + pos1.cellSize, pos2.y + pos2.cellSize);
                    let rectWidth = maxRendererX - rectX - 3;
                    let rectHeight = maxRendererY - rectY - 3;

                    ctx.save();
                    ctx.globalAlpha = 0.32;
                    ctx.fillStyle = footprintColor;
                    ctx.shadowColor = glowColor;
                    ctx.shadowBlur = 10;
                    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

                    ctx.globalAlpha = 0.95;
                    ctx.strokeStyle = footprintColor;
                    ctx.lineWidth = 2.5;
                    let dashOffset = (now * 0.03) % 16;
                    ctx.setLineDash([6, 4]);
                    ctx.lineDashOffset = -dashOffset;
                    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
                    ctx.restore();
                });
            }
            ctx.restore();
        }
    });

    let singleBadgeMap = new Map();
    let currentClusterKeys = new Set();
    let teamSuperunitsMap = new Map();

    ['blue', 'red'].forEach(teamName => {
        let suList = getSuperunitsForTeam(teamName, units);
        teamSuperunitsMap.set(teamName, suList);
        suList.forEach(su => {
            if (su.units && su.units.length > 0) {
                let sortedIds = su.units.map(u => u.id).sort((a, b) => a - b);
                let clusterKey = sortedIds.join(',');
                currentClusterKeys.add(clusterKey);

                let repUnitId = superunitBadgeCache.get(clusterKey);
                let repUnit = su.units.find(u => u.id === repUnitId);

                if (!repUnit) {
                    repUnit = su.units[Math.floor(Math.random() * su.units.length)];
                    superunitBadgeCache.set(clusterKey, repUnit.id);
                }

                if (su.units.length > 1) {
                    singleBadgeMap.set(repUnit.id, su.power);
                }
            }
        });
    });

    for (let key of superunitBadgeCache.keys()) {
        if (!currentClusterKeys.has(key)) {
            superunitBadgeCache.delete(key);
        }
    }

    drawUnitsAndBadges(ctx, canvas, units, selectedUnit, localTeam, detectedUnitIds, singleBadgeMap, teamSuperunitsMap, selectionAnimStartTime, getRenderCoordinates);

    ctx.restore();

    drawDestructionAlerts(canvas, localTeam);
}
