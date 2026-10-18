// ui-auth.js - Handles Authentication, Chat, and Independent Game Presence (Targeted Reconnection Retries)
import { db, ref, onValue, push, set, query, orderByChild, limitToLast } from './network.js';

export let currentUser = localStorage.getItem('arena_chess_user') || null;
export let currentServerId = null;
export let currentMatchId = null;
export let playerTeam = null;
export let isLeavingDeliberately = false;

export function setCurrentUser(val) { currentUser = val; }
export function setCurrentServerId(val) { currentServerId = val; }
export function setCurrentMatchId(val) { currentMatchId = val; }
export function setPlayerTeam(val) { playerTeam = val; }
export function setIsLeavingDeliberately(val) { isLeavingDeliberately = val; }

export function logToConsole(msg) {
    const logs = document.getElementById('console-logs');
    if (!logs) return;
    const time = new Date().toLocaleTimeString();
    logs.innerHTML += `[${time}] ${msg}<br>`;
    logs.scrollTop = logs.scrollHeight;
}

export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        logToConsole(`Switched active screen to: ${screenId}`);
    } else {
        console.error(`Target screen not found: ${screenId}`);
    }
}

export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Attach retry functions globally so inline buttons can call them directly without a full page reload
window.retryActivePlayersLoad = function() {
    const container = document.getElementById('playersListContainer');
    if (container) container.dataset.loaded = "";
    listenToActivePlayers();
};

window.retryChatLoad = function() {
    const container = document.getElementById('globalChatMessages');
    if (container) container.dataset.loaded = "";
    listenToGlobalChat();
};

// FAST ACTIVE PLAYERS LISTENER WITH TARGETED RETRY
export function listenToActivePlayers() {
    const container = document.getElementById('playersListContainer');
    if (!container) return;

    if (!container.dataset.loaded) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.75rem;"><div class="inline-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.2); border-top-color:var(--secondary); border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></div>Loading active players...</div>`;
    }

    const timeoutId = setTimeout(() => {
        if (!container.dataset.loaded) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:10px;">Connection slow. <button onclick="window.retryActivePlayersLoad()" style="background:none; border:none; color:var(--secondary); cursor:pointer; text-decoration:underline; font-weight:bold; padding:0;">Retry</button></div>`;
        }
    }, 4000);

    const playersRef = ref(db, 'game_presence');
    onValue(playersRef, (snapshot) => {
        clearTimeout(timeoutId);
        const data = snapshot.val() || {};
        container.dataset.loaded = "true";

        let onlineCount = 0;
        let htmlContent = '';

        const localAvatar = localStorage.getItem(`chess_campaign_avatar_${currentUser}`) || localStorage.getItem('arena_chess_avatar') || '😀';
        const localFaction = localStorage.getItem('arena_chess_faction') || 'Order';
        const localRank = localStorage.getItem('arena_chess_rank') || 'Grandmarshall (1st Class 🌟🌟🌟)';

        for (let username in data) {
            const info = data[username];
            if (info && info.online === true) {
                onlineCount++;
                const isYou = username === currentUser ? ' (You)' : '';
                
                const avatar = info.avatar || (username === currentUser ? localAvatar : '😀');
                const faction = info.faction || (username === currentUser ? localFaction : 'Order');
                const rank = info.rank || (username === currentUser ? localRank : 'Grandmarshall (1st Class 🌟🌟🌟)');
                const factionColor = faction === 'Order' ? '#2ecc71' : '#e74c3c';

                const avatarHTML = (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http')))
                    ? `<img src="${avatar}" style="width: 28px; height: 28px; min-width: 28px; min-height: 28px; aspect-ratio: 1 / 1; border-radius: 50%; object-fit: cover;">`
                    : `<span style="font-size: 1.2rem;">${avatar}</span>`;

                htmlContent += `
                    <div class="player-card">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="player-avatar-wrapper">
                                ${avatarHTML}
                            </div>
                            <div>
                                <div><strong>${username}</strong>${isYou}</div>
                                <div style="font-size: 0.75rem; color: ${factionColor}; font-weight: 600;">${faction} • ${rank}</div>
                            </div>
                        </div>
                        <div class="player-badge-online"></div>
                    </div>
                `;
            }
        }

        container.innerHTML = onlineCount === 0 ? `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No players online</div>` : htmlContent;
        const onlineCountText = document.getElementById('onlineCountText');
        if (onlineCountText) onlineCountText.innerText = `Active Players (${onlineCount})`;
    }, { onlyOnce: false });
}

export function sendGlobalMessage() {
    const input = document.getElementById('globalChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser) return;

    input.value = '';

    const userAvatar = localStorage.getItem(`chess_campaign_avatar_${currentUser}`) || localStorage.getItem('arena_chess_avatar') || '😀';
    const userFaction = localStorage.getItem('arena_chess_faction') || 'Order';
    const userRank = localStorage.getItem('arena_chess_rank') || 'Grandmarshall (1st Class 🌟🌟🌟)';

    const chatRef = ref(db, 'arena_globalChat');
    push(chatRef, {
        sender: currentUser,
        avatar: userAvatar,
        faction: userFaction,
        rank: userRank,
        message: text,
        timestamp: Date.now()
    });
}

// FAST GLOBAL CHAT LISTENER WITH TARGETED RETRY
export function listenToGlobalChat() {
    const container = document.getElementById('globalChatMessages');
    if (!container) return;

    if (!container.dataset.loaded) {
        container.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.75rem;"><div class="inline-spinner" style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.2); border-top-color:var(--secondary); border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px; vertical-align:middle;"></div>Connecting chat...</div>`;
    }

    const timeoutId = setTimeout(() => {
        if (!container.dataset.loaded) {
            container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:10px;">Chat delayed. <button onclick="window.retryChatLoad()" style="background:none; border:none; color:var(--secondary); cursor:pointer; text-decoration:underline; font-weight:bold; padding:0;">Retry</button></div>`;
        }
    }, 4000);

    const chatRef = query(ref(db, 'arena_globalChat'), orderByChild('timestamp'), limitToLast(30));

    onValue(chatRef, (snapshot) => {
        clearTimeout(timeoutId);
        const data = snapshot.val() || {};
        container.dataset.loaded = "true";

        const values = Object.values(data);
        values.sort((a, b) => a.timestamp - b.timestamp);

        let chatHtml = '';
        values.forEach(msg => {
            if (!msg || typeof msg.message !== 'string') return;

            const msgAvatar = msg.avatar || '😀';
            const msgFaction = msg.faction || 'Order';
            const msgRank = msg.rank || 'Grandmarshall (1st Class 🌟🌟🌟)';
            const factionTagColor = msgFaction === 'Order' ? '#2ecc71' : '#e74c3c';

            const avatarHTML = (msgAvatar && (msgAvatar.startsWith('data:image/') || msgAvatar.startsWith('http')))
                ? `<img src="${msgAvatar}" class="chat-user-avatar" style="width: 26px; height: 26px; min-width: 26px; min-height: 26px; aspect-ratio: 1 / 1; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.25);">`
                : `<span class="chat-user-emoji" style="font-size: 1.2rem; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">${msgAvatar}</span>`;

            chatHtml += `
                <div class="global-chat-msg">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;">
                        ${avatarHTML}
                        <span style="color: ${factionTagColor}; font-size: 0.75rem; font-weight: 700;">[${msgFaction} • ${msgRank}]</span>
                        <span style="color: var(--secondary); font-weight: 600;">${msg.sender || 'Unknown'}:</span>
                    </div>
                    <div style="padding-left: 20px; word-break: break-word;">${escapeHtml(msg.message)}</div>
                </div>
            `;
        });

        container.innerHTML = chatHtml;
        container.scrollTop = container.scrollHeight;
    }, { onlyOnce: false });
}
