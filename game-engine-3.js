// game-engine-3.js - Input handling, board clicks, unit selection, movement execution, and capture logic (XP & Firebase Sync Enabled)
import { db, ref, update, set, get } from './network.js';
import { cols, rows } from './game-config.js';
import { screenToWorldCoordinates, getCameraState } from './viewport.js';
import { getLegalMoves, getShowUnitRange, clearUnitRangeOverlayButton, updateUnitRangeOverlayButton } from './unit-movement.js';
import { resolveCombat, unitsToDestroy } from './combat-mechanics.js';
import { handleUnitDeployment, getPendingUnitType, cleanupUnitDeployerPopup } from './deployment.js';
import { tileCaptures, parseCoord, getGoldCoreCluster } from './team-logic.js';
import { updateTurnButtonState, updateGlobalCoinHUD, updateXpDisplay } from './game-controls.js';
import { triggerSelectSound, triggerMoveSound, stopMatchMusic } from './sound.js';
import { checkVictoryConditions, checkBaseCaptureVictory } from './game-victory.js';
import { clearArtilleryButtons, handleCombatDestructions, getSyncedNow, playerXp, setPlayerXp } from './game-engine-2.js';

// Helper function to persist user XP to Firebase and localStorage
export function addPlayerXp(amount, username) {
    if (!username) return;
    const newXp = playerXp + amount;
    setPlayerXp(newXp);
    updateXpDisplay(newXp);

    // Save to Firebase for reclamation elsewhere
    set(ref(db, `user_xp/${username}`), {
        xp: newXp,
        lastUpdated: getSyncedNow()
    }).catch(err => console.error("Failed to sync XP to Firebase:", err));

    localStorage.setItem(`arena_chess_xp_${username}`, newXp);
}

export function triggerArtilleryStrike(targetEnemy, artilleryUnit, canvas, units, teamCoins, logToConsole, localTeam, currentMatchId, playerTeam, isGameOverSetCallback, updateTurnStateCallback) {
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

    if (success) {
        unitsToDestroy.push({
            unit: targetEnemy,
            destroyedBy: 'Artillery',
            attackerTeam: artilleryUnit.team,
            attackerX: artilleryUnit.gridX,
            attackerY: artilleryUnit.gridY,
            reason: `Artillery (${artilleryUnit.team}) successfully shelled target ${targetEnemy.name}`
        });
    }

    let triggeredDestructions = handleCombatDestructions(canvas, units, teamCoins, logToConsole, localTeam, artilleryUnit);
    clearArtilleryButtons();
    checkVictoryConditions(units, currentMatchId, logToConsole, window.isGameOverState || false, (val) => { 
        isGameOverSetCallback(val); 
    });

    artilleryUnit.hasMovedThisTurn = true;

    let nextTurn = playerTeam === 'blue' ? 'red' : 'blue';
    updateTurnButtonState(nextTurn, playerTeam);

    if (currentMatchId) {
        let sanitizedTileCaptures = {};
        Object.keys(tileCaptures).forEach(k => {
            sanitizedTileCaptures[k] = {
                type: tileCaptures[k].type,
                capturedBy: tileCaptures[k].capturedBy != null ? tileCaptures[k].capturedBy : null
            };
        });

        update(ref(db, `matches_plus/${currentMatchId}`), {
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
                timestamp: getSyncedNow()
            }
        });
    }

    if (typeof updateTurnStateCallback === 'function') {
        updateTurnStateCallback(nextTurn, newTurnStartTime);
    }

    clearUnitRangeOverlayButton();
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
                logToConsole(`Inspecting own unit out-of-turn: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol}, ${clickedRow}]`);
            } else if (clickedUnit.hasMovedThisTurn) {
                setLegalMoves([]);
                logToConsole(`Unit ${clickedUnit.name} has already moved this turn and cannot move again.`);
            } else {
                setLegalMoves(getLegalMoves(clickedUnit, unitsRef.current));
                logToConsole(`Selected unit: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol}, ${clickedRow}]`);
            }

            updateUnitRangeOverlayButton(canvas, clickedUnit, localTeamRef.current, logToConsole);
        } else {
            setSelectedUnit(clickedUnit);
            setSelectionAnimStartTime(performance.now());
            triggerSelectSound(clickedUnit.name);
            setLegalMoves([]);
            updateUnitRangeOverlayButton(canvas, clickedUnit, localTeamRef.current, logToConsole);
            logToConsole(`Inspecting enemy unit: ${clickedUnit.name} (${clickedUnit.team}) at [${clickedCol}, ${clickedRow}]`);
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
                logToConsole(`Staged move for ${selUnit.name} to [${clickedCol}, ${clickedRow}]. Click again to confirm.`);
                return;
            }

            setStagedMove(null);
            triggerMoveSound(selUnit.name);

            selUnit.animFromX = selUnit.gridX;
            selUnit.animFromY = selUnit.gridY;
            selUnit.animStartTime = performance.now();
            
            selUnit.gridX = clickedCol;
            selUnit.gridY = clickedRow;
            selUnit.lastKnownGridX = clickedCol;
            selUnit.lastKnownGridY = clickedRow;
            
            selUnit.hasMovedThisTurn = true;

            let moveKey = `${clickedCol},${clickedRow}`;
            let unitNameLower = (selUnit.name || '').toLowerCase();
            let isInfantryOrTank = unitNameLower.includes('infantry') || unitNameLower.includes('tank');
            let currentUsername = localStorage.getItem('arena_chess_user');

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
                                if (linkKey && tileCaptures[linkKey]) {
                                    tileCaptures[linkKey].capturedBy = selUnit.team;
                                }
                            });

                            if (cluster.units) {
                                cluster.units.forEach(uItem => {
                                    let uKey = parseCoord(uItem.coordinates);
                                    if (uKey && tileCaptures[uKey]) {
                                        tileCaptures[uKey].capturedBy = selUnit.team;
                                    }
                                });
                            }

                            teamCoinsRef.current[selUnit.team] = (teamCoinsRef.current[selUnit.team] || 0) + 2;
                            logToConsole(`${selUnit.team.toUpperCase()} captured Gold Core cluster centrally (+2 coins)! Total: ${teamCoinsRef.current[selUnit.team]}`);
                            updateGlobalCoinHUD(teamCoinsRef.current);

                            // Reward XP if player captured the cluster
                            if (selUnit.team === localTeamRef.current && currentUsername) {
                                addPlayerXp(50, currentUsername); // +50 XP for Gold Core cluster capture
                                logToConsole(`+50 XP Awarded for Gold Core cluster capture!`);
                            }
                        }
                    } else if (tileInfo.capturedBy !== selUnit.team) {
                        tileInfo.capturedBy = selUnit.team;
                        let tileType = (tileInfo.type || '').toLowerCase();
                        let earnedCoins = 0;
                        if (['gold', 'artillery', 'tank', 'port'].includes(tileType)) earnedCoins = 0.5;

                        if (earnedCoins > 0) {
                            teamCoinsRef.current[selUnit.team] = (teamCoinsRef.current[selUnit.team] || 0) + earnedCoins;
                            logToConsole(`${selUnit.team.toUpperCase()} captured ${tileInfo.type} (+${earnedCoins} coins)! Total: ${teamCoinsRef.current[selUnit.team]}`);
                            updateGlobalCoinHUD(teamCoinsRef.current);

                            if (selUnit.team === localTeamRef.current && currentUsername) {
                                addPlayerXp(15, currentUsername); // +15 XP for standard tile/resource capture
                            }
                        }
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
                updateTurnButtonState(nextTurn, playerTeamRef.current);
            }

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
            }

            setSelectedUnit(null);
            setLegalMoves([]);
            setStagedMove(null);
            setSelectionAnimStartTime(null);
            clearUnitRangeOverlayButton();
            clearArtilleryButtons();
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
