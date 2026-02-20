import { Area } from '../types';

// ═══════════════════════════════════════════════════════════════════════
// Complete map definition — ported from verified Ruby implementation
// Source: https://github.com/chibimagic/got-board-game (area.rb + map.rb)
// ═══════════════════════════════════════════════════════════════════════

export const INITIAL_MAP: Record<string, Area> = {
    // ═══════════ LAND AREAS ═══════════

    // --- THE NORTH ---
    'Castle Black': {
        id: 'Castle Black', name: 'Castle Black', type: 'Land',
        power: 1,
        adjacent: ['Winterfell', 'Karhold', 'Bay of Ice', 'The Shivering Sea'],
        units: []
    },
    'Karhold': {
        id: 'Karhold', name: 'Karhold', type: 'Land',
        power: 1,
        adjacent: ['Castle Black', 'Winterfell', 'The Shivering Sea'],
        units: []
    },
    'The Stony Shore': {
        id: 'The Stony Shore', name: 'The Stony Shore', type: 'Land',
        supply: 1,
        adjacent: ['Winterfell', 'Bay of Ice'],
        units: []
    },
    'Winterfell': {
        id: 'Winterfell', name: 'Winterfell', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: [
            'Castle Black', 'Karhold', 'The Stony Shore', 'White Harbor', 'Moat Cailin',
            'Bay of Ice', 'The Shivering Sea'
        ],
        units: []
    },
    'White Harbor': {
        id: 'White Harbor', name: 'White Harbor', type: 'Land',
        castle: true,
        adjacent: ['Winterfell', 'Moat Cailin', "Widow's Watch", 'The Narrow Sea', 'The Shivering Sea'],
        units: []
    },
    "Widow's Watch": {
        id: "Widow's Watch", name: "Widow's Watch", type: 'Land',
        supply: 1,
        adjacent: ['White Harbor', 'The Narrow Sea', 'The Shivering Sea'],
        units: []
    },

    // --- RIVERLANDS / CENTRAL ---
    'Moat Cailin': {
        id: 'Moat Cailin', name: 'Moat Cailin', type: 'Land',
        castle: true,
        adjacent: ['Winterfell', 'White Harbor', 'Greywater Watch', 'Seagard', 'The Twins', 'The Narrow Sea'],
        units: []
    },
    'Greywater Watch': {
        id: 'Greywater Watch', name: 'Greywater Watch', type: 'Land',
        supply: 1,
        adjacent: ['Moat Cailin', 'Seagard', "Flint's Finger", 'Bay of Ice', "Ironman's Bay"],
        units: []
    },
    "Flint's Finger": {
        id: "Flint's Finger", name: "Flint's Finger", type: 'Land',
        castle: true,
        adjacent: ['Greywater Watch', 'Bay of Ice', "Ironman's Bay", 'Sunset Sea'],
        units: []
    },
    'Seagard': {
        id: 'Seagard', name: 'Seagard', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: ['Moat Cailin', 'Greywater Watch', 'The Twins', 'Riverrun', "Ironman's Bay"],
        units: []
    },
    'The Twins': {
        id: 'The Twins', name: 'The Twins', type: 'Land',
        power: 1,
        adjacent: ['Moat Cailin', 'Seagard', 'The Fingers', 'The Mountains of the Moon', 'The Narrow Sea'],
        units: []
    },
    'The Fingers': {
        id: 'The Fingers', name: 'The Fingers', type: 'Land',
        supply: 1,
        adjacent: ['The Twins', 'The Mountains of the Moon', 'The Narrow Sea'],
        units: []
    },
    'The Mountains of the Moon': {
        id: 'The Mountains of the Moon', name: 'The Mountains of the Moon', type: 'Land',
        supply: 1,
        adjacent: ['The Twins', 'The Fingers', 'The Eyrie', 'Crackclaw Point', 'The Narrow Sea'],
        units: []
    },
    'The Eyrie': {
        id: 'The Eyrie', name: 'The Eyrie', type: 'Land',
        castle: true, supply: 1, power: 1,
        adjacent: ['The Mountains of the Moon', 'The Narrow Sea'],
        units: []
    },

    // --- WESTERLANDS ---
    'Riverrun': {
        id: 'Riverrun', name: 'Riverrun', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: ['Seagard', 'Lannisport', 'Stoney Sept', 'Harrenhal', "Ironman's Bay", 'The Golden Sound'],
        units: []
    },
    'Lannisport': {
        id: 'Lannisport', name: 'Lannisport', type: 'Land',
        stronghold: true, supply: 2,
        adjacent: ['Riverrun', 'Stoney Sept', 'Searoad Marches', 'The Golden Sound'],
        units: []
    },
    'Stoney Sept': {
        id: 'Stoney Sept', name: 'Stoney Sept', type: 'Land',
        power: 1,
        adjacent: ['Riverrun', 'Lannisport', 'Harrenhal', 'Searoad Marches', 'Blackwater'],
        units: []
    },
    'Searoad Marches': {
        id: 'Searoad Marches', name: 'Searoad Marches', type: 'Land',
        supply: 1,
        adjacent: [
            'Lannisport', 'Stoney Sept', 'Highgarden', 'Blackwater', 'The Reach',
            'Sunset Sea', 'The Golden Sound', 'West Summer Sea'
        ],
        units: []
    },

    // --- CROWNLANDS ---
    'Harrenhal': {
        id: 'Harrenhal', name: 'Harrenhal', type: 'Land',
        castle: true, power: 1,
        adjacent: ['Riverrun', 'Stoney Sept', 'Crackclaw Point', "King's Landing"],
        units: []
    },
    'Crackclaw Point': {
        id: 'Crackclaw Point', name: 'Crackclaw Point', type: 'Land',
        castle: true,
        adjacent: [
            'Harrenhal', "King's Landing", 'The Mountains of the Moon',
            'Blackwater Bay', 'Shipbreaker Bay', 'The Narrow Sea'
        ],
        units: []
    },
    "King's Landing": {
        id: "King's Landing", name: "King's Landing", type: 'Land',
        stronghold: true, power: 2,
        adjacent: ['Harrenhal', 'Crackclaw Point', 'Blackwater', 'Kingswood', 'The Reach', 'Blackwater Bay'],
        units: []
    },
    'Blackwater': {
        id: 'Blackwater', name: 'Blackwater', type: 'Land',
        supply: 2,
        adjacent: [
            "King's Landing", 'Stoney Sept', 'Searoad Marches', 'Crackclaw Point',
            'The Reach', 'Kingswood', 'The Boneway', 'Dornish Marches'
        ],
        units: []
    },

    // --- SOUTH ---
    'Kingswood': {
        id: 'Kingswood', name: 'Kingswood', type: 'Land',
        supply: 1, power: 1,
        adjacent: [
            "King's Landing", 'Blackwater', "Storm's End", 'The Boneway', 'The Reach',
            'Blackwater Bay', 'Shipbreaker Bay'
        ],
        units: []
    },
    "Storm's End": {
        id: "Storm's End", name: "Storm's End", type: 'Land',
        castle: true,
        adjacent: ['Kingswood', 'The Boneway', 'East Summer Sea', 'Sea of Dorne', 'Shipbreaker Bay'],
        units: []
    },
    'Highgarden': {
        id: 'Highgarden', name: 'Highgarden', type: 'Land',
        stronghold: true, supply: 2,
        adjacent: ['Searoad Marches', 'The Reach', 'Dornish Marches', 'Oldtown', 'Redwyne Straits', 'West Summer Sea'],
        units: []
    },
    'The Reach': {
        id: 'The Reach', name: 'The Reach', type: 'Land',
        castle: true,
        adjacent: [
            'Highgarden', 'Searoad Marches', 'Blackwater', "King's Landing",
            'Kingswood', 'Dornish Marches', 'The Boneway', 'Oldtown'
        ],
        units: []
    },
    'Dornish Marches': {
        id: 'Dornish Marches', name: 'Dornish Marches', type: 'Land',
        power: 1,
        adjacent: ['Highgarden', 'The Reach', 'Blackwater', 'The Boneway', "Prince's Pass", 'Oldtown', 'Three Towers'],
        units: []
    },
    'Oldtown': {
        id: 'Oldtown', name: 'Oldtown', type: 'Land',
        stronghold: true,
        adjacent: ['Highgarden', 'The Reach', 'Dornish Marches', 'Three Towers', 'Redwyne Straits'],
        units: []
    },
    'Three Towers': {
        id: 'Three Towers', name: 'Three Towers', type: 'Land',
        supply: 1,
        adjacent: ['Oldtown', 'Dornish Marches', "Prince's Pass", 'Redwyne Straits', 'West Summer Sea'],
        units: []
    },

    // --- DORNE ---
    'The Boneway': {
        id: 'The Boneway', name: 'The Boneway', type: 'Land',
        power: 1,
        adjacent: [
            'Dornish Marches', "Prince's Pass", 'The Reach', 'Kingswood', 'Blackwater',
            "Storm's End", 'Yronwood', 'Sea of Dorne'
        ],
        units: []
    },
    "Prince's Pass": {
        id: "Prince's Pass", name: "Prince's Pass", type: 'Land',
        supply: 1, power: 1,
        adjacent: ['Dornish Marches', 'The Boneway', 'Three Towers', 'Starfall', 'Yronwood'],
        units: []
    },
    'Yronwood': {
        id: 'Yronwood', name: 'Yronwood', type: 'Land',
        castle: true,
        adjacent: ["Prince's Pass", 'The Boneway', 'Starfall', 'Salt Shore', 'Sunspear', 'Sea of Dorne'],
        units: []
    },
    'Starfall': {
        id: 'Starfall', name: 'Starfall', type: 'Land',
        castle: true, supply: 1,
        adjacent: ["Prince's Pass", 'Yronwood', 'Salt Shore', 'East Summer Sea', 'West Summer Sea'],
        units: []
    },
    'Salt Shore': {
        id: 'Salt Shore', name: 'Salt Shore', type: 'Land',
        supply: 1,
        adjacent: ['Yronwood', 'Starfall', 'Sunspear', 'East Summer Sea'],
        units: []
    },
    'Sunspear': {
        id: 'Sunspear', name: 'Sunspear', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: ['Yronwood', 'Salt Shore', 'East Summer Sea', 'Sea of Dorne'],
        units: []
    },

    // --- ISLANDS ---
    'Pyke': {
        id: 'Pyke', name: 'Pyke', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: ["Ironman's Bay"],
        units: []
    },
    'Dragonstone': {
        id: 'Dragonstone', name: 'Dragonstone', type: 'Land',
        stronghold: true, supply: 1, power: 1,
        adjacent: ['Shipbreaker Bay'],
        units: []
    },
    'The Arbor': {
        id: 'The Arbor', name: 'The Arbor', type: 'Land',
        power: 1,
        adjacent: ['Redwyne Straits', 'West Summer Sea'],
        units: []
    },

    // ═══════════ SEA AREAS ═══════════

    'Bay of Ice': {
        id: 'Bay of Ice', name: 'Bay of Ice', type: 'Sea',
        adjacent: [
            'Castle Black', 'The Stony Shore', 'Winterfell', "Flint's Finger", 'Greywater Watch',
            'Sunset Sea'
        ],
        units: []
    },
    'The Shivering Sea': {
        id: 'The Shivering Sea', name: 'The Shivering Sea', type: 'Sea',
        adjacent: [
            'Castle Black', 'Karhold', 'Winterfell', 'White Harbor', "Widow's Watch",
            'The Narrow Sea'
        ],
        units: []
    },
    'Sunset Sea': {
        id: 'Sunset Sea', name: 'Sunset Sea', type: 'Sea',
        adjacent: [
            "Flint's Finger", 'Searoad Marches',
            'Bay of Ice', "Ironman's Bay", 'The Golden Sound', 'West Summer Sea'
        ],
        units: []
    },
    "Ironman's Bay": {
        id: "Ironman's Bay", name: "Ironman's Bay", type: 'Sea',
        adjacent: [
            'Pyke', "Flint's Finger", 'Greywater Watch', 'Seagard', 'Riverrun',
            'Sunset Sea', 'The Golden Sound'
        ],
        units: []
    },
    'The Golden Sound': {
        id: 'The Golden Sound', name: 'The Golden Sound', type: 'Sea',
        adjacent: [
            'Lannisport', 'Riverrun', 'Searoad Marches',
            "Ironman's Bay", 'Sunset Sea'
        ],
        units: []
    },
    'The Narrow Sea': {
        id: 'The Narrow Sea', name: 'The Narrow Sea', type: 'Sea',
        adjacent: [
            'Moat Cailin', 'White Harbor', "Widow's Watch", 'The Twins', 'The Fingers',
            'The Mountains of the Moon', 'The Eyrie', 'Crackclaw Point',
            'The Shivering Sea', 'Shipbreaker Bay'
        ],
        units: []
    },
    'Blackwater Bay': {
        id: 'Blackwater Bay', name: 'Blackwater Bay', type: 'Sea',
        adjacent: [
            "King's Landing", 'Crackclaw Point', 'Kingswood',
            'Shipbreaker Bay'
        ],
        units: []
    },
    'Shipbreaker Bay': {
        id: 'Shipbreaker Bay', name: 'Shipbreaker Bay', type: 'Sea',
        adjacent: [
            'Dragonstone', 'Crackclaw Point', 'Kingswood', "Storm's End",
            'The Narrow Sea', 'Blackwater Bay', 'East Summer Sea'
        ],
        units: []
    },
    'Redwyne Straits': {
        id: 'Redwyne Straits', name: 'Redwyne Straits', type: 'Sea',
        adjacent: [
            'Highgarden', 'Oldtown', 'The Arbor', 'Three Towers',
            'West Summer Sea'
        ],
        units: []
    },
    'West Summer Sea': {
        id: 'West Summer Sea', name: 'West Summer Sea', type: 'Sea',
        adjacent: [
            'Highgarden', 'Searoad Marches', 'Three Towers', 'The Arbor', 'Starfall',
            'Sunset Sea', 'Redwyne Straits', 'East Summer Sea'
        ],
        units: []
    },
    'East Summer Sea': {
        id: 'East Summer Sea', name: 'East Summer Sea', type: 'Sea',
        adjacent: [
            'Sunspear', 'Salt Shore', 'Starfall', "Storm's End",
            'West Summer Sea', 'Sea of Dorne', 'Shipbreaker Bay'
        ],
        units: []
    },
    'Sea of Dorne': {
        id: 'Sea of Dorne', name: 'Sea of Dorne', type: 'Sea',
        adjacent: [
            'Sunspear', 'Yronwood', "Storm's End", 'The Boneway',
            'East Summer Sea'
        ],
        units: []
    },

    // ═══════════ PORTS ═══════════

    'Winterfell Port': {
        id: 'Winterfell Port', name: 'Winterfell Port', type: 'Port',
        connectedLand: 'Winterfell', connectedSea: 'Bay of Ice', maxShips: 3,
        adjacent: ['Winterfell', 'Bay of Ice'], units: []
    },
    'White Harbor Port': {
        id: 'White Harbor Port', name: 'White Harbor Port', type: 'Port',
        connectedLand: 'White Harbor', connectedSea: 'The Narrow Sea', maxShips: 3,
        adjacent: ['White Harbor', 'The Narrow Sea'], units: []
    },
    'Pyke Port': {
        id: 'Pyke Port', name: 'Pyke Port', type: 'Port',
        connectedLand: 'Pyke', connectedSea: "Ironman's Bay", maxShips: 3,
        adjacent: ['Pyke', "Ironman's Bay"], units: []
    },
    'Lannisport Port': {
        id: 'Lannisport Port', name: 'Lannisport Port', type: 'Port',
        connectedLand: 'Lannisport', connectedSea: 'The Golden Sound', maxShips: 3,
        adjacent: ['Lannisport', 'The Golden Sound'], units: []
    },
    'Dragonstone Port': {
        id: 'Dragonstone Port', name: 'Dragonstone Port', type: 'Port',
        connectedLand: 'Dragonstone', connectedSea: 'Shipbreaker Bay', maxShips: 3,
        adjacent: ['Dragonstone', 'Shipbreaker Bay'], units: []
    },
    "Storm's End Port": {
        id: "Storm's End Port", name: "Storm's End Port", type: 'Port',
        connectedLand: "Storm's End", connectedSea: 'Shipbreaker Bay', maxShips: 3,
        adjacent: ["Storm's End", 'Shipbreaker Bay'], units: []
    },
    'Highgarden Port': {
        id: 'Highgarden Port', name: 'Highgarden Port', type: 'Port',
        connectedLand: 'Highgarden', connectedSea: 'Redwyne Straits', maxShips: 3,
        adjacent: ['Highgarden', 'Redwyne Straits'], units: []
    },
    'Oldtown Port': {
        id: 'Oldtown Port', name: 'Oldtown Port', type: 'Port',
        connectedLand: 'Oldtown', connectedSea: 'Redwyne Straits', maxShips: 3,
        adjacent: ['Oldtown', 'Redwyne Straits'], units: []
    },
    'Sunspear Port': {
        id: 'Sunspear Port', name: 'Sunspear Port', type: 'Port',
        connectedLand: 'Sunspear', connectedSea: 'East Summer Sea', maxShips: 3,
        adjacent: ['Sunspear', 'East Summer Sea'], units: []
    },
};

// ═══════════ SUPPLY TABLE ═══════════
// From Ruby map.rb: ARMIES_ALLOWED
// Key = supply level, Value = max army sizes allowed (sorted descending)
export const ARMIES_ALLOWED: Record<number, number[]> = {
    0: [2, 2],
    1: [3, 2],
    2: [3, 2, 2],
    3: [3, 2, 2, 2],
    4: [3, 3, 2, 2],
    5: [4, 3, 2, 2],
    6: [4, 3, 2, 2, 2],
};

// ═══════════ GARRISONS ═══════════
// Neutral garrisons placed at game start
export const GARRISONS: Record<string, number> = {
    "King's Landing": 5,
    'The Eyrie': 6,
    'Dragonstone': 2,
    'Winterfell': 2,
    'Lannisport': 2,
    'Highgarden': 2,
    'Sunspear': 2,
    'Pyke': 2,
};
