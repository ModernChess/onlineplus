// game-sync.js - Safe synchronization preventing reload exploits while honoring server turn changes (OnlinePlus Version)
import { db, ref, update, get, onValue, off, push } from './network.js';
import { showScreen } from './ui-manager.js';
import { updateTurnStatusBanner } from './game-controls.js';
import { triggerFrontalExplosion, triggerFarDestructionTrails } from './renderer-helpers.js';
import { getRenderCoordinates } from './game-renderer.js';

let matchEndTimeout = null;
let lastProcessedActionTime = 0;
let lastProcessedDestructionTime = 0;
let lastServerTurn = null;
let isInitialSync = true; 

export function listenToMatchUpdates(currentMatchId, playerTeam, unitsRef, logToConsole, onMatchEnded, onTurnChanged, tileCapturesRef = null) {
    if (!currentMatchId) return null;

    const banner = document.getElementById('statusBanner');
    if (banner && !banner.dataset.loaded) {
        banner.innerHTML = `<div style="text-align:center; padding:8px; color:var(--text-muted); font-size:0.75rem;"><div class="inline-spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.2); border-top-color:var(--secondary); border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></div>Loading Match Status...</div>`;
    }

    const matchRef = ref(db, `matches_plus/${currentMatchId}`);
    
    const unsubscribe = onValue(matchRef, async (snapshot) => {
        const match = snapshot.val();
        if (!match) return;
        if (banner) banner.dataset.loaded = "true";
        
        const isMyTurn = match.turn === playerTeam;
        const serverTurnChanged = !isInitialSync && match.turn && match.turn !== lastServerTurn;
        
        if (match.turn) {
            lastServerTurn = match.turn;
        }

        if (match.turn && onTurnChanged) {
            onTurnChanged(match.turn, match);
        }
        
        if (match.lastAction && match.lastAction.timestamp > lastProcessedActionTime) {
            lastProcessedActionTime = match.lastAction.timestamp;
        }

        if (match.lastDestructions && match.lastDestructions.timestamp > lastProcessedDestructionTime) {
            lastProcessedDestructionTime = match.lastDestructions.timestamp;
            
            if (match.lastAction && match.lastAction.team !== playerTeam) {
                match.lastDestructions.events.forEach(evt => {
                    const canvas = document.getElementById('gameCanvas');
                    if (canvas) {
                        if (evt.isFarAttack) {
                            triggerFarDestructionTrails(evt.attackerX, evt.attackerY, evt.targetX, evt.targetY, getRenderCoordinates, canvas, playerTeam);
                        } else {
                            triggerFrontalExplosion(evt.targetX, evt.targetY, getRenderCoordinates, canvas, playerTeam);
                        }
                    }
                });
            }
        }
        
        if (match.tileCaptures && tileCapturesRef) {
            Object.keys(match.tileCaptures).forEach(key => {
                let remoteTile = match.tileCaptures[key];
                if (tileCapturesRef[key]) {
                    let newOwner = (remoteTile && remoteTile.capturedBy != null) ? remoteTile.capturedBy : null;
                    tileCapturesRef[key].capturedBy = newOwner;
                } else if (remoteTile) {
                    tileCapturesRef[key] = {
                        type: remoteTile.type || 'unknown',
                        capturedBy: (remoteTile.capturedBy != null) ? remoteTile.capturedBy : null
                    };
                }
            });
        }

        if (match.units) {
            const incomingMap = new Map();
            match.units.forEach(u => incomingMap.set(u.id, u));

            for (let i = unitsRef.length - 1; i >= 0; i--) {
                let localUnit = unitsRef[i];
                if (incomingMap.has(localUnit.id)) {
                    let incoming = incomingMap.get(localUnit.id);
                    
                    if (localUnit.gridX !== incoming.gridX || localUnit.gridY !== incoming.gridY) {
                        localUnit.animFromX = localUnit.gridX;
                        localUnit.animFromY = localUnit.gridY;
                        localUnit.animStartTime = performance.now();
                    }
                    
                    localUnit.gridX = incoming.gridX;
                    localUnit.gridY = incoming.gridY;
                    localUnit.lastKnownGridX = incoming.gridX;
                    localUnit.lastKnownGridY = incoming.gridY;
                    
                    if (isInitialSync) {
                        localUnit.hasMovedThisTurn = !!incoming.hasMovedThisTurn;
                    } else if (serverTurnChanged && isMyTurn && localUnit.team === playerTeam) {
                        localUnit.hasMovedThisTurn = false;
                    } else {
                        localUnit.hasMovedThisTurn = !!incoming.hasMovedThisTurn;
                    }
                    
                    incomingMap.delete(localUnit.id);
                } else {
                    unitsRef.splice(i, 1);
                }
            }

            incomingMap.forEach(newUnit => {
                unitsRef.push({
                    ...newUnit,
                    animFromX: newUnit.gridX,
                    animFromY: newUnit.gridY,
                    animStartTime: 0,
                    lastKnownGridX: newUnit.gridX,
                    lastKnownGridY: newUnit.gridY,
                    hasMovedThisTurn: isInitialSync ? !!newUnit.hasMovedThisTurn : ((serverTurnChanged && isMyTurn && newUnit.team === playerTeam) ? false : !!newUnit.hasMovedThisTurn)
                });
            });
        }
        
        isInitialSync = false;
        
        let blueName = match.blueUser || 'Blue Player';
        let redName = match.redUser || 'Red Player';
        let opponentIsAfk = playerTeam === 'blue' ? match.redAfk : match.blueAfk;

        // Fetch distinct avatars directly from game_presence for both blueUser and redUser
        let blueAvatar = match.blueAvatar;
        if (!blueAvatar || blueAvatar === '😀') {
            const blueSnap = await get(ref(db, `game_presence/${blueName}`));
            if (blueSnap.exists() && blueSnap.val().avatar) {
                blueAvatar = blueSnap.val().avatar;
            } else {
                blueAvatar = localStorage.getItem(`chess_campaign_avatar_${blueName}`) || '😀';
            }
        }

        let redAvatar = match.redAvatar;
        if (!redAvatar || redAvatar === '😀') {
            const redSnap = await get(ref(db, `game_presence/${redName}`));
            if (redSnap.exists() && redSnap.val().avatar) {
                redAvatar = redSnap.val().avatar;
            } else {
                redAvatar = localStorage.getItem(`chess_campaign_avatar_${redName}`) || '😀';
            }
        }

        let myName = playerTeam === 'blue' ? blueName : redName;
        let opponentName = playerTeam === 'blue' ? redName : blueName;

        const renderAvatarHTML = (avatar) => {
            if (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http'))) {
                return `<img src="${avatar}" style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; aspect-ratio: 1/1; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px; border: 1px solid rgba(255,255,255,0.3);">`;
            }
            return `<span style="font-size: 1rem; vertical-align: middle; margin-right: 6px;">${avatar || '😀'}</span>`;
        };

        if (match.status === 'ended') {
            if (banner) {
                banner.innerHTML = `<div style="background: #2c3e50; color: #f1c40f; padding: 10px; border-radius: 8px; font-weight: bold; text-align: center;">Match Ended! Winner: ${match.winner ? match.winner.toUpperCase() : 'Draw'}</div>`;
            }
            logToConsole(`Match ended. Winner: ${match.winner}. Returning to lobby in 4 seconds...`);
            
            if (!matchEndTimeout) {
                matchEndTimeout = setTimeout(() => {
                    if (onMatchEnded) onMatchEnded();
                    showScreen('lobby-screen');
                    matchEndTimeout = null;
                }, 4000);
            }
        } else {
            let activePlayerName = isMyTurn ? myName : opponentName;
            updateTurnStatusBanner(match.turn, activePlayerName);

            let bannerHTML = `
                <div class="battle-vs-container" style="display: flex; align-items: center; justify-content: center;">
                    <div class="battle-vs-box" style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: flex; align-items: center;">${renderAvatarHTML(blueAvatar)}<strong>${blueName}</strong></span>
                        <span class="vs-badge" style="padding: 0 6px; font-weight: bold; color: #f1c40f;">VS</span>
                        <span style="display: flex; align-items: center;">${renderAvatarHTML(redAvatar)}<strong>${redName}</strong></span>
                    </div>
                </div>
            `;
            if (opponentIsAfk) {
                bannerHTML += `<div style="color: #e74c3c; font-weight: bold; margin-top: 4px; font-size: 11px;">[${opponentName} has gone AFK. They can rejoin once they get into the app again!]</div>`;
            }
            if (banner) {
                banner.innerHTML = bannerHTML;
            }
        }
    });

    return () => {
        off(matchRef);
        if (matchEndTimeout) {
            clearTimeout(matchEndTimeout);
            matchEndTimeout = null;
        }
    };
}

export function listenToMatchChat(currentMatchId, currentUser) {
    if (!currentMatchId) return;

    const container = document.getElementById('chatMessages');
    if (container && !container.dataset.loaded) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.75rem;"><div class="inline-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.2); border-top-color:var(--secondary); border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></div>Connecting match chat...</div>`;
    }

    const chatRef = ref(db, `matches_plus/${currentMatchId}/chat`);
    
    const sendBtn = document.getElementById('chatSend');
    const inputEl = document.getElementById('chatInput');
    
    if (sendBtn && inputEl) {
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

        newSendBtn.addEventListener('click', async () => {
            const text = inputEl.value.trim();
            if (!text) return;
            
            const presenceSnap = await get(ref(db, `game_presence/${currentUser}`));
            const userAvatar = (presenceSnap.exists() && presenceSnap.val().avatar)
                ? presenceSnap.val().avatar
                : (localStorage.getItem(`chess_campaign_avatar_${currentUser}`) || localStorage.getItem('arena_chess_avatar') || '😀');
            
            push(chatRef, { 
                sender: currentUser, 
                avatar: userAvatar,
                text: text, 
                timestamp: Date.now() 
            });
            inputEl.value = '';
        });
    }

    onValue(chatRef, (snapshot) => {
        const data = snapshot.val() || {};
        if (!container) return;
        container.dataset.loaded = "true";
        container.innerHTML = '';
        
        Object.values(data).forEach(msg => {
            const msgAvatar = msg.avatar || '😀';
            const avatarHTML = (msgAvatar && (msgAvatar.startsWith('data:image/') || msgAvatar.startsWith('http')))
                ? `<img src="${msgAvatar}" class="chat-user-avatar" style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; aspect-ratio: 1/1; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px; border: 1px solid rgba(255, 255, 255, 0.25);">`
                : `<span class="chat-user-emoji" style="font-size: 1rem; vertical-align: middle; margin-right: 6px;">${msgAvatar}</span>`;

            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.style.cssText = 'display: flex; align-items: center; margin-bottom: 6px; word-break: break-word;';
            div.innerHTML = `
                <div style="display: flex; align-items: center; flex-shrink: 0;">
                    ${avatarHTML}
                    <strong style="color: var(--secondary); margin-right: 4px;">${msg.sender}:</strong>
                </div>
                <div style="flex-grow: 1;">${escapeHtml(msg.text)}</div>
            `;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
