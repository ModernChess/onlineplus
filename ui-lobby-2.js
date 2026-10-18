// ui-lobby-2.js - Handles Lobby Loading Overlays, Event Listeners, and Active Match/Session Cache Helpers (Safe Fallback)
import { db, ref, set, get, update, remove, onValue, push, setupUserPresence } from './network.js';
import { startGameSession } from './game-engine.js';
import { spawnTeamUnits } from './game-config.js';
import { 
    currentUser, currentServerId, currentMatchId, playerTeam, isLeavingDeliberately,
    setCurrentUser, setCurrentServerId, setCurrentMatchId, setPlayerTeam, setIsLeavingDeliberately,
    logToConsole, showScreen, sendGlobalMessage 
} from './ui-auth.js';

let userActiveMatchCache = null; 
let isCheckingActiveMatch = false;

export function getUserActiveMatchCache() { return userActiveMatchCache; }
export function setUserActiveMatchCache(val) { userActiveMatchCache = val; }

export function getIsCheckingActiveMatch() { return isCheckingActiveMatch; }
export function setIsCheckingActiveMatch(val) { isCheckingActiveMatch = val; }

export function ensureLoadingOverlay() {
    let overlay = document.getElementById('globalLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalLoadingOverlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(10, 10, 12, 0.85); backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px); display: none; flex-direction: column;
            align-items: center; justify-content: center; z-index: 99999; color: #fff;
            font-family: 'Fredoka', sans-serif;
        `;
        overlay.innerHTML = `
            <div style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2); border-top-color: var(--secondary); border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 12px;"></div>
            <div id="loadingOverlayText" style="font-size: 0.9rem; font-weight: 700; letter-spacing: 0.5px;">Loading server data...</div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(overlay);
    }
    return overlay;
}

export function showLoadingOverlay(msg = "Loading match session...") {
    const overlay = ensureLoadingOverlay();
    document.getElementById('loadingOverlayText').innerText = msg;
    overlay.style.display = 'flex';
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

export async function backgroundCheckActiveMatch(loadServerListCallback) {
    if (!currentUser) return;
    isCheckingActiveMatch = true;
    
    if (loadServerListCallback) loadServerListCallback();

    try {
        const pointerSnap = await get(ref(db, `user_active_matches/${currentUser}`));
        if (!pointerSnap.exists()) {
            // Only clear if we didn't already have a valid cached match holding us over
            isCheckingActiveMatch = false;
            if (loadServerListCallback) loadServerListCallback();
            return;
        }

        const mId = pointerSnap.val();
        const matchSnap = await get(ref(db, `matches_plus/${mId}`));

        if (matchSnap.exists()) {
            const match = matchSnap.val();
            if (match && match.status === 'active') {
                userActiveMatchCache = { mId, match };
            } else {
                userActiveMatchCache = null;
                remove(ref(db, `user_active_matches/${currentUser}`));
            }
        }
    } catch (err) {
        console.error("Background session check failed, preserving existing cache if any:", err);
    }

    isCheckingActiveMatch = false;
    if (loadServerListCallback) loadServerListCallback();
}

export function listenToGlobalMatchesForTerminations(loadServerListCallback) {
    const matchesRef = ref(db, 'matches_plus');
    onValue(matchesRef, (snapshot) => {
        const matches = snapshot.val() || {};
        for (let mId in matches) {
            const match = matches[mId];
            if (match.status === 'ended') {
                if (userActiveMatchCache && userActiveMatchCache.mId === mId) {
                    userActiveMatchCache = null;
                    if (loadServerListCallback) loadServerListCallback();
                    logToConsole("Active match terminated. Rejoin option removed from server list.");
                }
            }
        }
    });
}

export function findServerIdForMatch(mId, callback) {
    const serversRef = ref(db, 'servers');
    get(serversRef).then((snapshot) => {
        const servers = snapshot.val() || {};
        let foundSId = null;
        for (let sId in servers) {
            if (servers[sId].matchId === mId) {
                foundSId = sId;
                break;
            }
        }
        if (callback) callback(foundSId);
    });
}

export async function leaveMatchCompletely(loadServerListCallback) {
    if (currentServerId) {
        remove(ref(db, `servers/${currentServerId}`));
    }
    if (currentUser) {
        await remove(ref(db, `user_active_matches/${currentUser}`));
    }
    setCurrentMatchId(null);
    setCurrentServerId(null);
    hideLoadingOverlay();
    showScreen('lobby-screen');
    userActiveMatchCache = null;
    if (loadServerListCallback) loadServerListCallback();
    logToConsole("Left active session screen.");
}
