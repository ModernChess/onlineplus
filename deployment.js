// deployment.js - Handles Unit Purchasing, Affordability Checks, and Grid Placement Logic for All Units
import { db, ref, update } from './network.js';
import { 
    cols,
    rows,
    goldList, 
    bbcList, 
    rbcList, 
    redBasesList, 
    blueBasesList, 
    teamNavySpawns,
    artList,
    tList,
    navList,
    isWaterTerrain 
} from './game-config.js';
import { tileCaptures, parseCoord } from './team-logic.js';
import { getUnitAtCoordinate } from './game-renderer.js';

let pendingUnitType = null;
let isShopOpen = false;
let latestUnitsRef = [];
let teamCoinsRef = { blue: 0, red: 0 };
let currentTeamRef = 'blue';

// Pre-computed cache of valid deployment tiles for the currently pending unit type and team
let cachedValidDeploymentTiles = new Set();
let lastCachedUnitType = null;
let lastCachedTeam = null;

// Price configuration mapping based on user requirements
const unitPrices = {
    infantry: 0.5,
    tank: 2,
    ship: 3,
    engineer: 3,
    antiair: 2,
    plane: 3,
    artillery: 3,
    mine: 3
};

export function setTeamCoinsRef(coinsObj) {
    teamCoinsRef = coinsObj;
}

export function setCurrentTeamRef(team) {
    currentTeamRef = team;
}

export function getTeamCoins() {
    return teamCoinsRef;
}

export function setDeploymentUnits(units) {
    if (Array.isArray(units)) {
        latestUnitsRef = units;
    }
}

export function getIsShopOpen() {
    return isShopOpen;
}

function toCoordSet(list) {
    const set = new Set();
    if (!list) return set;
    list.forEach(item => {
        const parsed = parseCoord(item);
        if (parsed) {
            set.add(parsed);
        } else if (typeof item === 'string' && item.includes(',')) {
            set.add(item.trim());
        }
    });
    return set;
}

const baseAndCoreList = [...redBasesList, ...blueBasesList, ...bbcList, ...rbcList].map(i => parseCoord(i)).filter(Boolean);

const infantryAllowedTiles = new Set([...goldList.map(i => parseCoord(i)).filter(Boolean), ...baseAndCoreList]);
const tankAndPlaneAllowedTiles = new Set([...toCoordSet(tList), ...baseAndCoreList]);
const mineAllowedTiles = new Set([...infantryAllowedTiles, ...tankAndPlaneAllowedTiles]);

const deploymentRules = {
    infantry: infantryAllowedTiles,
    tank: tankAndPlaneAllowedTiles,
    ship: toCoordSet(navList),
    plane: tankAndPlaneAllowedTiles,
    engineer: tankAndPlaneAllowedTiles,
    artillery: toCoordSet(artList),
    antiair: toCoordSet(artList),
    mine: mineAllowedTiles
};

// Helper to normalize unit type strings consistently (removes spaces and hyphens)
function normalizeType(unitType) {
    return (unitType || '').toLowerCase().replace(/[\s-]/g, '');
}

// Internal base check function
function isBaseForTeam(coordKey, targetTeam) {
    const cleanKey = parseCoord(coordKey) || (coordKey || '').trim();
    if (targetTeam === 'blue') {
        return blueBasesList.some(b => parseCoord(b) === cleanKey) || bbcList.some(b => parseCoord(b) === cleanKey);
    } else {
        return redBasesList.some(b => parseCoord(b) === cleanKey) || rbcList.some(b => parseCoord(b) === cleanKey);
    }
}

function isOwnedByTeam(tileInfo, targetTeam) {
    if (!tileInfo) return false;
    const owner = tileInfo.capturedBy || tileInfo.team || tileInfo.owner;
    return owner && owner.toLowerCase() === targetTeam.toLowerCase();
}

// Compute valid tiles ONCE when a unit is selected for purchase, storing them in a fast lookup set
export function precomputeValidDeploymentTiles(unitType, targetTeam) {
    cachedValidDeploymentTiles.clear();
    lastCachedUnitType = unitType;
    lastCachedTeam = targetTeam;

    if (!unitType) return;
    const typeLower = normalizeType(unitType);

    // 1. Gather candidate tiles based on unit type rules to avoid brute-forcing all 816 tiles unnecessarily
    let candidateKeys = new Set();

    if (typeLower === 'mine') {
        // Evaluate land sources + check Chebyshev distance for water sources
        let validLandTiles = [];
        for (let gx = 0; gx < cols; gx++) {
            for (let gy = 0; gy < rows; gy++) {
                let key = `${gx},${gy}`;
                if (!isWaterTerrain(gx, gy)) {
                    let tileInfo = tileCaptures[key];
                    if (isBaseForTeam(key, targetTeam) || ((goldList.includes(key) || tList.includes(key)) && isOwnedByTeam(tileInfo, targetTeam))) {
                        validLandTiles.push({ x: gx, y: gy });
                        candidateKeys.add(key);
                    }
                }
            }
        }
        // Add water tiles within Chebyshev distance of 3 from valid team land tiles
        validLandTiles.forEach(land => {
            for (let dc = -3; dc <= 3; dc++) {
                for (let dr = -3; dr <= 3; dr++) {
                    let nx = land.x + dc;
                    let ny = land.y + dr;
                    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && isWaterTerrain(nx, ny)) {
                        candidateKeys.add(`${nx},${ny}`);
                    }
                }
            }
        });
    } else {
        let allowed = deploymentRules[typeLower] || new Set();
        allowed.forEach(k => candidateKeys.add(k));
    }

    // 2. Filter candidates strictly through team ownership rules
    candidateKeys.forEach(coordKey => {
        if (isTileValidForTeamInstant(coordKey, typeLower, targetTeam)) {
            cachedValidDeploymentTiles.add(coordKey);
        }
    });
}

// Internal instant validation check using pre-gathered rules
function isTileValidForTeamInstant(coordKey, typeLower, targetTeam) {
    const cleanKey = parseCoord(coordKey) || (coordKey || '').trim();
    let [c, r] = cleanKey.split(',').map(Number);
    let tileInfo = tileCaptures[cleanKey] || tileCaptures[coordKey];

    if (typeLower === 'ship') {
        let isInNavList = navList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInNavList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'tank' || typeLower === 'plane' || typeLower === 'engineer') {
        if (isBaseForTeam(cleanKey, targetTeam)) return true;
        let isInTList = tList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInTList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'artillery' || typeLower === 'antiair') {
        let isInArtList = artList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInArtList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'infantry') {
        if (isBaseForTeam(cleanKey, targetTeam)) return true;
        let isInGoldList = goldList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInGoldList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'mine') {
        if (isBaseForTeam(cleanKey, targetTeam)) return true;
        let isInGoldList = goldList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        let isInTList = tList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        if ((isInGoldList || isInTList) && isOwnedByTeam(tileInfo, targetTeam)) return true;

        // Check Chebyshev water proximity
        if (!isNaN(c) && !isNaN(r) && isWaterTerrain(c, r)) {
            for (let dc = -3; dc <= 3; dc++) {
                for (let dr = -3; dr <= 3; dr++) {
                    let nx = c + dc;
                    let ny = r + dr;
                    if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !isWaterTerrain(nx, ny)) {
                        let nKey = `${nx},${ny}`;
                        let nInfo = tileCaptures[nKey];
                        if (isBaseForTeam(nKey, targetTeam) || ((goldList.includes(nKey) || tList.includes(nKey)) && isOwnedByTeam(nInfo, targetTeam))) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    return false;
}

// Ultra-fast O(1) check used by the renderer on every frame
export function isTileValidForTeam(coordKey, unitType, targetTeam) {
    const typeLower = normalizeType(unitType);
    const cleanKey = parseCoord(coordKey) || (coordKey || '').trim();

    if (lastCachedUnitType !== typeLower || lastCachedTeam !== targetTeam) {
        precomputeValidDeploymentTiles(unitType, targetTeam);
    }

    return cachedValidDeploymentTiles.has(cleanKey) || cachedValidDeploymentTiles.has(coordKey);
}

export function getPendingUnitType() {
    return pendingUnitType;
}

export function setPendingUnitType(type) {
    pendingUnitType = type;
    if (!type) {
        cachedValidDeploymentTiles.clear();
        lastCachedUnitType = null;
    }
}

export function ensureBuyUnitsModal(logToConsole, getCurrentUnits, getPlayerTeam, matchIdRef, updateHudCallback) {
    if (document.getElementById('buyUnitsModal')) return;

    const modal = document.createElement('div');
    modal.id = 'buyUnitsModal';
    modal.className = 'buy-units-modal-overlay';
    modal.innerHTML = `
        <div class="buy-units-modal-content">
            <div class="shop-header-row">
                <h3>Buy Units</h3>
                <button class="shop-close-btn" id="shopModalXBtn">&times;</button>
            </div>
            <div class="buy-units-list">
                <div class="buy-unit-item"><span>Infantry (${unitPrices.infantry} Coin)</span><button class="btn" data-type="infantry">Buy</button></div>
                <div class="buy-unit-item"><span>Tank (${unitPrices.tank} Coins)</span><button class="btn" data-type="tank">Buy</button></div>
                <div class="buy-unit-item"><span>Ship (${unitPrices.ship} Coins)</span><button class="btn" data-type="ship">Buy</button></div>
                <div class="buy-unit-item"><span>Plane (${unitPrices.plane} Coins)</span><button class="btn" data-type="plane">Buy</button></div>
                <div class="buy-unit-item"><span>Artillery (${unitPrices.artillery} Coins)</span><button class="btn" data-type="artillery">Buy</button></div>
                <div class="buy-unit-item"><span>Engineer (${unitPrices.engineer} Coins)</span><button class="btn" data-type="engineer">Buy</button></div>
                <div class="buy-unit-item"><span>Anti-Air (${unitPrices.antiair} Coin)</span><button class="btn" data-type="antiair">Buy</button></div>
                <div class="buy-unit-item"><span>Mine (${unitPrices.mine} Coins)</span><button class="btn" data-type="mine">Buy</button></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeShop = () => {
        modal.style.display = 'none';
        isShopOpen = false;
        const buyBtn = document.getElementById('buyUnitsBtn');
        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.classList.remove('btn-frozen');
        }
    };

    modal.querySelector('#shopModalXBtn').onclick = closeShop;

    modal.querySelectorAll('.buy-units-list button').forEach(button => {
        button.onclick = (e) => {
            const rawType = e.target.getAttribute('data-type');
            const typeLower = normalizeType(rawType);
            const activeTeam = (typeof getPlayerTeam === 'function') ? getPlayerTeam() : currentTeamRef;
            const currentCoins = teamCoinsRef[activeTeam] || 0;
            const cost = unitPrices[typeLower] || 1;

            if (currentCoins < cost) {
                logToConsole(`Purchase Declined: Team ${activeTeam} has ${currentCoins} coins. Unit costs ${cost} coins.`);
                alert(`Insufficient funds! You need at least ${cost} coins.`);
                return;
            }

            pendingUnitType = rawType;
            // Precompute valid tiles instantly upon selection so rendering is O(1) lightning fast
            precomputeValidDeploymentTiles(rawType, activeTeam);

            modal.style.display = 'none';
            isShopOpen = false;
            
            const buyBtn = document.getElementById('buyUnitsBtn');
            if (buyBtn) {
                buyBtn.disabled = false;
                buyBtn.classList.remove('btn-frozen');
            }

            logToConsole(`Purchased ${rawType} for ${cost} coin(s). Select a valid captured deployment tile.`);
            
            const resolvedUnits = (typeof getCurrentUnits === 'function' && getCurrentUnits().length > 0) 
                ? getCurrentUnits() 
                : (latestUnitsRef.length > 0 ? latestUnitsRef : (window.units || window.gameUnits || []));

            spawnUnitDeployerPopup(rawType, resolvedUnits, logToConsole, activeTeam);
        };
    });
}

export function spawnUnitDeployerPopup(unitType, units, logToConsole, playerTeam) {
    let existing = document.getElementById('unitDeployerPopup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'unitDeployerPopup';
    popup.className = 'unit-deployer-popup minimized';

    const typeLower = normalizeType(unitType);
    const targetTeam = playerTeam || currentTeamRef;
    const cost = unitPrices[typeLower] || 1;
    const validRowsList = [];

    if (cachedValidDeploymentTiles.size === 0) {
        precomputeValidDeploymentTiles(unitType, targetTeam);
    }

    cachedValidDeploymentTiles.forEach(coordKey => {
        let [c, r] = coordKey.split(',').map(Number);
        let occupyingUnit = getUnitAtCoordinate(c, r);
        let tileInfo = tileCaptures[coordKey];
        let displayTypeName = tileInfo ? tileInfo.type : (isWaterTerrain(c, r) ? 'water mine' : 'base');

        validRowsList.push({ 
            col: c, 
            row: r, 
            typeName: displayTypeName, 
            occupantName: occupyingUnit ? (occupyingUnit.name || occupyingUnit.type || 'Unit') : null 
        });
    });

    let listHtml = validRowsList.length > 0 
        ? validRowsList.map(t => {
            let occupantWarning = t.occupantName 
                ? `<br><span style="color: #ff5252; font-size: 11px; font-weight: bold;">Another unit (${t.occupantName}) is currently on this</span>` 
                : '';
            return `<div class="deployer-tile-row"><span>${t.typeName.toUpperCase()}</span> <b>[Col: ${t.col}, Row: ${t.row}]</b>${occupantWarning}</div>`;
        }).join('')
        : `<div class="deployer-tile-row"><span>No controlled/captured tiles available for your team!</span></div>`;

    popup.innerHTML = `
        <div class="unit-deployer-header">
            <span class="unit-deployer-title">Deploying: ${unitType.toUpperCase()} (${cost} Coin${cost > 1 ? 's' : ''})</span>
            <div class="unit-deployer-controls">
                <button class="deployer-ctrl-btn" id="deployerMinimizeBtn">+</button>
                <button class="deployer-ctrl-btn" id="deployerCancelBtn">&times; Cancel</button>
            </div>
        </div>
        <div class="unit-deployer-body" style="max-height: 250px; overflow-y: auto;">
            ${listHtml}
        </div>
    `;
    document.body.appendChild(popup);

    let minimized = true;
    popup.querySelector('#deployerMinimizeBtn').onclick = () => {
        minimized = !minimized;
        popup.classList.toggle('minimized', minimized);
        popup.querySelector('#deployerMinimizeBtn').innerText = minimized ? '+' : '_';
    };

    popup.querySelector('#deployerCancelBtn').onclick = () => {
        pendingUnitType = null;
        cachedValidDeploymentTiles.clear();
        popup.remove();
        logToConsole("Deployment cancelled. Re-opening shop.");
        
        const modal = document.getElementById('buyUnitsModal');
        if (modal) {
            modal.style.display = 'flex';
            isShopOpen = true;
            const buyBtn = document.getElementById('buyUnitsBtn');
            if (buyBtn) {
                buyBtn.disabled = true;
                buyBtn.classList.add('btn-frozen');
            }
        }
    };
}

export function cleanupUnitDeployerPopup() {
    let popup = document.getElementById('unitDeployerPopup');
    if (popup) popup.remove();
}

export function handleUnitDeployment(clickedCol, clickedRow, playerTeam, units, currentMatchId, logToConsole, teamCoinsObj, updateHudCallback) {
    if (!pendingUnitType) return false;

    const key = `${clickedCol},${clickedRow}`;

    if (!isTileValidForTeam(key, pendingUnitType, playerTeam)) {
        logToConsole(`Failed to deploy: Coordinates [${clickedCol}, ${clickedRow}] do not belong to team ${playerTeam}'s controlled or captured deployment tiles.`);
        return false;
    }

    const occupyingUnit = getUnitAtCoordinate(clickedCol, clickedRow);
    if (occupyingUnit) {
        logToConsole(`Failed to deploy: Coordinates [${clickedCol}, ${clickedRow}] are already occupied by another unit.`);
        return false;
    }

    const typeLower = normalizeType(pendingUnitType);
    const cost = unitPrices[typeLower] || 1;
    const coinsRefToUse = teamCoinsObj || teamCoinsRef;

    if ((coinsRefToUse[playerTeam] || 0) < cost) {
        logToConsole(`Deployment failed: Insufficient funds for team ${playerTeam}. Requires ${cost} coins.`);
        pendingUnitType = null;
        cachedValidDeploymentTiles.clear();
        return false;
    }

    coinsRefToUse[playerTeam] -= cost;
    if (typeof updateHudCallback === 'function') {
        updateHudCallback();
    }
    logToConsole(`Deducted ${cost} coin(s) from ${playerTeam}. Remaining balance: ${coinsRefToUse[playerTeam]}`);

    const activeUnits = (Array.isArray(units) && units.length > 0) ? units : latestUnitsRef;

    let unitTypeVal = 'land';
    let unitRange = 2;

    if (typeLower === 'ship') {
        unitTypeVal = 'naval';
        unitRange = 2; 
    } else if (typeLower === 'tank' || typeLower === 'plane') {
        unitTypeVal = typeLower === 'plane' ? 'air' : 'land';
        unitRange = typeLower === 'plane' ? 4 : 3;
    } else if (typeLower === 'engineer') {
        unitTypeVal = 'air';
        unitRange = 1;
    } else if (typeLower === 'artillery') {
        unitTypeVal = 'land';
        unitRange = 1;
    } else if (typeLower === 'antiair') {
        unitTypeVal = 'land';
        unitRange = 1;
    } else if (typeLower === 'mine') {
        unitTypeVal = isWaterTerrain(clickedCol, clickedRow) ? 'naval' : 'land';
        unitRange = 0;
    } else if (typeLower === 'infantry') {
        unitTypeVal = 'land';
        unitRange = 2;
    }

    let formattedName = pendingUnitType;
    if (typeLower === 'antiair') formattedName = 'Anti-Air';
    else if (typeLower === 'mine') formattedName = 'Mine';
    else formattedName = pendingUnitType.charAt(0).toUpperCase() + pendingUnitType.slice(1);

    const newUnit = {
        id: 'test_' + Math.random().toString(36).substring(2, 9),
        name: formattedName,
        type: unitTypeVal,
        range: unitRange,
        team: playerTeam,
        gridX: clickedCol,
        gridY: clickedRow,
        animFromX: clickedCol,
        animFromY: clickedRow,
        animStartTime: performance.now(),
        lastKnownGridX: clickedCol,
        lastKnownGridY: clickedRow,
        hp: 100
    };

    activeUnits.push(newUnit);
    logToConsole(`Placed new unit ${newUnit.name} at coordinates [${clickedCol}, ${clickedRow}]`);

    if (currentMatchId) {
        update(ref(db, `matches_plus/${currentMatchId}`), { 
            units: activeUnits,
            coins: coinsRefToUse 
        });
    }

    pendingUnitType = null;
    cachedValidDeploymentTiles.clear();
    return true;
}
