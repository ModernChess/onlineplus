// game-controls.js - Manages Action Buttons, Turn States, Global Coin HUD, Live Timer, XP Bar, Destruction Feed, and Active Unit Counts
import { db, ref, update } from './network.js';
import { clearUnitRangeOverlayButton } from './unit-movement.js';

export function createConsoleLogger() {
    return function logToConsole(msg) {
        const logs = document.getElementById('console-logs');
        if (!logs) return;
        const time = new Date().toLocaleTimeString();
        logs.innerHTML += `[${time}] ${msg}<br>`;
        logs.scrollTop = logs.scrollHeight;
    };
}

export function updateTurnButtonState(currentTurn, playerTeam) {
    const changeTurnBtn = document.getElementById('changeTurnBtn');
    if (changeTurnBtn) {
        const isMyTurn = (currentTurn === playerTeam);
        changeTurnBtn.disabled = !isMyTurn;
        changeTurnBtn.style.opacity = isMyTurn ? '1' : '0.5';
        changeTurnBtn.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
    }
}

export function ensureCoinHudBar() {
    if (document.getElementById('coinDisplayBar')) return;
    
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer || !canvasContainer.parentNode) return;

    if (!document.getElementById('customGameUiStyles')) {
        const style = document.createElement('style');
        style.id = 'customGameUiStyles';
        style.innerHTML = `
            .game-top-hud {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 12px;
                width: 100%;
            }
            .hud-main-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }
            .team-coin-widget {
                padding: 6px 12px;
                border-radius: 6px;
                font-weight: bold;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 3px 5px rgba(0,0,0,0.2);
                flex: 1;
                justify-content: center;
            }
            .blue-team-frame {
                background: linear-gradient(135deg, #2980b9, #1abc9c);
                border: 1px solid #5dade2;
                color: #fff;
            }
            .red-team-frame {
                background: linear-gradient(135deg, #c0392b, #e74c3c);
                border: 1px solid #ec7063;
                color: #fff;
            }
            .turn-timer-widget {
                background: rgba(20, 20, 30, 0.95);
                border: 2px solid #f39c12;
                color: #f1c40f;
                padding: 6px 14px;
                border-radius: 6px;
                font-weight: 900;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            }
            .turn-status-banner {
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: bold;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 10px;
                font-size: 14px;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                transition: all 0.3s ease;
            }
            .turn-status-blue {
                background: linear-gradient(135deg, rgba(41, 128, 185, 0.85), rgba(52, 152, 219, 0.95));
                border: 2px solid #85c1e9;
                color: #fff;
            }
            .turn-status-red {
                background: linear-gradient(135deg, rgba(192, 57, 43, 0.85), rgba(231, 76, 60, 0.95));
                border: 2px solid #f1948a;
                color: #fff;
            }
            .coin-icon {
                background: #f1c40f;
                color: #2c3e50;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 900;
                box-shadow: inset 0 2px 3px rgba(0,0,0,0.2);
            }
            .turn-player-highlight {
                font-weight: 900;
                background: rgba(0, 0, 0, 0.25);
                padding: 2px 8px;
                border-radius: 4px;
                letter-spacing: 1px;
            }
            /* XP Display Frame Styles */
            .xp-bar-frame {
                position: relative;
                background: rgba(15, 15, 22, 0.9);
                border: 1px solid rgba(155, 89, 182, 0.6);
                border-radius: 8px;
                padding: 6px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0,0,0,0.3);
                overflow: hidden;
            }
            .xp-text-label {
                font-weight: 800;
                font-size: 12px;
                color: #d8b4fe;
                text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
                z-index: 2;
                letter-spacing: 0.5px;
            }
            .xp-progress-track {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, rgba(142, 68, 173, 0.6), rgba(155, 89, 182, 0.9));
                transition: width 0.4s ease-out;
                z-index: 1;
            }
        `;
        document.head.appendChild(style);
    }

    const hudContainer = document.createElement('div');
    hudContainer.id = 'coinDisplayBar';
    hudContainer.className = 'game-top-hud';
    hudContainer.innerHTML = `
        <div id="xpDisplayFrame" class="xp-bar-frame">
            <div id="xpProgressTrack" class="xp-progress-track"></div>
            <span class="xp-text-label">PLAYER XP: <strong id="playerXpText" style="color: #fff;">0 XP</strong></span>
            <span id="playerXpLevelTag" class="xp-text-label" style="font-size: 11px; opacity: 0.85;">LVL 1</span>
        </div>
        <div id="turnStatusBanner" class="turn-status-banner turn-status-blue">
            <span>⚔️ Turn:</span> 
            <span id="turnTeamText">BLUE</span> 
            <span id="turnPlayerText" class="turn-player-highlight">(Player's Turn)</span>
        </div>
        <div class="hud-main-row">
            <div class="team-coin-widget blue-team-frame">
                <span class="coin-icon">C</span> Blue: <span id="blueCoinCount">0</span>
            </div>
            <div class="turn-timer-widget">
                ⏳ <span id="turnTimerClock">60s</span>
            </div>
            <div class="team-coin-widget red-team-frame">
                <span class="coin-icon">C</span> Red: <span id="redCoinCount">0</span>
            </div>
        </div>
        <!-- Advanced Destruction Feed Frame -->
        <div id="destructionFeedWidget" style="
            background: rgba(18, 18, 26, 0.95);
            border: 1px solid rgba(231, 76, 60, 0.5);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            color: #fff;
            box-shadow: inset 0 2px 5px rgba(0,0,0,0.6);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center;" id="destructionFeedHeader">
                <span style="font-weight: bold; color: #e74c3c; display: flex; align-items: center; gap: 5px;">
                    🔥 Destruction Feed <span id="destructionLatestSummary" style="font-weight: normal; color: #aaa; font-size: 11px;">(No units destroyed yet)</span>
                </span>
                <button id="toggleUnitCountsBtn" style="
                    background: rgba(255,255,255,0.12);
                    border: 1px solid rgba(255,255,255,0.25);
                    color: #fff;
                    font-size: 11px;
                    padding: 3px 9px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                ">Active Units ▼</button>
            </div>
            <div id="destructionFeedBody" style="
                max-height: 70px;
                overflow-y: auto;
                margin-top: 6px;
                border-top: 1px solid rgba(255,255,255,0.1);
                padding-top: 4px;
                display: flex;
                flex-direction: column;
                gap: 3px;
                font-size: 11px;
                color: #ddd;
            ">
                <div style="color: #7f8c8d; font-style: italic;">No combat destructions recorded.</div>
            </div>
            <div id="activeUnitCountsCollapsible" style="
                display: none;
                margin-top: 8px;
                border-top: 1px dashed rgba(255,255,255,0.2);
                padding-top: 6px;
                font-size: 11px;
            ">
                <div style="display: flex; justify-content: space-between; gap: 10px;">
                    <div style="flex: 1; background: rgba(41, 128, 185, 0.2); padding: 5px 8px; border-radius: 4px; border-left: 3px solid #2980b9;">
                        <strong style="color: #3498db;">Blue Team Units:</strong>
                        <div id="blueActiveUnitsList" style="margin-top: 3px; color: #bdc3c7;">None (0)</div>
                    </div>
                    <div style="flex: 1; background: rgba(192, 57, 43, 0.2); padding: 5px 8px; border-radius: 4px; border-left: 3px solid #e74c3c;">
                        <strong style="color: #e74c3c;">Red Team Units:</strong>
                        <div id="redActiveUnitsList" style="margin-top: 3px; color: #bdc3c7;">None (0)</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    canvasContainer.parentNode.insertBefore(hudContainer, canvasContainer);

    setTimeout(() => {
        const toggleBtn = document.getElementById('toggleUnitCountsBtn');
        const collapsible = document.getElementById('activeUnitCountsCollapsible');
        if (toggleBtn && collapsible) {
            toggleBtn.onclick = () => {
                const isHidden = collapsible.style.display === 'none';
                collapsible.style.display = isHidden ? 'block' : 'none';
                toggleBtn.innerText = isHidden ? 'Active Units ▲' : 'Active Units ▼';
            };
        }
    }, 50);
}

export function appendDestructionFeed(unitName, defenderTeam, destroyedBy, attackerTeam) {
    ensureCoinHudBar();
    const body = document.getElementById('destructionFeedBody');
    const summary = document.getElementById('destructionLatestSummary');
    if (!body) return;

    if (body.querySelector('div[style*="font-style: italic"]')) {
        body.innerHTML = '';
    }

    const timeStr = new Date().toLocaleTimeString();
    const defColor = defenderTeam === 'blue' ? '#3498db' : '#e74c3c';
    const atkColor = attackerTeam === 'blue' ? '#3498db' : '#e74c3c';

    const item = document.createElement('div');
    item.innerHTML = `[${timeStr}] <strong style="color:${defColor};">${defenderTeam.toUpperCase()} ${unitName}</strong> destroyed by <strong style="color:${atkColor};">${attackerTeam ? attackerTeam.toUpperCase() : 'Enemy'}</strong> (${destroyedBy})`;
    body.appendChild(item);
    body.scrollTop = body.scrollHeight;

    if (summary) {
        summary.innerText = `(Latest: ${defenderTeam.toUpperCase()} ${unitName} lost)`;
    }
}

export function updateActiveUnitCounts(unitsList) {
    ensureCoinHudBar();
    const blueListEl = document.getElementById('blueActiveUnitsList');
    const redListEl = document.getElementById('redActiveUnitsList');
    if (!blueListEl || !redListEl) return;

    if (!Array.isArray(unitsList)) {
        blueListEl.innerText = 'None (0)';
        redListEl.innerText = 'None (0)';
        return;
    }

    const countTeamUnits = (team) => {
        const counts = {};
        let total = 0;
        unitsList.filter(u => u.team === team).forEach(u => {
            const name = u.name || 'Unit';
            counts[name] = (counts[name] || 0) + 1;
            total++;
        });
        if (total === 0) return 'None (0)';
        let str = Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ');
        return `${str} [Total: ${total}]`;
    };

    blueListEl.innerText = countTeamUnits('blue');
    redListEl.innerText = countTeamUnits('red');
}

export function updateXpDisplay(currentXp = 0) {
    ensureCoinHudBar();
    const xpText = document.getElementById('playerXpText');
    const xpTrack = document.getElementById('xpProgressTrack');
    const xpLevelTag = document.getElementById('playerXpLevelTag');

    if (xpText) xpText.innerText = `${currentXp} XP`;
    
    const level = Math.floor(currentXp / 100) + 1;
    const progressInLevel = currentXp % 100;
    
    if (xpLevelTag) xpLevelTag.innerText = `LVL ${level}`;
    if (xpTrack) xpTrack.style.width = `${Math.min(100, progressInLevel)}%`;
}

export function updateCoinHud(teamCoins) {
    ensureCoinHudBar();
    if (!teamCoins) return;
    
    const blueElem = document.getElementById('blueCoinCount');
    const redElem = document.getElementById('redCoinCount');
    
    if (blueElem) blueElem.innerText = teamCoins.blue ?? 0;
    if (redElem) redElem.innerText = teamCoins.red ?? 0;
}

export const updateGlobalCoinHUD = updateCoinHud;

export function updateTurnStatusBanner(currentTurn, playerName = '') {
    ensureCoinHudBar();
    const banner = document.getElementById('turnStatusBanner');
    const teamText = document.getElementById('turnTeamText');
    const playerText = document.getElementById('turnPlayerText');

    if (!banner || !teamText || !playerText) return;

    const lowerTurn = (currentTurn || 'blue').toLowerCase();
    
    if (lowerTurn === 'blue') {
        banner.className = 'turn-status-banner turn-status-blue';
        teamText.innerText = 'BLUE';
    } else {
        banner.className = 'turn-status-banner turn-status-red';
        teamText.innerText = 'RED';
    }

    playerText.innerText = playerName ? `(${playerName}'s Turn)` : `(${lowerTurn.toUpperCase()}'s Turn)`;
}

export function updateTurnTimerDisplay(secondsLeft) {
    ensureCoinHudBar();
    const timerElem = document.getElementById('turnTimerClock');
    if (timerElem) {
        timerElem.innerText = `${Math.max(0, secondsLeft)}s`;
        timerElem.style.color = secondsLeft <= 5 ? '#ff6b6b' : '#f1c40f';
    }
}

export function ensureGameActionButtons(matchIdRef, teamRef, turnRef, movedUnitsThisTurn, animRef, onLeaveCallback, logToConsole, updateTurnStateCallback) {
    ensureCoinHudBar();

    const surrenderBtn = document.getElementById('surrenderBtn');
    if (surrenderBtn) {
        surrenderBtn.onclick = () => {
            if (matchIdRef.current) {
                update(ref(db, `matches_plus/${matchIdRef.current}`), {
                    status: 'ended',
                    winner: teamRef.current === 'blue' ? 'red' : 'blue'
                });
            }
            if (animRef.current) cancelAnimationFrame(animRef.current);
            matchIdRef.current = null;
            clearUnitRangeOverlayButton();
            if (onLeaveCallback) onLeaveCallback();
            logToConsole("Match surrendered successfully.");
        };

        if (!document.getElementById('afkBtn')) {
            const afkBtn = document.createElement('button');
            afkBtn.id = 'afkBtn';
            afkBtn.className = 'btn btn-secondary';
            afkBtn.style.backgroundColor = '#f39c12';
            afkBtn.style.color = '#fff';
            afkBtn.style.marginLeft = '10px';
            afkBtn.innerText = 'Go AFK';
            afkBtn.onclick = () => {
                if (matchIdRef.current) {
                    const afkField = teamRef.current === 'blue' ? 'blueAfk' : 'redAfk';
                    update(ref(db, `matches_plus/${matchIdRef.current}`), { [afkField]: true });
                }
                if (animRef.current) cancelAnimationFrame(animRef.current);
                matchIdRef.current = null;
                clearUnitRangeOverlayButton();
                if (onLeaveCallback) onLeaveCallback();
                logToConsole("Marked as AFK and returned to lobby.");
            };
            surrenderBtn.parentNode.insertBefore(afkBtn, surrenderBtn.nextSibling);
        }

        if (!document.getElementById('changeTurnBtn')) {
            const changeTurnBtn = document.createElement('button');
            changeTurnBtn.id = 'changeTurnBtn';
            changeTurnBtn.className = 'btn btn-secondary';
            changeTurnBtn.style.backgroundColor = '#9b59b6';
            changeTurnBtn.style.icon = '⚡';
            changeTurnBtn.style.color = '#fff';
            changeTurnBtn.style.marginLeft = '10px';
            changeTurnBtn.innerText = 'Change Turn';
            changeTurnBtn.onclick = () => {
                if (turnRef.current !== teamRef.current) {
                    logToConsole("Action blocked: Not your turn!");
                    return;
                }
                logToConsole("Manual turn change triggered via Change Turn button.");
                movedUnitsThisTurn.clear();
                let nextTurn = teamRef.current === 'blue' ? 'red' : 'blue';
                let newTurnStartTime = Date.now();
                turnRef.current = nextTurn;
                updateTurnStateCallback();

                if (matchIdRef.current) {
                    update(ref(db, `matches_plus/${matchIdRef.current}`), { 
                        turn: nextTurn,
                        turnStartTime: newTurnStartTime 
                    });
                }
            };
            surrenderBtn.parentNode.insertBefore(changeTurnBtn, document.getElementById('afkBtn').nextSibling);
        }

        if (!document.getElementById('buyUnitsBtn')) {
            const buyUnitsBtn = document.createElement('button');
            buyUnitsBtn.id = 'buyUnitsBtn';
            buyUnitsBtn.className = 'btn btn-secondary';
            buyUnitsBtn.style.backgroundColor = '#e67e22';
            buyUnitsBtn.style.color = '#fff';
            buyUnitsBtn.style.marginLeft = '10px';
            buyUnitsBtn.innerText = 'Buy Units';
            
            buyUnitsBtn.onclick = () => {
                const modal = document.getElementById('buyUnitsModal');
                if (modal) {
                    modal.style.display = 'flex';
                    buyUnitsBtn.disabled = true;
                    buyUnitsBtn.classList.add('btn-frozen');
                } else {
                    window.dispatchEvent(new CustomEvent('openBuyUnitsShop'));
                }
            };
            surrenderBtn.parentNode.insertBefore(buyUnitsBtn, document.getElementById('changeTurnBtn').nextSibling);
        }
    }
}
