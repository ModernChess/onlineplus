// game-renderer-2.js - Handles unit rendering, image loading selection, rotation angles, shadows, and status badges
import { 
    cols, rows, 
    blueAntiairImg, blueAntiairLoaded, redAntiairImg, redAntiairLoaded, 
    blueArtilleryImg, blueArtilleryLoaded, redArtilleryImg, redArtilleryLoaded, 
    blueEngineerImg, blueEngineerLoaded, redEngineerImg, redEngineerLoaded, 
    blueInfantryImg, blueInfantryLoaded, redInfantryImg, redInfantryLoaded, 
    blueMineImg, blueMineLoaded, redMineImg, redMineLoaded, 
    bluePlaneImg, bluePlaneLoaded, redPlaneImg, redPlaneLoaded, 
    blueShipImg, blueShipLoaded, redShipImg, redShipLoaded, 
    blueTankImg, blueTankLoaded, redTankImg, redTankLoaded 
} from './game-config.js';
import { stalematedUnits } from './combat-mechanics.js';
import { spawnSmokeTrail } from './renderer-helpers.js';

export function drawUnitsAndBadges(ctx, canvas, units, selectedUnit, localTeam, detectedUnitIds, singleBadgeMap, teamSuperunitsMap, selectionAnimStartTime, getRenderCoordinates) {
    units.forEach(unit => {
        let targetPos = getRenderCoordinates(unit.gridX, unit.gridY, canvas.width, localTeam);

        if (unit.animX === undefined || unit.animY === undefined) {
            unit.animX = targetPos.x;
            unit.animY = targetPos.y;
        }

        let prevX = unit.animX;
        let prevY = unit.animY;

        unit.animX += (targetPos.x - unit.animX) * 0.05;
        unit.animY += (targetPos.y - unit.animY) * 0.05;

        spawnSmokeTrail(unit, prevX, prevY, targetPos.cellSize);

        let floatOffset = 0;
        let isSelected = selectedUnit && selectedUnit.id === unit.id;
        let isDetected = detectedUnitIds.has(unit.id);

        if (isSelected && selectionAnimStartTime !== null) {
            let elapsed = performance.now() - selectionAnimStartTime;
            let duration = 2000;
            
            if (elapsed < duration) {
                let progress = elapsed / duration;
                floatOffset = -Math.abs(Math.sin(progress * Math.PI * 3.5)) * 12 * Math.max(0, 1 - progress);
            } else {
                floatOffset = 0;
            }
        }

        ctx.save();

        let shadowX = unit.animX + targetPos.cellSize / 2;
        let shadowY = unit.animY + targetPos.cellSize - 4;
        let heightFactor = Math.max(0.4, 1 - (Math.abs(floatOffset) / 10));
        let shadowRadiusX = (targetPos.cellSize * 0.32) * heightFactor;
        let shadowRadiusY = (targetPos.cellSize * 0.12) * heightFactor;

        ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * heightFactor})`;
        ctx.beginPath();
        ctx.ellipse(shadowX, shadowY, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        let renderDrawY = unit.animY + floatOffset;

        let fromX = unit.animFromX !== undefined ? unit.animFromX : unit.gridX;
        let fromY = unit.animFromY !== undefined ? unit.animFromY : unit.gridY;
        let dx = unit.gridX - fromX;
        let dy = unit.gridY - fromY;

        let targetAngle = 0; 
        if (dx === 0 && dy < 0) targetAngle = 0;                      
        else if (dx > 0 && dy < 0) targetAngle = Math.PI / 4;        
        else if (dx > 0 && dy === 0) targetAngle = Math.PI / 2;      
        else if (dx > 0 && dy > 0) targetAngle = (3 * Math.PI) / 4;  
        else if (dx === 0 && dy > 0) targetAngle = Math.PI;          
        else if (dx < 0 && dy > 0) targetAngle = -(3 * Math.PI) / 4; 
        else if (dx < 0 && dy === 0) targetAngle = -Math.PI / 2;     
        else if (dx < 0 && dy < 0) targetAngle = -Math.PI / 4;       

        if (localTeam === 'red') {
            targetAngle += Math.PI;
        }

        if (unit.visualAngle === undefined) {
            unit.visualAngle = targetAngle;
        } else {
            let angleDiff = targetAngle - unit.visualAngle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            unit.visualAngle += angleDiff * 0.35; 
        }

        let unitImg = null;
        let isLoaded = false;
        let normalizedUnitName = (unit.name || '').toLowerCase().replace(/[\s-]/g, '');

        if (unit.team === 'blue') {
            if (normalizedUnitName === 'antiair') { unitImg = blueAntiairImg; isLoaded = blueAntiairLoaded; }
            else if (normalizedUnitName === 'artillery') { unitImg = blueArtilleryImg; isLoaded = blueArtilleryLoaded; }
            else if (normalizedUnitName === 'engineer') { unitImg = blueEngineerImg; isLoaded = blueEngineerLoaded; }
            else if (normalizedUnitName === 'infantry') { unitImg = blueInfantryImg; isLoaded = blueInfantryLoaded; }
            else if (normalizedUnitName === 'mine') { unitImg = blueMineImg; isLoaded = blueMineLoaded; }
            else if (normalizedUnitName === 'plane') { unitImg = bluePlaneImg; isLoaded = bluePlaneLoaded; }
            else if (normalizedUnitName === 'ship') { unitImg = blueShipImg; isLoaded = blueShipLoaded; }
            else if (normalizedUnitName === 'tank') { unitImg = blueTankImg; isLoaded = blueTankLoaded; }
        } else {
            if (normalizedUnitName === 'antiair') { unitImg = redAntiairImg; isLoaded = redAntiairLoaded; }
            else if (normalizedUnitName === 'artillery') { unitImg = redArtilleryImg; isLoaded = redArtilleryLoaded; }
            else if (normalizedUnitName === 'engineer') { unitImg = redEngineerImg; isLoaded = redEngineerLoaded; }
            else if (normalizedUnitName === 'infantry') { unitImg = redInfantryImg; isLoaded = redInfantryLoaded; }
            else if (normalizedUnitName === 'mine') { unitImg = redMineImg; isLoaded = redMineLoaded; }
            else if (normalizedUnitName === 'plane') { unitImg = redPlaneImg; isLoaded = redPlaneLoaded; }
            else if (normalizedUnitName === 'ship') { unitImg = redShipImg; isLoaded = redShipLoaded; }
            else if (normalizedUnitName === 'tank') { unitImg = redTankImg; isLoaded = redTankLoaded; }
        }

        let cellCenterX = unit.animX + targetPos.cellSize / 2;
        let cellCenterY = renderDrawY + targetPos.cellSize / 2;
        
        let sizeMultiplier = (normalizedUnitName === 'mine') ? 1.2 : 2.0;
        let drawSize = (targetPos.cellSize - 4) * sizeMultiplier; 

        ctx.save();
        ctx.translate(cellCenterX, cellCenterY);
        ctx.rotate(unit.visualAngle);

        if (isLoaded && unitImg && unitImg.complete) {
            ctx.save();
            ctx.filter = 'brightness(0)'; 
            ctx.globalAlpha = 0.5;        
            let outlineSize = drawSize * 1.14; 
            ctx.drawImage(unitImg, -outlineSize / 2, -outlineSize / 2, outlineSize, outlineSize);
            ctx.restore();

            ctx.drawImage(unitImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        } else {
            ctx.fillStyle = unit.team === 'blue' ? '#2196F3' : '#ff5252';
            ctx.beginPath();
            ctx.arc(0, 0, targetPos.cellSize / (normalizedUnitName === 'mine' ? 3.5 : 2.5), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        if (isSelected) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(unit.animX + 4, renderDrawY + 4, targetPos.cellSize - 8, targetPos.cellSize - 8);
        } else if (isDetected) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2, 2, 2]);
            ctx.strokeRect(unit.animX + 4, renderDrawY + 4, targetPos.cellSize - 8, targetPos.cellSize - 8);
        }

        let clusterPower = singleBadgeMap.get(unit.id);
        let isStalemated = unit.stalemate || stalematedUnits.has(unit.id);
        let teamSuList = teamSuperunitsMap.get(unit.team) || [];
        let parentSu = teamSuList.find(su => su.units.some(u => u.id === unit.id));
        if (parentSu && parentSu.stalemate) {
            isStalemated = true;
        }

        if (clusterPower !== undefined || isStalemated) {
            let badgeRadius = Math.max(5, targetPos.cellSize * 0.14);
            let badgeX = unit.animX + targetPos.cellSize + badgeRadius * 0.8;
            let badgeY = renderDrawY - badgeRadius * 0.8;

            ctx.fillStyle = isStalemated ? '#7f8c8d' : '#e74c3c';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isStalemated) {
                ctx.font = `${Math.max(8, Math.floor(badgeRadius * 1.2))}px sans-serif`;
                ctx.fillText('🔒', badgeX, badgeY);
            } else if (clusterPower !== undefined) {
                ctx.font = `bold ${Math.max(8, Math.floor(badgeRadius * 1.1))}px "Times New Roman", serif`;
                ctx.fillText(clusterPower, badgeX, badgeY);
            }
        }

        ctx.restore();
    });
}