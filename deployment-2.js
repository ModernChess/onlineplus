// deployment-2.js - Secondary deployment module containing configuration, rule maps, unit prices, and coordinate validation logic
import { 
    cols,
    rows,
    goldList, 
    bbcList, 
    rbcList, 
    redBasesList, 
    blueBasesList, 
    navList,
    artList,
    tList,
    isWaterTerrain 
} from './game-config.js';
import { tileCaptures, parseCoord } from './team-logic.js';

export let pendingUnitType = null;
export let isShopOpen = false;
export let latestUnitsRef = [];
export let teamCoinsRef = { blue: 0, red: 0 };
export let currentTeamRef = 'blue';

export let cachedValidDeploymentTiles = new Set();
export let lastCachedUnitType = null;
export let lastCachedTeam = null;

export const unitPrices = {
    infantry: 0.5,
    tank: 2,
    ship: 3,
    engineer: 3,
    antiair: 2,
    plane: 4,
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

export function setIsShopOpenVal(val) {
    isShopOpen = val;
}

export function toCoordSet(list) {
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

export const baseAndCoreList = [...redBasesList, ...blueBasesList, ...bbcList, ...rbcList].map(i => parseCoord(i)).filter(Boolean);

export const infantryAllowedTiles = new Set([...goldList.map(i => parseCoord(i)).filter(Boolean), ...baseAndCoreList]);
export const tankAndPlaneAllowedTiles = new Set([...toCoordSet(tList), ...baseAndCoreList]);
export const mineAllowedTiles = new Set([...infantryAllowedTiles, ...tankAndPlaneAllowedTiles]);

export const deploymentRules = {
    infantry: infantryAllowedTiles,
    tank: tankAndPlaneAllowedTiles,
    ship: toCoordSet(navList),
    plane: tankAndPlaneAllowedTiles,
    engineer: tankAndPlaneAllowedTiles,
    artillery: toCoordSet(artList),
    antiair: toCoordSet(artList),
    mine: mineAllowedTiles
};

export function normalizeType(unitType) {
    return (unitType || '').toLowerCase().replace(/[\s-]/g, '');
}

export function isBaseForTeam(coordKey, targetTeam) {
    const cleanKey = parseCoord(coordKey) || (coordKey || '').trim();
    if (targetTeam === 'blue') {
        return blueBasesList.some(b => parseCoord(b) === cleanKey) || bbcList.some(b => parseCoord(b) === cleanKey);
    } else {
        return redBasesList.some(b => parseCoord(b) === cleanKey) || rbcList.some(b => parseCoord(b) === cleanKey);
    }
}

export function isOwnedByTeam(tileInfo, targetTeam) {
    if (!tileInfo) return false;
    const owner = tileInfo.capturedBy || tileInfo.team || tileInfo.owner;
    return owner && owner.toLowerCase() === targetTeam.toLowerCase();
}

export function isTileValidForTeamInstant(coordKey, typeLower, targetTeam) {
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

export function precomputeValidDeploymentTiles(unitType, targetTeam) {
    cachedValidDeploymentTiles.clear();
    lastCachedUnitType = unitType;
    lastCachedTeam = targetTeam;

    if (!unitType) return;
    const typeLower = normalizeType(unitType);
    let candidateKeys = new Set();

    if (typeLower === 'mine') {
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

    candidateKeys.forEach(coordKey => {
        if (isTileValidForTeamInstant(coordKey, typeLower, targetTeam)) {
            cachedValidDeploymentTiles.add(coordKey);
        }
    });
}

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