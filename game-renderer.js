// game-renderer.js - Handles Canvas Drawing, Map Background Rendering, Unit Visuals, Glide Animations, Tile Highlighting, and Stalemate Badges (18x18 System)
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
let activeDestructionAlerts = []; // Stores { x, y, team, startTime }

export function triggerDestructionAlert(gridX, gridY, team) {
    activeDestructionAlerts.push({
        x: gridX,
        y: gridY,
        team: team,
        startTime: performance.now()
    });
}

// Bind globally so combat mechanics and fallback systems can call it without module scope errors
window.triggerDestructionAlert = triggerDestructionAlert;

export function drawDestructionAlerts(ctx, canvas, localTeam) {
    if (!activeDestructionAlerts || activeDestructionAlerts.length === 0) return;
    let now = performance.now();
    let duration = 10000; // 10 seconds

    ctx.save();
    for (let i = activeDestructionAlerts.length - 1; i >= 0; i--) {
        let alertObj = activeDestructionAlerts[i];
        let elapsed = now - alertObj.startTime;

        if (elapsed >= duration || alertObj.team !== localTeam) {
            if (elapsed >= duration) activeDestructionAlerts.splice(i, 1);
            continue;
        }

        let pos = getRenderCoordinates(alertObj.x, alertObj.y, canvas.width, localTeam);
        let cx = pos.x + pos.cellSize / 2;
        let cy = pos.y + pos.cellSize / 2;

        let blink = Math.floor(now / 300) % 2 === 0;
        if (blink) {
            ctx.font = `bold ${Math.floor(pos.cellSize * 0.8)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ff3838';
            ctx.shadowColor = '#000';
            ctx.shadowBlur = 6;
            ctx.fillText('❗', cx, cy - pos.cellSize * 0.2);
            ctx.shadowBlur = 0;
        }

        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(cx, cy + pos.cellSize * 0.4);
        ctx.lineTo(cx - 8, cy + pos.cellSize * 0.15);
        ctx.lineTo(cx + 8, cy + pos.cellSize * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
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
    drawDestructionAlerts(ctx, canvas, localTeam);

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

    units.forEach(unit => {
        if (getShowUnitRange(unit.id)) {
            ctx.save();
            let rangeVal = getUnitRange(unit);
            
            if (rangeVal > 0) {
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

                    let rectX = Math.min(pos1.x, pos2.x) + 2;
                    let rectY = Math.min(pos1.y, pos2.y) + 2;
                    let maxRendererX = Math.max(pos1.x + pos1.cellSize, pos2.x + pos2.cellSize);
                    let maxRendererY = Math.max(pos1.y + pos1.cellSize, pos2.y + pos2.cellSize);
                    let rectWidth = maxRendererX - rectX - 2;
                    let rectHeight = maxRendererY - rectY - 2;

                    ctx.globalAlpha = 0.25;
                    ctx.fillStyle = '#2196F3';
                    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

                    ctx.globalAlpha = 0.8;
                    ctx.strokeStyle = '#2196F3';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
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
}
