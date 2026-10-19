// ui-lobby-3.js - Handles Instant Server List Rendering, Match Actions, and Targeted Reconnection Retries
import { db, ref, set, get, update, remove, onValue, push } from './network.js';
import { startGameSession } from './game-engine.js';
import { spawnTeamUnits } from './game-config.js';
import { 
    currentUser, currentServerId, currentMatchId, playerTeam, isLeavingDeliberately,
    setCurrentServerId, setCurrentMatchId, setPlayerTeam, setIsLeavingDeliberately,
    logToConsole, showScreen 
} from './ui-auth.js';
import { 
    getUserActiveMatchCache, setUserActiveMatchCache, getIsCheckingActiveMatch, 
    showLoadingOverlay, hideLoadingOverlay, findServerIdForMatch, leaveMatchCompletely 
} from './ui-lobby-2.js';

function setCreateServerButtonState(disabled, label = "Create New Server") {
    const createServerBtn = document.getElementById('createServerBtn');
    if (createServerBtn) {
        createServerBtn.disabled = disabled;
        createServerBtn.innerText = label;
        createServerBtn.style.opacity = disabled ? '0.5' : '1';
        createServerBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }
}

window.retryServerListLoad = function() {
    loadServerList();
};

export function loadServerList() {
    const listEl = document.getElementById('serverList');
    if (!listEl) return;

    listEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
            <div style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--secondary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <span>Loading active sessions...</span>
        </div>
    `;

    const timeoutId = setTimeout(() => {
        if (listEl.innerHTML.includes('Loading active sessions...')) {
            listEl.innerHTML = `
                <div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding: 15px;">
                    Server connection delayed. <button onclick="window.retryServerListLoad()" style="background:none; border:none; color:var(--secondary); cursor:pointer; text-decoration:underline; font-weight:bold; padding:0;">Retry</button>
                </div>
            `;
        }
    }, 4000);

    const serversRef = ref(db, 'servers');
    const matchesRef = ref(db, 'matches_plus');
    
    // Listen to both servers and matches to track AFK states and live rooms simultaneously
    onValue(serversRef, (serverSnap) => {
        onValue(matchesRef, (matchSnap) => {
            clearTimeout(timeoutId);
            const serversData = serverSnap.val() || {};
            const matchesData = matchSnap.val() || {};
            renderServerListUI(serversData, matchesData);
        }, { onlyOnce: true });
    }, { onlyOnce: false });
}

function renderServerListUI(serversData, matchesData) {
    const listEl = document.getElementById('serverList');
    if (!listEl) return;
    
    const fragment = document.createDocumentFragment();
    let totalItemsCount = 0;
    const activeMatchCache = getUserActiveMatchCache();

    if (getIsCheckingActiveMatch()) {
        setCreateServerButtonState(true, "Verifying Session...");
        totalItemsCount++;
        const loadingItem = document.createElement('div');
        loadingItem.className = 'server-item';
        loadingItem.style.borderLeft = '3px solid var(--secondary)';
        loadingItem.innerHTML = `
            <span style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--secondary); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                Verifying active session...
            </span>
        `;
        fragment.appendChild(loadingItem);
    } else {
        setCreateServerButtonState(!!activeMatchCache, activeMatchCache ? "Active Match Exists" : "Create New Server");

        if (activeMatchCache) {
            totalItemsCount++;
            const { mId, match } = activeMatchCache;
            const isBlue = match.blueUser === currentUser;
            const opponentName = isBlue ? match.redUser : match.blueUser;

            const activeCard = document.createElement('div');
            activeCard.className = 'server-item';
            activeCard.style.borderLeft = '3px solid #27ae60';
            activeCard.style.background = 'rgba(39, 174, 96, 0.08)';
            activeCard.innerHTML = `
                <span>Ongoing Match vs <strong>${opponentName}</strong> (<strong style="color: #27ae60;">Ready to Rejoin</strong>)</span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-primary" onclick="window.rejoinActiveMatchFromList('${mId}')" style="background-color: #27ae60; padding: 5px 10px; font-size: 0.75rem;">Rejoin</button>
                    <button class="btn btn-secondary" onclick="window.terminateActiveMatchFromList('${mId}')" style="background-color: #c0392b; padding: 5px 10px; font-size: 0.75rem;">Terminate</button>
                </div>
            `;
            fragment.appendChild(activeCard);
        }
    }

    // 1. Render Waiting Servers
    for (let sId in serversData) {
        const server = serversData[sId];
        if (server.status !== 'waiting') continue;

        totalItemsCount++;
        const item = document.createElement('div');
        item.className = 'server-item';
        item.innerHTML = `
            <span>Host: <strong>${server.host}</strong> (Waiting for opponent)</span>
            <button class="btn btn-secondary" onclick="window.joinServer('${sId}')">Join Match</button>
        `;
        fragment.appendChild(item);
    }

    // 2. Render Public Ongoing Matches (with AFK indicators for others)
    for (let mId in matchesData) {
        const match = matchesData[mId];
        if (!match || match.status !== 'active') continue;

        // Skip if this is the current user's own active match (since it's already rendered above at the top)
        if (activeMatchCache && activeMatchCache.mId === mId) continue;

        totalItemsCount++;
        const blueAfk = match.blueAfk ? `<span style="color: #e74c3c; font-weight: bold;">[${match.blueUser} AFK]</span>` : '';
        const redAfk = match.redAfk ? `<span style="color: #e74c3c; font-weight: bold;">[${match.redUser} AFK]</span>` : '';
        const afkStatusText = (blueAfk || redAfk) ? ` ${blueAfk} ${redAfk}` : '<span style="color: #27ae60;">(Live)</span>';

        const item = document.createElement('div');
        item.className = 'server-item';
        item.style.borderLeft = '3px solid #f39c12';
        item.innerHTML = `
            <span>Match: <strong>${match.blueUser}</strong> vs <strong>${match.redUser}</strong>${afkStatusText}</span>
            <span style="font-size: 0.75rem; color: #f39c12; font-weight: 600; padding: 4px 8px; background: rgba(243, 156, 18, 0.1); border-radius: 4px;">Ongoing</span>
        `;
        fragment.appendChild(item);
    }

    listEl.innerHTML = '';
    if (totalItemsCount === 0) {
        listEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:20px;">No servers active. <button onclick="window.retryServerListLoad()" style="background:none; border:none; color:var(--secondary); cursor:pointer; text-decoration:underline; font-weight:bold; padding:0;">Refresh</button></div>`;
    } else {
        listEl.appendChild(fragment);
    }
}

window.rejoinActiveMatchFromList = async function(mId) {
    showLoadingOverlay("Rejoining active match...");
    setCurrentMatchId(mId);

    try {
        const snapshot = await get(ref(db, `matches_plus/${mId}`));
        const match = snapshot.val();
        if (!match) {
            hideLoadingOverlay();
            alert("Match no longer exists.");
            setUserActiveMatchCache(null);
            setCreateServerButtonState(false, "Create New Server");
            loadServerList();
            return;
        }

        const isUserBlue = match.blueUser === currentUser;
        setPlayerTeam(isUserBlue ? 'blue' : 'red');

        const afkField = isUserBlue ? 'blueAfk' : 'redAfk';
        update(ref(db, `matches_plus/${mId}`), { [afkField]: false });

        findServerIdForMatch(mId, (sId) => {
            if (sId) setCurrentServerId(sId);
            hideLoadingOverlay();
            startGameSession(mId, isUserBlue ? 'blue' : 'red', currentUser, async () => {
                setIsLeavingDeliberately(true);
                await leaveMatchCompletely(loadServerList);
            });
        });
    } catch (err) {
        hideLoadingOverlay();
        console.error("Rejoin error:", err);
    }
};

window.terminateActiveMatchFromList = async function(mId) {
    if (!confirm("Are you sure you want to terminate this ongoing match?")) return;
    showLoadingOverlay("Terminating match...");

    try {
        const snapshot = await get(ref(db, `matches_plus/${mId}`));
        const match = snapshot.val();
        if (match) {
            const isBlue = match.blueUser === currentUser;
            update(ref(db, `matches_plus/${mId}`), { status: 'ended', winner: isBlue ? 'red' : 'blue' });
            if (match.blueUser) remove(ref(db, `user_active_matches/${match.blueUser}`));
            if (match.redUser) remove(ref(db, `user_active_matches/${match.redUser}`));
        }

        findServerIdForMatch(mId, (sId) => {
            if (sId) remove(ref(db, `servers/${sId}`));
            hideLoadingOverlay();
        });

        setUserActiveMatchCache(null);
        setCreateServerButtonState(false, "Create New Server");
        loadServerList();
        logToConsole("Terminated active match from lobby list.");
    } catch (err) {
        hideLoadingOverlay();
        console.error("Termination error:", err);
    }
};

window.joinServer = async function(sId) {
    if (!currentUser) return;
    showLoadingOverlay("Joining match server...");
    setIsLeavingDeliberately(false);
    setCurrentServerId(sId);
    const serverRef = ref(db, `servers/${sId}`);

    try {
        const snapshot = await get(serverRef);
        let server = snapshot.val();

        if (!server || server.status !== 'waiting') {
            hideLoadingOverlay();
            alert("This server is no longer available.");
            loadServerList();
            return;
        }

        const matchesRef = ref(db, 'matches_plus');
        const newMatchRef = push(matchesRef);
        const mId = newMatchRef.key;
        setCurrentMatchId(mId);

        let initialUnits = [];
        spawnTeamUnits('blue', initialUnits);
        spawnTeamUnits('red', initialUnits);

        await Promise.all([
            set(newMatchRef, {
                blueUser: server.host,
                redUser: currentUser,
                blueAvatar: '😀',
                redAvatar: '😀',
                turn: 'blue',
                status: 'active',
                units: initialUnits,
                blueAfk: false,
                redAfk: false
            }),
            update(serverRef, {
                guest: currentUser,
                status: 'playing',
                matchId: mId
            }),
            set(ref(db, `user_active_matches/${server.host}`), mId),
            set(ref(db, `user_active_matches/${currentUser}`), mId)
        ]);

        hideLoadingOverlay();
        setPlayerTeam('red');
        logToConsole(`Joined server ${sId}. Match ID: ${mId}`);
        startGameSession(mId, 'red', currentUser, async () => {
            setIsLeavingDeliberately(true);
            await leaveMatchCompletely(loadServerList);
        });
    } catch (err) {
        hideLoadingOverlay();
        console.error("Failed to join server:", err);
        alert("Network error while joining server. Please try again.");
    }
};
