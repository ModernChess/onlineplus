// ui-lobby.js - Handles Lobby Entry, Authentication Cache, and Core Event Listeners (Optimized for Ultra-Fast Loading)
import { db, ref, set, get, update, remove, push, onValue, setupUserPresence } from './network.js';
import { startGameSession } from './game-engine.js';
import { initNetworkMonitor } from './network-monitor.js';
import { 
    currentUser, currentServerId, currentMatchId, playerTeam, isLeavingDeliberately,
    setCurrentUser, setCurrentServerId, setCurrentMatchId, setPlayerTeam, setIsLeavingDeliberately,
    logToConsole, showScreen, listenToActivePlayers, listenToGlobalChat, sendGlobalMessage 
} from './ui-auth.js';
import { 
    showLoadingOverlay, hideLoadingOverlay, backgroundCheckActiveMatch, 
    listenToGlobalMatchesForTerminations, leaveMatchCompletely 
} from './ui-lobby-2.js';
import { loadServerList } from './ui-lobby-3.js';
import { compressImageToThumbnail } from './image-compressor.js';

export function initLobbyModule() {
    initEventListeners();
    checkCachedSession();
    listenToActivePlayers();
    listenToGlobalChat();
    listenToGlobalMatchesForTerminations(loadServerList);
    initNetworkMonitor();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'none';
        logoutBtn.disabled = true;
    }

    const adminClearBtn = document.getElementById('adminClearBtn');
    if (adminClearBtn) {
        const savedUser = localStorage.getItem('arena_chess_user');
        if (savedUser && savedUser.toLowerCase() === 'testaccount3') {
            adminClearBtn.style.display = 'block';
        } else {
            adminClearBtn.style.display = 'none';
        }
    }

    const clearConsoleBtn = document.getElementById('clearConsole');
    if (clearConsoleBtn) {
        clearConsoleBtn.addEventListener('click', () => {
            const logs = document.getElementById('console-logs');
            if (logs) logs.innerHTML = '';
        });
    }

    window.addEventListener('beforeunload', () => {
        if (currentUser && currentMatchId && !isLeavingDeliberately) {
            const afkField = playerTeam === 'blue' ? 'blueAfk' : 'redAfk';
            try {
                update(ref(db, `matches_plus/${currentMatchId}`), { [afkField]: true });
            } catch (err) {
                console.error("Failed to update AFK status on unload:", err);
            }
        }

        if (currentServerId && !currentMatchId) {
            try {
                remove(ref(db, `servers/${currentServerId}`));
            } catch (err) {
                console.error("Failed to remove waiting server on unload:", err);
            }
        }
    });
}

async function checkCachedSession() {
    const savedUser = localStorage.getItem('arena_chess_user');
    
    if (savedUser) {
        setCurrentUser(savedUser);
        logToConsole(`Auto-logged in via home cache as: ${savedUser}`);
        
        // Render UI instantly from local cache before background checks finish
        showScreen('lobby-screen');
        loadServerList();
        backgroundCheckActiveMatch(loadServerList); 

        setupUserPresence(savedUser);
        
        let rawAvatar = localStorage.getItem(`chess_campaign_avatar_${savedUser}`) || localStorage.getItem(`arena_chess_avatar_${savedUser}`) || localStorage.getItem('arena_chess_avatar') || '😀';
        const faction = localStorage.getItem('arena_chess_faction') || 'Order';
        const rank = localStorage.getItem('arena_chess_rank') || 'Grandmarshall (1st Class 🌟🌟🌟)';
        const factionColor = faction === 'Order' ? 'var(--secondary)' : 'var(--accent)';
        
        const welcomeUser = document.getElementById('welcomeUser');
        if (welcomeUser) {
            const avatarHTML = (rawAvatar && (rawAvatar.startsWith('data:image/') || rawAvatar.startsWith('http')))
                ? `<img src="${rawAvatar}" style="width: 26px; height: 26px; min-width: 26px; min-height: 26px; aspect-ratio: 1 / 1; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 4px;">`
                : `<span style="font-size: 1.1rem; margin-right: 4px; vertical-align: middle;">${rawAvatar}</span>`;

            welcomeUser.innerHTML = `${avatarHTML} <span style="color: ${factionColor}; font-weight: 600;">[${faction} • ${rank}]</span> Logged in as: <strong>${savedUser}</strong>`;
        }
        
        const adminClearBtn = document.getElementById('adminClearBtn');
        if (adminClearBtn) {
            adminClearBtn.style.display = (savedUser.toLowerCase() === 'testaccount3') ? 'block' : 'none';
        }

        // Asynchronously compress/cache avatar in background without blocking UI render
        compressImageToThumbnail(rawAvatar, 64, 64, 0.5).then(avatar => {
            if (avatar !== rawAvatar) {
                localStorage.setItem(`chess_campaign_avatar_${savedUser}`, avatar);
            }
        }).catch(err => console.error("Avatar compression background task failed:", err));

    } else {
        logToConsole("No active session in cache. Showing login screen.");
        showScreen('login-screen');
    }
}

function initEventListeners() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const u = document.getElementById('userInput').value.trim();
            const p = document.getElementById('passInput').value.trim();
            const err = document.getElementById('loginError');

            if (!u || p !== '123') {
                if (err) err.innerText = "Invalid username or password!";
                logToConsole(`Login failed for username: ${u}`);
                return;
            }
            if (err) err.innerText = "";
            setCurrentUser(u);

            localStorage.setItem('arena_chess_user', u);
            setupUserPresence(u);

            showScreen('lobby-screen');
            loadServerList();
            backgroundCheckActiveMatch(loadServerList); 
            
            let rawAvatar = localStorage.getItem(`chess_campaign_avatar_${u}`) || localStorage.getItem(`arena_chess_avatar_${u}`) || localStorage.getItem('arena_chess_avatar') || '😀';
            const faction = localStorage.getItem('arena_chess_faction') || 'Order';
            const rank = localStorage.getItem('arena_chess_rank') || 'Grandmarshall (1st Class 🌟🌟🌟)';
            const factionColor = faction === 'Order' ? 'var(--secondary)' : 'var(--accent)';
            
            const welcomeUser = document.getElementById('welcomeUser');
            if (welcomeUser) {
                const avatarHTML = (rawAvatar && (rawAvatar.startsWith('data:image/') || rawAvatar.startsWith('http')))
                    ? `<img src="${rawAvatar}" style="width: 26px; height: 26px; min-width: 26px; min-height: 26px; aspect-ratio: 1 / 1; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 4px;">`
                    : `<span style="font-size: 1.1rem; margin-right: 4px; vertical-align: middle;">${rawAvatar}</span>`;

                welcomeUser.innerHTML = `${avatarHTML} <span style="color: ${factionColor}; font-weight: 600;">[${faction} • ${rank}]</span> Logged in as: <strong>${u}</strong>`;
            }
            
            const adminClearBtn = document.getElementById('adminClearBtn');
            if (adminClearBtn) {
                adminClearBtn.style.display = (u.toLowerCase() === 'testaccount3') ? 'block' : 'none';
            }

            logToConsole(`User ${u} logged in successfully.`);

            compressImageToThumbnail(rawAvatar, 64, 64, 0.5).then(avatar => {
                if (avatar !== rawAvatar) {
                    localStorage.setItem(`chess_campaign_avatar_${u}`, avatar);
                }
            }).catch(err => console.error("Avatar compression background task failed:", err));
        });
    }

    const createServerBtn = document.getElementById('createServerBtn');
    if (createServerBtn) createServerBtn.addEventListener('click', createNewServer);

    const cancelRoomBtn = document.getElementById('cancelRoomBtn');
    if (cancelRoomBtn) {
        cancelRoomBtn.addEventListener('click', () => {
            if (currentServerId) {
                remove(ref(db, `servers/${currentServerId}`));
                setCurrentServerId(null);
            }
            hideLoadingOverlay();
            showScreen('lobby-screen');
            logToConsole("Server creation canceled. Returned to lobby.");
        });
    }

    const globalChatSend = document.getElementById('globalChatSend');
    if (globalChatSend) globalChatSend.addEventListener('click', sendGlobalMessage);
    
    const globalChatInput = document.getElementById('globalChatInput');
    if (globalChatInput) {
        globalChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendGlobalMessage();
        });
    }

    const adminClearBtn = document.getElementById('adminClearBtn');
    if (adminClearBtn) {
        adminClearBtn.addEventListener('click', () => {
            if (!currentUser || currentUser.toLowerCase() !== 'testaccount3') {
                alert("Unauthorized action.");
                return;
            }
            if (confirm("Admin: Clear all active servers and matches?")) {
                remove(ref(db, 'servers'));
                remove(ref(db, 'matches_plus'));
                remove(ref(db, 'user_active_matches'));
                logToConsole("Admin cleared all servers, matches, and pointers.");
            }
        });
    }
}

function createNewServer() {
    if (!currentUser) return;
    
    const createServerBtn = document.getElementById('createServerBtn');
    if (createServerBtn) {
        createServerBtn.disabled = true;
        createServerBtn.innerText = "Creating Server...";
    }
    
    setIsLeavingDeliberately(false);
    
    const serversRef = ref(db, 'servers');
    const newServerRef = push(serversRef);
    setCurrentServerId(newServerRef.key);

    set(newServerRef, {
        host: currentUser,
        guest: null,
        status: 'waiting',
        createdAt: Date.now()
    }).then(() => {
        if (createServerBtn) {
            createServerBtn.disabled = false;
            createServerBtn.innerText = "Create New Server";
        }
        
        logToConsole(`Created server ID: ${currentServerId} by host ${currentUser} (Ready for opponents)`);
        
        const roomCodeDisplay = document.getElementById('roomCodeDisplay');
        if (roomCodeDisplay) roomCodeDisplay.innerText = `Server ID: ${currentServerId}`;
        
        showScreen('wait-screen');
    }).catch((err) => {
        if (createServerBtn) {
            createServerBtn.disabled = false;
            createServerBtn.innerText = "Create New Server";
        }
        console.error("Failed to create server:", err);
        logToConsole("Error: Failed to initialize server room.");
    });

    onValue(newServerRef, async (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === 'playing' && data.matchId) {
            setCurrentMatchId(data.matchId);
            setPlayerTeam('blue');

            await set(ref(db, `user_active_matches/${currentUser}`), data.matchId);

            startGameSession(data.matchId, 'blue', currentUser, async () => {
                setIsLeavingDeliberately(true);
                await leaveMatchCompletely(loadServerList);
            });
        }
    });
}
