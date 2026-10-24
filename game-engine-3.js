// game-engine-3.js - Input handling, board clicks, unit selection, movement execution, capture logic, and multi-player artillery sync
import { db, ref, update, set, get, push } from './network.js';
import { cols, rows } from './game-config.js';
import { screenToWorldCoordinates, getCameraState } from './viewport.js';
import { getLegalMoves, getShowUnitRange, clearUnitRangeOverlayButton, updateUnitRangeOverlayButton } from './unit-movement.js';
import { resolveCombat, unitsToDestroy } from './combat-mechanics.js';
import { handleUnitDeployment, getPendingUnitType, cleanupUnitDeployerPopup } from './deployment.js';
import { tileCaptures, parseCoord, getGoldCoreCluster } from './team-logic.js';
import { updateTurnButtonState, updateGlobalCoinHUD, updateXpDisplay } from './game-controls.js';
import { triggerSelectSound, triggerMoveSound, stopMatchMusic } from './sound.js';
import { checkVictoryConditions, checkBaseCaptureVictory, addSessionXp, recordTeamMove, recordGoldCoreCapture } from './game-victory.js';
import { clearArtilleryButtons, handleCombatDestructions, getSyncedNow, playerXp, setPlayerXp } from './game-engine-2.js';
import { playCoinSound } from './sound.js';
import { triggerFarDestructionTrails } from './renderer-helpers.js';

export function notifyGoldCoreCaptured(team, currentMatchId) {
    if (currentMatchId) {
        push(ref(db, `matches_plus/${currentMatchId}/destructionFeed`), {
            unitName: 'Gold Core Cluster',
            defenderTeam: team,
            destroyedBy: 'GOLD_CORE_CAPTURE',
            attackerTeam: team,
            timestamp: getSyncedNow()
        });
    }
}

export function addPlayerXp(amount, username) {
    if (!username) return;
    const newXp = playerXp + amount;
    setPlayerXp(newXp);
    addSessionXp(amount);
    updateXpDisplay(newXp);

    set(ref(db, `user_xp/${username}`), {
        xp: newXp,
        lastUpdated: getSyncedNow()
    }).catch(err => console.error("Failed to sync XP to Firebase:", err));

    localStorage.setItem(`arena_chess_xp_${username}`, newXp);
}

export function triggerArtilleryStrike(targetEnemy, artilleryUnit, canvas, units, teamCoins, logToConsole, localTeam, currentMatchId, playerTeam, isGameOverSetCallback, updateTurnStateCallback) {
    if (!targetEnemy || !artilleryUnit) return;

    const activeTarget = units.find(u => u.id === targetEnemy.id && u.gridX === targetEnemy.gridX && u.gridY === targetEnemy.gridY);
    if (!activeTarget) {
        logToConsole(`Artillery Strike Cancelled: Target unit no longer exists at [${targetEnemy.gridX}, ${targetEnemy.gridY}].`);
        clearArtilleryButtons();
        return;
    }

    let chebyshevDist = Math.max(
        Math.abs(artilleryUnit.gridX - targetEnemy.gridX),
        Math.abs(artilleryUnit.gridY - targetEnemy.gridY)
    );

    let successRate = 0.60;
    if (chebyshevDist >= 8) {
        successRate = 0.18;
    } else if (chebyshevDist > 4) {
        successRate = 0.60 - (chebyshevDist - 4) * 0.105;
    }

    let success = Math.random() < successRate;
    let destructionTimestamp = getSyncedNow();
    let newTurnStartTime = getSyncedNow();
    window.activeTurnStartTime = newTurnStartTime;

    unitsToDestroy.length = 0;

    triggerFarDestructionTrails(
        artilleryUnit.gridX, 
        artilleryUnit.gridY, 
        targetEnemy.gridX, 
        targetEnemy.gridY, 
        window.getRenderCoordinates || null, 
        canvas, 
        localTeam
    );

    let triggeredDestructions = [];

    if (success) {
        unitsToDestroy.push({
            unit: targetEnemy,
            destroyedBy: 'Artillery',
            attackerTeam: artilleryUnit.team,
            attackerX: artilleryUnit.gridX,
            attackerY: artilleryUnit.gridY,
            reason: `Artillery (${artilleryUnit.team}) successfully shelled target ${targetEnemy.name}`
        });
        
        triggeredDestructions = handleCombatDestructions(canvas, units, teamCoins, logToConsole, localTeam, artilleryUnit);
        logToConsole(`Artillery Strike SUCCESS against ${targetEnemy.name} at [${targetEnemy.gridX}, ${targetEnemy.gridY}]!`);
    } else {
        logToConsole(`Artillery Strike MISSED target ${targetEnemy.name} at [${targetEnemy.gridX}, ${targetEnemy.gridY}] (Accuracy was ${(successRate * 100).toFixed(1)}%).`);
        
        let statusBanner = document.getElementById('statusBanner');
        if (statusBanner) {
            statusBanner.innerHTML = `💨 Artillery strike by <strong style="color:${artilleryUnit.team === 'blue' ? '#3498db' : '#e74c3c'};">${artilleryUnit.team.toUpperCase()}</strong> missed ${targetEnemy.name}!`;
        }
    }

    clearArtilleryButtons();
    
    artilleryUnit.hasMovedThisTurn = true;
    let nextTurn = playerTeam === 'blue' ? 'red' : 'blue';
    updateTurnButtonState(nextTurn, playerTeam);

    if (typeof updateTurnStateCallback === 'function') {
        updateTurnStateCallback(nextTurn, newTurnStartTime);
    }

    clearUnitRangeOverlayButton();

    checkVictoryConditions(units, currentMatchId, logToConsole, window.isGameOverState || false, (val) => { 
        isGameOverSetCallback(val); 
        if (val) stopMatchMusic();
    });

    // Network transfers placed last so core game logic isn't delayed
    if (currentMatchId) {
        let sanitizedTileCaptures = {};
        Object.keys(tileCaptures).forEach(k => {
            sanitizedTileCaptures[k] = {
                type: tileCaptures[k].type,
                capturedBy: tileCaptures[k].capturedBy != null ? tileCaptures[k].capturedBy : null
            };
        });

        const matchRef = ref(db, `matches_plus/${currentMatchId}`);
        update(matchRef, {
            units: units,
            tileCaptures: sanitizedTileCaptures,
            coins: teamCoins,
            turn: nextTurn,
            turnStartTime: newTurnStartTime,
            lastDestructions: triggeredDestructions.length > 0 ? {
                timestamp: destructionTimestamp,
                events: triggeredDestructions
            } : null,
            lastAction: {
                type: 'ARTILLERY_STRIKE_D',
                unitName: artilleryUnit.name,
                team: artilleryUnit.team,
                success: success,
                fromX: artilleryUnit.gridX,
                fromY: artilleryUnit.gridY,
                toX: targetEnemy.gridX,
                toY: targetEnemy.gridY,
                timestamp: getSyncedNow()
            }
        });

        push(ref(db, `matches_plus/${currentMatchId}/artilleryAnimations`), {
            fromX: artilleryUnit.gridX,
            fromY: artilleryUnit.gridY,
            toX: targetEnemy.gridX,
            toY: targetEnemy.gridY,
            attackerTeam: artilleryUnit.team,
            targetName: targetEnemy.name,
            success: success,
            timestamp: getSyncedNow()
        });

        if (success && triggeredDestructions.length > 0) {
            triggeredDestructions.forEach(ev => {
                push(ref(db, `matches_plus/${currentMatchId}/destructionFeed`), {
                    unitName: targetEnemy.name,
                    defenderTeam: ev.defenderTeam,
                    destroyedBy: ev.destroyedBy || 'Artillery',
                    attackerTeam: ev.attackerTeam,
                    timestamp: getSyncedNow()
                });
            });
        }
    }
}

export function handleCanvasClick(e, canvas, state, callbacks) {
    const {
        isGameOverRef, localTeamRef, playerTeamRef, currentTurnRef,
        unitsRef, selectedUnitRef, legalMovesRef, stagedMoveRef,
        selectionAnimStartTimeRef, teamCoinsRef, currentMatchIdRef, logToConsole
    } = state;

    const { setGameOver, setSelectedUnit, setLegalMoves, setStagedMove, setSelectionAnimStartTime } = callbacks;

    if (isGameOverRef.current) return;
    if (getCameraState().activePointers.size > 0) return;

    const world = screenToWorldCoordinates(e.clientX, e.clientY, canvas);
    let cellSize = canvas.width / cols;
    let clickedCol = Math.floor(world.x / cellSize);
    let clickedRow = Math.floor(world.y / cellSize);

    if (clickedCol < 0 || clickedCol >= cols || clickedRow < 0 || clickedRow >= rows) return;

    if (localTeamRef.current === 'red') {
        clickedCol = cols - 1 - clickedCol;
        clickedRow = rows - 1 - clickedRow;
    }

    if (getPendingUnitType()) {
        let placed = handleUnitDeployment(clickedCol, clickedRow, playerTeamRef.current, unitsRef.current, currentMatchIdRef.current, logToConsole, teamCoinsRef.current, () => updateGlobalCoinHUD(teamCoinsRef.current));
        if (placed) {
            cleanupUnitDeployerPopup();
            setSelectedUnit(null);
            setLegalMoves([]);
            setStagedMove(null);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();
            return;
        }
    }

    const clickedUnit = unitsRef.current.find(u => u.gridX === clickedCol && u.gridY === clickedRow);

    if (clickedUnit) {
        setStagedMove(null);
        if (clickedUnit.team === playerTeamRef.current) {
            setSelectedUnit(clickedUnit);
            setSelectionAnimStartTime(performance.now());
            triggerSelectSound(clickedUnit.name);

            if (currentTurnRef.current !== playerTeamRef.current) {
                setLegalMoves([]);
                logToConsole(`Inspecting own unit out-of-turn: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol},${clickedRow}]`);
            } else if (clickedUnit.hasMovedThisTurn) {
                setLegalMoves([]);
                logToConsole(`Unit ${clickedUnit.name} has already moved this turn and cannot move again.`);
            } else {
                setLegalMoves(getLegalMoves(clickedUnit, unitsRef.current));
                logToConsole(`Selected unit: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol},${clickedRow}]`);
            }

            updateUnitRangeOverlayButton(canvas, clickedUnit, localTeamRef.current, logToConsole);
        } else {
            setSelectedUnit(clickedUnit);
            setSelectionAnimStartTime(performance.now());
            triggerSelectSound(clickedUnit.name);
            setLegalMoves([]);
            updateUnitRangeOverlayButton(canvas, clickedUnit, localTeamRef.current, logToConsole);
            logToConsole(`Inspecting enemy unit: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol},${clickedRow}]`);
        }
    } else if (selectedUnitRef.current) {
        let selUnit = selectedUnitRef.current;
        if (selUnit.team !== playerTeamRef.current || currentTurnRef.current !== playerTeamRef.current) {
            setSelectedUnit(null);
            setLegalMoves([]);
            setStagedMove(null);
            setSelectionAnimStartTime(null);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();
            return;
        }

        if (selUnit.hasMovedThisTurn) {
            logToConsole(`Movement Blocked: ${selUnit.name} already moved this turn.`);
            setSelectedUnit(null);
            setLegalMoves([]);
            setStagedMove(null);
            setSelectionAnimStartTime(null);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();
            return;
        }

        let isLegalMove = legalMovesRef.current.some(m => m.c === clickedCol && m.r === clickedRow);
        if (isLegalMove) {
            let staged = stagedMoveRef.current;
            if (!staged || staged.c !== clickedCol || staged.r !== clickedRow) {
                setStagedMove({ c: clickedCol, r: clickedRow });
                logToConsole(`Staged move for ${selUnit.name} to [${clickedCol},${clickedRow}]. Click again to confirm.`);
                return;
            }

            let oldGridX = selUnit.gridX;
            let oldGridY = selUnit.gridY;

            setStagedMove(null);
            triggerMoveSound(selUnit.name);

            recordTeamMove(selUnit.team);

            selUnit.animFromX = oldGridX;
            selUnit.animFromY = oldGridY;
            selUnit.animStartTime = performance.now();
            
            selUnit.gridX = clickedCol;
            selUnit.gridY = clickedRow;
            selUnit.lastKnownGridX = clickedCol;
            selUnit.lastKnownGridY = clickedRow;
            selUnit.hasMovedThisTurn = true;

            if (typeof window.triggerMovementArrowTrail === 'function') {
                window.triggerMovementArrowTrail(oldGridX, oldGridY, clickedCol, clickedRow, selUnit.team);
            }

            let moveKey = `${clickedCol},${clickedRow}`;
            let unitNameLower = (selUnit.name || '').toLowerCase();
            let isInfantryOrTank = unitNameLower.includes('infantry') || unitNameLower.includes('tank');
            let currentUsername = localStorage.getItem('arena_chess_user');
            let didCaptureGoldCore = false;

            if (isInfantryOrTank) {
                if (checkBaseCaptureVictory(selUnit, moveKey, currentMatchIdRef.current, logToConsole, isGameOverRef.current, (val) => { 
                    setGameOver(val);
                    if (val) {
                        stopMatchMusic();
                        setSelectedUnit(null);
                        setLegalMoves([]);
                        setStagedMove(null);
                        clearUnitRangeOverlayButton();
                        clearArtilleryButtons();
                    }
                })) {
                    return;
                }

                if (tileCaptures[moveKey]) {
                    let tileInfo = tileCaptures[moveKey];
                    let cluster = getGoldCoreCluster(moveKey);

                    if (cluster) {
                        let gcKey = parseCoord(cluster.gc);
                        let gcTile = tileCaptures[gcKey];
                        
                        let needsCapture = false;
                        if (gcTile && gcTile.capturedBy !== selUnit.team) needsCapture = true;
                        
                        if (!needsCapture) {
                            for (let linkItem of cluster.linked) {
                                let lKey = parseCoord(linkItem);
                                if (lKey && tileCaptures[lKey] && tileCaptures[lKey].capturedBy !== selUnit.team) {
                                    needsCapture = true;
                                    break;
                                }
                            }
                        }
                        if (!needsCapture && cluster.units) {
                            for (let uItem of cluster.units) {
                                let uKey = parseCoord(uItem.coordinates);
                                if (uKey && tileCaptures[uKey] && tileCaptures[uKey].capturedBy !== selUnit.team) {
                                    needsCapture = true;
                                    break;
                                }
                            }
                        }

                        if (needsCapture) {
                            if (gcTile) gcTile.capturedBy = selUnit.team;
                            cluster.linked.forEach(linkItem => {
                                let linkKey = parseCoord(linkItem);
                                if (linkKey && tileCaptures[linkKey]) tileCaptures[linkKey].capturedBy = selUnit.team;
                            });

                            teamCoinsRef.current[selUnit.team] = (teamCoinsRef.current[selUnit.team] || 0) + 2;
                            logToConsole(`${selUnit.team.toUpperCase()} captured Gold Core cluster (+2 coins)!`);
                            updateGlobalCoinHUD(teamCoinsRef.current);

                            didCaptureGoldCore = true;
                            recordGoldCoreCapture(selUnit.team, 50);

                            if (selUnit.team === localTeamRef.current) {
                                playCoinSound();
                                if (currentUsername) {
                                    addPlayerXp(50, currentUsername);
                                }
                            }
                        }
                    } else if (tileInfo.capturedBy !== selUnit.team) {
                        tileInfo.capturedBy = selUnit.team;
                    }
                }
            }

            resolveCombat(unitsRef.current, logToConsole);
            let triggeredDestructions = handleCombatDestructions(canvas, unitsRef.current, teamCoinsRef.current, logToConsole, localTeamRef.current, selUnit);

            checkVictoryConditions(unitsRef.current, currentMatchIdRef.current, logToConsole, isGameOverRef.current, (val) => { 
                setGameOver(val);
                if (val) {
                    stopMatchMusic();
                    setSelectedUnit(null);
                    setLegalMoves([]);
                    setStagedMove(null);
                    clearUnitRangeOverlayButton();
                    clearArtilleryButtons();
                }
            });
            if (isGameOverRef.current) return;
            
            let nextTurn = currentTurnRef.current;
            let turnChanged = false;
            let newTurnStartTime = getSyncedNow();

            let movedCount = unitsRef.current.filter(u => u.team === playerTeamRef.current && u.hasMovedThisTurn).length;
            if (movedCount >= 1) {
                unitsRef.current.forEach(u => u.hasMovedThisTurn = false);
                nextTurn = playerTeamRef.current === 'blue' ? 'red' : 'blue';
                turnChanged = true;
                window.activeTurnStartTime = newTurnStartTime;
                updateTurnButtonState(nextTurn, playerTeamRef.current);
            }

            setSelectedUnit(null);
            setLegalMoves([]);
            setStagedMove(null);
            setSelectionAnimStartTime(null);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();

            // All network message transmissions are performed at the very end
            if (currentMatchIdRef.current) {
                let sanitizedTileCaptures = {};
                Object.keys(tileCaptures).forEach(k => {
                    sanitizedTileCaptures[k] = {
                        type: tileCaptures[k].type,
                        capturedBy: tileCaptures[k].capturedBy != null ? tileCaptures[k].capturedBy : null
                    };
                });

                let payload = { 
                    units: unitsRef.current,
                    tileCaptures: sanitizedTileCaptures,
                    coins: teamCoinsRef.current,
                    lastDestructions: triggeredDestructions.length > 0 ? {
                        timestamp: getSyncedNow(),
                        events: triggeredDestructions
                    } : null,
                    lastAction: {
                        type: 'MOVE',
                        unitName: selUnit.name,
                        team: selUnit.team,
                        timestamp: getSyncedNow()
                    }
                };
                if (turnChanged) {
                    payload.turn = nextTurn;
                    payload.turnStartTime = newTurnStartTime;
                }
                update(ref(db, `matches_plus/${currentMatchIdRef.current}`), payload);

                push(ref(db, `matches_plus/${currentMatchIdRef.current}/movementFeed`), {
                    unitName: selUnit.name,
                    team: selUnit.team,
                    fromX: oldGridX,
                    fromY: oldGridY,
                    toX: clickedCol,
                    toY: clickedRow,
                    timestamp: getSyncedNow()
                });

                if (triggeredDestructions.length > 0) {
                    triggeredDestructions.forEach(ev => {
                        push(ref(db, `matches_plus/${currentMatchIdRef.current}/destructionFeed`), {
                            unitName: ev.targetId ? (unitsRef.current.find(u => u.id === ev.targetId)?.name || 'Unit') : 'Unit',
                            defenderTeam: ev.defenderTeam,
                            destroyedBy: ev.destroyedBy || 'Combat',
                            attackerTeam: ev.attackerTeam,
                            timestamp: getSyncedNow()
                        });
                    });
                }

                if (didCaptureGoldCore) {
                    notifyGoldCoreCaptured(selUnit.team, currentMatchIdRef.current);
                }
            }
        } else {
            setStagedMove(null);
            setSelectedUnit(null);
            setLegalMoves([]);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();
        }
    } else {
        setStagedMove(null);
        setSelectedUnit(null);
        setLegalMoves([]);
        clearUnitRangeOverlayButton();
        clearArtilleryButtons();
    }
}