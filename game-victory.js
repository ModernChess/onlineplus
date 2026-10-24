// game-victory.js - Victory conditions, match summaries, and post-game scoreboard modal (Fixed localTeam resolution)
import { db, ref, update, get, remove, set } from './network.js';
import { rbList, bbList, parseCoord } from './team-logic.js';
import { stalematedUnits } from './combat-mechanics.js';
import { showScreen } from './ui-manager.js';
import { getSyncedNow, playerXp, setPlayerXp } from './game-engine-2.js';
import { updateXpDisplay } from './game-controls.js';

let sessionXpEarned = 0;
let matchBlueUnitsLost = 0;
let matchRedUnitsLost = 0;
let matchBlueMoves = 0;
let matchRedMoves = 0;
let matchCombatEventsCount = 0;

let matchBlueGoldCoresCaptured = 0;
let matchRedGoldCoresCaptured = 0;
let matchBlueGoldCoreXp = 0;
let matchRedGoldCoreXp = 0;

let blueUnitsDestroyedDetail = []; 
let redUnitsDestroyedDetail = [];  

export function addSessionXp(amount) {
    sessionXpEarned += amount;
}

export function recordUnitLoss(defenderTeam, unitName, attackerTeam) {
    let cleanName = unitName && unitName !== 'Unit' ? unitName : 'Unit';
    if (defenderTeam === 'blue') {
        matchBlueUnitsLost++;
        blueUnitsDestroyedDetail.push({ name: cleanName, attacker: attackerTeam || 'red' });
    } else if (defenderTeam === 'red') {
        matchRedUnitsLost++;
        redUnitsDestroyedDetail.push({ name: cleanName, attacker: attackerTeam || 'blue' });
    }
    matchCombatEventsCount++;
}

export function recordTeamMove(team) {
    if (team === 'blue') matchBlueMoves++;
    if (team === 'red') matchRedMoves++;
}

export function recordGoldCoreCapture(team, xpGained = 50) {
    if (team === 'blue') {
        matchBlueGoldCoresCaptured++;
        matchBlueGoldCoreXp += xpGained;
    } else if (team === 'red') {
        matchRedGoldCoresCaptured++;
        matchRedGoldCoreXp += xpGained;
    }
}

export function resetMatchMetrics() {
    sessionXpEarned = 0;
    matchBlueUnitsLost = 0;
    matchRedUnitsLost = 0;
    matchBlueMoves = 0;
    matchRedMoves = 0;
    matchCombatEventsCount = 0;
    matchBlueGoldCoresCaptured = 0;
    matchRedGoldCoresCaptured = 0;
    matchBlueGoldCoreXp = 0;
    matchRedGoldCoreXp = 0;
    blueUnitsDestroyedDetail = [];
    redUnitsDestroyedDetail = [];
}

function isLandUnit(u) {
    if (!u) return false;
    let name = (u.name || '').toLowerCase();
    let type = (u.type || '').toLowerCase();
    return name !== 'ship' && name !== 'plane' && !type.includes('naval') && !type.includes('air');
}

function handleVictoryXpReward(winnerTeam) {
    if (!winnerTeam || winnerTeam === 'draw') return;
    
    const currentUsername = localStorage.getItem('arena_chess_user');
    const localTeam = window.playerTeam || localStorage.getItem('arena_chess_team') || 'blue';

    if (currentUsername && localTeam === winnerTeam) {
        const victoryXpBonus = 250;
        
        addSessionXp(victoryXpBonus);

        const newTotalXp = (playerXp || 0) + victoryXpBonus;
        setPlayerXp(newTotalXp);
        updateXpDisplay(newTotalXp);

        localStorage.setItem(`arena_chess_xp_${currentUsername}`, newTotalXp);

        set(ref(db, `user_xp/${currentUsername}`), {
            xp: newTotalXp,
            lastUpdated: getSyncedNow()
        }).catch(err => console.error("Failed to sync victory XP to Firebase:", err));
    }
}

export function checkVictoryConditions(currentUnits, matchId, logger, isGameOver, setGameOver, onGameOverCallback = null) {
    if (isGameOver) return;
    if (!currentUnits || !Array.isArray(currentUnits)) return;

    const blueUnits = currentUnits.filter(u => u && u.team === 'blue');
    const redUnits = currentUnits.filter(u => u && u.team === 'red');

    const blueTeamWiped = blueUnits.length === 0 && redUnits.length > 0;
    const redTeamWiped = redUnits.length === 0 && blueUnits.length > 0;

    if (redTeamWiped && !blueTeamWiped) {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        logger(`VICTORY! Blue team wins because all Red units have been completely destroyed!`);
        handleVictoryXpReward('blue');
        endGameSessionState(matchId, 'blue', currentUnits);
        return;
    } else if (blueTeamWiped && !redTeamWiped) {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        logger(`VICTORY! Red team wins because all Blue units have been completely destroyed!`);
        handleVictoryXpReward('red');
        endGameSessionState(matchId, 'red', currentUnits);
        return;
    }

    const blueLandUnits = blueUnits.filter(isLandUnit);
    const redLandUnits = redUnits.filter(isLandUnit);

    const blueAllLandStalemated = blueLandUnits.length > 0 && blueLandUnits.every(u => u.stalemate || stalematedUnits.has(u.id));
    const redAllLandStalemated = redLandUnits.length > 0 && redLandUnits.every(u => u.stalemate || stalematedUnits.has(u.id));

    if (blueAllLandStalemated && redAllLandStalemated) {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        logger(`GAME OVER! It's a draw because all land units for both teams are stalemated!`);
        endGameSessionState(matchId, 'draw', currentUnits);
        return;
    }

    const blueHasOnlyNonLand = blueUnits.length > 0 && blueLandUnits.length === 0;
    const redHasOnlyNonLand = redUnits.length > 0 && redLandUnits.length === 0;

    const redWins = blueHasOnlyNonLand || blueAllLandStalemated;
    const blueWins = redHasOnlyNonLand || redAllLandStalemated;

    if (redWins && !blueWins) {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        let reason = blueAllLandStalemated 
            ? "all Blue land units are stalemated" 
            : "all Blue land units were destroyed (only non-land units remain)";
        
        logger(`VICTORY! Red team wins because ${reason}!`);
        handleVictoryXpReward('red');
        endGameSessionState(matchId, 'red', currentUnits);
    } else if (blueWins && !redWins) {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        let reason = redAllLandStalemated 
            ? "all Red land units are stalemated" 
            : "all Red land units were destroyed (only non-land units remain)";
        
        logger(`VICTORY! Blue team wins because ${reason}!`);
        handleVictoryXpReward('blue');
        endGameSessionState(matchId, 'blue', currentUnits);
    }
}

export function checkBaseCaptureVictory(unit, moveKey, matchId, logger, isGameOver, setGameOver, onGameOverCallback = null) {
    if (isGameOver) return false;
    let unitNameLower = (unit.name || '').toLowerCase();
    let isInfantryOrTank = unitNameLower.includes('infantry') || unitNameLower.includes('tank');
    if (!isInfantryOrTank) return false;

    const isRedBase = rbList.some(item => parseCoord(item) === moveKey);
    const isBlueBase = bbList.some(item => parseCoord(item) === moveKey);

    if (isRedBase && unit.team === 'blue') {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        logger(`VICTORY! Blue team captured the Red Base/Core! Blue wins!`);
        handleVictoryXpReward('blue');
        endGameSessionState(matchId, 'blue', []);
        return true;
    } else if (isBlueBase && unit.team === 'red') {
        setGameOver(true);
        if (onGameOverCallback) onGameOverCallback();
        logger(`VICTORY! Red team captured the Blue Base/Core! Red wins!`);
        handleVictoryXpReward('red');
        endGameSessionState(matchId, 'red', []);
        return true;
    }
    return false;
}

export function endGameSessionState(matchId, winnerTeam, currentUnits = []) {
    const localTeam = window.playerTeam || localStorage.getItem('arena_chess_team') || 'blue';

    if (matchId) {
        update(ref(db, `matches_plus/${matchId}`), {
            status: 'ended',
            winner: winnerTeam,
            matchStats: {
                blueUnitsLost: matchBlueUnitsLost,
                redUnitsLost: matchRedUnitsLost,
                blueMoves: matchBlueMoves,
                redMoves: matchRedMoves,
                combatEventsCount: matchCombatEventsCount,
                blueGoldCoresCaptured: matchBlueGoldCoresCaptured,
                redGoldCoresCaptured: matchRedGoldCoresCaptured,
                blueGoldCoreXp: matchBlueGoldCoreXp,
                redGoldCoreXp: matchRedGoldCoreXp,
                blueUnitsDestroyedDetail: blueUnitsDestroyedDetail,
                redUnitsDestroyedDetail: redUnitsDestroyedDetail
            }
        });

        const serversRef = ref(db, 'servers');
        get(serversRef).then((snapshot) => {
            const servers = snapshot.val() || {};
            for (let sId in servers) {
                if (servers[sId].matchId === matchId) {
                    remove(ref(db, `servers/${sId}`));
                    break;
                }
            }
        });
    }

    showVictoryScoreboardModal(winnerTeam, { 
        blueUnitsLost: matchBlueUnitsLost, 
        redUnitsLost: matchRedUnitsLost, 
        blueMoves: matchBlueMoves, 
        redMoves: matchRedMoves, 
        combatEventsCount: matchCombatEventsCount,
        blueGoldCoresCaptured: matchBlueGoldCoresCaptured,
        redGoldCoresCaptured: matchRedGoldCoresCaptured,
        blueGoldCoreXp: matchBlueGoldCoreXp,
        redGoldCoreXp: matchRedGoldCoreXp,
        blueUnitsDestroyedDetail: blueUnitsDestroyedDetail,
        redUnitsDestroyedDetail: redUnitsDestroyedDetail
    }, localTeam);
}

export function showVictoryScoreboardModal(winnerTeam, remoteStats = null, localTeamOverride = null) {
    if (document.getElementById('victoryScoreboardModal')) return;

    // Resolve local team dynamically with strict fallback
    const localTeam = localTeamOverride || window.playerTeam || localStorage.getItem('arena_chess_team') || 'blue';

    let bLost = remoteStats && remoteStats.blueUnitsLost !== undefined ? remoteStats.blueUnitsLost : matchBlueUnitsLost;
    let rLost = remoteStats && remoteStats.redUnitsLost !== undefined ? remoteStats.redUnitsLost : matchRedUnitsLost;

    let bCores = remoteStats && remoteStats.blueGoldCoresCaptured !== undefined ? remoteStats.blueGoldCoresCaptured : matchBlueGoldCoresCaptured;
    let rCores = remoteStats && remoteStats.redGoldCoresCaptured !== undefined ? remoteStats.redGoldCoresCaptured : matchRedGoldCoresCaptured;
    let bCoreXp = remoteStats && remoteStats.blueGoldCoreXp !== undefined ? remoteStats.blueGoldCoreXp : matchBlueGoldCoreXp;
    let rCoreXp = remoteStats && remoteStats.redGoldCoreXp !== undefined ? remoteStats.redGoldCoreXp : matchRedGoldCoreXp;

    const currentUser = localStorage.getItem('arena_chess_user') || 'Player';
    const totalStoredXp = playerXp || localStorage.getItem(`arena_chess_xp_${currentUser}`) || '0';
    const finalSessionXpDisplay = sessionXpEarned > 0 ? `+${sessionXpEarned} XP` : `0 XP`;

    // Strictly show XP bonus only under the user's local team column
    let blueUnitsDisplay = `${bLost} Lost`;
    if (localTeam === 'blue' && bLost > 0) {
        blueUnitsDisplay += ` (+${bLost * 25} XP)`;
    }

    let redUnitsDisplay = `${rLost} Lost`;
    if (localTeam === 'red' && rLost > 0) {
        redUnitsDisplay += ` (+${rLost * 25} XP)`;
    }

    let blueCoresDisplay = `${bCores}`;
    if (localTeam === 'blue' && bCores > 0) {
        blueCoresDisplay += ` (+${bCoreXp || bCores * 50} XP)`;
    }

    let redCoresDisplay = `${rCores}`;
    if (localTeam === 'red' && rCores > 0) {
        redCoresDisplay += ` (+${rCoreXp || rCores * 50} XP)`;
    }

    if (!document.getElementById('victoryModalStyles')) {
        const style = document.createElement('style');
        style.id = 'victoryModalStyles';
        style.innerHTML = `
            .victory-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(8, 8, 12, 0.85); backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px); display: flex; align-items: center;
                justify-content: center; z-index: 10000; animation: fadeInModal 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .victory-modal-content {
                background: linear-gradient(145deg, rgba(24, 24, 36, 0.95), rgba(34, 34, 59, 0.95));
                border: 1px solid rgba(241, 196, 15, 0.4); border-radius: 20px; width: 92%; max-width: 500px;
                padding: 30px 24px; color: #fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.15);
                text-align: center; font-family: 'Fredoka', sans-serif; box-sizing: border-box;
            }
            .victory-title { font-size: 1.8rem; font-weight: 900; color: #f1c40f; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1.5px; text-shadow: 0 2px 10px rgba(241,196,15,0.4); }
            .victory-subtitle { font-size: 0.85rem; color: #a0aec0; margin-bottom: 20px; letter-spacing: 0.5px; }
            .victory-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; font-size: 0.82rem; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
            .victory-table th, .victory-table td { padding: 10px 14px; text-align: center; background: rgba(0, 0, 0, 0.25); border-bottom: 1px solid rgba(255,255,255,0.08); }
            .victory-table th { background: rgba(241, 196, 15, 0.12); color: #f1c40f; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.8px; }
            .victory-table tr:last-child td { border-bottom: none; }
            .victory-timer-box { background: rgba(0, 0, 0, 0.4); padding: 12px; border-radius: 12px; font-size: 0.85rem; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.1); color: #cbd5e0; }
            .victory-btn { background: linear-gradient(135deg, #f1c40f, #d35400); color: #121212; border: none; padding: 12px; border-radius: 12px; font-weight: 800; font-family: 'Fredoka', sans-serif; font-size: 0.9rem; cursor: pointer; width: 100%; box-shadow: 0 4px 15px rgba(241,196,15,0.3); transition: all 0.2s ease; }
            .victory-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(241,196,15,0.5); filter: brightness(1.1); }
            @keyframes fadeInModal { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'victoryScoreboardModal';
    overlay.className = 'victory-modal-overlay';

    const winColor = winnerTeam === 'blue' ? '#3498db' : (winnerTeam === 'red' ? '#e74c3c' : '#f1c40f');
    const winText = winnerTeam === 'draw' ? 'STALEMATE / DRAW' : `${winnerTeam.toUpperCase()} TEAM WINS!`;

    overlay.innerHTML = `
        <div class="victory-modal-content">
            <div class="victory-title" style="color: ${winColor};">${winText}</div>
            <div class="victory-subtitle">Final Match Performance & Tactical Summary</div>

            <table class="victory-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Blue Team</th>
                        <th>Red Team</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Units Destroyed / Lost</strong></td>
                        <td style="color: #ff6b6b;">${blueUnitsDisplay}</td>
                        <td style="color: #ff6b6b;">${redUnitsDisplay}</td>
                    </tr>
                    <tr>
                        <td><strong>Gold Cores Captured</strong></td>
                        <td style="color: #f1c40f; font-weight: bold;">${blueCoresDisplay}</td>
                        <td style="color: #f1c40f; font-weight: bold;">${redCoresDisplay}</td>
                    </tr>
                    <tr>
                        <td><strong>Match XP Earned</strong></td>
                        <td colspan="2" style="color: #d8b4fe; font-weight: bold;">${finalSessionXpDisplay} (Total: ${totalStoredXp} XP)</td>
                    </tr>
                </tbody>
            </table>

            <div class="victory-timer-box">
                Returning to Lobby automatically in <strong id="victoryCountdownTimer" style="color: #f1c40f; font-size: 1.1rem;">20</strong> seconds...
            </div>

            <button id="returnLobbyDirectBtn" class="victory-btn">Return to Lobby Now</button>
        </div>
    `;

    document.body.appendChild(overlay);

    let timeLeft = 20;
    const timerEl = document.getElementById('victoryCountdownTimer');

    const interval = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(interval);
            exitToLobby();
        }
    }, 1000);

    document.getElementById('returnLobbyDirectBtn').onclick = () => {
        clearInterval(interval);
        exitToLobby();
    };
}

function exitToLobby() {
    const modal = document.getElementById('victoryScoreboardModal');
    if (modal) modal.remove();
    sessionXpEarned = 0;
    resetMatchMetrics();
    showScreen('lobby-screen');
}
