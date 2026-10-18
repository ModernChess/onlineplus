// combat-mechanics-2.js - Secondary combat logic containing unit power definitions, vulnerability flags, and superunit clustering rules
import { cols, rows, isWaterTerrain } from './game-config.js';
import { getUnitRange } from './unit-movement.js';

export let stalematedUnits = new Set();

export function getUnitPower(unit) {
    if (!unit) return 0;
    if (unit.name === 'Infantry') return 1;
    if (unit.name === 'Tank') return 2;
    return 0;
}

export function areUnitsAdjacent(u1, u2) {
    let colDiff = Math.abs(u1.gridX - u2.gridX);
    let rowDiff = Math.abs(u1.gridY - u2.gridY);
    return colDiff <= 1 && rowDiff <= 1 && !(colDiff === 0 && rowDiff === 0);
}

export const planeVulnerableUnits = new Set(['Tank', 'Infantry', 'Engineer', 'Artillery']);
export const shipVulnerableUnits = new Set(['Infantry', 'Tank', 'Anti-Air', 'Engineer', 'Artillery']);
export const artilleryVulnerableUnits = new Set(['Ship', 'Infantry', 'Tank', 'Anti-Air', 'Engineer', 'Artillery']);
export const antiairVulnerableUnits = new Set(['Plane']);
export const mineLandVulnerableUnits = new Set(['Tank', 'Infantry', 'Anti-Air', 'Artillery']);
export const mineWaterVulnerableUnits = new Set(['Ship']);
export const infantryTankVulnerableUnits = new Set(['Engineer', 'Artillery', 'Anti-Air']);

export function getUnitMacroRangeTiles(unit) {
    if (!unit) return [];
    
    let rangeVal = getUnitRange(unit);
    if (rangeVal <= 0) {
        if (unit.name === 'Mine') rangeVal = 3;
        else if (unit.name === 'Artillery') rangeVal = 2;
        else if (unit.name === 'Ship') rangeVal = 2;
        else if (unit.name === 'Anti-Air') rangeVal = 2;
        else if (unit.name === 'Engineer') rangeVal = 1;
    }
    
    if (rangeVal <= 0) return [];
    
    let tiles = [];
    let macroSize = 2;
    let unitMCol = Math.floor(unit.gridX / macroSize);
    let unitMRow = Math.floor(unit.gridY / macroSize);

    let directions = [
        { dc: 0, dr: -1 }, { dc: 0, dr: 1 },   
        { dc: -1, dr: 0 }, { dc: 1, dr: 0 },   
        { dc: -1, dr: -1 }, { dc: 1, dr: -1 }, 
        { dc: -1, dr: 1 }, { dc: 1, dr: 1 }
    ];

    let targetMacroSquares = new Set();

    directions.forEach(dir => {
        for (let step = 1; step <= rangeVal; step++) {
            let targetMCol = unitMCol + (dir.dc * step);
            let targetMRow = unitMRow + (dir.dr * step);

            let startGridX = targetMCol * macroSize;
            let startGridY = targetMRow * macroSize;

            if (startGridX < 0 || startGridX >= cols || startGridY < 0 || startGridY >= rows) {
                break;
            }

            targetMacroSquares.add(`${targetMCol},${targetMRow}`);
        }
    });

    targetMacroSquares.forEach(coordStr => {
        let [targetMCol, targetMRow] = coordStr.split(',').map(Number);
        let startGridX = targetMCol * macroSize;
        let startGridY = targetMRow * macroSize;
        let endGridX = Math.min(cols - 1, startGridX + macroSize - 1);
        let endGridY = Math.min(rows - 1, startGridY + macroSize - 1);

        for (let r = startGridY; r <= endGridY; r++) {
            for (let c = startGridX; c <= endGridX; c++) {
                tiles.push({ c, r });
            }
        }
    });

    return tiles;
}

export function getSuperunitsForTeamBase(teamName, allUnits) {
    let teamUnits = allUnits.filter(u => u.team === teamName);
    let combatUnits = teamUnits.filter(u => getUnitPower(u) > 0);
    let superunits = [];
    let visited = new Set();

    combatUnits.forEach(unit => {
        if (visited.has(unit)) return;
        let cluster = [];
        let queue = [unit];
        visited.add(unit);

        while (queue.length > 0) {
            let curr = queue.shift();
            cluster.push(curr);

            combatUnits.forEach(other => {
                if (!visited.has(other)) {
                    let touching = areUnitsAdjacent(curr, other);
                    let sharingEnemyBridge = false;
                    
                    if (!touching) {
                        sharingEnemyBridge = allUnits.some(enemy => 
                            enemy.team !== teamName && areUnitsAdjacent(curr, enemy) && areUnitsAdjacent(other, enemy)
                        );
                    }

                    if (touching || sharingEnemyBridge) {
                        visited.add(other);
                        queue.push(other);
                    }
                }
            });
        }

        let totalPower = cluster.reduce((sum, u) => sum + getUnitPower(u), 0);
        let isStalemate = cluster.some(u => u.stalemate || stalematedUnits.has(u.id));
        superunits.push({
            units: cluster,
            power: totalPower,
            team: teamName,
            stalemate: isStalemate
        });
    });

    return superunits;
}

export function updateStalemates(unitsList) {
    if (!unitsList) return;
    
    unitsList.forEach(u => {
        u.stalemate = false;
    });
    stalematedUnits.clear();

    let blueSuperunits = getSuperunitsForTeamBase('blue', unitsList);
    let redSuperunits = getSuperunitsForTeamBase('red', unitsList);

    blueSuperunits.forEach(suBlue => {
        redSuperunits.forEach(suRed => {
            let isAdjacent = suBlue.units.some(uB => suRed.units.some(uR => areUnitsAdjacent(uB, uR)));
            if (isAdjacent && suBlue.power === suRed.power) {
                suBlue.units.forEach(u => { u.stalemate = true; stalematedUnits.add(u.id); });
                suRed.units.forEach(u => { u.stalemate = true; stalematedUnits.add(u.id); });
            }
        });
    });
}

export function getSuperunitsForTeam(teamName, allUnits) {
    updateStalemates(allUnits);
    return getSuperunitsForTeamBase(teamName, allUnits);
}

export function getMultiUnitPowerMap(unitsList) {
    let powerMap = new Map();
    if (!unitsList) return powerMap;

    updateStalemates(unitsList);
    ['blue', 'red'].forEach(teamName => {
        let suList = getSuperunitsForTeamBase(teamName, unitsList);
        suList.forEach(su => {
            if (su.units && su.units.length > 0) {
                su.units.forEach(u => {
                    powerMap.set(u.id, su.power);
                });
            }
        });
    });

    return powerMap;
}