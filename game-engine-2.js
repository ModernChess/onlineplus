// game-engine-2.js - Secondary game engine logic handling timers, artilleries, state variables, and network game loop utilities
import { db, ref, update, set } from './network.js';
import { cols, rows } from './game-config.js';
import { getRenderCoordinates } from './game-renderer.js';
import { getShowUnitRange } from './unit-movement.js';
import { unitsToDestroy, processDestructions, getUnitMacroRangeTiles, artilleryVulnerableUnits } from './combat-mechanics.js';
import { tileCaptures } from './team-logic.js';
import { updateTurnButtonState, updateGlobalCoinHUD, updateTurnTimerDisplay, updateXpDisplay, appendDestructionFeed, updateActiveUnitCounts } from './game-controls.js';
import { triggerFrontalExplosion, triggerFarDestructionTrails } from './renderer-helpers.js';
import { checkVictoryConditions } from './game-victory.js';

export let serverTimeOffset = 0; 
export let turnTimerInterval = null;
export let coinIncomeInterval = null;
export const TURN_TIME_LIMIT_MS = 60000;
export let playerXp = 0;

window.activeTurnStartTime = Date.now();

export function setPlayerXp(val) {
    playerXp = val;
}

export function setServerTimeOffset(offset) {
    serverTimeOffset = offset;
}

export function getSyncedNow() {
    return Date.now() + serverTimeOffset;
}

export function clearArtilleryButtons() {
    document.querySelectorAll('.artillery-strike-btn').forEach(btn => btn.remove());
}

export function updateArtilleryButtons(canvas, selectedUnit, localTeam, units, currentTurn, playerTeam, logToConsole, onStrikeCallback) {
    clearArtilleryButtons();
    
    if (!selectedUnit || selectedUnit.name !== 'Artillery' || !getShowUnitRange(selectedUnit.id)) return;
    if (currentTurn !== playerTeam || selectedUnit.team !== playerTeam) return;

    const container = document.getElementById('canvas-container');
    if (!container) return;

    let rangeTiles = getUnitMacroRangeTiles(selectedUnit);
    let cam = getCameraStateFallback();
    let scaleX = canvas.clientWidth / canvas.width;
    let scaleY = canvas.clientHeight / canvas.height;

    rangeTiles.forEach(tile => {
        let enemy = units.find(u => u.gridX === tile.c && u.gridY === tile.r && u.team !== selectedUnit.team);
        if (enemy && artilleryVulnerableUnits.has(enemy.name)) {
            let renderPos = getRenderCoordinates(enemy.gridX, enemy.gridY, canvas.width, localTeam);
            let worldX = (renderPos.x * cam.zoom) + cam.x;
            let worldY = (renderPos.y * cam.zoom) + cam.y;
            let screenX = worldX * scaleX;
            let screenY = worldY * scaleY;
            
            let scaledCellSize = renderPos.cellSize * cam.zoom * scaleX;
            let btnSize = Math.min(32, Math.max(20, scaledCellSize * 0.5));

            let offsetX = scaledCellSize - (btnSize * 0.3);
            let offsetY = -btnSize * 0.2;

            let btn = document.createElement('button');
            btn.className = 'artillery-strike-btn';
            btn.innerText = 'D';
            btn.title = `Strike enemy ${enemy.name} with Artillery`;

            btn.style.position = 'absolute';
            btn.style.zIndex = '1000';
            btn.style.left = `${screenX + offsetX}px`;
            btn.style.top = `${screenY + offsetY}px`;
            btn.style.width = `${btnSize}px`;
            btn.style.height = `${btnSize}px`;
            btn.style.fontSize = `${Math.max(10, btnSize * 0.45)}px`;
            btn.style.borderRadius = '50%';
            btn.style.backgroundColor = '#e74c3c';
            btn.style.color = '#fff';
            btn.style.border = '2px solid #fff';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 3px 6px rgba(0,0,0,0.4)';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.fontWeight = 'bold';

            btn.onclick = (e) => {
                e.stopPropagation();
                if (typeof onStrikeCallback === 'function') {
                    onStrikeCallback(enemy, selectedUnit, canvas);
                }
            };

            container.appendChild(btn);
        }
    });
}

function getCameraStateFallback() {
    return window.currentCameraState || { x: 0, y: 0, zoom: 1, activePointers: new Set() };
}

export function handleCombatDestructions(canvas, units, teamCoins, logToConsole, localTeam, actingUnit = null) {
    if (unitsToDestroy && unitsToDestroy.length > 0) {
        let triggeredDestructions = [];

        unitsToDestroy.forEach(item => {
            let targetUnit = item.unit;
            let attackerTeam = item.attackerTeam || (actingUnit ? actingUnit.team : 'blue');
            let defenderTeam = targetUnit.team;

            teamCoins[attackerTeam] = parseFloat(((teamCoins[attackerTeam] || 0) + 1.5).toFixed(1));
            teamCoins[defenderTeam] = parseFloat(Math.max(0, (teamCoins[defenderTeam] || 0) - 1.0).toFixed(1));

            if (attackerTeam === localTeam) {
                let currentUsername = localStorage.getItem('arena_chess_user');
                playerXp += 25;
                updateXpDisplay(playerXp);
                
                if (currentUsername) {
                    set(ref(db, `user_xp/${currentUsername}`), {
                        xp: playerXp,
                        lastUpdated: getSyncedNow()
                    }).catch(err => console.error("Failed to sync destruction XP to Firebase:", err));

                    localStorage.setItem(`arena_chess_xp_${currentUsername}`, playerXp);
                }
            }

            if (defenderTeam === localTeam) {
                triggerDestructionAlertFallback(targetUnit.gridX, targetUnit.gridY, defenderTeam);
            }

            // Append live destruction feed entry
            appendDestructionFeed(targetUnit.name, defenderTeam, item.destroyedBy || 'Combat', attackerTeam);

            let statusBanner = document.getElementById('statusBanner');
            if (statusBanner) {
                statusBanner.innerHTML = `⚠️ <strong style="color:${defenderTeam === 'blue' ? '#3498db' : '#e74c3c'};">${defenderTeam.toUpperCase()}</strong> unit (${targetUnit.name}) destroyed by <strong style="color:${attackerTeam === 'blue' ? '#3498db' : '#e74c3c'};">${attackerTeam.toUpperCase()}</strong>! (+25 XP)`;
            }
            logToConsole(`Destruction Alert: ${defenderTeam} lost ${targetUnit.name} at [${targetUnit.gridX}, ${targetUnit.gridY}].`);

            let attackerType = (item.destroyedBy || '').toLowerCase();
            let isFarAttack = attackerType.includes('artillery') || attackerType.includes('ship') || attackerType.includes('anti-air');
            let startX = item.attackerX !== undefined ? item.attackerX : (actingUnit ? actingUnit.gridX : targetUnit.gridX);
            let startY = item.attackerY !== undefined ? item.attackerY : (actingUnit ? actingUnit.gridY : targetUnit.gridY);
            
            triggeredDestructions.push({
                targetId: targetUnit.id,
                targetX: targetUnit.gridX,
                targetY: targetUnit.gridY,
                attackerX: startX,
                attackerY: startY,
                defenderTeam: defenderTeam,
                destroyedBy: item.destroyedBy || 'Combat',
                attackerTeam: attackerTeam,
                isFarAttack: isFarAttack
            });

            if (isFarAttack) {
                triggerFarDestructionTrails(startX, startY, targetUnit.gridX, targetUnit.gridY, getRenderCoordinates, canvas, localTeam);
            } else {
                triggerFrontalExplosion(targetUnit.gridX, targetUnit.gridY, getRenderCoordinates, canvas, localTeam);
            }
        });

        updateGlobalCoinHUD(teamCoins);
        processDestructions(units);
        updateActiveUnitCounts(units); // Refresh collapsible unit counts
        return triggeredDestructions;
    }
    return [];
}

function triggerDestructionAlertFallback(gx, gy, team) {
    if (typeof window.triggerDestructionAlert === 'function') {
        window.triggerDestructionAlert(gx, gy, team);
    }
}

export function startTurnTimer(matchIdRef, playerTeam, currentTurnRef, movedUnitsThisTurn, units, logToConsole, onTurnTimeout) {
    if (turnTimerInterval) clearInterval(turnTimerInterval);

    turnTimerInterval = setInterval(() => {
        let isGameOver = window.isGameOverState || false;
        if (isGameOver) return;

        if (!window.activeTurnStartTime) {
            window.activeTurnStartTime = getSyncedNow();
        }

        let syncedNow = getSyncedNow();
        let elapsed = syncedNow - window.activeTurnStartTime;
        
        if (elapsed < 0) {
            window.activeTurnStartTime = syncedNow;
            elapsed = 0;
        }

        let timeLeftSec = Math.ceil((TURN_TIME_LIMIT_MS - elapsed) / 1000);
        timeLeftSec = Math.max(0, Math.min(60, timeLeftSec));

        updateTurnTimerDisplay(timeLeftSec);

        if (elapsed >= TURN_TIME_LIMIT_MS && currentTurnRef.current === playerTeam) {
            logToConsole(`Turn time limit (60s) reached! Automatically changing turn.`);
            movedUnitsThisTurn.clear();
            units.forEach(u => u.hasMovedThisTurn = false);
            clearArtilleryButtons();
            
            let nextTurn = playerTeam === 'blue' ? 'red' : 'blue';
            let newTurnStartTime = getSyncedNow();
            currentTurnRef.current = nextTurn;
            window.activeTurnStartTime = newTurnStartTime;
            updateTurnButtonState(nextTurn, playerTeam);

            if (typeof onTurnTimeout === 'function') {
                onTurnTimeout(nextTurn, newTurnStartTime);
            }
        }
    }, 200);
}
