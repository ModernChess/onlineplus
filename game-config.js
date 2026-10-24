// game-config.js - Configuration, Map Data Arrays, Terrain Parsers, and Local Asset Loaders (18x18 Grid System)

export const cols = 18;
export const rows = 18;

export let blueAntiairImg = new Image(), blueAntiairLoaded = false;
export let redAntiairImg = new Image(), redAntiairLoaded = false;
export let blueArtilleryImg = new Image(), blueArtilleryLoaded = false;
export let redArtilleryImg = new Image(), redArtilleryLoaded = false;
export let blueEngineerImg = new Image(), blueEngineerLoaded = false;
export let redEngineerImg = new Image(), redEngineerLoaded = false;
export let blueInfantryImg = new Image(), blueInfantryLoaded = false;
export let redInfantryImg = new Image(), redInfantryLoaded = false;
export let blueMineImg = new Image(), blueMineLoaded = false;
export let redMineImg = new Image(), redMineLoaded = false;
export let bluePlaneImg = new Image(), bluePlaneLoaded = false;
export let redPlaneImg = new Image(), redPlaneLoaded = false;
export let blueShipImg = new Image(), blueShipLoaded = false;
export let redShipImg = new Image(), redShipLoaded = false;
export let blueTankImg = new Image(), blueTankLoaded = false;
export let redTankImg = new Image(), redTankLoaded = false;
export let mapImg = new Image(), mapLoaded = false;

function loadOnlineAsset(url, imgObj, setLoadedFlag) {
    imgObj.crossOrigin = "anonymous";
    imgObj.src = url;
    imgObj.onload = () => { setLoadedFlag(true); };
    imgObj.onerror = () => {
        console.error(`Failed to load online asset: ${url}`);
    };
}

const repoBaseUrl = 'https://raw.githubusercontent.com/ModernChess/assets-images/main/';

loadOnlineAsset(`${repoBaseUrl}blueantiair.png`, blueAntiairImg, (val) => { blueAntiairLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redantiair.png`, redAntiairImg, (val) => { redAntiairLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}blueartillery.png`, blueArtilleryImg, (val) => { blueArtilleryLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redartillery.png`, redArtilleryImg, (val) => { redArtilleryLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}blueengineer.png`, blueEngineerImg, (val) => { blueEngineerLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redengineer.png`, redEngineerImg, (val) => { redEngineerLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}blueinfantry.png`, blueInfantryImg, (val) => { blueInfantryLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redinfantry.png`, redInfantryImg, (val) => { redInfantryLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}bluemine.png`, blueMineImg, (val) => { blueMineLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redmine.png`, redMineImg, (val) => { redMineLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}blueplane.png`, bluePlaneImg, (val) => { bluePlaneLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redplane.png`, redPlaneImg, (val) => { redPlaneLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}blueship.png`, blueShipImg, (val) => { blueShipLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redship.png`, redShipImg, (val) => { redShipLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}bluetank.png`, blueTankImg, (val) => { blueTankLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}redtank.png`, redTankImg, (val) => { redTankLoaded = val; });
loadOnlineAsset(`${repoBaseUrl}map30.png`, mapImg, (val) => { mapLoaded = val; });

export function colLetterToIndex(colStr) {
    let upper = colStr.toUpperCase();
    let col = 0;
    for (let i = 0; i < upper.length; i++) {
        col = col * 26 + (upper.charCodeAt(i) - 64);
    }
    return col - 1;
}

export const landList = [
    "0,0","0,1","0,2","0,3","1,2","1,3","1,1","1,0","2,0","2,1","2,2","2,3","3,0","3,1","3,2","3,3","4,0","4,1","4,2","4,3","5,0","5,1","5,2","6,0","6,1","6,2","7,0","7,1","7,2","8,0","8,1","8,2","9,0","9,1","9,2","0,7","0,8","0,9","1,7","1,8","1,9","2,7","2,8","2,9","3,7","3,8","3,9","0,13","0,14","0,15","0,16","0,17","1,13","1,14","1,15","1,16","1,17","2,13","2,14","2,15","2,16","2,17","3,13","3,14","3,15","3,16","3,17","4,16","4,17","5,16","5,17","6,16","6,17","7,16","7,17","8,16","8,17","9,16","9,17","7,12","7,13","7,14","7,15","8,12","8,13","8,14","8,15","9,12","9,13","9,14","9,15","13,14","13,15","13,16","13,17","14,14","14,15","14,16","14,17","15,14","15,15","15,16","15,17","16,14","16,15","16,16","16,17","17,14","17,15","17,16","17,17","14,0","14,1","14,2","14,3","14,4","14,5","14,6","14,7","14,8","14,9","14,10","15,0","15,1","15,2","15,3","15,4","15,5","15,6","15,7","15,8","15,9","15,10","16,0","16,1","16,2","16,3","16,4","16,5","16,6","16,7","16,8","16,9","16,10","17,0","17,1","17,2","17,3","17,4","17,5","17,6","17,7","17,8","17,9","17,10","10,2","10,3","10,4","11,2","11,3","11,4","12,2","12,3","12,4","13,2","13,3","13,4","3,4","3,5","3,6","4,6","4,4","4,5","4,7","5,7","5,6","6,6","2,10","2,11","2,12","3,11","3,12","3,10","4,11","4,12","4,10","5,12","6,12","6,11","7,11","10,13","10,14","11,14","12,14","14,13","14,12","14,11","13,10","13,9","12,9","13,5","12,5","13,1","13,0","8,3","9,3"
];

export const waterList = [
    "4,8","4,9","5,8","5,9","5,10","6,9","6,10","6,8","6,7","7,7","7,8","7,9","7,10","7,6","8,4","8,5","8,6","8,7","8,8","8,9","8,10","8,11","9,4","9,5","9,6","9,7","9,8","9,9","9,10","9,11","10,5","10,6","10,7","10,8","10,9","10,10","10,11","10,12","11,8","11,9","11,10","11,11","11,12","11,13","12,10","12,11","12,12","12,13","13,11","13,12","13,13"
];

// Gold Core Clusters mapped from your Gold Links structure
export const goldClusters = [
    {
        core: "11,16",
        tiles: ["11,17", "12,17", "12,16", "12,15", "11,15", "10,15", "10,16", "10,17"],
        units: []
    },
    {
        core: "16,12",
        tiles: ["15,12", "15,13", "16,13", "17,13", "17,12", "17,11", "16,11", "15,11"],
        units: []
    },
    {
        core: "12,7",
        tiles: ["12,8", "13,8", "13,7", "13,6", "12,6", "11,6", "11,7"],
        units: []
    },
    {
        core: "6,4",
        tiles: ["6,3", "7,3", "7,4", "7,5", "6,5", "5,5", "5,4", "5,3"],
        units: []
    },
    {
        core: "1,5",
        tiles: ["0,5", "0,4", "1,4", "2,4", "2,5", "2,6", "1,6", "0,6"],
        units: []
    },
    {
        core: "5,14",
        tiles: ["4,14", "4,15", "5,15", "6,15", "6,14", "6,13", "5,13", "4,13"],
        units: []
    }
];

export const goldList = goldClusters.flatMap(c => c.tiles);
export const goldCoreList = goldClusters.map(c => c.core);

export const artList = [];
export const tList = [];

// Ports / Navy setup
export const navList = ["5,11", "11,5"];

// HQ and Base Setup mappings from your HQ array
export const bbcList = ["0,11"];
export const rbcList = ["11,0"];

export const blueBasesList = ["0,10", "1,10", "1,11", "1,12", "0,12"];
export const redBasesList = ["12,0", "12,1", "11,1", "10,1", "10,0"];

export const bbList = blueBasesList;
export const rbList = redBasesList;

export const teamNavySpawns = [
    { coordinates: "5,11", team: "blue" },
    { coordinates: "11,5", team: "red" }
];

export const landSet = new Set(landList);
export const waterSet = new Set(waterList);

export function isWaterTerrain(col, row) {
    return waterSet.has(`${col},${row}`);
}

export function getTerrain(col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return 'out_of_bounds';
    let key = `${col},${row}`;
    if (bbcList.includes(key)) return 'bbc';
    if (rbcList.includes(key)) return 'rbc';
    return isWaterTerrain(col, row) ? 'water' : 'land';
}

export function spawnTeamUnits(team, unitsList) {
    // Spawn exactly one infantry unit per team at their central/primary base coordinate with divisionNumber set to 1 for the triangular badge
    let spawnCoord = (team === 'blue') ? "1,11" : "11,1";
    let [gx, gy] = spawnCoord.split(',').map(Number);

    unitsList.push({
        id: `${team}_spawn_infantry_0_${Date.now()}`,
        team: team,
        name: 'Infantry',
        divisionNumber: 1,
        type: 'land',
        gridX: gx,
        gridY: gy,
        range: 2,
        health: 100,
        hasMovedThisTurn: false
    });
}
