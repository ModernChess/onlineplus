// combat-mechanics.js - Main Combat Resolver Module importing auxiliary logic from combat-mechanics-2.js
import { isWaterTerrain } from './game-config.js';
import { 
    stalematedUnits, getUnitPower, areUnitsAdjacent, 
    planeVulnerableUnits, shipVulnerableUnits, artilleryVulnerableUnits, 
    antiairVulnerableUnits, mineLandVulnerableUnits, mineWaterVulnerableUnits, 
    infantryTankVulnerableUnits, getUnitMacroRangeTiles, 
    getSuperunitsForTeamBase, updateStalemates, getSuperunitsForTeam, getMultiUnitPowerMap 
} from './combat-mechanics-2.js';

export { stalematedUnits, getSuperunitsForTeam, getMultiUnitPowerMap, artilleryVulnerableUnits, getUnitMacroRangeTiles };

export let unitsToDestroy = [];

export function resolveCombat(unitsList, logCallback) {
    unitsToDestroy = [];
    let destroyedIds = new Set();

    updateStalemates(unitsList);

    // 1. General Macro-Square Range Detection Logging
    unitsList.forEach(unit => {
        let rangeTiles = getUnitMacroRangeTiles(unit);
        if (rangeTiles.length > 0) {
            let detectedUnits = [];
            rangeTiles.forEach(tile => {
                let found = unitsList.find(u => u.gridX === tile.c && u.gridY === tile.r);
                if (found && found.id !== unit.id) {
                    detectedUnits.push(`${found.name} (${found.team}) at [${tile.c}, ${tile.r}]`);
                }
            });
            if (detectedUnits.length > 0 && logCallback) {
                logCallback(`Macro Range Detection: ${unit.name} (${unit.team}) at [${unit.gridX}, ${unit.gridY}] detected units in macro boundary: ${detectedUnits.join(', ')}`);
            }
        }
    });

    // 2. Ship Ranged Combat Resolution
    let ships = unitsList.filter(u => u.name === 'Ship');
    ships.forEach(ship => {
        let rangeTiles = getUnitMacroRangeTiles(ship);
        rangeTiles.forEach(tile => {
            let enemy = unitsList.find(u => u.gridX === tile.c && u.gridY === tile.r && u.team !== ship.team);
            if (enemy && shipVulnerableUnits.has(enemy.name)) {
                if (!destroyedIds.has(enemy.id) && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                    destroyedIds.add(enemy.id);
                    unitsToDestroy.push({ 
                        unit: enemy, destroyedBy: 'Ship', attackerTeam: ship.team,
                        attackerX: ship.gridX, attackerY: ship.gridY,
                        reason: `Ship (${ship.team}) ranged-attacked and destroyed vulnerable enemy unit ${enemy.name} (${enemy.team})` 
                    });
                    if (logCallback) {
                        logCallback(`Combat! Ship (${ship.team}) shelled and destroyed enemy ${enemy.name} (${enemy.team}) within range!`);
                    }
                }
            }
        });
    });

    // 4. Anti-Air Ranged Combat Resolution
    let antiairs = unitsList.filter(u => {
        let normName = (u.name || '').toLowerCase().replace(/[\s-]/g, '');
        return normName === 'antiair';
    });
    
    antiairs.forEach(antiair => {
        let rangeTiles = getUnitMacroRangeTiles(antiair);
        rangeTiles.forEach(tile => {
            let enemy = unitsList.find(u => u.gridX === tile.c && u.gridY === tile.r && u.team !== antiair.team);
            if (enemy && antiairVulnerableUnits.has(enemy.name)) {
                if (!destroyedIds.has(enemy.id) && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                    destroyedIds.add(enemy.id);
                    unitsToDestroy.push({ 
                        unit: enemy, destroyedBy: 'Anti-Air', attackerTeam: antiair.team,
                        attackerX: antiair.gridX, attackerY: antiair.gridY,
                        reason: `Anti-Air (${antiair.team}) fired missiles and shot down enemy plane ${enemy.name} (${enemy.team}) within range` 
                    });
                    if (logCallback) {
                        logCallback(`Combat! Anti-Air (${antiair.team}) shot down enemy Plane (${enemy.team}) within range!`);
                    }
                }
            }
        });
    });

    // 5. Mine Ranged Combat Resolution
    let mines = unitsList.filter(u => u.name === 'Mine');
    mines.forEach(mine => {
        let isOnWater = isWaterTerrain(mine.gridX, mine.gridY);
        let activeVulnerableSet = isOnWater ? mineWaterVulnerableUnits : mineLandVulnerableUnits;

        let rangeTiles = getUnitMacroRangeTiles(mine);
        rangeTiles.forEach(tile => {
            let enemy = unitsList.find(u => u.gridX === tile.c && u.gridY === tile.r && u.team !== mine.team);
            if (enemy && activeVulnerableSet.has(enemy.name)) {
                if (!destroyedIds.has(enemy.id) && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                    destroyedIds.add(enemy.id);
                    unitsToDestroy.push({ 
                        unit: enemy, destroyedBy: 'Mine', attackerTeam: mine.team,
                        attackerX: mine.gridX, attackerY: mine.gridY,
                        reason: `Mine (${mine.team}) detonated on ${isOnWater ? 'water' : 'land'} and destroyed enemy unit ${enemy.name} (${enemy.team})` 
                    });
                    if (logCallback) {
                        logCallback(`Combat! Mine (${mine.team}) triggered on ${isOnWater ? 'water' : 'land'} and destroyed enemy ${enemy.name} (${enemy.team})!`);
                    }
                }
            }
        });
    });

    // 5.5 Engineer-to-Mine Adjacency Dismantling/Destruction
    let engineers = unitsList.filter(u => u.name === 'Engineer' && !u.stalemate && !stalematedUnits.has(u.id));
    engineers.forEach(engineer => {
        let enemyMines = unitsList.filter(u => u.name === 'Mine' && u.team !== engineer.team && !u.stalemate && !stalematedUnits.has(u.id));
        enemyMines.forEach(mine => {
            if (areUnitsAdjacent(engineer, mine)) {
                if (!destroyedIds.has(mine.id)) {
                    destroyedIds.add(mine.id);
                    unitsToDestroy.push({
                        unit: mine, destroyedBy: 'Engineer', attackerTeam: engineer.team,
                        attackerX: engineer.gridX, attackerY: engineer.gridY,
                        reason: `Engineer (${engineer.team}) adjacently dismantled/destroyed enemy Mine (${mine.team})`
                    });
                    if (logCallback) {
                        logCallback(`Combat! Engineer (${engineer.team}) dismantled and destroyed adjacent enemy Mine (${mine.team})!`);
                    }
                }
            }
        });
    });

    // 6. Plane Adjacent Combat Resolution
    let planes = unitsList.filter(u => u.name === 'Plane' && !u.stalemate && !stalematedUnits.has(u.id));
    planes.forEach(planeA => {
        let enemyUnits = unitsList.filter(u => u.team !== planeA.team);
        enemyUnits.forEach(enemy => {
            let isVulnerableGround = planeVulnerableUnits.has(enemy.name);
            let isEnemyPlane = enemy.name === 'Plane';

            if (isVulnerableGround && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                if (areUnitsAdjacent(planeA, enemy)) {
                    if (!destroyedIds.has(enemy.id)) {
                        destroyedIds.add(enemy.id);
                        unitsToDestroy.push({ 
                            unit: enemy, destroyedBy: 'Plane', attackerTeam: planeA.team,
                            attackerX: planeA.gridX, attackerY: planeA.gridY,
                            reason: `Plane (${planeA.team}) adjacently attacked and destroyed vulnerable enemy unit ${enemy.name} (${enemy.team})` 
                        });
                        if (logCallback) {
                            logCallback(`Combat! Plane (${planeA.team}) destroyed adjacent enemy ${enemy.name} (${enemy.team})!`);
                        }
                    }
                }
            } else if (isEnemyPlane && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                let planeB = enemy;
                if (areUnitsAdjacent(planeA, planeB)) {
                    if (!destroyedIds.has(planeA.id)) {
                        destroyedIds.add(planeA.id);
                        unitsToDestroy.push({ 
                            unit: planeA, destroyedBy: 'Plane Collision', attackerTeam: planeB.team,
                            attackerX: planeB.gridX, attackerY: planeB.gridY,
                            reason: `Plane (${planeA.team}) collided in dogfight with enemy Plane (${planeB.team}) causing mutual destruction` 
                        });
                    }
                    if (!destroyedIds.has(planeB.id)) {
                        destroyedIds.add(planeB.id);
                        unitsToDestroy.push({ 
                            unit: planeB, destroyedBy: 'Plane Collision', attackerTeam: planeA.team,
                            attackerX: planeA.gridX, attackerY: planeA.gridY,
                            reason: `Plane (${planeB.team}) collided in dogfight with enemy Plane (${planeA.team}) causing mutual destruction` 
                        });
                    }
                }
            }
        });
    });

    // 7. Superunit Equal-Power Locks & Superunit Combat
    let blueSuperunits = getSuperunitsForTeamBase('blue', unitsList);
    let redSuperunits = getSuperunitsForTeamBase('red', unitsList);

    blueSuperunits.forEach(suBlue => {
        redSuperunits.forEach(suRed => {
            let isAdjacent = suBlue.units.some(uB => suRed.units.some(uR => areUnitsAdjacent(uB, uR)));
            if (isAdjacent) {
                let blueReinforced = suBlue.units.some(u => !stalematedUnits.has(u.id) && !u.stalemate);
                let redReinforced = suRed.units.some(u => !stalematedUnits.has(u.id) && !u.stalemate);

                if (suBlue.stalemate || suRed.stalemate) {
                    if (blueReinforced && !redReinforced && suBlue.power !== suRed.power) {
                        suRed.units.forEach(u => {
                            if (!destroyedIds.has(u.id)) {
                                destroyedIds.add(u.id);
                                unitsToDestroy.push({
                                    unit: u, destroyedBy: 'Reinforced Superunit', attackerTeam: 'blue',
                                    attackerX: suBlue.units[0].gridX, attackerY: suBlue.units[0].gridY,
                                    reason: `Blue reinforcement broke stalemate and destroyed Red unit ${u.name}`
                                });
                            }
                        });
                        return;
                    } else if (redReinforced && !blueReinforced && suRed.power !== suBlue.power) {
                        suBlue.units.forEach(u => {
                            if (!destroyedIds.has(u.id)) {
                                destroyedIds.add(u.id);
                                unitsToDestroy.push({
                                    unit: u, destroyedBy: 'Reinforced Superunit', attackerTeam: 'red',
                                    attackerX: suRed.units[0].gridX, attackerY: suRed.units[0].gridY,
                                    reason: `Red reinforcement broke stalemate and destroyed Blue unit ${u.name}`
                                });
                            }
                        });
                        return;
                    }
                }

                if (suBlue.power > suRed.power) {
                    suRed.units.forEach(u => {
                        if (!destroyedIds.has(u.id) && !u.stalemate && !stalematedUnits.has(u.id)) {
                            destroyedIds.add(u.id);
                            unitsToDestroy.push({
                                unit: u, destroyedBy: 'Superunit Power', attackerTeam: 'blue',
                                attackerX: suBlue.units[0].gridX, attackerY: suBlue.units[0].gridY,
                                reason: `Blue superunit overpowered Red unit ${u.name}`
                            });
                        }
                    });
                } else if (suRed.power > suBlue.power) {
                    suBlue.units.forEach(u => {
                        if (!destroyedIds.has(u.id) && !u.stalemate && !stalematedUnits.has(u.id)) {
                            destroyedIds.add(u.id);
                            unitsToDestroy.push({
                                unit: u, destroyedBy: 'Superunit Power', attackerTeam: 'red',
                                attackerX: suRed.units[0].gridX, attackerY: suRed.units[0].gridY,
                                reason: `Red superunit overpowered Blue unit ${u.name}`
                            });
                        }
                    });
                }
            }
        });
    });

    // 8. Ship-to-Ship Adjacent Mutual Destruction Check
    let shipsList = unitsList.filter(u => u.name === 'Ship' && !u.stalemate && !stalematedUnits.has(u.id));
    shipsList.forEach(shipA => {
        let enemyShips = unitsList.filter(u => u.name === 'Ship' && u.team !== shipA.team && !u.stalemate && !stalematedUnits.has(u.id));
        enemyShips.forEach(shipB => {
            if (areUnitsAdjacent(shipA, shipB)) {
                if (!destroyedIds.has(shipA.id)) {
                    destroyedIds.add(shipA.id);
                    unitsToDestroy.push({ 
                        unit: shipA, destroyedBy: 'Ship Collision', attackerTeam: shipB.team,
                        attackerX: shipB.gridX, attackerY: shipB.gridY,
                        reason: `Ship (${shipA.team}) collided with enemy Ship` 
                    });
                }
                if (!destroyedIds.has(shipB.id)) {
                    destroyedIds.add(shipB.id);
                    unitsToDestroy.push({ 
                        unit: shipB, destroyedBy: 'Ship Collision', attackerTeam: shipA.team,
                        attackerX: shipA.gridX, attackerY: shipA.gridY,
                        reason: `Ship (${shipB.team}) collided with enemy Ship` 
                    });
                }
            }
        });
    });

    // 9. Infantry & Tank Adjacent Combat Resolution
    let infantryAndTanks = unitsList.filter(u => (u.name === 'Infantry' || u.name === 'Tank') && !u.stalemate && !stalematedUnits.has(u.id));
    infantryAndTanks.forEach(attacker => {
        let enemyUnits = unitsList.filter(u => u.team !== attacker.team);
        enemyUnits.forEach(enemy => {
            if (infantryTankVulnerableUnits.has(enemy.name)) {
                if (areUnitsAdjacent(attacker, enemy)) {
                    if (!destroyedIds.has(enemy.id) && !enemy.stalemate && !stalematedUnits.has(enemy.id)) {
                        destroyedIds.add(enemy.id);
                        unitsToDestroy.push({ 
                            unit: enemy, destroyedBy: attacker.name, attackerTeam: attacker.team,
                            attackerX: attacker.gridX, attackerY: attacker.gridY,
                            reason: `${attacker.name} (${attacker.team}) destroyed vulnerable enemy ${enemy.name} (${enemy.team})` 
                        });
                        if (logCallback) {
                            logCallback(`Combat! ${attacker.name} (${attacker.team}) engaged and destroyed adjacent enemy ${enemy.name} (${enemy.team})!`);
                        }
                    }
                }
            }
        });
    });

    return unitsToDestroy.length > 0;
}

export function processDestructions(unitsList) {
    if (unitsToDestroy.length === 0) return false;
    let targetIds = new Set(unitsToDestroy.map(item => item.unit.id));

    for (let i = unitsList.length - 1; i >= 0; i--) {
        if (targetIds.has(unitsList[i].id)) {
            let u = unitsList[i];
            stalematedUnits.delete(u.id);
            unitsList.splice(i, 1);
        }
    }
    updateStalemates(unitsList);
    return true;
}
