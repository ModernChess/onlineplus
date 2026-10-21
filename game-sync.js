// game-sync.js - Safe synchronization preventing reload exploits while honoring server turn changes, live feed recovery, and real-time artillery sync
import { db, ref, update, get, onValue, off, push } from './network.js';
import { showScreen } from './ui-manager.js';
import { updateTurnStatusBanner, updateTurnTimerDisplay, appendDestructionFeed, appendMovementFeed } from './game-controls.js';
import { triggerFrontalExplosion, triggerFarDestructionTrails } from './renderer-helpers.js';
import { getRenderCoordinates, triggerDeploymentAlert } from './game-renderer.js';
import { getSyncedNow } from './game-engine-2.js';
import { triggerMoveSound, startStalemateSound, stopStalemateSound, playMetalClangSound, playWarningSound } from './sound.js';

let matchEndTimeout = null;
let lastProcessedActionTime = 0;
let lastProcessedDestructionTime = 0;
let lastProcessedDeploymentTime = 0;
let lastProcessedArtilleryTime = 0;
let lastProcessedDestructionFeedLength = 0;
let lastProcessedMovementFeedLength = 0;
let lastServerTurn = null;
let isInitialSync = true; 
let hasHydratedFeeds = false;

export function listenToMatchUpdates(currentMatchId, playerTeam, unitsRef, logToConsole, onMatchEnded, onTurnChanged, tileCapturesRef = null) {
    if (!currentMatchId) return null;

    lastProcessedDeploymentTime = Date.now();
    lastProcessedArtilleryTime = Date.now();
    isInitialSync = true;

    const banner = document.getElementById('statusBanner');
    if (banner && !banner.dataset.loaded) {
        banner.innerHTML = `<div style="text-align:center; padding:8px; color:var(--text-muted); font-size:0.75rem;"><div class="inline-spinner" style="display:inline-block; width:12px; height:12px; border:2px solid rgba(255,255,255,0.2); border-top-color:var(--secondary); border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></div>Loading Match Status...</div>`;
    }

    const matchRef = ref(db, `matches_plus/${currentMatchId}`);
    
    if (!hasHydratedFeeds) {
        onValue(ref(db, `matches_plus/${currentMatchId}/movementFeed`), (snap) => {
            if (snap.exists()) {
                const moveData = snap.val();
                const entries = Object.values(moveData);
                
                if (lastProcessedMovementFeedLength === 0) {
                    lastProcessedMovementFeedLength = entries.length;
                    return;
                }

                if (entries.length > lastProcessedMovementFeedLength) {
                    const latestMove = entries[entries.length - 1];
                    lastProcessedMovementFeedLength = entries.length;

                    if (latestMove) {
                        appendMovementFeed(latestMove.unitName, latestMove.team, latestMove.fromX, latestMove.fromY, latestMove.toX, latestMove.toY);
                        
                        if (latestMove.team !== playerTeam) {
                            triggerMoveSound(latestMove.unitName);

                            if (typeof window.triggerMovementArrowTrail === 'function') {
                                window.triggerMovementArrowTrail(latestMove.fromX, latestMove.fromY, latestMove.toX, latestMove.toY, latestMove.team);
                            }
                        }
                    }
                }
            }
        });

        // LIVE DESTRUCTION & CAPTURE FEED SYNCHRONIZATION LISTENER
        onValue(ref(db, `matches_plus/${currentMatchId}/destructionFeed`), (snap) => {
            if (snap.exists()) {
                const feedData = snap.val();
                const entries = Object.values(feedData);

                if (lastProcessedDestructionFeedLength === 0) {
                    lastProcessedDestructionFeedLength = entries.length;
                    return;
                }

                if (entries.length > lastProcessedDestructionFeedLength) {
                    const latestEvent = entries[entries.length - 1];
                    lastProcessedDestructionFeedLength = entries.length;

                    if (latestEvent) {
                        appendDestructionFeed(latestEvent.unitName, latestEvent.defenderTeam, latestEvent.destroyedBy || 'Combat', latestEvent.attackerTeam);
                    }
                }
            }
        });

        // LIVE REAL-TIME ARTILLERY SYNC (FIRED FOR BOTH SUCCESSES AND MISSES ON BOTH TEAMS)
        onValue(ref(db, `matches_plus/${currentMatchId}/artilleryAnimations`), (snap) => {
            if (snap.exists()) {
                const artData = snap.val();
                const entries = Object.values(artData);
                const latestArt = entries[entries.length - 1];

                if (latestArt && latestArt.timestamp > lastProcessedArtilleryTime) {
                    lastProcessedArtilleryTime = latestArt.timestamp;

                    // Play long-range artillery firing particle animation on opponent screen
                    if (latestArt.attackerTeam !== playerTeam) {
                        const canvas = document.getElementById('gameCanvas');
                        if (canvas) {
                            triggerFarDestructionTrails(
                                latestArt.fromX, 
                                latestArt.fromY, 
                                latestArt.toX, 
                                latestArt.toY, 
                                getRenderCoordinates, 
                                canvas, 
                                playerTeam
                            );
                        }

                        let statusBanner = document.getElementById('statusBanner');
                        if (statusBanner) {
                            if (latestArt.success) {
                                statusBanner.innerHTML = `💥 <strong style="color:${latestArt.attackerTeam === 'blue' ? '#3498db' : '#e74c3c'};">${latestArt.attackerTeam.toUpperCase()}</strong> Artillery successfully struck${latestArt.targetName}!`;
                            } else {
                                statusBanner.innerHTML = `💨 <strong style="color:${latestArt.attackerTeam === 'blue' ? '#3498db' : '#e74c3c'};">${latestArt.attackerTeam.toUpperCase()}</strong> Artillery missed${latestArt.targetName}!`;
                            }
                        }
                    }
                }
            }
        });

        hasHydratedFeeds = true;
    }

    const unsubscribe = onValue(matchRef, async (snapshot) => {
        const match = snapshot.val();
        if (!match) return;
        if (banner) banner.dataset.loaded = "true";
        
        const isMyTurn = match.turn === playerTeam;
        const serverTurnChanged = !isInitialSync && match.turn && match.turn !== lastServerTurn;
        
        if (match.turn) {
            lastServerTurn = match.turn;
        }

        if (match.turnStartTime) {
            window.activeTurnStartTime = match.turnStartTime;
            if (serverTurnChanged) {
                updateTurnTimerDisplay(60); 
            }
        }

        if (match.turn && onTurnChanged) {
            onTurnChanged(match.turn, match);
        }
        
        if (match.lastAction && match.lastAction.timestamp > lastProcessedActionTime) {
            lastProcessedActionTime = match.lastAction.timestamp;
        }

        if (match.lastDeployment && match.lastDeployment.timestamp) {
            if (match.lastDeployment.timestamp > lastProcessedDeploymentTime) {
                lastProcessedDeploymentTime = match.lastDeployment.timestamp;
                
                if (match.lastDeployment.team !== playerTeam) {
                    triggerDeploymentAlert(match.lastDeployment.x, match.lastDeployment.y, match.lastDeployment.team);
                    playMetalClangSound();
                }
            }
        }

        if (match.lastDestructions && match.lastDestructions.timestamp > lastProcessedDestructionTime) {
            lastProcessedDestructionTime = match.lastDestructions.timestamp;
            
            match.lastDestructions.events.forEach(evt => {
                const canvas = document.getElementById('gameCanvas');
                if (canvas) {
                    if (evt.isFarAttack) {
                        triggerFarDestructionTrails(evt.attackerX, evt.attackerY, evt.targetX, evt.targetY, getRenderCoordinates, canvas, playerTeam);
                    } else {
                        triggerFrontalExplosion(evt.targetX, evt.targetY, getRenderCoordinates, canvas, playerTeam);
                    }
                }

                if (evt.defenderTeam === playerTeam) {
                    if (typeof window.triggerDestructionAlert === 'function') {
                        window.triggerDestructionAlert(evt.targetX, evt.targetY, evt.defenderTeam);
                    }
                    playWarningSound(8000);
                }
            });
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

        let hasActiveStalemate = false;

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
                    localUnit.stalemate = !!incoming.stalemate;

                    if (localUnit.stalemate) {
                        hasActiveStalemate = true;
                    }
                    
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
                let isStalemate = !!newUnit.stalemate;
                if (isStalemate) hasActiveStalemate = true;

                unitsRef.push({
                    ...newUnit,
                    stalemate: isStalemate,
                    animFromX: newUnit.gridX,
                    animFromY: newUnit.gridY,
                    animStartTime: 0,
                    lastKnownGridX: newUnit.gridX,
                    lastKnownGridY: newUnit.gridY,
                    hasMovedThisTurn: isInitialSync ? !!newUnit.hasMovedThisTurn : ((serverTurnChanged && isMyTurn && newUnit.team === playerTeam) ? false : !!newUnit.hasMovedThisTurn)
                });
            });
        }

        if (hasActiveStalemate) {
            startStalemateSound();
        } else {
            stopStalemateSound();
        }
        
        isInitialSync = false;
        
        let blueName = match.blueUser || 'Blue Player';
        let redName = match.redUser || 'Red Player';
        let opponentIsAfk = playerTeam === 'blue' ? match.redAfk : match.blueAfk;

        let blueAvatar = match.blueAvatar;
        if (!blueAvatar || blueAvatar === '🤖') {
            const blueSnap = await get(ref(db, `game_presence/${blueName}`));
            if (blueSnap.exists() && blueSnap.val().avatar) {
                blueAvatar = blueSnap.val().avatar;
            } else {
                blueAvatar = localStorage.getItem(`chess_campaign_avatar_${blueName}`) || '🤖';
            }
        }

        let redAvatar = match.redAvatar;
        if (!redAvatar || redAvatar === '🤖') {
            const redSnap = await get(ref(db, `game_presence/${redName}`));
            if (redSnap.exists() && redSnap.val().avatar) {
                redAvatar = redSnap.val().avatar;
            } else {
                redAvatar = localStorage.getItem(`chess_campaign_avatar_${redName}`) || '🤖';
            }
        }

        let myName = playerTeam === 'blue' ? blueName : redName;
        let opponentName = playerTeam === 'blue' ? redName : blueName;

        const renderAvatarHTML = (avatar) => {
            if (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http'))) {
                return `<img src="${avatar}" style="width: 24px; height: 24px; min-width: 24px; min-height: 24px; aspect-ratio: 1/1; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 6px; border: 1px solid rgba(255,255,255,0.3);">`;
            }
            return `<span style="font-size: 1rem; vertical-align: middle; margin-right: 6px;">${avatar || '🤖'}</span>`;
        };

        if (match.status === 'ended') {
            stopStalemateSound();
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
        stopStalemateSound();
        hasHydratedFeeds = false;
        lastProcessedDeploymentTime = 0;
        lastProcessedArtilleryTime = 0;
        lastProcessedDestructionFeedLength = 0;
        lastProcessedMovementFeedLength = 0;
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
                : (localStorage.getItem(`chess_campaign_avatar_${currentUser}`) || localStorage.getItem('arena_chess_avatar') || '🤖');
            
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
            const msgAvatar = msg.avatar || '🤖';
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