import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../setup';
import { INITIAL_MAP } from '../constants/map';
import {
    resolveMarch, resolveRaid, checkVictory,
    resolveUnitSelection, submitBid, resolveBids, chooseBidTieBreak,
    getMissingOrderAreas, portOwner
} from '../engine';
import {
    initiateCombat, declareSupportChoice, selectHouseCard,
    resolveCombat, computeRetreatOptions
} from '../combat';
import { GameState, HouseName, Unit, UnitType, getStarLimit } from '../types';
import { fitsArmies, maxUnitsAddable } from '../supply';

// ─── helpers ─────────────────────────────────────────────

let unitCounter = 0;
function makeUnit(house: HouseName, type: UnitType, routed = false): Unit {
    return { id: `${house}-${type}-test-${unitCounter++}`, type, house, routed };
}

function placeUnits(state: GameState, areaId: string, house: HouseName, types: UnitType[], routed = false): Unit[] {
    const units = types.map(t => makeUnit(house, t, routed));
    state.board[areaId].units.push(...units);
    if (state.board[areaId].type !== 'Port') state.board[areaId].house = house;
    return units;
}

function clearBoard(state: GameState) {
    Object.values(state.board).forEach(a => { a.units = []; a.house = null; a.order = null; });
    state.garrisons = {};
}

function marchOrder(state: GameState, areaId: string, house: HouseName, strength = 0) {
    state.board[areaId].order = {
        id: `test-march`, type: 'March', house, strength, star: false, tokenIndex: 1
    };
}

// ─── map integrity ───────────────────────────────────────

describe('map integrity', () => {
    it('all adjacencies are symmetric', () => {
        for (const [id, area] of Object.entries(INITIAL_MAP)) {
            for (const adj of area.adjacent) {
                expect(INITIAL_MAP[adj], `"${id}" lista adjacência inexistente "${adj}"`).toBeDefined();
                expect(
                    INITIAL_MAP[adj].adjacent.includes(id),
                    `adjacência assimétrica: ${id} → ${adj}`
                ).toBe(true);
            }
        }
    });

    it('has the 8 official ports (Highgarden has no port)', () => {
        const ports = Object.values(INITIAL_MAP).filter(a => a.type === 'Port');
        expect(ports.length).toBe(8);
        expect(INITIAL_MAP['Highgarden Port']).toBeUndefined();
    });

    it('Blackwater borders Harrenhal but not Dornish Marches', () => {
        expect(INITIAL_MAP['Blackwater'].adjacent).toContain('Harrenhal');
        expect(INITIAL_MAP['Blackwater'].adjacent).not.toContain('Dornish Marches');
        expect(INITIAL_MAP["King's Landing"].adjacent).not.toContain('Harrenhal');
        expect(INITIAL_MAP['Oldtown'].adjacent).not.toContain('The Reach');
    });
});

// ─── setup ───────────────────────────────────────────────

describe('setup', () => {
    it('Lannister starts with a ship in Lannisport Port', () => {
        const s = createInitialGameState(6);
        expect(s.board['Lannisport Port'].units.some(u => u.house === 'Lannister' && u.type === 'Ship')).toBe(true);
    });

    it("King's Landing (5) and The Eyrie (6) have neutral forces", () => {
        const s = createInitialGameState(6);
        expect(s.garrisons["King's Landing"]).toEqual({ house: null, strength: 5 });
        expect(s.garrisons['The Eyrie']).toEqual({ house: null, strength: 6 });
    });

    it('4-player star limits use the overlay (3/2/1/0)', () => {
        expect(getStarLimit(4, 1)).toBe(3);
        expect(getStarLimit(4, 2)).toBe(2);
        expect(getStarLimit(4, 3)).toBe(1);
        expect(getStarLimit(4, 4)).toBe(0);
    });

    it('house cards have official icons (Greatjon/Randyll: 1 sword)', () => {
        const s = createInitialGameState(6);
        const greatjon = s.cas.Stark.cards.find(c => c.id === 'stark-greatjon')!;
        const randyll = s.cas.Tyrell.cards.find(c => c.id === 'tyr-randyll')!;
        expect(greatjon.swords).toBe(1);
        expect(randyll.swords).toBe(1);
    });
});

// ─── supply ──────────────────────────────────────────────

describe('supply', () => {
    it('fitsArmies follows the official table', () => {
        expect(fitsArmies([3, 2], 1)).toBe(true);
        expect(fitsArmies([4], 1)).toBe(false);
        expect(fitsArmies([3, 2, 2], 1)).toBe(false);
        expect(fitsArmies([4, 3, 2, 2, 2], 6)).toBe(true);
    });

    it('marching cannot exceed supply', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        s.cas.Stark.supply = 0; // limits: [2,2]
        placeUnits(s, 'Winterfell', 'Stark', ['Footman', 'Footman']);
        placeUnits(s, 'Moat Cailin', 'Stark', ['Footman', 'Footman']);
        placeUnits(s, 'White Harbor', 'Stark', ['Footman']);
        marchOrder(s, 'White Harbor', 'Stark');
        // Moving into Winterfell would create a 3-unit army (limit 2)
        const ids = s.board['White Harbor'].units.map(u => u.id);
        const after = resolveMarch(s, 'White Harbor', 'Winterfell', ids);
        expect(after).toBe(s); // rejected
    });
});

// ─── combat ──────────────────────────────────────────────

function basicCombat(overrides?: {
    attackerUnits?: UnitType[]; defenderUnits?: UnitType[];
    attackerCardId?: string; defenderCardId?: string;
}) {
    const s = createInitialGameState(6);
    clearBoard(s);
    placeUnits(s, 'Winterfell', 'Stark', overrides?.defenderUnits ?? ['Footman']);
    const attackers = (overrides?.attackerUnits ?? ['Knight', 'Knight']).map(t => makeUnit('Lannister', t));
    placeUnits(s, 'Moat Cailin', 'Lannister', []);
    s.board['Moat Cailin'].house = 'Lannister';
    let st = initiateCombat(s, 'Winterfell', 'Lannister', 'Stark', attackers, 0, 'Moat Cailin');
    st = selectHouseCard(st, 'Lannister', overrides?.attackerCardId ?? 'lan-jaime');   // str 2, 1 sword
    st = selectHouseCard(st, 'Stark', overrides?.defenderCardId ?? 'stark-catelyn');   // str 0
    return st;
}

describe('combat', () => {
    it('only the loser suffers casualties (winner swords - loser forts)', () => {
        let st = basicCombat();
        st = resolveCombat(st);
        // Lannister (2 knights = 4 + Jaime 2) vs Stark (1 footman + Catelyn 0) → Lannister wins
        // Jaime has 1 sword → Stark must choose 1 casualty
        expect(st.pendingUnitSelection?.purpose).toBe('combat-casualties');
        expect(st.pendingUnitSelection?.house).toBe('Stark');
        expect(st.pendingUnitSelection?.count).toBe(1);
        const before = st.cas.Lannister.availableUnits.Knight;
        st = resolveUnitSelection(st, [st.pendingUnitSelection!.eligibleUnitIds[0]]);
        // Attacker (winner) lost nothing
        expect(st.cas.Lannister.availableUnits.Knight).toBe(before);
        // Combat finished, Lannister took Winterfell
        expect(st.combat).toBeUndefined();
        expect(st.board['Winterfell'].house).toBe('Lannister');
    });

    it('conquest removes the defender garrison permanently and clears the loser order', () => {
        let st = basicCombat();
        // Winterfell still had the Stark garrison? (we cleared garrisons in helper — add one)
        st.garrisons['Winterfell'] = { house: 'Stark', strength: 2 };
        st.board['Winterfell'].order = { id: 'x', type: 'ConsolidatePower', house: 'Stark', strength: 0, star: false, tokenIndex: 12 };
        st = resolveCombat(st);
        // Jaime 1 sword: casualties pending — resolve
        if (st.pendingUnitSelection) st = resolveUnitSelection(st, [st.pendingUnitSelection.eligibleUnitIds[0]]);
        expect(st.garrisons['Winterfell']).toBeUndefined();
        expect(st.board['Winterfell'].order).toBeNull();
    });

    it('routed units contribute 0 strength when defending', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'Winterfell', 'Stark', ['Knight', 'Knight'], true); // routed: 0 strength
        const attackers = [makeUnit('Lannister', 'Footman')];
        const st = initiateCombat(s, 'Winterfell', 'Lannister', 'Stark', attackers, 0, 'Moat Cailin');
        expect(st.combat!.defenderStrength).toBe(0);
        expect(st.combat!.attackerStrength).toBe(1);
    });

    it('the 7th house card stays in the discard pile on recycle', () => {
        let st = basicCombat();
        // Leave each player with only the played card in hand
        st.cas.Lannister.discards = st.cas.Lannister.cards.filter(c => c.id !== 'lan-jaime');
        st.cas.Lannister.cards = st.cas.Lannister.cards.filter(c => c.id === 'lan-jaime');
        st.cas.Stark.discards = st.cas.Stark.cards.filter(c => c.id !== 'stark-catelyn');
        st.cas.Stark.cards = st.cas.Stark.cards.filter(c => c.id === 'stark-catelyn');
        st = resolveCombat(st);
        if (st.pendingUnitSelection) st = resolveUnitSelection(st, [st.pendingUnitSelection.eligibleUnitIds[0]]);
        expect(st.cas.Lannister.cards.length).toBe(6);
        expect(st.cas.Lannister.discards.length).toBe(1);
        expect(st.cas.Lannister.discards[0].id).toBe('lan-jaime');
    });

    it('land units never support combat in a sea area', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'The Shivering Sea', 'Stark', ['Ship']);
        placeUnits(s, 'Winterfell', 'Stark', ['Knight', 'Knight']);
        s.board['Winterfell'].order = { id: 'sup', type: 'Support', house: 'Stark', strength: 0, star: false, tokenIndex: 6 };
        const attackers = [makeUnit('Greyjoy', 'Ship'), makeUnit('Greyjoy', 'Ship')];
        let st = initiateCombat(s, 'The Shivering Sea', 'Greyjoy', 'Stark', attackers, 0, 'Bay of Ice');
        // Stark declares own support: knights are land units → contribute 0
        st = declareSupportChoice(st, 'Winterfell', 'defender');
        expect(st.combat!.defenderStrength).toBe(1); // just the ship
    });

    it('Patchface triggers even when its owner loses', () => {
        let st = basicCombat({ defenderUnits: ['Footman'], defenderCardId: 'bar-patchface' });
        // defender is Stark in the helper; use Baratheon as defender instead
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'Kingswood', 'Baratheon', ['Footman']);
        const attackers = [makeUnit('Lannister', 'Knight'), makeUnit('Lannister', 'Knight')];
        st = initiateCombat(s, 'Kingswood', 'Lannister', 'Baratheon', attackers, 0, "King's Landing");
        st = selectHouseCard(st, 'Lannister', 'lan-tywin');
        st = selectHouseCard(st, 'Baratheon', 'bar-patchface');
        st = resolveCombat(st);
        // Baratheon loses but Patchface still lets him discard one of Lannister's cards
        expect(st.pendingPatchface?.baratheonPlayer).toBe('Baratheon');
        expect(st.pendingPatchface?.opponent).toBe('Lannister');
    });

    it('Mace Tyrell destroys a footman and reduces strength before the outcome', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'The Reach', 'Tyrell', ['Footman', 'Footman']);
        const attackers = [makeUnit('Lannister', 'Footman'), makeUnit('Lannister', 'Footman')];
        let st = initiateCombat(s, 'The Reach', 'Lannister', 'Tyrell', attackers, 0, 'Blackwater');
        st = selectHouseCard(st, 'Lannister', 'lan-hound');   // str 2, 2 forts
        st = selectHouseCard(st, 'Tyrell', 'tyr-mace');       // str 4, kills a footman
        st = resolveCombat(st);
        // Attacker: 2 footmen = 2, minus 1 (Mace kill) = 1, + Hound 2 = 3
        // Defender: 2 footmen (castle area? The Reach has castle, defenders no bonus) = 2 + Mace 4 = 6 → Tyrell wins
        expect(st.combat === undefined || st.combat.attackerWon === false).toBe(true);
        // A Lannister footman was returned to the pool by Mace
        expect(st.cas.Lannister.availableUnits.Footman).toBeGreaterThan(8);
    });
});

// ─── retreats ────────────────────────────────────────────

describe('retreats', () => {
    it('ships never retreat to land; land units never to sea', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        const ships = [makeUnit('Stark', 'Ship')];
        placeUnits(s, 'The Shivering Sea', 'Stark', []);
        const { options } = computeRetreatOptions(s, 'Stark', 'The Shivering Sea', ships);
        options.forEach(o => {
            expect(['Sea', 'Port']).toContain(s.board[o].type);
        });

        const foot = [makeUnit('Stark', 'Footman')];
        const landOpts = computeRetreatOptions(s, 'Stark', 'Winterfell', foot);
        landOpts.options.forEach(o => {
            expect(s.board[o].type).toBe('Land');
        });
    });

    it('land units may retreat via ship transport', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'The Shivering Sea', 'Stark', ['Ship']);
        const foot = [makeUnit('Stark', 'Footman')];
        const { options } = computeRetreatOptions(s, 'Stark', 'Winterfell', foot);
        // White Harbor is not directly adjacent... it is adjacent to Winterfell — pick Karhold via sea:
        expect(options).toContain('Karhold'); // adjacent by land anyway
        expect(options).toContain("Widow's Watch"); // ONLY reachable via The Shivering Sea transport
    });

    it('siege engines are destroyed instead of retreating', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'Winterfell', 'Stark', ['SiegeEngine', 'Knight']);
        const attackers = [makeUnit('Lannister', 'Knight'), makeUnit('Lannister', 'Knight'), makeUnit('Lannister', 'Knight')];
        let st = initiateCombat(s, 'Winterfell', 'Lannister', 'Stark', attackers, 0, 'Moat Cailin');
        st = selectHouseCard(st, 'Lannister', 'lan-tywin');    // str 4
        st = selectHouseCard(st, 'Stark', 'stark-catelyn');    // str 0
        const siegeBefore = st.cas.Stark.availableUnits.SiegeEngine;
        st = resolveCombat(st);
        // Tywin has no swords → no casualties; defender retreats: siege destroyed, knight retreats
        expect(st.cas.Stark.availableUnits.SiegeEngine).toBe(siegeBefore + 1);
        expect(st.pendingRetreat?.units.length).toBe(1);
        expect(st.pendingRetreat?.units[0].type).toBe('Knight');
        // Cannot retreat into the attacker's origin
        expect(st.pendingRetreat?.possibleAreas).not.toContain('Moat Cailin');
    });
});

// ─── neutral forces & garrisons ──────────────────────────

describe('neutral forces', () => {
    it('marching equal to the neutral strength destroys it', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        s.garrisons["King's Landing"] = { house: null, strength: 5 };
        placeUnits(s, 'Blackwater', 'Lannister', ['Knight', 'Knight', 'Footman']); // 5 vs KL castle... knights 4 + footman 1 = 5
        marchOrder(s, 'Blackwater', 'Lannister', 0);
        const ids = s.board['Blackwater'].units.map(u => u.id);
        const st = resolveMarch(s, 'Blackwater', "King's Landing", ids);
        expect(st.garrisons["King's Landing"]).toBeUndefined();
        expect(st.board["King's Landing"].house).toBe('Lannister');
    });

    it('marching below the neutral strength is not allowed', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        s.garrisons["King's Landing"] = { house: null, strength: 5 };
        placeUnits(s, 'Blackwater', 'Lannister', ['Knight', 'Knight']); // 4 < 5
        marchOrder(s, 'Blackwater', 'Lannister', 0);
        const ids = s.board['Blackwater'].units.map(u => u.id);
        const st = resolveMarch(s, 'Blackwater', "King's Landing", ids);
        expect(st.garrisons["King's Landing"]).toBeDefined();
        expect(st.board['Blackwater'].units.length).toBe(2); // units stayed
    });

    it('attacking an enemy home garrison with no units starts a real combat', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        s.board['Winterfell'].house = 'Stark';
        s.garrisons['Winterfell'] = { house: 'Stark', strength: 2 };
        placeUnits(s, 'Moat Cailin', 'Lannister', ['Knight']);
        marchOrder(s, 'Moat Cailin', 'Lannister');
        const ids = s.board['Moat Cailin'].units.map(u => u.id);
        const st = resolveMarch(s, 'Moat Cailin', 'Winterfell', ids);
        expect(st.combat).toBeDefined();
        expect(st.combat!.defender).toBe('Stark');
        expect(st.combat!.defenderStrength).toBe(2); // garrison only
    });
});

// ─── raids ───────────────────────────────────────────────

describe('raids', () => {
    it('a land raid can never target a sea area', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'Winterfell', 'Stark', ['Footman']);
        s.board['Winterfell'].order = { id: 'r', type: 'Raid', house: 'Stark', strength: 0, star: false, tokenIndex: 9 };
        placeUnits(s, 'The Shivering Sea', 'Greyjoy', ['Ship']);
        s.board['The Shivering Sea'].order = { id: 's', type: 'Support', house: 'Greyjoy', strength: 0, star: false, tokenIndex: 6 };
        const st = resolveRaid(s, 'Winterfell', 'The Shivering Sea');
        expect(st).toBe(s); // rejected
    });

    it('pillaging a CP order always gives the raider 1 power', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        placeUnits(s, 'Winterfell', 'Stark', ['Footman']);
        s.board['Winterfell'].order = { id: 'r', type: 'Raid', house: 'Stark', strength: 0, star: false, tokenIndex: 9 };
        placeUnits(s, 'Moat Cailin', 'Lannister', ['Footman']);
        s.board['Moat Cailin'].order = { id: 'c', type: 'ConsolidatePower', house: 'Lannister', strength: 0, star: false, tokenIndex: 12 };
        s.cas.Lannister.power = 0; // victim has nothing to lose
        const starkPower = s.cas.Stark.power;
        const st = resolveRaid(s, 'Winterfell', 'Moat Cailin');
        expect(st.cas.Stark.power).toBe(starkPower + 1);
        expect(st.cas.Lannister.power).toBe(0);
    });
});

// ─── wildlings ───────────────────────────────────────────

describe('wildlings', () => {
    it('defeat moves the threat token back two positions (-4)', () => {
        const s = createInitialGameState(6);
        s.wildlingThreat = 10;
        s.pendingBidding = { type: 'wildling', bids: {}, resolved: false };
        let st = s;
        st.turnOrder.forEach(h => { st.cas[h].power = 10; });
        st = st.turnOrder.reduce((acc, h, i) => submitBid(acc, h, i === 0 ? 1 : 0), st);
        // total 1 < 10 → defeat; but bids tie at 0 → tie-break for lowest
        st = resolveBids(st);
        if (st.pendingBidTieBreak) {
            // decider picks the first tied house
            st = chooseBidTieBreak(st, st.pendingBidTieBreak.tiedHouses[0]);
        }
        expect(st.wildlingThreat).toBe(6); // 10 - 4
    });

    it('victory resets the threat to 0', () => {
        const s = createInitialGameState(6);
        s.wildlingThreat = 4;
        s.pendingBidding = { type: 'wildling', bids: {}, resolved: false };
        let st = s;
        st.turnOrder.forEach(h => { st.cas[h].power = 10; });
        // Distinct bids: 6,5,4,3,2,1 → total 21 ≥ 4
        st = st.turnOrder.reduce((acc, h, i) => submitBid(acc, h, 6 - i), st);
        st = resolveBids(st);
        expect(st.wildlingThreat).toBe(0);
        expect(st.currentWildlingCard).toBeDefined();
    });

    it('used wildling cards are buried at the bottom of the deck', () => {
        const s = createInitialGameState(6);
        s.wildlingThreat = 2;
        const topCard = s.wildlingDeck![0];
        s.pendingBidding = { type: 'wildling', bids: {}, resolved: false };
        let st = s;
        st.turnOrder.forEach(h => { st.cas[h].power = 10; });
        st = st.turnOrder.reduce((acc, h, i) => submitBid(acc, h, 6 - i), st);
        st = resolveBids(st);
        expect(st.wildlingDeck![st.wildlingDeck!.length - 1].id).toBe(topCard.id);
        expect(st.wildlingDeck!.length).toBe(9);
    });
});

// ─── victory ─────────────────────────────────────────────

describe('victory', () => {
    it('round-10 tiebreak counts strongholds before supply', () => {
        const s = createInitialGameState(6);
        clearBoard(s);
        s.round = 11;
        // Stark: 1 stronghold + 1 castle; Lannister: 2 castles (same total, fewer strongholds)
        placeUnits(s, 'Winterfell', 'Stark', ['Footman']);       // stronghold
        placeUnits(s, 'White Harbor', 'Stark', ['Footman']);     // castle
        placeUnits(s, 'Moat Cailin', 'Lannister', ['Footman']);  // castle
        placeUnits(s, 'Harrenhal', 'Lannister', ['Footman']);    // castle
        s.cas.Lannister.supply = 6; // higher supply would win under the old (wrong) rule
        s.cas.Stark.supply = 0;
        const st = checkVictory(s);
        expect(st.winner).toBe('Stark');
    });
});

// ─── planning ────────────────────────────────────────────

describe('planning', () => {
    it('detects areas missing mandatory orders', () => {
        const s = createInitialGameState(6);
        const missing = getMissingOrderAreas(s);
        expect(missing.length).toBeGreaterThan(0); // fresh game: nobody placed orders
    });

    it('port owner follows the connected land area', () => {
        const s = createInitialGameState(6);
        expect(portOwner(s, 'Lannisport Port')).toBe('Lannister');
        expect(portOwner(s, 'Winterfell Port')).toBe('Stark');
    });
});
