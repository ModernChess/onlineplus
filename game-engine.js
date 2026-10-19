// game-engine.js - Game Loop and Core Cluster Capture Logic (OnlinePlus Version - Firebase XP Persistence Fixed)
import { db, ref, update, get, onValue } from './network.js';
import { showScreen } from './ui-manager.js';
import { cols, rows, spawnTeamUnits } from './game-config.js';
import { initViewportControls, resetCamera, getCameraState } from './viewport.js';
import { listenToMatchUpdates, listenToMatchChat } from './game-sync.js';
import { drawGameScene, getRenderCoordinates } from './game-renderer.js';
import { getShowUnitRange, clearUnitRangeOverlayButton } from './unit-movement.js';
import { ensureBuyUnitsModal, setTeamCoinsRef, setCurrentTeamRef, setPendingUnitType } from './deployment.js';
import { tileCaptures, initTileCaptures } from './team-logic.js';
import { createConsoleLogger, updateTurnButtonState, ensureGameActionButtons, updateGlobalCoinHUD, updateXpDisplay } from './game-controls.js';
import { startMatchMusic, stopMatchMusic } from './sound.js';
import { initializeTileCapturesState } from './renderer-helpers-2.js';
import { checkVictoryConditions } from './game-victory.js';
import { 
    serverTimeOffset, turnTimerInterval, coinIncomeInterval, 
    setServerTimeOffset, getSyncedNow, clearArtilleryButtons, updateArtilleryButtons, 
    startTurnTimer, setPlayerXp 
} from './game-engine-2.js';
import { triggerArtilleryStrike, handleCanvasClick } from './game-engine-3.js';

let currentMatchId = null;
let playerTeam = null;
let localTeam = 'blue';
let currentUser = null;
let currentTurn = 'blue';
let lastSeenTurn = null;
let selectedUnit = null;
let legalMoves = [];
let stagedMove = null;
let selectionAnimStartTime = null;
let animationFrameId = null;
let units = [];
let movedUnitsThisTurn = new Set();
let teamCoins = { blue: 0, red: 0 };
let hasInitializedState = false;
let isGameOver = false;

window.isGameOverState = false;
window.currentCameraState = null;

const logToConsole = createConsoleLogger();
initTileCaptures();

onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    let offset = snap.val() || 0;
    setServerTimeOffset(offset);
});

export function startGameSession(matchId, team, user, onLeaveCallback) {
    currentMatchId = matchId;
    playerTeam = team;
    localTeam = team;
    currentUser = user;
    currentTurn = 'blue';
    lastSeenTurn = null;
    teamCoins = { blue: 0, red: 0 };
    hasInitializedState = false;
    isGameOver = false;
    window.isGameOverState = false;
    
    setTeamCoinsRef(teamCoins);
    setCurrentTeamRef(playerTeam);

    movedUnitsThisTurn.clear();
    setPendingUnitType(null);
    clearUnitRangeOverlayButton();
    clearArtilleryButtons();
    initTileCaptures();

    showScreen('game-screen');
    document.getElementById('playerTeamBadge').innerText = `Team: ${playerTeam.toUpperCase()}`;
    document.getElementById('statusBanner').innerText = "Match started! 60s turn timer active.";
    logToConsole(`Starting game session as team: ${playerTeam}`);

    // Fetch existing user XP from Firebase so it doesn't reset to 0 on new matches
    if (currentUser) {
        get(ref(db, `user_xp/${currentUser}`)).then((snap) => {
            if (snap.exists()) {
                const data = snap.val();
                let existingXp = typeof data === 'object' ? (data.xp || 0) : Number(data);
                if (!isNaN(existingXp)) {
                    setPlayerXp(existingXp);
                    updateXpDisplay(existingXp);
                    logToConsole(`Loaded existing account XP from Firebase: ${existingXp} XP`);
                }
            }
        }).catch(err => console.error("Failed to load user XP from Firebase:", err));
    }

    startMatchMusic();

    get(ref(db, `matches_plus/${matchId}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const mData = snapshot.val();
            if (mData.turn) {
                currentTurn = mData.turn;
                lastSeenTurn = mData.turn;
                updateTurnButtonState(currentTurn, playerTeam);
            }
            if (mData.turnStartTime) {
                window.activeTurnStartTime = mData.turnStartTime;
            }
        }
    });

    if (coinIncomeInterval) clearInterval(coinIncomeInterval);
    setInterval(() => {
        if (isGameOver) return;

        let updated = false;

        if ((teamCoins.blue || 0) < 3) {
            teamCoins.blue = parseFloat(Math.min(3, (teamCoins.blue || 0) + 0.1).toFixed(1));
            updated = true;
        }

        if ((teamCoins.red || 0) < 3) {
            teamCoins.red = parseFloat(Math.min(3, (teamCoins.red || 0) + 0.1).toFixed(1));
            updated = true;
        }

        if (updated) {
            updateGlobalCoinHUD(teamCoins);

            if (currentMatchId) {
                update(ref(db, `matches_plus/${currentMatchId}`), { 
                    coins: teamCoins 
                });
            }
        }
    }, 2000);

    if (units.length === 0) {
        spawnTeamUnits('blue', units);
        spawnTeamUnits('red', units);
        units.forEach(u => {
            u.animFromX = u.gridX;
            u.animFromY = u.gridY;
            u.animStartTime = 0;
            u.lastKnownGridX = u.gridX;
            u.lastKnownGridY = u.gridY;
            u.hasMovedThisTurn = false;
        });
    }

    const matchIdRef = { get current() { return currentMatchId; }, set current(v) { currentMatchId = v; } };
    const teamRef = { get current() { return playerTeam; } };
    const turnRef = { get current() { return currentTurn; }, set current(v) { currentTurn = v; } };
    const animRef = { get current() { return animationFrameId; }, set current(v) { animationFrameId = v; } };

    const wrappedLeaveCallback = () => {
        stopMatchMusic();
        clearArtilleryButtons();
        if (typeof onLeaveCallback === 'function') {
            onLeaveCallback();
        }
    };

    ensureGameActionButtons(matchIdRef, teamRef, turnRef, movedUnitsThisTurn, animRef, wrappedLeaveCallback, logToConsole, () => updateTurnButtonState(currentTurn, playerTeam));
    ensureBuyUnitsModal(logToConsole, () => units, () => playerTeam, matchIdRef, () => updateGlobalCoinHUD(teamCoins));

    updateTurnButtonState(currentTurn, playerTeam);
    updateGlobalCoinHUD(teamCoins);
    initCanvasGame();

    const currentTurnRef = { get current() { return currentTurn; }, set current(v) { currentTurn = v; } };
    startTurnTimer(matchIdRef, playerTeam, currentTurnRef, movedUnitsThisTurn, units, logToConsole, (nextTurn, newTurnStartTime) => {
        if (currentMatchId) {
            update(ref(db, `matches_plus/${currentMatchId}`), {
                turn: nextTurn,
                turnStartTime: newTurnStartTime,
                lastAction: {
                    type: 'TIMEOUT_TURN_CHANGE',
                    team: playerTeam,
                    timestamp: getSyncedNow()
                }
            });
        }
    });
    
    listenToMatchUpdates(currentMatchId, playerTeam, units, logToConsole,
        () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (turnTimerInterval) clearInterval(turnTimerInterval);
            if (coinIncomeInterval) clearInterval(coinIncomeInterval);
            stopMatchMusic();
            clearArtilleryButtons();
        },
        (turn, remoteData) => {
            const turnChanged = (turn !== currentTurn || turn !== lastSeenTurn);

            if (turnChanged) {
                logToConsole(`Turn changed to: ${turn}. Syncing turn timer.`);
                movedUnitsThisTurn.clear();
                units.forEach(u => u.hasMovedThisTurn = false);
            }
            
            currentTurn = turn;
            lastSeenTurn = turn;

            if (remoteData) {
                if (remoteData.status === 'ended' && !isGameOver) {
                    isGameOver = true;
                    window.isGameOverState = true;
                    stopMatchMusic();
                    
                    selectedUnit = null;
                    legalMoves = [];
                    stagedMove = null;
                    clearUnitRangeOverlayButton();
                    clearArtilleryButtons();

                    if (remoteData.winner) {
                        logToConsole(`Match ended remotely. Winner: ${remoteData.winner.toUpperCase()}`);
                    }
                }
                if (remoteData.coins) {
                    teamCoins.blue = remoteData.coins.blue || 0;
                    teamCoins.red = remoteData.coins.red || 0;
                    updateGlobalCoinHUD(teamCoins);
                }
                if (remoteData.tileCaptures) {
                    Object.keys(remoteData.tileCaptures).forEach(key => {
                        let remoteTile = remoteData.tileCaptures[key];
                        if (tileCaptures[key]) {
                            tileCaptures[key].capturedBy = (remoteTile && remoteTile.capturedBy != null) ? remoteTile.capturedBy : null;
                        } else if (remoteTile) {
                            tileCaptures[key] = {
                                type: remoteTile.type || 'unknown',
                                capturedBy: (remoteTile.capturedBy != null) ? remoteTile.capturedBy : null
                            };
                        }
                    });
                }
            }

            if (!hasInitializedState) {
                initializeTileCapturesState(tileCaptures);
                hasInitializedState = true;
            }

            checkVictoryConditions(units, currentMatchId, logToConsole, isGameOver, (val) => { 
                isGameOver = val; 
                window.isGameOverState = val;
                if (val) {
                    stopMatchMusic();
                    selectedUnit = null;
                    legalMoves = [];
                    stagedMove = null;
                    clearUnitRangeOverlayButton();
                    clearArtilleryButtons();
                }
            });
            updateTurnButtonState(currentTurn, playerTeam);
        }
    );
    
    listenToMatchChat(currentMatchId, currentUser);
}

function initCanvasGame() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    const parentWidth = canvas.parentElement ? canvas.parentElement.clientWidth : 600;
    canvas.width = parentWidth > 0 ? parentWidth : 600;
    canvas.height = canvas.width * (rows / cols);

    resetCamera();
    initViewportControls(canvas);

    function renderGameLoop() {
        window.currentCameraState = getCameraState();

        units.forEach(u => {
            if (u.gridX !== u.lastKnownGridX || u.gridY !== u.lastKnownGridY) {
                u.animFromX = u.lastKnownGridX !== undefined ? u.lastKnownGridX : u.gridX;
                u.animFromY = u.lastKnownGridY !== undefined ? u.lastKnownGridY : u.gridY;
                u.animStartTime = performance.now();
                u.lastKnownGridX = u.gridX;
                u.lastKnownGridY = u.gridY;
            }
        });

        drawGameScene(ctx, canvas, units, selectedUnit, localTeam, legalMoves, selectionAnimStartTime, stagedMove);
        
        if (selectedUnit) {
            let renderPos = getRenderCoordinates(selectedUnit.gridX, selectedUnit.gridY, canvas.width, localTeam);
            let scaleX = canvas.clientWidth / canvas.width;
            let scaleY = canvas.clientHeight / canvas.height;
            let cam = getCameraState();
            
            let worldX = (renderPos.x * cam.zoom) + cam.x;
            let worldY = (renderPos.y * cam.zoom) + cam.y;
            let screenX = worldX * scaleX;
            let screenY = worldY * scaleY;
            
            let scaledCellSize = renderPos.cellSize * cam.zoom * scaleX;
            let btnSize = Math.min(28, Math.max(16, scaledCellSize * 0.45));

            let btn = document.getElementById('activeUnitRangeBtn');
            if (btn) {
                btn.style.position = 'absolute';
                btn.style.zIndex = '1000';
                let offsetX = -36 * (cam.zoom || 1);
                let offsetY = -42 * (cam.zoom || 1);

                btn.style.left = `${screenX + offsetX}px`;
                btn.style.top = `${screenY + offsetY}px`;
                btn.style.width = `${btnSize}px`;
                btn.style.height = `${btnSize}px`;
                btn.style.fontSize = `${Math.max(9, btnSize * 0.45)}px`;
            }

            if (selectedUnit.name === 'Artillery' && getShowUnitRange(selectedUnit.id)) {
                updateArtilleryButtons(canvas, selectedUnit, localTeam, units, currentTurn, playerTeam, logToConsole, (enemy, selUnit, canv) => {
                    triggerArtilleryStrike(enemy, selUnit, canv, units, teamCoins, logToConsole, localTeam, currentMatchId, playerTeam, (val) => {
                        isGameOver = val;
                        window.isGameOverState = val;
                    }, (nextTurn, newTurnStartTime) => {
                        currentTurn = nextTurn;
                        lastSeenTurn = nextTurn;
                    });
                });
            } else {
                clearArtilleryButtons();
            }
        } else {
            clearArtilleryButtons();
        }

        animationFrameId = requestAnimationFrame(renderGameLoop);
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderGameLoop();

    canvas.onclick = (e) => {
        const state = {
            isGameOverRef: { get current() { return isGameOver; } },
            localTeamRef: { get current() { return localTeam; } },
            playerTeamRef: { get current() { return playerTeam; } },
            currentTurnRef: { get current() { return currentTurn; } },
            unitsRef: { get current() { return units; } },
            selectedUnitRef: { get current() { return selectedUnit; } },
            legalMovesRef: { get current() { return legalMoves; } },
            stagedMoveRef: { get current() { return stagedMove; } },
            selectionAnimStartTimeRef: { get current() { return selectionAnimStartTime; } },
            teamCoinsRef: { get current() { return teamCoins; } },
            currentMatchIdRef: { get current() { return currentMatchId; } },
            logToConsole
        };

        const callbacks = {
            setGameOver: (val) => { isGameOver = val; window.isGameOverState = val; },
            setSelectedUnit: (u) => { selectedUnit = u; },
            setLegalMoves: (m) => { legalMoves = m; },
            setStagedMove: (s) => { stagedMove = s; },
            setSelectionAnimStartTime: (t) => { selectionAnimStartTime = t; }
        };

        handleCanvasClick(e, canvas, state, callbacks);
    };
}
