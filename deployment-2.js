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
    artillery: 3
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
export const tankAllowedTiles = new Set([...toCoordSet(tList), ...baseAndCoreList]);

export const deploymentRules = {
    infantry: infantryAllowedTiles,
    tank: tankAllowedTiles,
    ship: toCoordSet(navList),
    artillery: new Set(baseAndCoreList) // Artillery restricted to base squares only
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
    let tileInfo = tileCaptures[cleanKey] || tileCaptures[coordKey];

    if (typeLower === 'ship') {
        let isInNavList = navList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInNavList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'tank') {
        if (isBaseForTeam(cleanKey, targetTeam)) return true;
        let isInTList = tList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInTList && isOwnedByTeam(tileInfo, targetTeam);
    }

    if (typeLower === 'artillery') {
        // Artillery spawns at base squares only for the team
        return isBaseForTeam(cleanKey, targetTeam);
    }

    if (typeLower === 'infantry') {
        if (isBaseForTeam(cleanKey, targetTeam)) return true;
        let isInGoldList = goldList.some(k => parseCoord(k) === cleanKey || k.trim() === coordKey);
        return isInGoldList && isOwnedByTeam(tileInfo, targetTeam);
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

    let allowed = deploymentRules[typeLower] || new Set();
    allowed.forEach(k => candidateKeys.add(k));

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
