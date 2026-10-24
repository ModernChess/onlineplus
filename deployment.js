// deployment.js - Handles Unit Purchasing and Deployment (Preserving standard unit names for combat compatibility)
import { db, ref, update, push } from './network.js';
import { 
    isWaterTerrain 
} from './game-config.js';
import { tileCaptures } from './team-logic.js';
import { getUnitAtCoordinate } from './game-renderer.js';
import { 
    pendingUnitType, isShopOpen, latestUnitsRef, teamCoinsRef, currentTeamRef,
    cachedValidDeploymentTiles, unitPrices, setTeamCoinsRef, setCurrentTeamRef, 
    getTeamCoins, setDeploymentUnits, getIsShopOpen, setIsShopOpenVal, 
    normalizeType, precomputeValidDeploymentTiles, isTileValidForTeam, 
    getPendingUnitType, setPendingUnitType 
} from './deployment-2.js';
import { getSyncedNow } from './game-engine-2.js';
import { triggerDeploymentAlert } from './game-renderer.js';

export { setTeamCoinsRef, setCurrentTeamRef, getTeamCoins, setDeploymentUnits, getIsShopOpen, isTileValidForTeam, getPendingUnitType, setPendingUnitType };

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
                <div class="buy-unit-item"><span>Infantry (${unitPrices.infantry} Coin)</span><button class="btn primary-btn" data-type="infantry">Buy</button></div>
                <div class="buy-unit-item"><span>Tank (${unitPrices.tank} Coins)</span><button class="btn primary-btn" data-type="tank">Buy</button></div>
                <div class="buy-unit-item"><span>Ship (${unitPrices.ship} Coins)</span><button class="btn primary-btn" data-type="ship">Buy</button></div>
                <div class="buy-unit-item"><span>Artillery (${unitPrices.artillery} Coins)</span><button class="btn primary-btn" data-type="artillery">Buy</button></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeShop = () => {
        modal.style.display = 'none';
        setIsShopOpenVal(false);
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

            setPendingUnitType(rawType);
            precomputeValidDeploymentTiles(rawType, activeTeam);

            modal.style.display = 'none';
            setIsShopOpenVal(false);
            
            const buyBtn = document.getElementById('buyUnitsBtn');
            if (buyBtn) {
                buyBtn.disabled = false;
                buyBtn.classList.remove('btn-frozen');
            }

            logToConsole(`Purchased ${rawType} for ${cost} coin(s). Select a valid base/deployment tile.`);
            
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
                ? `<br><span style="color: #ff5252; font-size: 10px; font-weight: bold;">Occupied by (${t.occupantName})</span>` 
                : '';
            return `<div class="deployer-tile-row"><span>${t.typeName.toUpperCase()}</span> <b>[Col: ${t.col}, Row: ${t.row}]</b>${occupantWarning}</div>`;
        }).join('')
        : `<div class="deployer-tile-row"><span>No valid deployment tiles available!</span></div>`;

    popup.innerHTML = `
        <div class="unit-deployer-header">
            <span class="unit-deployer-title">Deploying: ${unitType.toUpperCase()} (${cost} Coin${cost > 1 ? 's' : ''})</span>
            <div class="unit-deployer-controls">
                <button class="deployer-ctrl-btn" id="deployerMinimizeBtn">+</button>
                <button class="deployer-ctrl-btn" id="deployerCancelBtn">&times;</button>
            </div>
        </div>
        <div class="unit-deployer-body">
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
        setPendingUnitType(null);
        cachedValidDeploymentTiles.clear();
        popup.remove();
        logToConsole("Deployment cancelled. Re-opening shop.");
        
        const modal = document.getElementById('buyUnitsModal');
        if (modal) {
            modal.style.display = 'flex';
            setIsShopOpenVal(true);
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
        setPendingUnitType(null);
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
    } else if (typeLower === 'tank') {
        unitTypeVal = 'land';
        unitRange = 3;
    } else if (typeLower === 'artillery') {
        unitTypeVal = 'land';
        unitRange = 1;
    } else if (typeLower === 'infantry') {
        unitTypeVal = 'land';
        unitRange = 2;
    }

    // Keep standard name for combat logic compatibility, count type quantity for ordinal badge index
    let formattedName = pendingUnitType.charAt(0).toUpperCase() + pendingUnitType.slice(1);
    let countOfType = activeUnits.filter(u => u.team === playerTeam && normalizeType(u.name).includes(typeLower)).length + 1;
    
    let deploymentTimestamp = getSyncedNow();

    const newUnit = {
        id: 'test_' + Math.random().toString(36).substring(2, 9),
        name: formattedName,             // Standard name ("Infantry", "Tank", etc.) for destructions & rules
        divisionNumber: countOfType,     // Sequential number index for renderer badge (1, 2, 3...)
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
    logToConsole(`Placed new unit ${newUnit.name} (#${newUnit.divisionNumber}) at coordinates [${clickedCol}, ${clickedRow}]`);

    triggerDeploymentAlert(clickedCol, clickedRow, playerTeam);

    cleanupUnitDeployerPopup();

    if (currentMatchId) {
        update(ref(db, `matches_plus/${currentMatchId}`), { 
            units: activeUnits,
            coins: coinsRefToUse,
            lastDeployment: {
                x: clickedCol,
                y: clickedRow,
                team: playerTeam,
                timestamp: deploymentTimestamp
            }
        });

        push(ref(db, `matches_plus/${currentMatchId}/movementFeed`), {
            unitName: `Deployed ${newUnit.name}`,
            team: playerTeam,
            fromX: clickedCol,
            fromY: clickedRow,
            toX: clickedCol,
            toY: clickedRow,
            timestamp: deploymentTimestamp
        });
    }

    setPendingUnitType(null);
    cachedValidDeploymentTiles.clear();
    return true;
}
