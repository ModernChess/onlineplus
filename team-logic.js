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

    const registerList = (list, typeName, defaultOwner = null) => {
        if (!list) return;
        list.forEach(item => {
            let key = parseCoord(item);
            if (key) {
                tileCaptures[key] = { type: typeName, capturedBy: defaultOwner };
            }
        });
    };

    // Register basic structures and neutral items
    registerList(goldList, 'gold', null);
    registerList(redBasesList, 'red base', 'red');       
    registerList(blueBasesList, 'blue base', 'blue');    
    registerList(bbcList, 'blue base command', 'blue');  
    registerList(rbcList, 'red base command', 'red');    
    registerList(navList, 'port', null);
    registerList(artList, 'artillery', null);
    registerList(tList, 'tank', null);

    // Keep all gold cores and their linked tiles strictly neutral at startup
    goldCoreClusters.forEach(cluster => {
        let gcKey = parseCoord(cluster.gc);
        if (gcKey) {
            tileCaptures[gcKey] = { type: 'gold core', capturedBy: null };
        }

        cluster.linked.forEach(link => {
            let linkKey = parseCoord(link);
            if (linkKey) {
                tileCaptures[linkKey] = { type: 'gold core linked', gcCoord: gcKey, capturedBy: null };
            }
        });
    });

    // Explicitly re-apply pre-ownership to the designated Navy ports
    const designatedBluePorts = ["5,11"];
    const designatedRedPorts = ["11,5"];

    navList.forEach(navCoord => {
        let key = parseCoord(navCoord);
        if (key) {
            let owner = null;
            if (designatedBluePorts.includes(navCoord)) owner = 'blue';
            else if (designatedRedPorts.includes(navCoord)) owner = 'red';
            tileCaptures[key] = { type: 'port', capturedBy: owner };
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
