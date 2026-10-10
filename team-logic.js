// team-logic.js - Handles map coordinate parsing, tile types, capture tracking, and economy coin values
import { 
    cols, 
    rows,
    colLetterToIndex,
    goldList, 
    bbcList, 
    rbcList, 
    redBasesList, 
    blueBasesList,
    navList,
    artList,
    tList,
    goldCoreList,
    goldClusters
} from './game-config.js';

export const rbList = redBasesList;
export const bbList = blueBasesList;

export let tileCaptures = {};

// Map game-config's goldClusters structure to team-logic's expected format
export const goldCoreClusters = goldClusters.map(cluster => ({
    gc: cluster.core,
    linked: [...cluster.tiles],
    units: cluster.units ? [...cluster.units] : []
}));

export const tileCoinValues = {
    'gold': 0.5,
    'gold core': 2,
    'red base': 0.5,
    'blue base': 0.5,
    'port': 0.5,
    'artillery': 0.5,
    'tank': 0.5
};

export function parseCoord(item) {
    if (typeof item !== 'string') return null;

    let chessMatch = item.match(/^([A-Z]+)(\d+)$/);
    if (chessMatch) {
        let colStr = chessMatch[1];
        let rowNum = parseInt(chessMatch[2], 10);
        let rawIndex = colLetterToIndex(colStr);
        if (rawIndex === undefined || rawIndex === null) return null;
        
        let correctedCol = rawIndex;
        let rIdx = rowNum - 18; 
        if (correctedCol < 0 || correctedCol >= cols || rIdx < 0 || rIdx >= rows) return null;

        return `${correctedCol},${rIdx}`;
    }

    let parts = item.split(',');
    if (parts.length !== 2) return null;
    
    let c = parseInt(parts[0], 10);
    let r = parseInt(parts[1], 10);
    
    if (isNaN(c) || isNaN(r) || c < 0 || c >= cols || r < 0 || r >= rows) {
        return null;
    }

    return `${c},${r}`;
}

export function initTileCaptures() {
    tileCaptures = {};

    const alliedGoldCores = ["2,10", "5,12", "8,11", "4,16", "3,19", "9,16", "13,16", "13,5", "10,8", "21,23"];
    const axisGoldCores = ["10,30", "13,30", "15,23", "10,21", "8,24", "4,24", "2,26"];

    const registerList = (list, typeName, defaultOwner = null) => {
        if (!list) return;
        list.forEach(item => {
            let key = parseCoord(item);
            if (key) {
                tileCaptures[key] = { type: typeName, capturedBy: defaultOwner };
            }
        });
    };

    registerList(goldList, 'gold', null);
    registerList(redBasesList, 'red base', 'red');       
    registerList(blueBasesList, 'blue base', 'blue');    
    registerList(bbcList, 'blue base command', 'blue');  
    registerList(rbcList, 'red base command', 'red');    
    registerList(navList, 'port', null);
    registerList(artList, 'artillery', null);
    registerList(tList, 'tank', null);

    // Pre-occupy gold cores, linked tiles, and associated cluster units according to Allied (blue) or Axis (red) alignment
    goldCoreClusters.forEach(cluster => {
        let gcKey = parseCoord(cluster.gc);
        let owner = null;
        if (alliedGoldCores.includes(cluster.gc)) owner = 'blue';
        else if (axisGoldCores.includes(cluster.gc)) owner = 'red';

        if (gcKey) {
            tileCaptures[gcKey] = { type: 'gold core', capturedBy: owner };
        }

        cluster.linked.forEach(link => {
            let linkKey = parseCoord(link);
            if (linkKey) {
                tileCaptures[linkKey] = { type: 'gold core linked', gcCoord: gcKey, capturedBy: owner };
            }
        });

        if (cluster.units) {
            cluster.units.forEach(u => {
                let uKey = parseCoord(u.coordinates);
                if (uKey) {
                    let uTypeName = u.type === 'port' ? 'port' : (u.type === 'artillery' ? 'artillery' : 'tank');
                    tileCaptures[uKey] = { type: uTypeName, gcCoord: gcKey, capturedBy: owner };
                }
            });
        }
    });
}

export function getGoldCoreCluster(coordKey) {
    for (let cluster of goldCoreClusters) {
        let gcKey = parseCoord(cluster.gc);
        if (gcKey === coordKey) return cluster;
        if (cluster.linked.some(l => parseCoord(l) === coordKey)) return cluster;
        if (cluster.units && cluster.units.some(u => parseCoord(u.coordinates) === coordKey)) return cluster;
    }
    return null;
}
