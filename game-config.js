// game-config.js - Configuration, Map Data Arrays, Terrain Parsers, and Local Asset Loaders (24x34 Grid System)

export const cols = 24;
export const rows = 34;

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
loadOnlineAsset(`${repoBaseUrl}map16.png`, mapImg, (val) => { mapLoaded = val; });

export function colLetterToIndex(colStr) {
    let upper = colStr.toUpperCase();
    let col = 0;
    for (let i = 0; i < upper.length; i++) {
        col = col * 26 + (upper.charCodeAt(i) - 64);
    }
    const baseColCode = 'AY'.toUpperCase();
    let baseVal = 0;
    for (let i = 0; i < baseColCode.length; i++) {
        baseVal = baseVal * 26 + (baseColCode.charCodeAt(i) - 64);
    }
    return col - baseVal;
}

export const landList = [
    "0,33","0,32","1,32","1,33","2,32","2,33","3,33","3,32","4,32","4,33","5,32","5,33","6,32","6,33","7,32","7,33","6,31","7,31","8,32","8,33","9,32","9,33","10,32","10,33","9,31","11,31","11,32","11,33","12,32","12,33","12,31","12,30","11,30","11,29","12,29","12,28","11,28","10,28","9,28","9,29","8,28","7,28","7,29","6,28","6,29","5,28","5,29","5,30","5,31","0,28","0,29","0,30","0,31","1,28","1,29","1,30","1,31","2,28","2,29","2,30","2,31","3,28","3,29","3,30","3,31","4,28","4,29","4,30","4,31","3,26","3,27","4,26","4,27","5,26","5,27","6,26","6,27","7,26","7,27","8,26","8,27","9,26","9,27","10,26","10,27","11,26","11,27","12,26","12,27","13,26","13,27","14,26","14,27","15,26","15,27","16,26","16,27","13,32","13,33","14,32","14,33","15,32","15,33","16,32","16,33","17,32","17,33","9,23","9,24","9,25","10,23","10,24","10,25","11,23","11,24","11,25","12,23","12,24","12,25","5,13","5,14","5,15","5,16","5,17","5,18","5,19","5,20","5,21","5,22","5,23","6,13","6,14","6,15","6,16","6,17","6,18","6,19","6,20","6,21","6,22","6,23","7,13","7,14","7,15","7,16","7,17","7,18","7,19","7,20","7,21","7,22","7,23","0,17","0,18","1,17","1,18","2,17","2,18","3,17","3,18","4,17","4,18","0,19","0,20","0,21","0,22","0,23","0,24","1,19","1,20","1,21","1,22","1,23","1,24","2,19","2,20","2,21","2,22","2,23","2,24","1,1","1,2","1,3","1,4","1,5","1,6","1,7","1,8","2,1","2,2","2,3","2,4","2,5","2,6","2,7","2,8","0,4","0,5","0,6","0,7","0,8","0,9","0,10","0,11","8,18","8,19","9,18","9,19","10,18","10,19","11,18","11,19","12,18","12,19","13,18","13,19","14,18","14,19","15,18","15,19","12,20","12,21","12,22","13,20","13,21","13,22","11,21","11,22","9,22","8,22","8,21","8,20","9,20","6,24","6,25","7,25","5,24","5,25","3,22","4,22","3,24","3,25","0,26","0,27","1,27","1,26","1,25","0,25","14,31","15,31","15,30","16,30","16,31","17,30","18,30","18,29","17,29","16,29","16,28","17,28","15,28","14,28","14,29","17,27","18,26","19,27","20,27","21,27","22,27","20,28","21,29","21,30","22,28","22,30","22,31","23,29","23,30","23,31","23,32","23,33","20,32","21,25","20,25","22,24","22,23","22,22","23,22","23,23","23,24","19,24","20,23","20,22","19,22","19,23","18,23","18,24","17,23","17,24","17,22","16,23","16,24","16,25","17,25","21,22","20,24","14,20","14,21","15,20","15,21","16,20","16,21","15,22","13,24","13,25","14,25","15,25","13,28","10,14","10,15","10,16","10,17","11,17","11,16","11,15","12,16","9,17","8,17","9,15","9,14","8,14","8,13","8,12","9,12","9,13","6,12","6,11","7,11","6,10","6,9","5,9","5,10","4,9","4,10","4,11","4,12","4,13","3,13","3,14","3,15","2,14","2,15","2,16","1,16","1,15","0,15","0,16","0,14","0,13","1,9","3,8","3,7","3,6","4,6","5,6","5,5","4,7","5,8","8,30","14,17","15,17","15,16","7,0","8,1","8,2","8,3","8,4","9,2","9,3","9,4","10,4","10,5","11,5","11,4","11,2","11,3","11,1","11,0","12,2","12,3","13,2","13,3","14,2","14,3","14,1","15,1","15,3","14,4","15,4","14,5","15,5","15,6","14,7","13,7","12,7","12,6","11,6","11,7","12,9","12,10","13,9","13,10","13,8","14,8","15,8","11,9","10,9","9,9","9,8","16,7","16,6","16,5","16,4","16,3","17,3","17,4","17,5","17,7","17,6","18,6","18,5","18,4","18,3","19,3","19,4","19,5","20,5","20,4","20,3","20,2","21,2","21,3","21,4","21,5","22,4","22,3","22,2","23,2","23,3","21,1","20,1","21,0","19,1","19,0","13,4"
];

export const waterList = [
    "9,10","9,11","10,10","10,11","10,12","10,13","11,13","11,12","11,11","11,10","12,11","12,12","12,13","12,14","11,14","13,14","13,15","13,13","13,12","13,11","14,11","14,12","14,13","14,14","14,15","14,9","14,10","15,9","15,10","15,11","15,12","15,13","15,14","15,15","16,9","16,10","16,11","16,12","16,13","16,14","16,15","17,9","17,10","17,11","17,12","17,13","17,14","17,15","18,9","18,10","18,11","18,12","18,13","18,14","18,15","19,9","19,10","19,11","19,12","19,13","19,14","19,15","20,9","20,10","20,11","20,12","20,13","20,14","20,15","21,9","21,10","21,11","21,12","21,13","21,14","21,15","22,9","22,10","22,11","22,12","22,13","22,14","22,15","23,9","23,10","23,11","23,12","23,13","23,14","23,15","16,16","16,17","16,18","16,19","17,16","17,17","17,18","17,19","18,16","18,17","18,18","18,19","19,16","19,17","19,18","19,19","20,16","20,17","20,18","20,19","21,16","21,17","21,18","21,19","22,16","22,17","22,18","22,19","23,16","23,17","23,18","23,19","17,20","17,21","18,20","18,21","19,20","19,21","20,20","20,21","21,20","21,21","22,20","22,21","23,20","23,21","18,7","18,8","19,7","19,8","20,7","20,8","21,7","21,8","22,7","22,8","23,7","23,8","6,1","6,2","6,3","6,4","6,5","6,6","6,7","6,8","7,1","7,2","7,3","7,4","7,5","7,6","7,7","7,8","3,0","3,1","3,2","3,3","3,4","4,0","4,1","4,2","4,3","4,4","5,0","5,1","5,2","5,3","5,4","16,0","16,1","16,2","17,0","17,1","17,2","18,0","18,1","18,2","8,0","9,0","10,0","9,1","10,1","10,2","10,3","12,0","12,1","13,0","13,1","14,0","15,0","15,2","20,0","19,2","22,0","22,1","23,0","23,1","23,4","22,5","23,5","23,6","22,6","21,6","20,6","19,6","16,8","17,8","8,10","7,10","7,9","8,9","8,8","8,7","8,6","8,5","5,7","3,5","4,5","0,3","0,2","0,1","0,0","1,0","2,0","6,0","17,31","18,31","19,31","20,31","21,31","21,32","21,33","20,33","19,33","19,32","18,32","18,33","22,32","22,33","20,30","19,30","19,29","20,29","19,28","18,28","18,27","17,26","19,26","19,25","18,25","20,26","21,26","21,28","22,26","22,25","23,25","23,26","23,27","23,28","22,29","18,22"
];

// Gold Core Clusters mapping core cities, linked tiles, industry (`ind` = tank), air (`air` = artillery), and ports (`nav`)
export const goldClusters = [
    {
        core: "5,12",
        tiles: ["5,11"],
        units: []
    },
    {
        core: "8,11",
        tiles: ["7,12"],
        units: []
    },
    {
        core: "4,16",
        tiles: ["4,15"],
        units: [
            { coordinates: "3,16", type: "artillery" },
            { coordinates: "4,14", type: "tank" }
        ]
    },
    {
        core: "3,19",
        tiles: ["3,20"],
        units: []
    },
    {
        core: "9,16",
        tiles: ["8,15"],
        units: [
            { coordinates: "8,16", type: "tank" }
        ]
    },
    {
        core: "10,21",
        tiles: ["10,22"],
        units: [
            { coordinates: "9,21", type: "tank" },
            { coordinates: "10,20", type: "tank" },
            { coordinates: "11,20", type: "artillery" }
        ]
    },
    {
        core: "13,16",
        tiles: ["12,17"],
        units: [
            { coordinates: "14,16", type: "artillery" },
            { coordinates: "13,17", type: "tank" },
            { coordinates: "12,15", type: "port" }
        ]
    },
    {
        core: "15,23",
        tiles: ["15,24"],
        units: [
            { coordinates: "14,24", type: "tank" },
            { coordinates: "14,23", type: "tank" },
            { coordinates: "13,23", type: "tank" },
            { coordinates: "14,22", type: "artillery" },
            { coordinates: "16,22", type: "port" }
        ]
    },
    {
        core: "10,30",
        tiles: ["10,31"],
        units: [
            { coordinates: "10,29", type: "artillery" },
            { coordinates: "9,30", type: "tank" },
            { coordinates: "8,31", type: "tank" },
            { coordinates: "8,29", type: "tank" },
            { coordinates: "7,30", type: "tank" },
            { coordinates: "6,30", type: "artillery" }
        ]
    },
    {
        core: "2,26",
        tiles: ["2,27"],
        units: [
            { coordinates: "2,25", type: "tank" }
        ]
    },
    {
        core: "4,24",
        tiles: ["4,25"],
        units: [
            { coordinates: "4,23", type: "tank" },
            { coordinates: "3,23", type: "artillery" }
        ]
    },
    {
        core: "8,24",
        tiles: ["8,25"],
        units: [
            { coordinates: "7,24", type: "artillery" },
            { coordinates: "8,23", type: "tank" }
        ]
    },
    {
        core: "13,5",
        tiles: ["13,6", "12,5"],
        units: [
            { coordinates: "12,4", type: "tank" },
            { coordinates: "14,6", type: "artillery" },
            { coordinates: "15,7", type: "port" }
        ]
    },
    {
        core: "21,23",
        tiles: ["21,24"],
        units: []
    },
    {
        core: "2,10",
        tiles: ["2,11", "3,10", "3,11", "3,12", "2,12", "1,12", "1,11", "1,10"],
        units: [
            { coordinates: "0,12", type: "artillery" },
            { coordinates: "1,13", type: "tank" },
            { coordinates: "1,14", type: "tank" },
            { coordinates: "2,13", type: "tank" },
            { coordinates: "2,9", type: "tank" },
            { coordinates: "3,9", type: "artillery" },
            { coordinates: "4,8", type: "port" }
        ]
    },
    {
        core: "10,8",
        tiles: ["10,7", "10,6", "11,8", "12,8"],
        units: [
            { coordinates: "9,7", type: "port" },
            { coordinates: "9,6", type: "tank" },
            { coordinates: "9,5", type: "artillery" }
        ]
    },
    {
        core: "13,30",
        tiles: ["13,31"],
        units: [
            { coordinates: "13,29", type: "artillery" },
            { coordinates: "14,30", type: "tank" },
            { coordinates: "15,29", type: "artillery" }
        ]
    }
];

// Explicitly extracted lists for deployment validation and renderer checking
export const goldList = goldClusters.flatMap(c => c.tiles);
export const goldCoreList = goldClusters.map(c => c.core);

export const artList = goldClusters.flatMap(c => c.units.filter(u => u.type === 'artillery').map(u => u.coordinates));
export const tList = goldClusters.flatMap(c => c.units.filter(u => u.type === 'tank').map(u => u.coordinates));
export const navList = goldClusters.flatMap(c => c.units.filter(u => u.type === 'port').map(u => u.coordinates));

export const bbcList = ["2,10", "10,8"];
export const rbcList = ["10,30", "13,30"];

export const blueBasesList = ["2,10", "10,8"];
export const redBasesList = ["10,30", "13,30"];

export const bbList = blueBasesList;
export const rbList = redBasesList;

export const teamNavySpawns = navList.map(coord => ({
    coordinates: coord,
    team: ["4,8", "9,7", "12,15", "15,7"].includes(coord) ? "blue" : "axis"
}));

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
    let baseList = (team === 'blue') ? blueBasesList : redBasesList;

    baseList.forEach((coordStr, index) => {
        let [gx, gy] = coordStr.split(',').map(Number);
        unitsList.push({
            id: `${team}_spawn_infantry_${index}_${Date.now()}`,
            team: team,
            name: 'Infantry',
            type: 'land',
            gridX: gx,
            gridY: gy,
            range: 2,
            health: 100,
            hasMovedThisTurn: false
        });
    });
}
