// game-input.js - Utility helper functions for input coordinate mapping with forgiving touch margins (25% Buffer)
import { cols, rows } from './game-config.js';

export function getGridCoordinatesFromClient(clientX, clientY, canvas, cameraX, cameraY, cameraZoom, localTeam) {
    const rect = canvas.getBoundingClientRect();
    const worldX = ((clientX - rect.left) - cameraX) / cameraZoom;
    const worldY = ((clientY - rect.top) - cameraY) / cameraZoom;

    let cellSize = canvas.width / cols;
    
    // Calculate fractional position within the grid
    let exactCol = worldX / cellSize;
    let exactRow = worldY / cellSize;

    let clickedCol = Math.floor(exactCol);
    let clickedRow = Math.floor(exactRow);

    // Apply forgiving edge tolerance (25% outer buffer snap)
    let colRemainder = exactCol - clickedCol;
    let rowRemainder = exactRow - clickedRow;

    if (colRemainder < 0.25 && clickedCol > 0) clickedCol -= 1;
    else if (colRemainder > 0.75 && clickedCol < cols - 1) clickedCol += 1;

    if (rowRemainder < 0.25 && clickedRow > 0) clickedRow -= 1;
    else if (rowRemainder > 0.75 && clickedRow < rows - 1) clickedRow += 1;

    if (clickedCol < 0 || clickedCol >= cols || clickedRow < 0 || clickedRow >= rows) {
        return null;
    }

    if (localTeam === 'red') {
        clickedCol = cols - 1 - clickedCol;
        clickedRow = rows - 1 - clickedRow;
    }

    return { col: clickedCol, row: clickedRow };
}
