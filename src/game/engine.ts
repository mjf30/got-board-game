import { GameState, Order, OrderType, HouseName, UnitType, Unit, getStarLimit, MUSTER_COSTS, ActionSubPhase, Decision, UnitSelection } from './types';
import {
    initiateCombat, handleCombatDecision, applyCombatCasualties,
    applyRetreatSupplyLoss, applyRenlyUpgrade, supportAreaStrength
} from './combat';
import { WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3 } from './constants/westerosCards';
import { WILDLING_DECK, WildlingCard } from './constants/wildlingCards';
import { checkSupplyLimits, maxUnitsAddable, fitsArmies } from './supply';
import { isMoveValid } from './navigation';
import { ORDER_TOKENS } from './types';
import { HOUSE_SETUP } from './constants/houses';

// Retreat resolution lives in combat.ts (kept as engine re-exports for the UI)
export { resolveRetreat, resolveRobbRetreat, computeRetreatOptions } from './combat';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function countCastlesAndStrongholds(state: GameState, house: HouseName): number {
    let count = 0;
    Object.values(state.board).forEach(area => {
        if (area.house === house && (area.castle || area.stronghold)) count++;
    });
    return count;
}

/** Get the holder of a dominance token (position 1 on the track) */
function getTrackHolder(state: GameState, track: 'ironThrone' | 'fiefdoms' | 'kingsCourt'): HouseName {
    let best: HouseName = state.turnOrder[0];
    let bestVal = 99;
    for (const house of state.turnOrder) {
        if (state.cas[house].influence[track] < bestVal) {
            bestVal = state.cas[house].influence[track];
            best = house;
        }
    }
    return best;
}

/** How many star orders can this house use? Based on King's Court position and player count */
function getStarOrderLimit(state: GameState, house: HouseName): number {
    const position = state.cas[house].influence.kingsCourt;
    const playerCount = state.turnOrder.length;
    return getStarLimit(playerCount, position);
}

/** Check if a house has any orders of a given type on the board */
function houseHasOrderType(state: GameState, house: HouseName, orderType: OrderType): boolean {
    return Object.values(state.board).some(
        area => area.order?.house === house && area.order?.type === orderType
    );
}

/** Get the next player in turn order who has orders of the given type, or null if none */
function findNextPlayerWithOrder(state: GameState, orderType: OrderType, startIndex: number): number | null {
    for (let i = 0; i < state.turnOrder.length; i++) {
        const idx = (startIndex + i) % state.turnOrder.length;
        if (houseHasOrderType(state, state.turnOrder[idx], orderType)) return idx;
    }
    return null;
}

/** The house whose printed crest marks this area as its home area (permanent control marker) */
export function homeCrestOwner(areaId: string): HouseName | null {
    for (const h of Object.keys(HOUSE_SETUP) as HouseName[]) {
        if (HOUSE_SETUP[h].homeArea === areaId) return h;
    }
    return null;
}

/** A port belongs to whoever controls its connected land area */
export function portOwner(state: GameState, portId: string): HouseName | null {
    const port = state.board[portId];
    if (!port?.connectedLand) return null;
    return state.board[port.connectedLand]?.house ?? null;
}

/** Who controls an empty area: board power token, else printed home crest, else nobody */
function residualController(state: GameState, areaId: string): HouseName | null {
    return state.board[areaId].powerToken ?? homeCrestOwner(areaId) ?? null;
}

/** Move a house to the bottom of a track; everyone below shifts up (mutates cas) */
export function shiftToBottom(state: GameState, house: HouseName, track: 'ironThrone' | 'fiefdoms' | 'kingsCourt') {
    const pos = state.cas[house].influence[track];
    const total = Object.keys(state.cas).length;
    (Object.keys(state.cas) as HouseName[]).forEach(h => {
        if (h !== house && state.cas[h].influence[track] > pos) state.cas[h].influence[track] -= 1;
    });
    state.cas[house].influence[track] = total;
}

/** Move a house to the top of a track; everyone above shifts down (mutates cas) */
export function shiftToTop(state: GameState, house: HouseName, track: 'ironThrone' | 'fiefdoms' | 'kingsCourt') {
    const pos = state.cas[house].influence[track];
    (Object.keys(state.cas) as HouseName[]).forEach(h => {
        if (h !== house && state.cas[h].influence[track] < pos) state.cas[h].influence[track] += 1;
    });
    state.cas[house].influence[track] = 1;
}

/** Re-derive turn order from the Iron Throne track (used after any influence shift) */
export function syncTurnOrder(state: GameState): GameState {
    const newOrder = [...state.turnOrder].sort(
        (a, b) => state.cas[a].influence.ironThrone - state.cas[b].influence.ironThrone
    );
    const s = { ...state, turnOrder: newOrder };
    if (s.phase === 'Action') {
        const idx = newOrder.indexOf(state.currentPlayerHouse);
        if (idx >= 0) s.actionPlayerIndex = idx;
    }
    return s;
}

/** Pop queued unit selections / decisions into the active slots */
export function advanceQueues(state: GameState): GameState {
    const s = { ...state };
    if (!s.pendingUnitSelection && s.pendingUnitSelectionQueue?.length) {
        const [next, ...rest] = s.pendingUnitSelectionQueue;
        s.pendingUnitSelection = next;
        s.pendingUnitSelectionQueue = rest.length ? rest : undefined;
    }
    if (!s.pendingUnitSelection && !s.pendingDecision && s.pendingDecisionQueue?.length) {
        const [next, ...rest] = s.pendingDecisionQueue;
        s.pendingDecision = next;
        s.pendingDecisionQueue = rest.length ? rest : undefined;
    }
    return s;
}

/** Clear control of a land area emptied by unit destruction (no establishing control via events) */
function clearControlIfEmpty(state: GameState, areaId: string) {
    const area = state.board[areaId];
    if (area.units.length > 0) return;
    if (area.type === 'Sea' || area.type === 'Port') {
        area.house = null;
    } else {
        area.house = residualController(state, areaId);
    }
}

// ═══════════════════════════════════════════════
// VICTORY
// ═══════════════════════════════════════════════

export function checkVictory(state: GameState): GameState {
    const newState = { ...state };

    // Instant Win: 7 Castles/Strongholds
    for (const house of state.turnOrder) {
        if (countCastlesAndStrongholds(state, house) >= 7) {
            newState.winner = house;
            console.log(`🏆 ${house} wins with 7+ castles/strongholds!`);
            return newState;
        }
    }

    // Round 10 Time Limit
    if (state.round > 10) {
        let winner: HouseName = state.turnOrder[0];
        // 1. Castles/Strongholds
        // 2. Supply
        // 3. Power
        // 4. Iron Throne Position

        const scores = state.turnOrder.map(house => {
            let strongholds = 0;
            Object.values(state.board).forEach(area => {
                if (area.house === house && area.stronghold) strongholds++;
            });
            return {
                house,
                castles: countCastlesAndStrongholds(state, house),
                strongholds,
                supply: state.cas[house].supply,
                power: state.cas[house].power,
                thronePos: state.cas[house].influence.ironThrone
            };
        });

        // Official tiebreakers: castles+strongholds → most Strongholds → Supply → available Power → Iron Throne
        scores.sort((a, b) => {
            if (b.castles !== a.castles) return b.castles - a.castles;
            if (b.strongholds !== a.strongholds) return b.strongholds - a.strongholds;
            if (b.supply !== a.supply) return b.supply - a.supply;
            if (b.power !== a.power) return b.power - a.power;
            return a.thronePos - b.thronePos;
        });

        winner = scores[0].house;
        newState.winner = winner;
        console.log(`🏆 Round 10 end! Winner: ${winner}`);
        console.log(`  Stats: ${scores.map(s => `${s.house}(C:${s.castles} S:${s.supply} P:${s.power} T:${s.thronePos})`).join(', ')}`);
    }
    return newState;
}

// ═══════════════════════════════════════════════
// PHASE RESOLUTION
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// PHASE RESOLUTION
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════

export function applyWesterosCardEffect(state: GameState, cardName: string, deckIndex: number): GameState {
    let newState = { ...state };

    // Reshuffle Logic (Winter is Coming)
    if (cardName === 'Winter is Coming') {
        // Reshuffle the full deck source and draw a new card
        const deckSources = [WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3];
        const reshuffled = shuffle([...deckSources[deckIndex]]);
        const newCard = reshuffled.shift()!;
        // Update persistent deck
        if (deckIndex === 0) newState.westerosDeck1 = reshuffled;
        else if (deckIndex === 1) newState.westerosDeck2 = reshuffled;
        else newState.westerosDeck3 = reshuffled;

        // Update drawn cards display
        if (newState.drawnWesterosCards) {
            newState.drawnWesterosCards[deckIndex] = newCard.name;
        }

        newState.uiMessage = `🔄 Deck ${['I', 'II', 'III'][deckIndex]} Reshuffled! New Card Drawn.`;
        console.log(`  🔄 Winter is Coming! Reshuffled Deck ${deckIndex + 1}. Drawn: ${newCard.name}`);
        return newState;
    }

    if (deckIndex === 0) { // Deck I
        if (cardName === 'Mustering') {
            newState = triggerMustering(newState);
        } else if (cardName === 'A Throne of Blades') {
            // Iron Throne holder chooses: Supply, Mustering, or nothing
            const holder = getTrackHolder(state, 'ironThrone');
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'Mustering', action: 'Mustering' },
                    { label: 'Supply', action: 'Supply' },
                    { label: 'Nada acontece', action: 'Nothing' }
                ]
            };
            console.log(`  ❓ A Throne of Blades: ${holder} must choose.`);
        } else if (cardName === 'Supply') {
            newState = recalculateSupply(newState);
            // Check violations and require reconciliation
            const violations = checkSupplyLimits(newState);
            const violatingHouses = (Object.keys(violations) as HouseName[]).filter(h => violations[h]);
            if (violatingHouses.length > 0) {
                newState.pendingReconcile = violatingHouses.map(house => ({
                    house,
                    violations: getSupplyViolationDetails(newState, house)
                }));
                console.warn(`  ⚠️ Supply Violations: ${violatingHouses.join(', ')} must reconcile armies`);
            }
        }
    } else if (deckIndex === 1) { // Deck II
        if (cardName === 'Clash of Kings') {
            newState.pendingBidding = {
                type: 'ironThrone',
                bids: {},
                resolved: false,
                currentTrack: 'ironThrone',
                remainingTracks: ['fiefdoms', 'kingsCourt']
            };
            console.log(`  👑 Clash of Kings! Bidding on Iron Throne...`);
        } else if (cardName === 'Dark Wings, Dark Words') {
            // Messenger Raven holder (King's Court #1) chooses: Clash of Kings, Game of Thrones, or nothing
            const holder = getTrackHolder(state, 'kingsCourt');
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'Clash of Kings', action: 'Clash of Kings' },
                    { label: 'Game of Thrones', action: 'Game of Thrones' },
                    { label: 'Nada acontece', action: 'Nothing' }
                ]
            };
            console.log(`  ❓ Dark Wings, Dark Words: ${holder} must choose.`);
        } else if (cardName === 'Game of Thrones') {
            newState.pendingGameOfThrones = true;
            console.log(`  🎭 Game of Thrones! Collecting power from crown areas...`);
        }
    } else if (deckIndex === 2) { // Deck III
        if (cardName === 'Wildling Attack') {
            if (!newState.pendingBidding) {
                newState.pendingBidding = {
                    type: 'wildling',
                    bids: {},
                    resolved: false
                };
                console.log(`  🐺 WILDLING ATTACK! All houses must bid Power tokens!`);
            }
        } else if (cardName === 'Put to the Sword') {
            // VSB holder chooses: no Defense, no March +1, or no restrictions
            const holder = getTrackHolder(state, 'fiefdoms'); // Valyrian Steel Blade holder
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'Sem ordens de Defesa', action: 'Storm of Swords' },
                    { label: 'Sem ordens de Marcha +1', action: 'Rains of Autumn' },
                    { label: 'Sem restrições', action: 'Nothing' }
                ]
            };
            console.log(`  ❓ Put to the Sword: ${holder} must choose.`);
        } else {
            // Restrictions auto-apply
            newState.orderRestrictions = undefined;
            newState.orderStarRestrictions = undefined;
            const restrictionMap: Record<string, OrderType[]> = {
                'Sea of Storms': ['Raid'],
                'Feast for Crows': ['ConsolidatePower'],
                'Web of Lies': ['Support'],
                'Storm of Swords': ['Defense'],
            };
            const starRestrictionMap: Record<string, OrderType[]> = {
                'Rains of Autumn': ['March'],
            };
            if (restrictionMap[cardName]) {
                newState.orderRestrictions = restrictionMap[cardName];
                console.log(`  ⚡ Banned: ${newState.orderRestrictions.join(', ')}`);
            }
            if (starRestrictionMap[cardName]) {
                newState.orderStarRestrictions = starRestrictionMap[cardName];
                console.log(`  ⚡ Banned (star only): ${newState.orderStarRestrictions.join(', ')}★`);
            }
        }
    }

    return newState;
}

/** Build a destroy-units selection for a house (returns null when the house has no units) */
function buildDestroySelection(
    state: GameState, house: HouseName, count: number, prompt: string, restrictAreaId?: string
): UnitSelection | null {
    const eligible: string[] = [];
    Object.entries(state.board).forEach(([aId, area]) => {
        if (restrictAreaId && aId !== restrictAreaId) return;
        area.units.forEach(u => { if (u.house === house) eligible.push(u.id); });
    });
    if (eligible.length === 0) return null;
    return {
        purpose: 'destroy-units',
        house,
        count: Math.min(count, eligible.length),
        eligibleUnitIds: eligible,
        prompt
    };
}

export function makeDecision(state: GameState, action: string): GameState {
    if (!state.pendingDecision) return state;

    // Combat decisions are handled by the combat module
    if (action.startsWith('combat:')) {
        return handleCombatDecision(state, action);
    }

    let newState = { ...state };
    const { cardName, chooser } = state.pendingDecision;

    console.log(`👉 Decision made: ${action} (for ${cardName})`);

    // Clear decision
    newState.pendingDecision = undefined;

    // Execute chosen action
    if (action === 'Mustering') {
        newState = triggerMustering(newState);
    } else if (action === 'Supply') {
        newState = recalculateSupply(newState);
        // Check for supply violations requiring reconciliation
        const violations = checkSupplyLimits(newState);
        const violatingHouses = (Object.keys(violations) as HouseName[]).filter(h => violations[h]);
        if (violatingHouses.length > 0) {
            newState.pendingReconcile = violatingHouses.map(house => ({
                house,
                violations: getSupplyViolationDetails(newState, house)
            }));
            console.warn(`  ⚠️ Supply Violations: ${violatingHouses.join(', ')} must reconcile armies`);
        }
    } else if (action === 'Clash of Kings') {
        newState.pendingBidding = {
            type: 'ironThrone',
            bids: {},
            resolved: false,
            currentTrack: 'ironThrone',
            remainingTracks: ['fiefdoms', 'kingsCourt']
        };
    } else if (action === 'Game of Thrones') {
        newState.pendingGameOfThrones = true;
    } else if (action.startsWith('horde-muster:')) {
        // Horde Descends reward: muster in the chosen area
        const parts = action.split(':');
        const hmAreaId = parts[1];
        const hmPoints = parseInt(parts[2]);
        newState.pendingMustering = [{
            house: chooser,
            areaId: hmAreaId,
            pointsRemaining: hmPoints
        }];
        console.log(`🏗️ Horde Descends: mustering in ${hmAreaId} (${hmPoints} pts)`);
    } else if (action.startsWith('horde-hit:')) {
        // Horde Descends penalty: destroy 2 units at the chosen castle/stronghold
        const areaId = action.slice('horde-hit:'.length);
        const sel = buildDestroySelection(newState, chooser, 2,
            `The Horde Descends: destrua 2 unidades em ${newState.board[areaId]?.name}`, areaId);
        if (sel) newState.pendingUnitSelection = sel;
    } else if (action === 'preemptive-destroy') {
        // Preemptive Raid: destroy 2 units of your choice
        const sel = buildDestroySelection(newState, chooser, 2, 'Preemptive Raid: destrua 2 unidades suas');
        if (sel) newState.pendingUnitSelection = sel;
    } else if (action === 'preemptive-track') {
        // Preemptive Raid: lose 2 positions on highest (best) Influence track
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        const prTracks = ['ironThrone', 'fiefdoms', 'kingsCourt'] as const;
        const bestTrack = prTracks.reduce((best, t) =>
            newState.cas[chooser].influence[t] < newState.cas[chooser].influence[best] ? t : best
        , prTracks[0]);
        const totalPositions = Object.keys(newState.cas).length;
        const newPos = Math.min(totalPositions, newState.cas[chooser].influence[bestTrack] + 2);
        Object.keys(newState.cas).forEach(h => {
            if (h !== chooser) {
                const hPos = newState.cas[h as HouseName].influence[bestTrack];
                if (hPos > newState.cas[chooser].influence[bestTrack] && hPos <= newPos) {
                    newState.cas[h as HouseName].influence[bestTrack] -= 1;
                }
            }
        });
        newState.cas[chooser].influence[bestTrack] = newPos;
        if (bestTrack === 'ironThrone') newState = syncTurnOrder(newState);
        console.log(`📉 Preemptive Raid: ${chooser} moved down 2 positions on ${bestTrack}`);
    } else if (action.startsWith('kbw-top:')) {
        // A King Beyond the Wall reward: move to top of one track
        const track = action.slice('kbw-top:'.length) as 'ironThrone' | 'fiefdoms' | 'kingsCourt';
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        shiftToTop(newState, chooser, track);
        if (track === 'ironThrone') newState = syncTurnOrder(newState);
        console.log(`👑 King Beyond the Wall: ${chooser} → top of ${track}`);
    } else if (action.startsWith('kbw-bottom:')) {
        // A King Beyond the Wall penalty: chosen track → bottom
        const track = action.slice('kbw-bottom:'.length) as 'fiefdoms' | 'kingsCourt';
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        shiftToBottom(newState, chooser, track);
        console.log(`💀 King Beyond the Wall: ${chooser} → bottom of ${track}`);
    } else if (action.startsWith('milkwater:')) {
        // Massing on the Milkwater penalty: chosen card is discarded
        const cardId = action.slice('milkwater:'.length);
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        const card = newState.cas[chooser].cards.find(c => c.id === cardId);
        if (card) {
            newState.cas[chooser].cards = newState.cas[chooser].cards.filter(c => c.id !== cardId);
            newState.cas[chooser].discards.push(card);
            console.log(`💀 Milkwater: ${chooser} discarded ${card.name}`);
        }
    } else if (action.startsWith('mammoth:')) {
        // Mammoth Riders reward: retrieve a card from the discard pile
        const cardId = action.slice('mammoth:'.length);
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        const card = newState.cas[chooser].discards.find(c => c.id === cardId);
        if (card) {
            newState.cas[chooser].discards = newState.cas[chooser].discards.filter(c => c.id !== cardId);
            newState.cas[chooser].cards.push(card);
            console.log(`🏆 Mammoth Riders: ${chooser} retrieved ${card.name}`);
        }
    } else if (action === 'raven:swap') {
        newState.pendingRavenSwap = { holder: chooser };
        return newState;
    } else if (action === 'raven:peek') {
        let deck = [...(newState.wildlingDeck ?? [])];
        if (deck.length === 0) deck = [...WILDLING_DECK];
        newState.wildlingDeck = deck;
        newState.messengerRavenUsed = true;
        newState.pendingRavenPeek = { holder: chooser, card: deck[0] };
        console.log(`🐦 ${chooser} peeks at the top wildling card`);
        return newState;
    } else if (action === 'raven:decline') {
        return startActionPhase(newState);
    } else if (action === 'Nothing') {
        // Do nothing
    } else {
        // Restrictions (Put to the Sword)
        const restrictionMap: Record<string, OrderType[]> = {
            'Sea of Storms': ['Raid'],
            'Feast for Crows': ['ConsolidatePower'],
            'Web of Lies': ['Support'],
            'Storm of Swords': ['Defense'],
        };
        const starRestrictionMap: Record<string, OrderType[]> = {
            'Rains of Autumn': ['March'],
        };
        if (restrictionMap[action]) {
            newState.orderRestrictions = restrictionMap[action];
            console.log(`  ⚡ Restricted via Decision: ${newState.orderRestrictions.join(', ')}`);
        }
        if (starRestrictionMap[action]) {
            newState.orderStarRestrictions = starRestrictionMap[action];
            console.log(`  ⚡ Restricted (star only): ${newState.orderStarRestrictions.join(', ')}★`);
        }
    }

    // Pop queued decisions/selections, then try to advance the Westeros phase
    newState = advanceQueues(newState);
    if (newState.phase === 'Westeros' &&
        !newState.pendingDecision && !newState.pendingUnitSelection &&
        !newState.pendingBidding && !newState.pendingMustering && !newState.drawnWesterosCards) {
        newState = tryAdvanceWesteros(newState);
    }

    return newState;
}

/** Resolve the Messenger Raven peek: return the card to the top or bury it at the bottom */
export function resolveRavenPeek(state: GameState, placement: 'top' | 'bottom'): GameState {
    if (!state.pendingRavenPeek) return state;
    const newState = { ...state };
    const deck = [...(newState.wildlingDeck ?? [])];
    if (placement === 'bottom' && deck.length > 0) {
        const top = deck.shift()!;
        deck.push(top);
        console.log(`🐦 Wildling card buried at the bottom of the deck`);
    } else {
        console.log(`🐦 Wildling card returned to the top of the deck`);
    }
    newState.wildlingDeck = deck;
    newState.pendingRavenPeek = undefined;
    return startActionPhase(newState);
}

/** Cancel the raven swap without using it */
export function skipRavenSwap(state: GameState): GameState {
    if (!state.pendingRavenSwap) return state;
    const newState = { ...state, pendingRavenSwap: undefined };
    return startActionPhase(newState);
}

export function resolveNextWesterosCard(state: GameState): GameState {
    let newState = { ...state };
    const idx = newState.westerosActionIndex ?? 0;
    const cards = newState.drawnWesterosCards;

    // Safety check
    if (!cards) {
        return tryAdvanceWesteros(newState);
    }

    // If we've resolved all 3 cards (index 0,1,2 dealt with), finish phase
    if (idx >= 3) {
        newState.drawnWesterosCards = undefined;
        newState.westerosActionIndex = undefined;
        // Proceed to Planning via standard check
        return tryAdvanceWesteros(newState);
    }

    // Resolve current card
    const cardName = cards[idx];
    console.log(`Resolving Card ${idx + 1}: ${cardName}`);
    newState = applyWesterosCardEffect(newState, cardName, idx);

    // FIX: If the card CHANGED (Reshuffle), do not advance index.
    // The user will see the new card and click "Resolve" again.
    if (newState.drawnWesterosCards && newState.drawnWesterosCards[idx] !== cardName) {
        return newState;
    }

    // Advance index
    newState.westerosActionIndex = idx + 1;

    // If we just resolved the last card (Deck III, idx was 2, now 3), check if we can finish immediately
    if (newState.westerosActionIndex >= 3) {
        // Only auto-finish if we are NOT blocked by pending events spawned by Card III (e.g. Wildling)
        if (!newState.pendingBidding && !newState.pendingMustering && !newState.pendingGameOfThrones &&
            !newState.pendingDecision && !newState.pendingUnitSelection && !newState.pendingReconcile &&
            !newState.pendingBidTieBreak) {
            newState.drawnWesterosCards = undefined;
            newState.westerosActionIndex = undefined;
            return tryAdvanceWesteros(newState);
        }
    }

    return newState;
}

/** Areas that still need an order during the Planning phase (placing orders is mandatory).
 *  A house short on eligible tokens is exempt for the areas it cannot cover. */
export function getMissingOrderAreas(state: GameState): { house: HouseName; areaId: string }[] {
    const missing: { house: HouseName; areaId: string }[] = [];
    for (const house of state.turnOrder) {
        const areas = Object.entries(state.board).filter(([, a]) => {
            const controller = a.type === 'Port' ? portOwner(state, a.id) : a.house;
            return controller === house && a.units.length > 0;
        });
        const uncovered = areas.filter(([, a]) => !a.order || a.order.house !== house);
        // Eligible tokens still available (not used, not banned this round)
        const usable = ORDER_TOKENS.filter((t, idx) => {
            if (state.cas[house].usedOrderTokens.includes(idx)) return false;
            if (state.orderRestrictions?.includes(t.type)) return false;
            if (t.star && state.orderStarRestrictions?.includes(t.type)) return false;
            return true;
        }).length;
        const required = Math.min(uncovered.length, usable);
        uncovered.slice(0, required).forEach(([aId]) => missing.push({ house, areaId: aId }));
    }
    return missing;
}

/** Transition Planning → Action (after the Messenger Raven step) */
export function startActionPhase(state: GameState): GameState {
    const newState = { ...state };
    newState.pendingRavenSwap = undefined;
    newState.pendingRavenPeek = undefined;
    newState.phase = 'Action';
    newState.actionSubPhase = 'Raid';
    newState.actionPlayerIndex = 0;
    const nextRaid = findNextPlayerWithOrder(newState, 'Raid', 0);
    if (nextRaid !== null) {
        newState.actionPlayerIndex = nextRaid;
        newState.currentPlayerHouse = newState.turnOrder[nextRaid];
    } else {
        newState.actionSubPhase = 'March';
        const nextMarch = findNextPlayerWithOrder(newState, 'March', 0);
        if (nextMarch !== null) {
            newState.actionPlayerIndex = nextMarch;
            newState.currentPlayerHouse = newState.turnOrder[nextMarch];
        } else {
            newState.actionSubPhase = 'ConsolidatePower';
        }
    }
    return newState;
}

export function resolvePhase(state: GameState): GameState {
    let newState = { ...state };

    if (state.phase === 'Westeros') {
        // Guard: If cards are already drawn OR we are in the middle of resolving events, do nothing.
        if (state.drawnWesterosCards || state.pendingBidding || state.pendingMustering ||
            state.pendingGameOfThrones || state.pendingDecision || state.pendingUnitSelection ||
            state.pendingReconcile || state.pendingBidTieBreak || state.currentWildlingCard) {
            return newState;
        }

        if (state.round === 1) {
            newState.phase = 'Planning';
            newState.orderRestrictions = undefined;
            newState.orderStarRestrictions = undefined;
            return newState;
        }

        // Draw from persistent decks (reshuffle when empty)
        let d1 = [...(newState.westerosDeck1 ?? shuffle([...WESTEROS_DECK_1]))];
        let d2 = [...(newState.westerosDeck2 ?? shuffle([...WESTEROS_DECK_2]))];
        let d3 = [...(newState.westerosDeck3 ?? shuffle([...WESTEROS_DECK_3]))];
        if (d1.length === 0) d1 = shuffle([...WESTEROS_DECK_1]);
        if (d2.length === 0) d2 = shuffle([...WESTEROS_DECK_2]);
        if (d3.length === 0) d3 = shuffle([...WESTEROS_DECK_3]);
        const card1 = d1.shift()!;
        const card2 = d2.shift()!;
        const card3 = d3.shift()!;
        newState.westerosDeck1 = d1;
        newState.westerosDeck2 = d2;
        newState.westerosDeck3 = d3;

        // Advance Wildling Threat for each card with wildling icon (Step 3 of Westeros Phase)
        const before = newState.wildlingThreat || 0;
        [card1, card2, card3].forEach(card => {
            if (card.wildlingIcon) {
                newState.wildlingThreat = Math.min(12, (newState.wildlingThreat || 0) + 2);
            }
        });

        newState.drawnWesterosCards = [card1.name, card2.name, card3.name];
        newState.westerosActionIndex = 0;

        // If the threat token reached "12", a Wildling Attack resolves IMMEDIATELY
        // (before resolving the Westeros cards)
        if (before < 12 && newState.wildlingThreat >= 12) {
            newState.pendingBidding = { type: 'wildling', bids: {}, resolved: false };
            console.log(`  🐺 WILDLING THREAT AT 12 — immediate attack before resolving cards!`);
        }

        console.log(`📜 Westeros — Round ${state.round}`);
        console.log(`  I: ${card1.name}  II: ${card2.name}  III: ${card3.name}`);
        console.log(`  🐺 Wildling Threat: ${newState.wildlingThreat}`);

    } else if (state.phase === 'Planning') {
        // Placing one order on every area with units is mandatory
        const missing = getMissingOrderAreas(newState);
        if (missing.length > 0) {
            newState.uiMessage = `⚠️ Ordens obrigatórias faltando: ${missing.map(m => `${m.house} (${state.board[m.areaId].name})`).join(', ')}`;
            console.warn(newState.uiMessage);
            return newState;
        }
        newState.uiMessage = undefined;

        // Messenger Raven step: the holder may swap an order or peek at the wildling deck
        if (!newState.messengerRavenUsed && !newState.ravenPromptShown) {
            const holder = getTrackHolder(newState, 'kingsCourt');
            newState.ravenPromptShown = true;
            newState.pendingDecision = {
                cardName: 'Corvo Mensageiro',
                chooser: holder,
                options: [
                    { label: 'Trocar uma ordem no tabuleiro', action: 'raven:swap' },
                    { label: 'Ver a carta do topo do baralho Wildling', action: 'raven:peek' },
                    { label: 'Não usar', action: 'raven:decline' }
                ]
            };
            return newState;
        }

        newState = startActionPhase(newState);

    } else if (state.phase === 'Action') {
        // Cleanup
        newState.board = JSON.parse(JSON.stringify(state.board));
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        Object.values(newState.board).forEach(area => {
            area.order = null;
            // Unroute units at end of round
            area.units.forEach(u => { u.routed = false; });
        });
        Object.values(newState.cas).forEach(house => { house.usedOrderTokens = []; });

        newState.phase = 'Westeros';
        newState.round += 1;
        newState.orderRestrictions = undefined;
        newState.orderStarRestrictions = undefined;
        newState.valyrianSteelBladeUsed = false;
        newState.messengerRavenUsed = false;
        newState.ravenPromptShown = false;
        newState.actionSubPhase = 'Raid';
        newState.actionPlayerIndex = 0;
        newState = checkVictory(newState);
    }

    return newState;
}

/** Advance to the next player/sub-phase in the Action Phase */
export function advanceActionTurn(state: GameState): GameState {
    if (state.phase !== 'Action') return state;
    const newState = { ...state };

    const subPhases: ActionSubPhase[] = ['Raid', 'March', 'ConsolidatePower'];
    let subIdx = subPhases.indexOf(state.actionSubPhase);
    let playerIdx = (state.actionPlayerIndex + 1) % state.turnOrder.length;

    // Find next player with matching order in current sub-phase
    const orderTypeMap: Record<string, OrderType> = { 'Raid': 'Raid', 'March': 'March', 'ConsolidatePower': 'ConsolidatePower' };

    while (subIdx < subPhases.length) {
        const orderType = orderTypeMap[subPhases[subIdx]];
        const next = findNextPlayerWithOrder(newState, orderType, playerIdx);
        if (next !== null) {
            newState.actionSubPhase = subPhases[subIdx];
            newState.actionPlayerIndex = next;
            newState.currentPlayerHouse = newState.turnOrder[next];
            return newState;
        }
        // Move to next sub-phase
        subIdx++;
        playerIdx = 0;
    }

    // All sub-phases done — auto-resolve remaining CP orders
    newState.actionSubPhase = 'Done';
    return newState;
}

// ═══════════════════════════════════════════════
// MUSTERING
// ═══════════════════════════════════════════════

function triggerMustering(state: GameState): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));

    const musterAreas: { house: HouseName; areaId: string; pointsRemaining: number }[] = [];

    Object.entries(newState.board).forEach(([areaId, area]) => {
        if (area.house && (area.castle || area.stronghold)) {
            const points = area.stronghold ? 2 : 1;
            musterAreas.push({ house: area.house, areaId, pointsRemaining: points });
        }
    });

    if (musterAreas.length > 0) {
        newState.pendingMustering = musterAreas;
        console.log(`⚔️ Mustering triggered! ${musterAreas.length} areas can muster.`);
    }

    return newState;
}

/** Muster a unit in an area (called by UI) */
export function musterUnit(state: GameState, areaId: string, unitType: UnitType): GameState {
    if (!state.pendingMustering) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.pendingMustering = [...state.pendingMustering];

    const musterEntry = newState.pendingMustering.find(m => m.areaId === areaId);
    if (!musterEntry) return state;

    const cost = MUSTER_COSTS[unitType];
    if (cost > musterEntry.pointsRemaining) {
        console.warn(`Not enough mustering points (have ${musterEntry.pointsRemaining}, need ${cost})`);
        return state;
    }

    // Ships must go to adjacent sea area (simplified: place in area if sea, otherwise find adjacent sea)
    const area = newState.board[areaId];
    let targetAreaId = areaId;

    if (unitType === 'Ship') {
        // Check for connected port first
        const portId = getPortForArea(newState, areaId);
        if (portId && canMusterInPort(newState, portId)) {
            targetAreaId = portId;
        } else {
            // Find adjacent sea or port
            const adjacentWater = area.adjacent.find(adjId => {
                const adj = newState.board[adjId];
                return adj && (adj.type === 'Sea' || adj.type === 'Port') && (!adj.house || adj.house === musterEntry.house);
            });
            if (!adjacentWater) {
                console.warn('No adjacent sea or port for ship mustering');
                return state;
            }
            targetAreaId = adjacentWater;
        }
    }

    // Check available units
    if (newState.cas[musterEntry.house].availableUnits[unitType] <= 0) {
        console.warn(`No ${unitType} units available`);
        return state;
    }

    // A player may never muster a unit that would exceed his supply limit
    if (maxUnitsAddable(newState, musterEntry.house, targetAreaId) < 1) {
        console.warn(`Mustering in ${targetAreaId} would exceed ${musterEntry.house}'s supply limit`);
        return state;
    }

    // Place unit
    const newUnit = {
        id: `${musterEntry.house}-${unitType}-${Date.now()}-${Math.random()}`,
        type: unitType,
        house: musterEntry.house,
        routed: false
    };
    newState.board[targetAreaId].units.push(newUnit);
    newState.board[targetAreaId].house = musterEntry.house;
    newState.cas[musterEntry.house].availableUnits[unitType] -= 1;

    musterEntry.pointsRemaining -= cost;
    console.log(`🏗️ ${musterEntry.house} mustered ${unitType} in ${targetAreaId} (${musterEntry.pointsRemaining} points left)`);

    // Remove entry if no points left
    if (musterEntry.pointsRemaining <= 0) {
        newState.pendingMustering = newState.pendingMustering.filter(m => m.areaId !== areaId);
    }

    // If all mustering done
    if (newState.pendingMustering.length === 0) {
        newState.pendingMustering = undefined;
    }

    return newState;
}

/** Skip mustering for an area */
export function skipMustering(state: GameState, areaId: string): GameState {
    if (!state.pendingMustering) return state;
    const newState = { ...state };
    newState.pendingMustering = state.pendingMustering.filter(m => m.areaId !== areaId);
    if (newState.pendingMustering.length === 0) newState.pendingMustering = undefined;
    return newState;
}

/** Skip all remaining mustering */
export function skipAllMustering(state: GameState): GameState {
    return { ...state, pendingMustering: undefined };
}

/** Upgrade a Footman to Knight or Siege Engine during mustering (costs 1 muster point) */
export function upgradeFootman(
    state: GameState, areaId: string, footmanId: string, to: 'Knight' | 'SiegeEngine' = 'Knight'
): GameState {
    if (!state.pendingMustering) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.pendingMustering = state.pendingMustering.map(m => ({ ...m }));

    const musterEntry = newState.pendingMustering.find(m => m.areaId === areaId);
    if (!musterEntry || musterEntry.pointsRemaining < 1) {
        console.warn('Not enough mustering points for upgrade');
        return state;
    }

    const area = newState.board[areaId];
    const footmanIdx = area.units.findIndex(u => u.id === footmanId && u.type === 'Footman');
    if (footmanIdx < 0) {
        console.warn('Footman not found for upgrade');
        return state;
    }

    if (newState.cas[musterEntry.house].availableUnits[to] <= 0) {
        console.warn(`No ${to} units available for upgrade`);
        return state;
    }

    // Convert Footman → Knight/SiegeEngine (upgrading does not change army size)
    area.units[footmanIdx] = {
        ...area.units[footmanIdx],
        type: to,
        id: `${musterEntry.house}-${to}-${Date.now()}-${Math.random()}`
    };
    newState.cas[musterEntry.house].availableUnits[to] -= 1;
    newState.cas[musterEntry.house].availableUnits.Footman += 1;
    musterEntry.pointsRemaining -= 1;

    console.log(`🏗️ ${musterEntry.house} upgraded Footman → ${to} in ${area.name} (${musterEntry.pointsRemaining} pts left)`);

    if (musterEntry.pointsRemaining <= 0) {
        newState.pendingMustering = newState.pendingMustering.filter(m => m.areaId !== areaId);
    }
    if (newState.pendingMustering.length === 0) {
        newState.pendingMustering = undefined;
    }

    return newState;
}

/** Backwards-compatible helper */
export function upgradeFootmanToKnight(state: GameState, areaId: string, footmanId: string): GameState {
    return upgradeFootman(state, areaId, footmanId, 'Knight');
}

// ═══════════════════════════════════════════════
// SUPPLY RECALCULATION
// ═══════════════════════════════════════════════

function recalculateSupply(state: GameState): GameState {
    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    for (const house of state.turnOrder) {
        let supplyIcons = 0;
        Object.values(state.board).forEach(area => {
            if (area.house === house && area.supply) {
                supplyIcons += area.supply;
            }
        });
        newState.cas[house].supply = Math.min(6, supplyIcons);
        console.log(`📦 ${house} supply: ${newState.cas[house].supply}`);
    }

    return newState;
}

const SUPPLY_LIMITS_TABLE = [
    [2, 2], // 0
    [3, 2], // 1
    [3, 2, 2], // 2
    [3, 2, 2, 2], // 3
    [3, 3, 2, 2], // 4
    [4, 3, 2, 2], // 5
    [4, 3, 2, 2, 2], // 6
];

/** Get detailed supply violation info for a house */
function getSupplyViolationDetails(state: GameState, house: HouseName): { areaId: string; currentSize: number; maxAllowed: number }[] {
    const supply = Math.min(state.cas[house].supply, 6);
    const limits = [...SUPPLY_LIMITS_TABLE[supply]].sort((a, b) => b - a);

    // Find all armies (2+ units in an area)
    const armies: { areaId: string; size: number }[] = [];
    Object.entries(state.board).forEach(([aId, area]) => {
        if (area.house === house && area.units.length >= 2) {
            armies.push({ areaId: aId, size: area.units.length });
        }
    });
    armies.sort((a, b) => b.size - a.size);

    const violations: { areaId: string; currentSize: number; maxAllowed: number }[] = [];
    for (let i = 0; i < armies.length; i++) {
        const maxAllowed = i < limits.length ? limits[i] : 1; // No slot = max 1 unit
        if (armies[i].size > maxAllowed) {
            violations.push({
                areaId: armies[i].areaId,
                currentSize: armies[i].size,
                maxAllowed
            });
        }
    }
    return violations;
}

/** Reconcile armies: Remove a unit from an area to meet supply limits */
export function resolveReconcileArmy(state: GameState, house: HouseName, areaId: string, unitIndex: number): GameState {
    if (!state.pendingReconcile) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.pendingReconcile = state.pendingReconcile.map(r => ({ ...r, violations: [...r.violations] }));

    const area = newState.board[areaId];
    if (!area || area.house !== house || unitIndex >= area.units.length) return state;

    // Remove the unit and return it to available pool
    const removed = area.units.splice(unitIndex, 1)[0];
    newState.cas[house].availableUnits[removed.type] += 1;
    console.log(`🗑️ ${house} removed ${removed.type} from ${area.name}`);

    // If area has no more units, clear ownership
    if (area.units.length === 0) {
        area.house = null;
    }

    // Re-check supply violations for this house
    const stillViolating = checkSupplyLimits(newState);
    if (!stillViolating[house]) {
        // This house is now compliant — remove from pending
        newState.pendingReconcile = newState.pendingReconcile!.filter(r => r.house !== house);
    } else {
        // Update violation details
        const houseEntry = newState.pendingReconcile!.find(r => r.house === house);
        if (houseEntry) {
            houseEntry.violations = getSupplyViolationDetails(newState, house);
        }
    }

    // All houses compliant? Clear pending
    if (newState.pendingReconcile!.length === 0) {
        newState.pendingReconcile = undefined;
        console.log(`✅ All supply violations resolved`);
    }

    return newState;
}

// ═══════════════════════════════════════════════
// ORDER PLACEMENT
// ═══════════════════════════════════════════════

export function placeOrder(state: GameState, areaId: string, house: HouseName, tokenIndex: number): GameState {
    const newState = { ...state };
    const area = newState.board[areaId];

    // Ports belong to whoever controls the connected land area
    const controller = area?.type === 'Port' ? portOwner(state, areaId) : area?.house;
    if (!area || controller !== house || area.units.length === 0) {
        console.warn('Invalid order placement');
        return state;
    }

    const tokenDef = ORDER_TOKENS[tokenIndex];
    if (!tokenDef) return state;

    // Check Deck III restrictions
    if (state.orderRestrictions?.includes(tokenDef.type)) {
        console.warn(`${tokenDef.type} banned this round`);
        return state;
    }

    // Check star-only restrictions (e.g. Rains of Autumn bans only March★)
    if (tokenDef.star && state.orderStarRestrictions?.includes(tokenDef.type)) {
        console.warn(`${tokenDef.type}★ banned this round`);
        return state;
    }

    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.board = JSON.parse(JSON.stringify(state.board));
    const houseState = newState.cas[house];
    const newArea = newState.board[areaId];

    // Return old token if replacing
    if (newArea.order?.house === house) {
        houseState.usedOrderTokens = houseState.usedOrderTokens.filter(idx => idx !== newArea.order!.tokenIndex);
    }

    // Check token availability
    if (houseState.usedOrderTokens.includes(tokenIndex)) {
        console.warn(`Token '${tokenDef.label}' already used`);
        return state;
    }

    // Star order limit check (King's Court track)
    if (tokenDef.star) {
        const currentStarCount = houseState.usedOrderTokens.filter(idx => ORDER_TOKENS[idx].star).length;
        const maxStars = getStarOrderLimit(state, house);
        if (currentStarCount >= maxStars) {
            console.warn(`${house} can only use ${maxStars} star orders (King's Court position: ${houseState.influence.kingsCourt})`);
            return state;
        }
    }

    const newOrder: Order = {
        id: `${house}-${tokenDef.type}-${Date.now()}`,
        type: tokenDef.type,
        house,
        strength: tokenDef.strength,
        star: tokenDef.star,
        tokenIndex
    };
    newArea.order = newOrder;
    houseState.usedOrderTokens.push(tokenIndex);

    return newState;
}

// ═══════════════════════════════════════════════
// MESSENGER RAVEN (swap one order after reveal)
// ═══════════════════════════════════════════════

export function useMessengerRaven(state: GameState, areaId: string, newTokenIndex: number): GameState {
    if (state.messengerRavenUsed) {
        console.warn('Messenger Raven already used this round');
        return state;
    }
    const ravenHolder = getTrackHolder(state, 'kingsCourt');
    const area = state.board[areaId];
    if (!area?.order || area.order.house !== ravenHolder) {
        console.warn('Can only raven your own orders');
        return state;
    }

    // Place new order (this handles token swap internally)
    let newState = placeOrder(state, areaId, ravenHolder, newTokenIndex);
    if (newState !== state) {
        newState = { ...newState, messengerRavenUsed: true };
        console.log(`🐦 ${ravenHolder} used Messenger Raven to swap order in ${areaId}`);
        // If this was the raven step of the Planning phase, proceed to the Action phase
        if (newState.pendingRavenSwap) {
            newState = { ...newState, pendingRavenSwap: undefined };
            newState = startActionPhase(newState);
        }
    }
    return newState;
}

// ═══════════════════════════════════════════════
// VALYRIAN STEEL BLADE
// ═══════════════════════════════════════════════

export function useValyrianSteelBlade(state: GameState): GameState {
    if (!state.combat) return state;
    if (state.valyrianSteelBladeUsed) {
        console.warn('Valyrian Steel Blade already used this round');
        return state;
    }

    const bladeHolder = getTrackHolder(state, 'fiefdoms');
    const newState = { ...state };
    newState.combat = { ...state.combat };

    if (bladeHolder === state.combat.attacker) {
        newState.combat.attackerStrength += 1;
        newState.combat.attackerUsedBlade = true;
    } else if (bladeHolder === state.combat.defender) {
        newState.combat.defenderStrength += 1;
        newState.combat.defenderUsedBlade = true;
    } else {
        console.warn(`${bladeHolder} is not in this combat`);
        return state;
    }

    newState.valyrianSteelBladeUsed = true;
    console.log(`🗡️ ${bladeHolder} used Valyrian Steel Blade! (+1 strength)`);
    return newState;
}

// ═══════════════════════════════════════════════
// MARCH RESOLUTION
// ═══════════════════════════════════════════════

export function resolveMarch(state: GameState, fromAreaId: string, toAreaId: string, unitsToMove: string[]): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    const fromArea = newState.board[fromAreaId];
    const toArea = newState.board[toAreaId];
    const mover = (fromArea.type === 'Port' ? portOwner(newState, fromAreaId) : fromArea.house) as HouseName | null;

    if (!mover) return state;
    if (!fromArea.order || fromArea.order.type !== 'March') {
        console.warn('No March order in origin area');
        return state;
    }
    if (!isMoveValid(state, fromAreaId, toAreaId, mover)) {
        console.warn('Invalid move');
        return state;
    }

    const allowedTypes = toArea.type === 'Sea' || toArea.type === 'Port' ? ['Ship'] : ['Footman', 'Knight', 'SiegeEngine'];
    const movingUnits = fromArea.units.filter(u => unitsToMove.includes(u.id) && allowedTypes.includes(u.type) && !u.routed);

    if (movingUnits.length === 0) return state;

    // Port destination: only friendly ports, respecting the 3-ship cap
    if (toArea.type === 'Port') {
        if (portOwner(newState, toAreaId) !== mover) {
            console.warn('Ships may never march into a port owned by another player');
            return state;
        }
        if (toArea.units.length + movingUnits.length > (toArea.maxShips ?? 3)) {
            console.warn('Port capacity (3 ships) exceeded');
            return state;
        }
    }

    // A player may never march in a way that exceeds his supply limit
    const supplyOk = (() => {
        const sizes: number[] = [];
        Object.entries(newState.board).forEach(([aId, a]) => {
            if (aId === fromAreaId || aId === toAreaId) return;
            const owner = a.type === 'Port' ? portOwner(newState, aId) : a.house;
            if (owner === mover && a.units.length >= 2) sizes.push(a.units.length);
        });
        const newOrigin = fromArea.units.length - movingUnits.length;
        const newTarget = toArea.units.filter(u => u.house === mover).length + movingUnits.length;
        if (newOrigin >= 2) sizes.push(newOrigin);
        if (newTarget >= 2) sizes.push(newTarget);
        return fitsArmies(sizes, Math.min(newState.cas[mover].supply, 6));
    })();
    if (!supplyOk) {
        console.warn('March would exceed supply limit');
        return state;
    }

    const marchStrength = fromArea.order.strength ?? 0;
    const marchTokenIndex = fromArea.order.tokenIndex;

    fromArea.units = fromArea.units.filter(u => !movingUnits.some(mu => mu.id === u.id));

    const handleVacate = () => {
        if (fromArea.units.length !== 0) return;
        if (fromArea.type === 'Sea' || fromArea.type === 'Port') {
            fromArea.house = null;
            return;
        }
        // Land: power token on board or printed home crest retains control automatically
        if (fromArea.powerToken === mover) {
            console.log(`💰 ${mover} retains ${fromAreaId} (power token on the board)`);
        } else if (homeCrestOwner(fromAreaId) === mover) {
            console.log(`🏠 ${mover} automatically retains Home Area ${fromAreaId}`);
        } else if (newState.cas[mover].power > 0) {
            newState.pendingPowerTokenArea = fromAreaId;
        } else {
            fromArea.house = residualController(newState, fromAreaId);
            console.log(`❌ ${mover} has no Power tokens — lost control of ${fromAreaId}`);
        }
    };

    // ── Enemy units in destination → combat ──
    const defenderHouse = (toArea.type === 'Port' ? portOwner(newState, toAreaId) : toArea.house) as HouseName | null;
    if (toArea.units.length > 0 && defenderHouse && defenderHouse !== mover) {
        console.log('⚔️ Combat!');
        fromArea.order = null;
        handleVacate();
        return initiateCombat(newState, toAreaId, mover, defenderHouse, movingUnits, marchStrength, fromAreaId, marchTokenIndex);
    }

    // ── Garrison / Neutral Force without units ──
    const targetGarrison = newState.garrisons[toAreaId];
    if (toArea.units.length === 0 && targetGarrison && targetGarrison.house !== mover) {
        if (targetGarrison.house) {
            // Enemy home-area garrison: combat occurs as normal (House cards are played)
            console.log(`⚔️ Combat against ${targetGarrison.house}'s garrison in ${toArea.name}!`);
            fromArea.order = null;
            handleVacate();
            return initiateCombat(newState, toAreaId, mover, targetGarrison.house, movingUnits, marchStrength, fromAreaId, marchTokenIndex);
        }

        // Neutral Force: must EQUAL or exceed its strength (no House cards, no VSB, support allowed)
        let force = marchStrength;
        movingUnits.forEach(u => {
            switch (u.type) {
                case 'Footman': force += 1; break;
                case 'Knight': force += 2; break;
                case 'Ship': force += 1; break;
                case 'SiegeEngine':
                    if (toArea.castle || toArea.stronghold) force += 4;
                    break;
            }
        });
        // The marching player may receive support from his own adjacent Support orders
        Object.entries(newState.board).forEach(([saId, sa]) => {
            if (sa.order?.type !== 'Support') return;
            const saOwner = sa.type === 'Port' ? portOwner(newState, saId) : sa.house;
            if (saOwner !== mover) return;
            if (!sa.adjacent.includes(toAreaId)) return;
            if (sa.type === 'Port' && sa.connectedSea !== toAreaId) return;
            force += supportAreaStrength(sa, toArea, 'attacker').total;
        });

        if (force >= targetGarrison.strength) {
            console.log(`🛡️ Neutral force destroyed (${force} vs ${targetGarrison.strength}) in ${toArea.name}`);
            delete newState.garrisons[toAreaId];
            toArea.units.push(...movingUnits);
            toArea.house = mover;
            fromArea.order = null;
            handleVacate();
            return checkVictory(newState);
        }
        // Not enough strength: the march is not allowed — units stay, order stays
        console.log(`🛡️ Neutral force too strong (${force} vs ${targetGarrison.strength}) in ${toArea.name}`);
        fromArea.units.push(...movingUnits);
        return newState;
    }

    // ── Peaceful move (empty area, own area, or enemy power token only) ──
    const previousOwner = toArea.house;
    toArea.units.push(...movingUnits);
    if (toArea.type !== 'Port') {
        toArea.house = mover;
        // An enemy power token in the area is discarded to the Power Pool
        if (toArea.powerToken && toArea.powerToken !== mover) {
            console.log(`💰 ${toArea.powerToken}'s power token in ${toArea.name} discarded`);
            toArea.powerToken = undefined;
        }
    }

    // Taking control of a land area with a port: the old owner's ships are lost;
    // the new owner may replace them with his own available ships
    if (toArea.type === 'Land' && previousOwner && previousOwner !== mover) {
        const portId = getPortForArea(newState, toAreaId);
        if (portId) {
            const port = newState.board[portId];
            const enemyShips = port.units.filter(u => u.house !== mover);
            if (enemyShips.length > 0) {
                enemyShips.forEach(u => { newState.cas[u.house].availableUnits.Ship += 1; });
                port.units = port.units.filter(u => u.house === mover);
                console.log(`  ⚓ ${enemyShips.length} enemy ship(s) removed from ${port.name}`);
                const maxReplace = Math.min(
                    enemyShips.length,
                    newState.cas[mover].availableUnits.Ship,
                    maxUnitsAddable(newState, mover, portId)
                );
                if (maxReplace > 0) {
                    const options = [];
                    for (let n = 0; n <= maxReplace; n++) {
                        options.push({
                            label: n === 0 ? 'Não substituir' : `Colocar ${n} navio(s)`,
                            action: `combat:portreplace:${portId}:${n}`
                        });
                    }
                    newState.pendingDecision = { cardName: 'Captura de Porto', chooser: mover, options };
                }
            }
            port.house = mover;
        }
    }

    handleVacate();
    return checkVictory(newState);
}

export function leavePowerToken(state: GameState): GameState {
    if (!state.pendingPowerTokenArea) return state;
    const areaId = state.pendingPowerTokenArea;
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    const area = newState.board[areaId];
    if (area.house && newState.cas[area.house].power > 0) {
        newState.cas[area.house].power -= 1;
        area.powerToken = area.house;
        console.log(`💰 ${area.house} estabeleceu controle de ${areaId} (power token no tabuleiro)`);
    } else if (area.house) {
        // Can't afford power token — control reverts (printed crest, if any)
        console.log(`❌ ${area.house} has no Power tokens — lost control of ${areaId}`);
        area.house = residualController(newState, areaId);
    }
    newState.pendingPowerTokenArea = undefined;
    return newState;
}

export function declinePowerToken(state: GameState): GameState {
    if (!state.pendingPowerTokenArea) return state;
    const areaId = state.pendingPowerTokenArea;
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    // Control reverts to the printed home crest owner (if this is someone's home area)
    newState.board[areaId].house = residualController(newState, areaId);
    console.log(`❌ ${areaId} control released`);
    newState.pendingPowerTokenArea = undefined;
    return newState;
}

export function finishMarch(state: GameState, fromAreaId: string): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.board[fromAreaId].order = null;
    return newState;
}

// ═══════════════════════════════════════════════
// RAID RESOLUTION
// ═══════════════════════════════════════════════

export function resolveRaid(state: GameState, fromAreaId: string, toAreaId: string): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    const fromArea = newState.board[fromAreaId];
    const toArea = newState.board[toAreaId];

    if (!fromArea.order || fromArea.order.type !== 'Raid') return state;
    if (!toArea.order) return state;

    const raider = (fromArea.type === 'Port' ? portOwner(newState, fromAreaId) : fromArea.house) as HouseName | null;
    const victim = (toArea.type === 'Port' ? portOwner(newState, toAreaId) : toArea.house) as HouseName | null;
    if (!raider || !victim || raider === victim) return state;

    const raidableTypes: OrderType[] = ['Raid', 'Support', 'ConsolidatePower'];
    if (fromArea.order.star) raidableTypes.push('Defense');

    if (!raidableTypes.includes(toArea.order.type)) return state;
    if (!fromArea.adjacent.includes(toAreaId)) return state;

    // A Raid Order in a LAND area can never raid an adjacent SEA area (or port)
    if (fromArea.type === 'Land' && (toArea.type === 'Sea' || toArea.type === 'Port')) {
        console.warn('Land areas cannot raid sea areas');
        return state;
    }

    // Ships in a Port can only raid the connected sea
    if (fromArea.type === 'Port' && fromArea.connectedSea !== toAreaId) return state;
    // A port can only be raided from its connected sea (never from land — blocked above)
    if (toArea.type === 'Port' && toArea.connectedSea !== fromAreaId) return state;

    console.log(`🔥 Raid: ${raider} → ${victim}'s ${toArea.order.type}`);

    if (toArea.order.type === 'ConsolidatePower') {
        // Pillage: the raider ALWAYS gains 1 Power; the victim loses 1 if able
        if (newState.cas[victim].power > 0) {
            newState.cas[victim].power -= 1;
        }
        newState.cas[raider].power = Math.min(20, newState.cas[raider].power + 1);
        console.log(`  💰 Pillage: ${raider} +1 Power, ${victim} -1 Power (if able)`);
    }

    fromArea.order = null;
    toArea.order = null;
    return newState;
}

/** Resolve a Raid order with no effect (allowed by the rules, or when no target exists) */
export function resolveRaidNoEffect(state: GameState, fromAreaId: string): GameState {
    const fromArea = state.board[fromAreaId];
    if (!fromArea?.order || fromArea.order.type !== 'Raid') return state;
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.board[fromAreaId].order = null;
    console.log(`🔥 Raid removed with no effect (${fromAreaId})`);
    return newState;
}

// ═══════════════════════════════════════════════
// CONSOLIDATE POWER
// ═══════════════════════════════════════════════

export function resolveConsolidatePower(state: GameState): GameState {
    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.board = JSON.parse(JSON.stringify(state.board));

    Object.entries(newState.board).forEach(([areaId, area]) => {
        if (area.order?.type !== 'ConsolidatePower') return;

        // CP orders on sea areas have no effect
        if (area.type === 'Sea') { area.order = null; return; }

        // CP in a port: removed without effect if enemy ships occupy the connected sea
        if (area.type === 'Port') {
            const owner = portOwner(newState, areaId);
            const sea = area.connectedSea ? newState.board[area.connectedSea] : null;
            const enemyShipsInSea = !!sea && sea.units.some(u => u.house !== owner);
            area.order = null;
            if (!owner) return;
            if (enemyShipsInSea) {
                console.log(`💰 CP in ${area.name} removed without effect (enemy ships in ${sea!.name})`);
                return;
            }
            newState.cas[owner].power = Math.min(20, newState.cas[owner].power + 1);
            console.log(`💰 ${owner} +1 power from ${area.name}`);
            return;
        }

        if (!area.house) { area.order = null; return; }
        let powerGain = 1;
        if (area.power && area.power > 0) powerGain += area.power;
        newState.cas[area.house].power = Math.min(20, newState.cas[area.house].power + powerGain);
        console.log(`💰 ${area.house} +${powerGain} power from ${area.name}`);
        area.order = null;
    });

    return newState;
}

// ═══════════════════════════════════════════════
// BIDDING SYSTEM (Clash of Kings + Wildling)
// ═══════════════════════════════════════════════

/** Submit a bid for the current bidding round */
export function submitBid(state: GameState, house: HouseName, amount: number): GameState {
    if (!state.pendingBidding) return state;
    if (state.pendingBidding.excludedHouses?.includes(house)) {
        console.warn(`${house} does not participate in this bidding`);
        return state;
    }
    if (amount < 0 || amount > state.cas[house].power) {
        console.warn(`${house} can't bid ${amount} (has ${state.cas[house].power} Power)`);
        return state;
    }

    const newState = { ...state };
    newState.pendingBidding = { ...state.pendingBidding, bids: { ...state.pendingBidding.bids } };
    newState.pendingBidding.bids[house] = amount;
    console.log(`💰 ${house} bids ${amount} Power`);
    return newState;
}

/** Houses taking part in the current bidding */
export function biddingParticipants(state: GameState): HouseName[] {
    const excluded = state.pendingBidding?.excludedHouses ?? [];
    return state.turnOrder.filter(h => !excluded.includes(h));
}

/** Group houses by bid amount, descending */
function bidGroups(bids: Partial<Record<HouseName, number>>, houses: HouseName[]): HouseName[][] {
    const byAmount = new Map<number, HouseName[]>();
    houses.forEach(h => {
        const amt = bids[h] ?? 0;
        if (!byAmount.has(amt)) byAmount.set(amt, []);
        byAmount.get(amt)!.push(h);
    });
    return [...byAmount.entries()].sort((a, b) => b[0] - a[0]).map(([, hs]) => hs);
}

/** Resolve the current bidding round once all bids are in */
export function resolveBids(state: GameState): GameState {
    if (!state.pendingBidding) return state;

    const bidding = state.pendingBidding;
    const participants = biddingParticipants(state);

    const missingBids = participants.filter(h => bidding.bids[h] === undefined);
    if (missingBids.length > 0) {
        console.warn(`Waiting for bids from: ${missingBids.join(', ')}`);
        return state;
    }

    let newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    if (bidding.type === 'wildling') {
        return resolveWildlingBids(newState);
    }

    // Clash of Kings: all power bid is discarded, regardless of outcome
    participants.forEach(h => {
        newState.cas[h].power -= bidding.bids[h] ?? 0;
    });

    // Ties are decided by the holder of the Iron Throne token (the CURRENT holder,
    // even when bidding on the Iron Throne track itself)
    const groups = bidGroups(bidding.bids, participants);
    const firstTie = groups.find(g => g.length > 1);
    if (firstTie) {
        newState.pendingBidTieBreak = {
            kind: 'track',
            decider: getTrackHolder(newState, 'ironThrone'),
            tiedHouses: [...firstTie],
            ordered: groups.flatMap(g => (g.length === 1 ? g : [])).slice(0, groups.indexOf(firstTie))
        };
        // Rebuild `ordered` correctly: everything strictly before the tied group
        const ordered: HouseName[] = [];
        for (const g of groups) {
            if (g === firstTie) break;
            ordered.push(...g);
        }
        newState.pendingBidTieBreak.ordered = ordered;
        console.log(`👑 Bid tie on ${bidding.currentTrack}: ${firstTie.join(', ')} — Iron Throne holder decides`);
        return newState;
    }

    const finalOrder = groups.flat();
    return finalizeTrackBidding(newState, finalOrder);
}

/** Iron Throne holder picks the next house among the tied ones */
export function chooseBidTieBreak(state: GameState, house: HouseName): GameState {
    if (!state.pendingBidTieBreak || !state.pendingBidding) return state;
    const tb = state.pendingBidTieBreak;
    if (!tb.tiedHouses.includes(house)) return state;

    let newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.pendingBidding = { ...state.pendingBidding, bids: { ...state.pendingBidding.bids } };

    if (tb.kind === 'wildling-high') {
        newState.pendingBidding.chosenHighest = house;
        newState.pendingBidTieBreak = undefined;
        return continueWildlingResolution(newState);
    }
    if (tb.kind === 'wildling-low') {
        newState.pendingBidding.chosenLowest = house;
        newState.pendingBidTieBreak = undefined;
        return continueWildlingResolution(newState);
    }

    // Track bidding: append the chosen house, then continue through remaining groups
    const participants = biddingParticipants(newState);
    const groups = bidGroups(newState.pendingBidding.bids, participants);
    const ordered = [...tb.ordered, house];
    let remainingTied = tb.tiedHouses.filter(h => h !== house);
    if (remainingTied.length === 1) {
        ordered.push(remainingTied[0]);
        remainingTied = [];
    }

    if (remainingTied.length > 0) {
        newState.pendingBidTieBreak = { ...tb, tiedHouses: remainingTied, ordered };
        return newState;
    }

    // Advance through the rest of the groups until the next tie (or the end)
    let idx = 0;
    // Skip groups fully covered by `ordered`
    while (idx < groups.length && groups[idx].every(h => ordered.includes(h))) idx++;
    while (idx < groups.length) {
        const g = groups[idx];
        if (g.length === 1) {
            ordered.push(g[0]);
            idx++;
        } else {
            newState.pendingBidTieBreak = {
                kind: 'track',
                decider: getTrackHolder(newState, 'ironThrone'),
                tiedHouses: [...g],
                ordered
            };
            return newState;
        }
    }

    newState.pendingBidTieBreak = undefined;
    return finalizeTrackBidding(newState, ordered);
}

/** Assign track positions from the final order, award dominance, and continue */
function finalizeTrackBidding(state: GameState, finalOrder: HouseName[]): GameState {
    let newState = { ...state };
    const bidding = newState.pendingBidding!;
    const track = bidding.currentTrack!;

    finalOrder.forEach((house, idx) => {
        newState.cas[house].influence[track] = idx + 1;
    });
    console.log(`👑 ${track} track updated: ${finalOrder.join(' > ')}`);

    if (track === 'ironThrone') {
        newState = syncTurnOrder(newState);
        newState.currentPlayerHouse = newState.turnOrder[0];
    }

    const remaining = bidding.remainingTracks ?? [];
    if (remaining.length > 0) {
        const nextTrack = remaining[0];
        newState.pendingBidding = {
            type: nextTrack,
            bids: {},
            resolved: false,
            currentTrack: nextTrack,
            remainingTracks: remaining.slice(1)
        };
        console.log(`  Next bidding: ${nextTrack}`);
    } else {
        newState.pendingBidding = undefined;
        newState = tryAdvanceWesteros(newState);
    }

    return newState;
}

/** Resolve Wildling attack bidding (power is discarded; leaders may need tie-breaking) */
function resolveWildlingBids(state: GameState): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.pendingBidding = { ...state.pendingBidding!, bids: { ...state.pendingBidding!.bids } };
    const bidding = newState.pendingBidding!;
    const participants = biddingParticipants(newState);

    if (!bidding.resolved) {
        // All Power bid is discarded to the Power Pool, regardless of outcome
        participants.forEach(h => {
            newState.cas[h].power -= bidding.bids[h] ?? 0;
        });
        bidding.resolved = true;
    }

    return continueWildlingResolution(newState);
}

/** Determine highest/lowest bidders (Iron Throne holder breaks ties), then finish the attack */
function continueWildlingResolution(state: GameState): GameState {
    const newState = { ...state };
    newState.pendingBidding = { ...state.pendingBidding!, bids: { ...state.pendingBidding!.bids } };
    const bidding = newState.pendingBidding!;
    const participants = biddingParticipants(newState);
    const groups = bidGroups(bidding.bids, participants);

    if (!bidding.chosenHighest) {
        const top = groups[0];
        if (top.length > 1) {
            newState.pendingBidTieBreak = {
                kind: 'wildling-high',
                decider: getTrackHolder(newState, 'ironThrone'),
                tiedHouses: [...top],
                ordered: []
            };
            console.log(`🐺 Tie for highest bidder: ${top.join(', ')} — Iron Throne holder decides`);
            return newState;
        }
        bidding.chosenHighest = top[0];
    }

    if (!bidding.chosenLowest) {
        const bottomGroup = groups[groups.length - 1];
        const pool = bottomGroup.filter(h => h !== bidding.chosenHighest);
        const candidates = pool.length > 0 ? pool : bottomGroup;
        if (candidates.length > 1) {
            newState.pendingBidTieBreak = {
                kind: 'wildling-low',
                decider: getTrackHolder(newState, 'ironThrone'),
                tiedHouses: [...candidates],
                ordered: []
            };
            console.log(`🐺 Tie for lowest bidder: ${candidates.join(', ')} — Iron Throne holder decides`);
            return newState;
        }
        bidding.chosenLowest = candidates[0];
    }

    return finalizeWildling(newState);
}

/** Apply the wildling attack outcome: adjust the track, draw & bury the card, queue effects */
function finalizeWildling(state: GameState): GameState {
    let newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.board = JSON.parse(JSON.stringify(state.board));
    const bidding = newState.pendingBidding!;
    const participants = biddingParticipants(newState);

    const bidAmounts: Record<string, number> = {};
    participants.forEach(h => { bidAmounts[h] = bidding.bids[h] ?? 0; });
    const totalBid = participants.reduce((sum, h) => sum + bidAmounts[h], 0);
    const strength = bidding.strengthOverride ?? newState.wildlingThreat;
    const isVictory = totalBid >= strength;
    const highestBidder = bidding.chosenHighest!;
    const lowestBidder = bidding.chosenLowest!;

    // Draw wildling card; after use it is buried at the bottom of the deck
    let wildDeck = [...(newState.wildlingDeck ?? shuffle([...WILDLING_DECK]))];
    if (wildDeck.length === 0) wildDeck = shuffle([...WILDLING_DECK]);
    const wildlingCard = wildDeck.shift()!;
    wildDeck.push(wildlingCard);
    newState.wildlingDeck = wildDeck;

    console.log(`🛡️ Wildling Attack: Bid ${totalBid} vs Strength ${strength}`);
    console.log(`  🃏 Card: ${wildlingCard.name}`);

    // Adjust Wildlings track: victory → "0"; defeat → back two positions (min "0")
    if (isVictory) {
        newState.wildlingThreat = 0;
        console.log(`  🎉 Night's Watch victory! Highest: ${highestBidder}`);
    } else {
        newState.wildlingThreat = Math.max(0, newState.wildlingThreat - 4);
        console.log(`  💀 Wildling victory! Lowest: ${lowestBidder}`);
    }

    newState.pendingBidding = undefined;

    if (isVictory) {
        applyWildlingVictory(newState, wildlingCard, highestBidder, participants, bidAmounts);
    } else {
        applyWildlingDefeat(newState, wildlingCard, lowestBidder, participants);
    }

    newState.currentWildlingCard = wildlingCard;
    return advanceQueues(newState);
}

/** Apply wildling victory rewards (interactive where the rules give the winner a choice) */
function applyWildlingVictory(state: GameState, card: WildlingCard, winner: HouseName, participants: HouseName[], bidAmounts: Record<string, number>) {
    switch (card.id) {
        case 'silence-at-wall':
            break;
        case 'skinchanger-scout':
            // Return bid to highest bidder
            state.cas[winner].power = Math.min(20, state.cas[winner].power + bidAmounts[winner]);
            console.log(`    🏆 ${winner}: ${bidAmounts[winner]} Power returned`);
            break;
        case 'rattleshirts-raiders':
            state.cas[winner].supply = Math.min(6, state.cas[winner].supply + 1);
            console.log(`    🏆 ${winner}: +1 Supply → ${state.cas[winner].supply}`);
            break;
        case 'mammoth-riders':
            // Retrieve 1 House card of HIS CHOICE from the discard pile
            if (state.cas[winner].discards.length > 0) {
                state.pendingDecision = {
                    cardName: 'Mammoth Riders — recompensa',
                    chooser: winner,
                    options: state.cas[winner].discards.map(c => ({
                        label: `${c.name} (força ${c.strength})`,
                        action: `mammoth:${c.id}`
                    }))
                };
            }
            break;
        case 'crow-killers': {
            // May replace up to 2 of his Footmen, anywhere, with available Knights
            const eligible: string[] = [];
            Object.values(state.board).forEach(area => {
                area.units.forEach(u => {
                    if (u.house === winner && u.type === 'Footman') eligible.push(u.id);
                });
            });
            const max = Math.min(2, eligible.length, state.cas[winner].availableUnits.Knight);
            if (max > 0) {
                state.pendingUnitSelection = {
                    purpose: 'crow-upgrade',
                    house: winner,
                    count: max,
                    upTo: true,
                    eligibleUnitIds: eligible,
                    prompt: `Crow Killers: você pode promover até ${max} Footmen a Knights`
                };
            }
            break;
        }
        case 'massing-milkwater':
            state.cas[winner].cards.push(...state.cas[winner].discards);
            state.cas[winner].discards = [];
            console.log(`    🏆 ${winner}: All discarded cards returned to hand`);
            break;
        case 'preemptive-raid':
            // The wildlings attack again immediately at strength 6; the winner does not participate
            state.pendingBidding = {
                type: 'wildling',
                bids: {},
                resolved: false,
                excludedHouses: [winner],
                strengthOverride: 6
            };
            console.log(`    🏆 ${winner}: Preemptive Raid — wildlings re-attack at strength 6 (without ${winner})!`);
            break;
        case 'king-beyond-wall':
            // Moves his token to the TOP of one Influence track of his choice
            state.pendingDecision = {
                cardName: 'A King Beyond the Wall — recompensa',
                chooser: winner,
                options: [
                    { label: 'Topo do Trono de Ferro', action: 'kbw-top:ironThrone' },
                    { label: 'Topo dos Feudos', action: 'kbw-top:fiefdoms' },
                    { label: 'Topo da Corte do Rei', action: 'kbw-top:kingsCourt' }
                ]
            };
            break;
        case 'horde-descends': {
            // Winner may muster in ONE Castle or Stronghold they control
            const musterAreas: { areaId: string; points: number }[] = [];
            Object.entries(state.board).forEach(([aId, area]) => {
                if (area.house !== winner) return;
                if (area.stronghold) {
                    musterAreas.push({ areaId: aId, points: 2 });
                } else if (area.castle) {
                    musterAreas.push({ areaId: aId, points: 1 });
                }
            });
            if (musterAreas.length === 1) {
                state.pendingMustering = [{
                    house: winner,
                    areaId: musterAreas[0].areaId,
                    pointsRemaining: musterAreas[0].points
                }];
                console.log(`    🏆 ${winner}: Horde Descends - mustering in ${musterAreas[0].areaId}`);
            } else if (musterAreas.length > 1) {
                state.pendingDecision = {
                    cardName: 'The Horde Descends',
                    chooser: winner,
                    options: musterAreas.map(m => ({
                        label: `${m.areaId} (${m.points}pts)`,
                        action: `horde-muster:${m.areaId}:${m.points}`
                    }))
                };
                console.log(`    🏆 ${winner}: Horde Descends - choose ONE area to muster`);
            }
            break;
        }
    }
}

/** Apply wildling defeat penalties (interactive where the rules give players a choice).
 *  Order: lowest bidder first, then the others in turn order. */
function applyWildlingDefeat(state: GameState, card: WildlingCard, loser: HouseName, participants: HouseName[]) {
    const others = participants.filter(h => h !== loser);
    const selQueue: UnitSelection[] = [];
    const decQueue: Decision[] = [];

    const queueDestroy = (house: HouseName, count: number, prompt: string, restrictAreaId?: string) => {
        const sel = buildDestroySelection(state, house, count, prompt, restrictAreaId);
        if (sel) selQueue.push(sel);
    };

    switch (card.id) {
        case 'silence-at-wall':
            break;
        case 'skinchanger-scout':
            console.log(`    💀 ${loser}: Lost all ${state.cas[loser].power} Power tokens`);
            state.cas[loser].power = 0;
            others.forEach(h => {
                const lost = Math.min(2, state.cas[h].power);
                state.cas[h].power -= lost;
                console.log(`    💀 ${h}: Lost ${lost} Power tokens`);
            });
            break;
        case 'rattleshirts-raiders': {
            state.cas[loser].supply = Math.max(0, state.cas[loser].supply - 2);
            console.log(`    💀 ${loser}: -2 Supply → ${state.cas[loser].supply}`);
            others.forEach(h => {
                state.cas[h].supply = Math.max(0, state.cas[h].supply - 1);
                console.log(`    💀 ${h}: -1 Supply → ${state.cas[h].supply}`);
            });
            // Then reconcile armies to the new supply limits
            const violations = checkSupplyLimits(state);
            const violatingHouses = participants.filter(h => violations[h]);
            if (violatingHouses.length > 0) {
                state.pendingReconcile = violatingHouses.map(house => ({
                    house,
                    violations: getSupplyViolationDetails(state, house)
                }));
                console.warn(`    ⚠️ Reconcile armies: ${violatingHouses.join(', ')}`);
            }
            break;
        }
        case 'mammoth-riders':
            queueDestroy(loser, 3, 'Mammoth Riders: destrua 3 unidades suas (sua escolha)');
            others.forEach(h => queueDestroy(h, 2, 'Mammoth Riders: destrua 2 unidades suas (sua escolha)'));
            break;
        case 'crow-killers': {
            // Loser replaces ALL knights (no choice); others choose 2 knights to downgrade
            replaceKnightsWithFootmen(state, loser, Infinity);
            others.forEach(h => {
                const knightIds: string[] = [];
                Object.values(state.board).forEach(area => {
                    area.units.forEach(u => {
                        if (u.house === h && u.type === 'Knight') knightIds.push(u.id);
                    });
                });
                if (knightIds.length === 0) return;
                if (knightIds.length <= 2) {
                    replaceKnightsWithFootmen(state, h, 2);
                } else {
                    selQueue.push({
                        purpose: 'crow-downgrade',
                        house: h,
                        count: 2,
                        eligibleUnitIds: knightIds,
                        prompt: 'Crow Killers: escolha 2 Knights para rebaixar a Footmen'
                    });
                }
            });
            break;
        }
        case 'massing-milkwater':
            // Loser discards ALL cards with the highest strength (no choice)
            if (state.cas[loser].cards.length > 1) {
                const maxStr = Math.max(...state.cas[loser].cards.map(c => c.strength));
                const toDiscard = state.cas[loser].cards.filter(c => c.strength === maxStr);
                state.cas[loser].cards = state.cas[loser].cards.filter(c => c.strength !== maxStr);
                state.cas[loser].discards.push(...toDiscard);
                console.log(`    💀 ${loser}: Discarded ${toDiscard.map(c => c.name).join(', ')}`);
            }
            // Others choose one card to discard
            others.forEach(h => {
                if (state.cas[h].cards.length > 1) {
                    decQueue.push({
                        cardName: 'Massing on the Milkwater',
                        chooser: h,
                        options: state.cas[h].cards.map(c => ({
                            label: `Descartar ${c.name} (força ${c.strength})`,
                            action: `milkwater:${c.id}`
                        }))
                    });
                }
            });
            break;
        case 'preemptive-raid':
            // Loser chooses: destroy 2 units OR lose 2 positions on highest Influence track
            state.pendingDecision = {
                cardName: 'Preemptive Raid — penalidade',
                chooser: loser,
                options: [
                    { label: 'Destruir 2 unidades (sua escolha)', action: 'preemptive-destroy' },
                    { label: 'Perder 2 posições na sua melhor trilha', action: 'preemptive-track' }
                ]
            };
            break;
        case 'king-beyond-wall': {
            // Loser: bottom of ALL tracks (no choice)
            (['ironThrone', 'fiefdoms', 'kingsCourt'] as const).forEach(track => {
                shiftToBottom(state, loser, track);
            });
            console.log(`    💀 ${loser}: Moved to bottom of ALL tracks`);
            // Others: choose Fiefdoms or King's Court, in turn order
            others.forEach(h => {
                decQueue.push({
                    cardName: 'A King Beyond the Wall',
                    chooser: h,
                    options: [
                        { label: 'Descer para o fim dos Feudos', action: 'kbw-bottom:fiefdoms' },
                        { label: 'Descer para o fim da Corte do Rei', action: 'kbw-bottom:kingsCourt' }
                    ]
                });
            });
            break;
        }
        case 'horde-descends': {
            // Loser destroys 2 units at ONE of his castles/strongholds (his choice); if unable, 2 anywhere
            const castleAreas = Object.entries(state.board).filter(([, a]) =>
                a.house === loser && (a.castle || a.stronghold) && a.units.length > 0
            );
            if (castleAreas.length === 1) {
                queueDestroy(loser, 2, `The Horde Descends: destrua 2 unidades em ${castleAreas[0][1].name}`, castleAreas[0][0]);
            } else if (castleAreas.length > 1) {
                decQueue.push({
                    cardName: 'The Horde Descends',
                    chooser: loser,
                    options: castleAreas.map(([aId, a]) => ({
                        label: `${a.name} (${Math.min(2, a.units.length)} unidade(s))`,
                        action: `horde-hit:${aId}`
                    }))
                });
            } else {
                queueDestroy(loser, 2, 'The Horde Descends: destrua 2 unidades suas');
            }
            others.forEach(h => queueDestroy(h, 1, 'The Horde Descends: destrua 1 unidade sua'));
            break;
        }
    }

    if (selQueue.length > 0) {
        state.pendingUnitSelectionQueue = [...(state.pendingUnitSelectionQueue ?? []), ...selQueue];
    }
    if (decQueue.length > 0) {
        state.pendingDecisionQueue = [...(state.pendingDecisionQueue ?? []), ...decQueue];
    }
    // King Beyond the Wall may have changed the Iron Throne order
    if (card.id === 'king-beyond-wall') {
        const sorted = [...state.turnOrder].sort(
            (a, b) => state.cas[a].influence.ironThrone - state.cas[b].influence.ironThrone
        );
        state.turnOrder = sorted;
    }
}

/** Replace knights with footmen for a house (knights that cannot be replaced are destroyed) */
function replaceKnightsWithFootmen(state: GameState, house: HouseName, maxReplace: number) {
    let replaced = 0;
    let destroyed = 0;
    for (const [areaId, area] of Object.entries(state.board)) {
        for (let i = 0; i < area.units.length && replaced + destroyed < maxReplace; i++) {
            if (area.units[i].house === house && area.units[i].type === 'Knight') {
                if (state.cas[house].availableUnits.Footman > 0) {
                    area.units[i].type = 'Footman';
                    state.cas[house].availableUnits.Knight += 1;
                    state.cas[house].availableUnits.Footman -= 1;
                    replaced++;
                } else {
                    area.units.splice(i, 1);
                    state.cas[house].availableUnits.Knight += 1;
                    destroyed++;
                    i--;
                }
            }
        }
        clearControlIfEmpty(state, areaId);
    }
    console.log(`    💀 ${house}: ${replaced} Knights → Footmen, ${destroyed} Knights destroyed`);
}

/** Try to advance through remaining Westeros events */
function tryAdvanceWesteros(state: GameState): GameState {
    let newState = advanceQueues({ ...state });

    // If cards are being displayed, wait for user acknowledgement
    if (newState.drawnWesterosCards || newState.currentWildlingCard) {
        return newState;
    }

    // Wait for any pending interactive event
    if (newState.pendingDecision || newState.pendingUnitSelection ||
        newState.pendingBidding || newState.pendingBidTieBreak ||
        newState.pendingReconcile) {
        return newState;
    }

    // If Game of Thrones is pending, resolve it automatically
    if (newState.pendingGameOfThrones) {
        return resolveGameOfThrones(newState);
    }

    // If mustering is pending, wait for UI
    if (newState.pendingMustering && newState.pendingMustering.length > 0) {
        return newState;
    }

    // All done — advance to Planning
    newState.phase = 'Planning';
    return newState;
}

// ═══════════════════════════════════════════════
// UNIT SELECTION RESOLUTION
// ═══════════════════════════════════════════════

/** Resolve the current pendingUnitSelection with the chosen unit ids */
export function resolveUnitSelection(state: GameState, unitIds: string[]): GameState {
    const sel = state.pendingUnitSelection;
    if (!sel) return state;

    // Validate the choice
    const valid = unitIds.every(id => sel.eligibleUnitIds.includes(id)) &&
        new Set(unitIds).size === unitIds.length &&
        (sel.upTo ? unitIds.length <= sel.count : unitIds.length === sel.count);
    if (!valid) {
        console.warn(`Invalid unit selection (need ${sel.upTo ? 'up to ' : ''}${sel.count})`);
        return state;
    }

    // Combat-flow selections are handled by the combat module
    if (sel.purpose === 'combat-casualties') return applyCombatCasualties(state, unitIds);
    if (sel.purpose === 'retreat-supply') return applyRetreatSupplyLoss(state, unitIds);
    if (sel.purpose === 'renly-upgrade') return applyRenlyUpgrade(state, unitIds);

    let newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.pendingUnitSelection = undefined;

    const findUnit = (id: string): { areaId: string; index: number } | null => {
        for (const [aId, area] of Object.entries(newState.board)) {
            const idx = area.units.findIndex(u => u.id === id);
            if (idx >= 0) return { areaId: aId, index: idx };
        }
        return null;
    };

    if (sel.purpose === 'destroy-units') {
        for (const id of unitIds) {
            const loc = findUnit(id);
            if (!loc) continue;
            const unit = newState.board[loc.areaId].units.splice(loc.index, 1)[0];
            newState.cas[sel.house].availableUnits[unit.type] += 1;
            clearControlIfEmpty(newState, loc.areaId);
        }
        console.log(`💀 ${sel.house} destroyed ${unitIds.length} unit(s)`);
    } else if (sel.purpose === 'crow-upgrade') {
        for (const id of unitIds) {
            const loc = findUnit(id);
            if (!loc || newState.cas[sel.house].availableUnits.Knight <= 0) continue;
            const u = newState.board[loc.areaId].units[loc.index];
            if (u.type !== 'Footman') continue;
            newState.board[loc.areaId].units[loc.index] = { ...u, type: 'Knight' };
            newState.cas[sel.house].availableUnits.Knight -= 1;
            newState.cas[sel.house].availableUnits.Footman += 1;
        }
        console.log(`🏆 ${sel.house} upgraded ${unitIds.length} Footmen → Knights`);
    } else if (sel.purpose === 'crow-downgrade') {
        for (const id of unitIds) {
            const loc = findUnit(id);
            if (!loc) continue;
            const u = newState.board[loc.areaId].units[loc.index];
            if (u.type !== 'Knight') continue;
            if (newState.cas[sel.house].availableUnits.Footman > 0) {
                newState.board[loc.areaId].units[loc.index] = { ...u, type: 'Footman' };
                newState.cas[sel.house].availableUnits.Knight += 1;
                newState.cas[sel.house].availableUnits.Footman -= 1;
            } else {
                newState.board[loc.areaId].units.splice(loc.index, 1);
                newState.cas[sel.house].availableUnits.Knight += 1;
                clearControlIfEmpty(newState, loc.areaId);
            }
        }
        console.log(`💀 ${sel.house} downgraded ${unitIds.length} Knights → Footmen`);
    }

    newState = advanceQueues(newState);
    if (newState.phase === 'Westeros' &&
        !newState.pendingDecision && !newState.pendingUnitSelection &&
        !newState.pendingBidding && !newState.drawnWesterosCards) {
        newState = tryAdvanceWesteros(newState);
    }
    return newState;
}

export function acknowledgeWesterosCards(state: GameState): GameState {
    const newState = { ...state };
    newState.drawnWesterosCards = undefined;
    return tryAdvanceWesteros(newState);
}

export function acknowledgeWildlingCard(state: GameState): GameState {
    const newState = { ...state };
    newState.currentWildlingCard = undefined;
    return tryAdvanceWesteros(newState);
}

// ═══════════════════════════════════════════════
// GAME OF THRONES CARD
// ═══════════════════════════════════════════════

/** Resolve Game of Thrones: each house gains power for crown icons and for friendly ports
 *  containing at least one friendly ship (if the connected sea has no enemy ships). */
export function resolveGameOfThrones(state: GameState): GameState {
    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    for (const house of state.turnOrder) {
        let powerGain = 0;
        Object.entries(state.board).forEach(([areaId, area]) => {
            if (area.type === 'Port') {
                // Trade with the Free Cities
                const owner = portOwner(state, areaId);
                if (owner !== house) return;
                const hasOwnShip = area.units.some(u => u.house === house && u.type === 'Ship');
                if (!hasOwnShip) return;
                const sea = area.connectedSea ? state.board[area.connectedSea] : null;
                const enemyShipsInSea = !!sea && sea.units.some(u => u.house !== house);
                if (!enemyShipsInSea) powerGain += 1;
                return;
            }
            if (area.house === house && area.power && area.power > 0) {
                powerGain += area.power;
            }
        });
        if (powerGain > 0) {
            newState.cas[house].power = Math.min(20, newState.cas[house].power + powerGain);
            console.log(`🎭 ${house} gains ${powerGain} Power (crowns + ports)`);
        }
    }

    newState.pendingGameOfThrones = undefined;

    // Continue advancing Westeros
    if (!newState.pendingMustering || newState.pendingMustering.length === 0) {
        newState.phase = 'Planning';
    }

    return newState;
}

// ═══════════════════════════════════════════════
// CP★ MUSTERING (Action Phase)
// ═══════════════════════════════════════════════

/** Trigger mustering from a CP★ order during Action Phase */
export function triggerCPStarMustering(state: GameState, areaId: string): GameState {
    const area = state.board[areaId];
    if (!area.order || area.order.type !== 'ConsolidatePower' || !area.order.star) {
        return state;
    }
    if (!area.house || !(area.castle || area.stronghold)) {
        return state;
    }

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));

    const points = area.stronghold ? 2 : 1;
    newState.pendingMustering = [{
        house: area.house,
        areaId,
        pointsRemaining: points
    }];

    // Consume the CP★ order
    newState.board[areaId].order = null;

    console.log(`🏗️ CP★ Mustering in ${area.name} (${points} points)`);
    return newState;
}

// ═══════════════════════════════════════════════
// PORT MECHANICS
// ═══════════════════════════════════════════════

/** Find the port connected to a land area */
export function getPortForArea(state: GameState, landAreaId: string): string | null {
    for (const [portId, portArea] of Object.entries(state.board)) {
        if (portArea.type === 'Port' && portArea.connectedLand === landAreaId) {
            return portId;
        }
    }
    return null;
}

/** Sync port ownership to match connected land area */
export function syncPortOwnership(state: GameState): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));

    for (const [areaId, area] of Object.entries(newState.board)) {
        if (area.type === 'Port' && area.connectedLand) {
            const landArea = newState.board[area.connectedLand];
            if (landArea) {
                area.house = landArea.house;
            }
        }
    }
    return newState;
}

/** Check if ships can be mustered into a port */
export function canMusterInPort(state: GameState, portId: string): boolean {
    const port = state.board[portId];
    if (!port || port.type !== 'Port') return false;
    const shipCount = port.units.filter(u => u.type === 'Ship').length;
    return shipCount < (port.maxShips ?? 3);
}

/** Move ship from port to connected sea */
export function moveShipFromPort(state: GameState, portId: string, shipId: string): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));

    const port = newState.board[portId];
    if (!port || port.type !== 'Port' || !port.connectedSea) return state;

    const shipIdx = port.units.findIndex(u => u.id === shipId);
    if (shipIdx < 0) return state;

    const ship = port.units.splice(shipIdx, 1)[0];
    newState.board[port.connectedSea].units.push(ship);
    console.log(`  ⛵ Ship moved from ${port.name} to ${newState.board[port.connectedSea].name}`);

    return newState;
}
