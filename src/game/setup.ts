import { GameState, HouseName, HouseProfile } from './types';
import { INITIAL_MAP, GARRISONS } from './constants/map';
import { INITIAL_HOUSE_ESTIMATES, HOUSE_CARDS, HOUSE_SETUP } from './constants/houses';
import { WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3 } from './constants/westerosCards';
import { WILDLING_DECK } from './constants/wildlingCards';

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export const PLAYABLE_HOUSES: HouseName[] = ['Stark', 'Lannister', 'Baratheon', 'Greyjoy', 'Tyrell', 'Martell'];

export function createInitialGameState(playerCount: number = 6): GameState {
    // Filter houses based on player count — each house has a minimumPlayers requirement
    const activeHouses = PLAYABLE_HOUSES.filter(h => HOUSE_SETUP[h].minimumPlayers <= playerCount);

    const houseStates: Record<string, HouseProfile> = {};

    activeHouses.forEach(house => {
        const estimate = INITIAL_HOUSE_ESTIMATES[house];
        const setup = HOUSE_SETUP[house];
        houseStates[house] = {
            name: house,
            color: estimate.color!,
            influence: {
                ironThrone: setup.startingPositions.ironThrone,
                fiefdoms: setup.startingPositions.fiefdoms,
                kingsCourt: setup.startingPositions.kingsCourt,
            },
            supply: setup.initialSupply,
            power: estimate.power!,
            availableUnits: {
                Footman: 10,
                Knight: 5,
                Ship: 6,
                SiegeEngine: 2
            },
            cards: HOUSE_CARDS[house],
            discards: [],
            usedOrderTokens: []
        };
    });

    // Deep copy map to avoid mutations affecting constants
    const board = JSON.parse(JSON.stringify(INITIAL_MAP));

    // --- Place Starting Units (from HOUSE_SETUP) ---
    const addUnit = (areaId: string, type: 'Footman' | 'Knight' | 'Ship' | 'SiegeEngine', house: HouseName) => {
        if (board[areaId]) {
            board[areaId].units.push({ id: `${house}-${type}-${Math.random()}`, type, house, routed: false });
            board[areaId].house = house;
        } else {
            console.warn(`Area "${areaId}" not found when placing ${house} ${type}`);
        }
    };

    activeHouses.forEach(house => {
        const setup = HOUSE_SETUP[house];
        setup.startingUnits.forEach(su => {
            su.units.forEach(unitType => {
                addUnit(su.area, unitType, house);
            });
        });
        // Deduct placed units from available pool
        const placed = setup.startingUnits.flatMap(su => su.units);
        placed.forEach(unitType => {
            houseStates[house].availableUnits[unitType]--;
        });
    });

    // Determine turn order based on Iron Throne track (lower is better, 1 is top)
    const turnOrder = [...activeHouses].sort((a, b) => {
        return houseStates[a].influence.ironThrone - houseStates[b].influence.ironThrone;
    });

    // Place garrison tokens on home areas
    const garrisons: Record<string, { house: HouseName; strength: number }> = {};
    activeHouses.forEach(house => {
        const areaId = HOUSE_SETUP[house].homeArea;
        if (board[areaId]) {
            const strength = GARRISONS[areaId] || 2;
            garrisons[areaId] = { house, strength };
        }
    });

    // ── Neutral Forces (3-5 player games) ──
    // Data verified against S&R baseGameData.json

    // === 3 players: BLOCKED regions (impassable) ===
    const BLOCKED_REGIONS_3P = [
        'Pyke', 'Pyke Port', 'Highgarden', 'Oldtown', 'Oldtown Port',
        'Sunspear', 'Sunspear Port', 'Salt Shore', 'Yronwood', 'Starfall',
        'Three Towers', 'Dornish Marches', "Prince's Pass", 'The Boneway',
        "Storm's End", "Storm's End Port"
    ];

    // === 4 players: Neutral garrisons (Tyrell + Martell areas) ===
    const NEUTRAL_GARRISONS_4P: Record<string, number> = {
        'Oldtown': 3,
        'Three Towers': 3,
        'Dornish Marches': 3,
        "Prince's Pass": 3,
        'Starfall': 3,
        'Yronwood': 3,
        'The Boneway': 3,
        "Storm's End": 4,
        'Salt Shore': 3,
        'Sunspear': 5
    };

    // === 5 players: Neutral garrisons (Martell areas) ===
    const NEUTRAL_GARRISONS_5P: Record<string, number> = {
        'Three Towers': 3,
        "Prince's Pass": 3,
        'The Boneway': 3,
        'Starfall': 3,
        'Yronwood': 3,
        'Salt Shore': 3,
        'Sunspear': 5
    };

    if (playerCount === 3) {
        // Block inaccessible southern regions
        BLOCKED_REGIONS_3P.forEach(areaId => {
            if (board[areaId]) {
                board[areaId].blocked = true;
                board[areaId].house = null;
                // High garrison to prevent any combat resolution exploits
                garrisons[areaId] = { house: 'Stark' as HouseName, strength: 99 };
                console.log(`🚫 Blocked: ${areaId}`);
            }
        });
    } else if (playerCount === 4) {
        // Neutral garrison tokens in Tyrell + Martell territory
        Object.entries(NEUTRAL_GARRISONS_4P).forEach(([areaId, strength]) => {
            if (board[areaId]) {
                garrisons[areaId] = { house: 'Tyrell' as HouseName, strength };
                board[areaId].house = 'Tyrell' as HouseName;
                // Correct house assignment for Martell-region areas
                const martellAreas = ['Sunspear', 'Yronwood', 'Salt Shore', 'Starfall', 'The Boneway', "Prince's Pass"];
                if (martellAreas.includes(areaId)) {
                    garrisons[areaId].house = 'Martell' as HouseName;
                    board[areaId].house = 'Martell' as HouseName;
                }
                console.log(`🛡️ Neutral garrison: ${areaId} (${strength})`);
            }
        });
    } else if (playerCount === 5) {
        // Neutral garrison tokens in Martell territory
        Object.entries(NEUTRAL_GARRISONS_5P).forEach(([areaId, strength]) => {
            if (board[areaId]) {
                garrisons[areaId] = { house: 'Martell' as HouseName, strength };
                board[areaId].house = 'Martell' as HouseName;
                console.log(`🛡️ Neutral garrison: ${areaId} (${strength})`);
            }
        });
    }

    return {
        round: 1,
        phase: 'Planning', // Westeros Phase is SKIPPED on round 1
        cas: houseStates as Record<HouseName, HouseProfile>,
        board: board,
        turnOrder: turnOrder,
        wildlingThreat: 2, // Starts at 2 per rules
        garrisons: garrisons,
        currentPlayerHouse: turnOrder[0],
        actionSubPhase: 'Raid' as const,
        actionPlayerIndex: 0,
        valyrianSteelBladeUsed: false,
        messengerRavenUsed: false,
        westerosDeck1: shuffle([...WESTEROS_DECK_1]),
        westerosDeck2: shuffle([...WESTEROS_DECK_2]),
        westerosDeck3: shuffle([...WESTEROS_DECK_3]),
        wildlingDeck: shuffle([...WILDLING_DECK]),
    };
}
