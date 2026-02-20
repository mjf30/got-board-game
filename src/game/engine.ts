import { GameState, Order, OrderType, HouseName, UnitType, Unit, STAR_ORDER_LIMITS, getStarLimit, MUSTER_COSTS, ActionSubPhase, BiddingState } from './types';
import { initiateCombat } from './combat';
import { WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3 } from './constants/westerosCards';
import { WILDLING_DECK, WildlingCard } from './constants/wildlingCards';
import { checkSupplyLimits } from './supply';
import { isMoveValid } from './navigation';
import { ORDER_TOKENS } from './types';
import { HOUSE_SETUP } from './constants/houses';

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
            return {
                house,
                castles: countCastlesAndStrongholds(state, house),
                supply: state.cas[house].supply,
                power: state.cas[house].power,
                thronePos: state.cas[house].influence.ironThrone
            };
        });

        // Sort descending by criteria
        // Note: Throne Position 1 is best, so ascending sort for that.
        scores.sort((a, b) => {
            if (b.castles !== a.castles) return b.castles - a.castles;
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
            // Choice: Supply or Mustering
            const holder = getTrackHolder(state, 'ironThrone');
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'Mustering', action: 'Mustering' },
                    { label: 'Supply', action: 'Supply' }
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
            // Choice: Clash of Kings or Game of Thrones
            const holder = getTrackHolder(state, 'kingsCourt'); // Messenger Raven holder (usually Top of King's Court? Note: Raven is distinct item, usually held by King's Court #1, but let's assume Track Holder #1 for simplicity)
            // Actually, Messenger Raven holder is King's Court #1.
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'Clash of Kings', action: 'Clash of Kings' },
                    { label: 'Game of Thrones', action: 'Game of Thrones' },
                ]
            };
            console.log(`  ❓ Dark Wings, Dark Words: ${holder} must choose.`);
        } else if (cardName === 'Game of Thrones') {
            newState.pendingGameOfThrones = true;
            console.log(`  🎭 Game of Thrones! Collecting power from crown areas...`);
        }
    } else if (deckIndex === 2) { // Deck III
        if (cardName === 'Wildling Attack' || newState.wildlingThreat >= 12) {
            if (!newState.pendingBidding) {
                newState.pendingBidding = {
                    type: 'wildling',
                    bids: {},
                    resolved: false
                };
                console.log(`  🐺 WILDLING ATTACK! All houses must bid Power tokens!`);
            }
        } else if (cardName === 'Put to the Sword') {
            // Choice: Restrict 1 type of order
            const holder = getTrackHolder(state, 'fiefdoms'); // Valyrian Steel Blade holder
            newState.pendingDecision = {
                cardName,
                chooser: holder,
                options: [
                    { label: 'No Defense', action: 'Storm of Swords' }, // Same effect as Storm of Swords
                    { label: 'No March +1', action: 'Rains of Autumn' },
                    { label: 'No Support', action: 'Web of Lies' },
                    { label: 'No CP', action: 'Feast for Crows' },
                    { label: 'No Raid', action: 'Sea of Storms' }
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

export function makeDecision(state: GameState, action: string): GameState {
    if (!state.pendingDecision) return state;

    let newState = { ...state };
    const { cardName } = state.pendingDecision;

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
        // Horde Descends: muster in the chosen area
        const parts = action.split(':');
        const hmAreaId = parts[1];
        const hmPoints = parseInt(parts[2]);
        newState.pendingMustering = [{
            house: state.pendingDecision!.chooser,
            areaId: hmAreaId,
            pointsRemaining: hmPoints
        }];
        console.log(`🏗️ Horde Descends: mustering in ${hmAreaId} (${hmPoints} pts)`);
    } else if (action === 'preemptive-destroy') {
        // Preemptive Raid: destroy 2 units
        newState.board = JSON.parse(JSON.stringify(state.board));
        destroyUnitsAuto(newState, state.pendingDecision!.chooser, 2);
        newState = tryAdvanceWesteros(newState);
    } else if (action === 'preemptive-track') {
        // Preemptive Raid: lose 2 positions on highest (best) Influence track
        const prLoser = state.pendingDecision!.chooser;
        const prTracks = ['ironThrone', 'fiefdoms', 'kingsCourt'] as const;
        const bestTrack = prTracks.reduce((best, t) =>
            newState.cas[prLoser].influence[t] < newState.cas[prLoser].influence[best] ? t : best
        , prTracks[0]);
        const totalPositions = Object.keys(newState.cas).length;
        const newPos = Math.min(totalPositions, newState.cas[prLoser].influence[bestTrack] + 2);
        // Shift others up to fill the gap
        Object.keys(newState.cas).forEach(h => {
            if (h !== prLoser) {
                const hPos = newState.cas[h as HouseName].influence[bestTrack];
                if (hPos > newState.cas[prLoser].influence[bestTrack] && hPos <= newPos) {
                    newState.cas[h as HouseName].influence[bestTrack] -= 1;
                }
            }
        });
        newState.cas[prLoser].influence[bestTrack] = newPos;
        console.log(`📉 Preemptive Raid: ${prLoser} moved down 2 positions on ${bestTrack}`);
        newState = tryAdvanceWesteros(newState);
    } else if (action === 'Nothing') {
        // Do nothing
    } else {
        // Restrictions (Put to the Sword)
        // Map action string back to restriction
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

    return newState;
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
        if (!newState.pendingBidding && !newState.pendingMustering && !newState.pendingGameOfThrones) {
            newState.drawnWesterosCards = undefined;
            newState.westerosActionIndex = undefined;
            return tryAdvanceWesteros(newState);
        }
    }

    return newState;
}

export function resolvePhase(state: GameState): GameState {
    let newState = { ...state };

    if (state.phase === 'Westeros') {
        // Guard: If cards are already drawn OR we are in the middle of resolving events, do nothing.
        // This prevents the engine from resetting the card index or drawing new cards repeatedly.
        if (state.drawnWesterosCards || state.pendingBidding || state.pendingMustering || state.pendingGameOfThrones) {
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

        // Advance Wildling Threat for each card with wildling icon (Step 2 of Westeros Phase)
        [card1, card2, card3].forEach(card => {
            if (card.wildlingIcon) {
                newState.wildlingThreat = Math.min(12, (newState.wildlingThreat || 0) + 2);
            }
        });

        newState.drawnWesterosCards = [card1.name, card2.name, card3.name];
        newState.westerosActionIndex = 0;

        console.log(`📜 Westeros — Round ${state.round}`);
        console.log(`  I: ${card1.name}  II: ${card2.name}  III: ${card3.name}`);
        console.log(`  🐺 Wildling Threat: ${newState.wildlingThreat}`);

        // Logic removed here - moved to resolveNextWesterosCard

    } else if (state.phase === 'Planning') {
        newState.phase = 'Action';
        newState.actionSubPhase = 'Raid';
        newState.actionPlayerIndex = 0;
        // Find first player with Raid orders
        const nextRaid = findNextPlayerWithOrder(newState, 'Raid', 0);
        if (nextRaid !== null) {
            newState.actionPlayerIndex = nextRaid;
            newState.currentPlayerHouse = newState.turnOrder[nextRaid];
        } else {
            // No raids, skip to March
            newState.actionSubPhase = 'March';
            const nextMarch = findNextPlayerWithOrder(newState, 'March', 0);
            if (nextMarch !== null) {
                newState.actionPlayerIndex = nextMarch;
                newState.currentPlayerHouse = newState.turnOrder[nextMarch];
            } else {
                newState.actionSubPhase = 'ConsolidatePower';
            }
        }

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

    // Can also upgrade: Footman → Knight (costs 1 muster point as upgrade)
    // For now, just place new units

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

/** Upgrade a Footman to Knight during mustering (costs 1 muster point) */
export function upgradeFootmanToKnight(state: GameState, areaId: string, footmanId: string): GameState {
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

    if (newState.cas[musterEntry.house].availableUnits.Knight <= 0) {
        console.warn('No Knight units available for upgrade');
        return state;
    }

    // Convert Footman → Knight
    area.units[footmanIdx] = {
        ...area.units[footmanIdx],
        type: 'Knight',
        id: `${musterEntry.house}-Knight-${Date.now()}-${Math.random()}`
    };
    newState.cas[musterEntry.house].availableUnits.Knight -= 1;
    newState.cas[musterEntry.house].availableUnits.Footman += 1;
    musterEntry.pointsRemaining -= 1;

    console.log(`🏗️ ${musterEntry.house} upgraded Footman → Knight in ${area.name} (${musterEntry.pointsRemaining} pts left)`);

    if (musterEntry.pointsRemaining <= 0) {
        newState.pendingMustering = newState.pendingMustering.filter(m => m.areaId !== areaId);
    }
    if (newState.pendingMustering.length === 0) {
        newState.pendingMustering = undefined;
    }

    return newState;
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

    if (!area || area.house !== house || area.units.length === 0) {
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

    const fromArea = newState.board[fromAreaId];
    const toArea = newState.board[toAreaId];

    if (!isMoveValid(state, fromAreaId, toAreaId, fromArea.house!)) {
        console.warn('Invalid move');
        return state;
    }

    const allowedTypes = toArea.type === 'Sea' || toArea.type === 'Port' ? ['Ship'] : ['Footman', 'Knight', 'SiegeEngine'];
    const movingUnits = fromArea.units.filter(u => unitsToMove.includes(u.id) && allowedTypes.includes(u.type) && !u.routed);

    if (movingUnits.length === 0) return state;

    fromArea.units = fromArea.units.filter(u => !movingUnits.some(mu => mu.id === u.id));

    if (toArea.house && toArea.house !== fromArea.house && toArea.units.length > 0) {
        console.log('⚔️ Combat!');
        const marchStrength = fromArea.order?.strength ?? 0;
        fromArea.order = null;
        return initiateCombat(newState, toAreaId, fromArea.house!, toArea.house!, movingUnits, marchStrength, fromAreaId);
    }

    // Garrison-only defense: area has a neutral garrison but no units
    const targetGarrison = newState.garrisons[toAreaId];
    if (targetGarrison && toArea.house && toArea.house !== fromArea.house && toArea.units.length === 0) {
        // Calculate march strength vs garrison defense
        let marchForce = 0;
        movingUnits.forEach(u => {
            switch (u.type) {
                case 'Footman': marchForce += 1; break;
                case 'Knight': marchForce += 2; break;
                case 'Ship': marchForce += 1; break;
                case 'SiegeEngine':
                    if (toArea.castle || toArea.stronghold) marchForce += 4;
                    break;
            }
        });
        marchForce += (fromArea.order?.strength ?? 0);

        if (marchForce > targetGarrison.strength) {
            // Overcome garrison: take the area, remove garrison
            console.log(`🛡️ Overcame garrison (${marchForce} vs ${targetGarrison.strength}) in ${toArea.name}`);
            delete newState.garrisons[toAreaId];
            toArea.units.push(...movingUnits);
            toArea.house = fromArea.house;
            fromArea.order = null;
        } else {
            // March fails: units stay in origin
            console.log(`🛡️ Garrison held! (${marchForce} vs ${targetGarrison.strength}) in ${toArea.name}`);
            fromArea.units.push(...movingUnits);
            fromArea.order = null;
            return newState;
        }
    } else if (!toArea.house || toArea.house === fromArea.house || toArea.units.length === 0) {
        toArea.units.push(...movingUnits);
        toArea.house = fromArea.house;
    }

    // Clear ownership if Sea or Port becomes empty
    if (fromArea.units.length === 0) {
        if (fromArea.type === 'Sea' || fromArea.type === 'Port') {
            fromArea.house = null;
        }
    }

    // Power token logic for empty Land area
    if (fromArea.units.length === 0 && fromArea.type === 'Land') {
        const house = fromArea.house!;
        const isHomeArea = HOUSE_SETUP[house]?.homeArea === fromAreaId;

        // Home areas have a printed power token — automatically retained
        if (isHomeArea) {
            console.log(`🏠 ${house} automatically retains Home Area ${fromAreaId}`);
        } else {
            // For other land areas, ask player whether to leave a power token
            newState.pendingPowerTokenArea = fromAreaId;
        }
    }

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
        console.log(`💰 ${area.house} kept control of ${areaId}`);
    } else if (area.house) {
        // Can't afford power token — automatically lose control
        console.log(`❌ ${area.house} has no Power tokens — lost control of ${areaId}`);
        area.house = null;
    }
    newState.pendingPowerTokenArea = undefined;
    return newState;
}

export function declinePowerToken(state: GameState): GameState {
    if (!state.pendingPowerTokenArea) return state;
    const areaId = state.pendingPowerTokenArea;
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.board[areaId].house = null;
    console.log(`❌ ${areaId} lost control`);
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

    const raidableTypes: OrderType[] = ['Raid', 'Support', 'ConsolidatePower'];
    if (fromArea.order.star) raidableTypes.push('Defense');

    if (!raidableTypes.includes(toArea.order.type)) return state;
    if (!fromArea.adjacent.includes(toAreaId)) return state;

    // Port Restriction: Ships in Port can only raid the connected Sea
    if (fromArea.type === 'Port' && fromArea.connectedSea !== toAreaId) return state;

    console.log(`🔥 Raid: ${fromArea.house} → ${toArea.house}'s ${toArea.order.type}`);

    if (toArea.order.type === 'ConsolidatePower' && toArea.house && fromArea.house) {
        if (newState.cas[toArea.house].power > 0) {
            newState.cas[toArea.house].power -= 1;
            newState.cas[fromArea.house].power = Math.min(20, newState.cas[fromArea.house].power + 1);
            console.log(`  💰 Stole 1 Power`);
        }
    }

    fromArea.order = null;
    toArea.order = null;
    return newState;
}

// ═══════════════════════════════════════════════
// CONSOLIDATE POWER
// ═══════════════════════════════════════════════

export function resolveConsolidatePower(state: GameState): GameState {
    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.board = JSON.parse(JSON.stringify(state.board));

    Object.values(newState.board).forEach(area => {
        if (area.order?.type === 'ConsolidatePower' && area.house) {
            let powerGain = 1;
            if (area.power && area.power > 0) powerGain += area.power;
            newState.cas[area.house].power = Math.min(20, newState.cas[area.house].power + powerGain);
            console.log(`💰 ${area.house} +${powerGain} power from ${area.name}`);
            area.order = null;
        }
    });

    return newState;
}

// ═══════════════════════════════════════════════
// RETREAT
// ═══════════════════════════════════════════════

/** Set up retreat for losing units — UI will call resolveRetreat */
export function initiateRetreat(state: GameState, house: HouseName, units: Unit[], fromAreaId: string, attackOriginAreaId?: string): GameState {
    const area = state.board[fromAreaId];
    // Find adjacent friendly areas (or empty), excluding attacker's origin
    const possibleAreas = area.adjacent.filter(adjId => {
        const adj = state.board[adjId];
        if (!adj) return false;
        // Cannot retreat to the area the attacker marched from
        if (adjId === attackOriginAreaId) return false;
        if (adj.type === 'Sea' && units.some(u => u.type !== 'Ship')) return false; // Land units can't retreat to sea
        return !adj.house || adj.house === house;
    });

    if (possibleAreas.length === 0 || units.length === 0) {
        // No retreat possible — units are destroyed and returned to available pool
        console.log(`💀 No retreat possible for ${house} — units destroyed`);
        const newState = { ...state };
        newState.cas = JSON.parse(JSON.stringify(state.cas));
        for (const u of units) {
            newState.cas[house].availableUnits[u.type] += 1;
        }
        return newState;
    }

    return { ...state, pendingRetreat: { house, units, fromAreaId, possibleAreas } };
}

/** Execute retreat to chosen area */
export function resolveRetreat(state: GameState, toAreaId: string): GameState {
    if (!state.pendingRetreat) return state;

    const { house, units, possibleAreas } = state.pendingRetreat;
    if (!possibleAreas.includes(toAreaId)) {
        console.warn('Invalid retreat destination');
        return state;
    }

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    const toArea = newState.board[toAreaId];

    // Mark as routed
    const routedUnits = units.map(u => ({ ...u, routed: true }));
    toArea.units.push(...routedUnits);
    toArea.house = house;

    console.log(`🏃 ${house} retreated ${units.length} units to ${toAreaId}`);
    newState.pendingRetreat = undefined;
    return newState;
}

// ═══════════════════════════════════════════════
// BIDDING SYSTEM (Clash of Kings + Wildling)
// ═══════════════════════════════════════════════

/** Submit a bid for the current bidding round */
export function submitBid(state: GameState, house: HouseName, amount: number): GameState {
    if (!state.pendingBidding) return state;
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

/** Resolve the current bidding round once all bids are in */
export function resolveBids(state: GameState): GameState {
    if (!state.pendingBidding) return state;

    const bidding = state.pendingBidding;
    const allHouses = state.turnOrder;

    // Check all houses have bid
    const missingBids = allHouses.filter(h => bidding.bids[h] === undefined);
    if (missingBids.length > 0) {
        console.warn(`Waiting for bids from: ${missingBids.join(', ')}`);
        return state;
    }

    let newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    if (bidding.type === 'wildling') {
        return resolveWildlingBids(newState);
    }

    // Clash of Kings: Rank on the track by bid (highest = position 1)
    const track = bidding.currentTrack!;
    const sorted = [...allHouses].sort((a, b) => {
        const bidA = bidding.bids[a] ?? 0;
        const bidB = bidding.bids[b] ?? 0;
        if (bidB !== bidA) return bidB - bidA; // Higher bid = better position
        // Tie: existing position on Iron Throne track breaks ties
        return newState.cas[a].influence.ironThrone - newState.cas[b].influence.ironThrone;
    });

    // Assign positions (1-based)
    sorted.forEach((house, idx) => {
        newState.cas[house].influence[track] = idx + 1;
    });

    // Deduct power
    allHouses.forEach(h => {
        const bid = bidding.bids[h] ?? 0;
        newState.cas[h].power -= bid;
    });

    console.log(`👑 ${track} track updated: ${sorted.join(' > ')}`);

    // Move to next track or finish
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
        // Update turn order based on new Iron Throne positions
        newState.turnOrder = [...allHouses].sort(
            (a, b) => newState.cas[a].influence.ironThrone - newState.cas[b].influence.ironThrone
        );
        newState.currentPlayerHouse = newState.turnOrder[0];
        // Check if there's a pending wildling or other event
        newState = tryAdvanceWesteros(newState);
    }

    return newState;
}

/** Resolve Wildling attack bidding */
function resolveWildlingBids(state: GameState): GameState {
    const newState = { ...state };
    const bidding = state.pendingBidding!;
    const allHouses = state.turnOrder;
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    const totalBid = allHouses.reduce((sum, h) => sum + (bidding.bids[h] ?? 0), 0);

    // Store bids before deducting (needed for Skinchanger Scout)
    const bidAmounts: Record<string, number> = {};
    allHouses.forEach(h => { bidAmounts[h] = bidding.bids[h] ?? 0; });

    // Deduct power from all houses
    allHouses.forEach(h => {
        newState.cas[h].power -= bidAmounts[h];
    });

    const isVictory = totalBid >= state.wildlingThreat;

    // Determine Highest Bidder (ties: better Iron Throne position wins)
    const sortedByHigh = [...allHouses].sort((a, b) => {
        if (bidAmounts[b] !== bidAmounts[a]) return bidAmounts[b] - bidAmounts[a];
        return newState.cas[a].influence.ironThrone - newState.cas[b].influence.ironThrone;
    });
    const highestBidder = sortedByHigh[0];

    // Determine Lowest Bidder (ties: worse Iron Throne position = lowest)
    const sortedByLow = [...allHouses].sort((a, b) => {
        if (bidAmounts[a] !== bidAmounts[b]) return bidAmounts[a] - bidAmounts[b];
        return newState.cas[b].influence.ironThrone - newState.cas[a].influence.ironThrone;
    });
    const lowestBidder = sortedByLow[0];

    // Draw wildling card from persistent deck
    let wildDeck = [...(newState.wildlingDeck ?? shuffle([...WILDLING_DECK]))];
    if (wildDeck.length === 0) wildDeck = shuffle([...WILDLING_DECK]);
    const wildlingCard = wildDeck.shift()!;
    newState.wildlingDeck = wildDeck;

    console.log(`🛡️ Wildling Attack: Bid ${totalBid} vs Threat ${state.wildlingThreat}`);
    console.log(`  🃏 Card: ${wildlingCard.name}`);

    if (isVictory) {
        newState.wildlingThreat = 0;
        console.log(`  🎉 Victory! Highest: ${highestBidder}`);
        applyWildlingVictory(newState, wildlingCard, highestBidder, allHouses, bidAmounts);
    } else {
        newState.wildlingThreat = Math.min(12, newState.wildlingThreat + 2);
        console.log(`  💀 Defeat! Lowest: ${lowestBidder}`);
        applyWildlingDefeat(newState, wildlingCard, lowestBidder, allHouses);
    }

    // Store card for display
    newState.currentWildlingCard = wildlingCard;
    newState.pendingBidding = undefined;

    return newState;
}

/** Apply wildling victory rewards */
function applyWildlingVictory(state: GameState, card: WildlingCard, winner: HouseName, allHouses: HouseName[], bidAmounts: Record<string, number>) {
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
            if (state.cas[winner].discards.length > 0) {
                const sorted = [...state.cas[winner].discards].sort((a, b) => b.strength - a.strength);
                const retrieved = sorted[0];
                state.cas[winner].discards = state.cas[winner].discards.filter(c => c.id !== retrieved.id);
                state.cas[winner].cards.push(retrieved);
                console.log(`    🏆 ${winner}: Retrieved ${retrieved.name} from discards`);
            }
            break;
        case 'crow-killers': {
            let upgrades = 0;
            for (const area of Object.values(state.board)) {
                if (upgrades >= 2) break;
                for (let i = 0; i < area.units.length && upgrades < 2; i++) {
                    if (area.units[i].house === winner && area.units[i].type === 'Footman' && state.cas[winner].availableUnits.Knight > 0) {
                        area.units[i].type = 'Knight';
                        state.cas[winner].availableUnits.Knight--;
                        state.cas[winner].availableUnits.Footman++;
                        upgrades++;
                    }
                }
            }
            console.log(`    🏆 ${winner}: Upgraded ${upgrades} Footmen → Knights`);
            break;
        }
        case 'massing-milkwater':
            state.cas[winner].cards.push(...state.cas[winner].discards);
            state.cas[winner].discards = [];
            console.log(`    🏆 ${winner}: All discarded cards returned to hand`);
            break;
        case 'preemptive-raid':
            // The wildlings attack again immediately at strength 6, starting with the highest bidder
            state.wildlingThreat = 6;
            state.pendingBidding = {
                type: 'wildling',
                bids: {},
                resolved: false
            };
            console.log(`    🏆 ${winner}: Preemptive Raid - wildlings re-attack at strength 6!`);
            break;
        case 'king-beyond-wall': {
            const tracks = ['ironThrone', 'fiefdoms', 'kingsCourt'] as const;
            const worstTrack = tracks.reduce((worst, t) =>
                state.cas[winner].influence[t] > state.cas[winner].influence[worst] ? t : worst
            , tracks[0]);
            const oldPos = state.cas[winner].influence[worstTrack];
            allHouses.forEach(h => {
                if (h !== winner && state.cas[h].influence[worstTrack] < oldPos) {
                    state.cas[h].influence[worstTrack] += 1;
                }
            });
            state.cas[winner].influence[worstTrack] = 1;
            console.log(`    🏆 ${winner}: Moved to #1 on ${worstTrack}`);
            break;
        }
        case 'horde-descends': {
            // Winner may muster in ONE Castle or Stronghold they control (per rules)
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
                // Only one option — auto-select
                state.pendingMustering = [{
                    house: winner,
                    areaId: musterAreas[0].areaId,
                    pointsRemaining: musterAreas[0].points
                }];
                console.log(`    🏆 ${winner}: Horde Descends - mustering in ${musterAreas[0].areaId}`);
            } else if (musterAreas.length > 1) {
                // Player must choose ONE area
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

/** Apply wildling defeat penalties */
function applyWildlingDefeat(state: GameState, card: WildlingCard, loser: HouseName, allHouses: HouseName[]) {
    const others = allHouses.filter(h => h !== loser);

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
        case 'rattleshirts-raiders':
            state.cas[loser].supply = Math.max(0, state.cas[loser].supply - 2);
            console.log(`    💀 ${loser}: -2 Supply → ${state.cas[loser].supply}`);
            others.forEach(h => {
                state.cas[h].supply = Math.max(0, state.cas[h].supply - 1);
                console.log(`    💀 ${h}: -1 Supply → ${state.cas[h].supply}`);
            });
            break;
        case 'mammoth-riders':
            destroyUnitsAuto(state, loser, 3);
            others.forEach(h => destroyUnitsAuto(state, h, 2));
            break;
        case 'crow-killers':
            replaceKnightsWithFootmen(state, loser, Infinity);
            others.forEach(h => replaceKnightsWithFootmen(state, h, 2));
            break;
        case 'massing-milkwater':
            if (state.cas[loser].cards.length > 1) {
                const maxStr = Math.max(...state.cas[loser].cards.map(c => c.strength));
                const toDiscard = state.cas[loser].cards.filter(c => c.strength === maxStr);
                state.cas[loser].cards = state.cas[loser].cards.filter(c => c.strength !== maxStr);
                state.cas[loser].discards.push(...toDiscard);
                console.log(`    💀 ${loser}: Discarded ${toDiscard.map(c => c.name).join(', ')}`);
            }
            others.forEach(h => {
                if (state.cas[h].cards.length > 1) {
                    const sorted = [...state.cas[h].cards].sort((a, b) => a.strength - b.strength);
                    const toDiscard = sorted[0];
                    state.cas[h].cards = state.cas[h].cards.filter(c => c.id !== toDiscard.id);
                    state.cas[h].discards.push(toDiscard);
                    console.log(`    💀 ${h}: Discarded ${toDiscard.name}`);
                }
            });
            break;
        case 'preemptive-raid':
            // Loser chooses: destroy 2 units OR lose 2 positions on highest Influence track
            state.pendingDecision = {
                cardName: 'Preemptive Raid Penalty',
                chooser: loser,
                options: [
                    { label: 'Destroy 2 units', action: 'preemptive-destroy' },
                    { label: 'Lose 2 track positions', action: 'preemptive-track' }
                ]
            };
            break;
        case 'king-beyond-wall': {
            const tracks = ['ironThrone', 'fiefdoms', 'kingsCourt'] as const;
            tracks.forEach(track => {
                const currentPos = state.cas[loser].influence[track];
                allHouses.forEach(h => {
                    if (h !== loser && state.cas[h].influence[track] > currentPos) {
                        state.cas[h].influence[track] -= 1;
                    }
                });
                state.cas[loser].influence[track] = allHouses.length;
            });
            console.log(`    💀 ${loser}: Moved to bottom of ALL tracks`);
            others.forEach(h => {
                const fPos = state.cas[h].influence.fiefdoms;
                const kPos = state.cas[h].influence.kingsCourt;
                const chooseWorst = fPos > kPos ? 'fiefdoms' : 'kingsCourt';
                const currentPos = state.cas[h].influence[chooseWorst];
                allHouses.forEach(h2 => {
                    if (h2 !== h && state.cas[h2].influence[chooseWorst] > currentPos) {
                        state.cas[h2].influence[chooseWorst] -= 1;
                    }
                });
                state.cas[h].influence[chooseWorst] = allHouses.length;
                console.log(`    💀 ${h}: Moved to bottom of ${chooseWorst}`);
            });
            break;
        }
        case 'horde-descends': {
            const castleAreas = Object.entries(state.board).filter(([_, a]) =>
                a.house === loser && (a.castle || a.stronghold) && a.units.length > 0
            );
            if (castleAreas.length > 0) {
                const [, area] = castleAreas[0];
                const killed = Math.min(2, area.units.length);
                for (let i = 0; i < killed; i++) {
                    const unit = area.units.pop()!;
                    state.cas[loser].availableUnits[unit.type] += 1;
                }
                console.log(`    💀 ${loser}: Destroyed ${killed} units at ${area.name}`);
            } else {
                destroyUnitsAuto(state, loser, 2);
            }
            others.forEach(h => destroyUnitsAuto(state, h, 1));
            break;
        }
    }
}

/** Auto-destroy N units for a house (removes from board, returns to pool) */
function destroyUnitsAuto(state: GameState, house: HouseName, count: number) {
    let remaining = count;
    for (const area of Object.values(state.board)) {
        if (remaining <= 0) break;
        while (remaining > 0 && area.units.some(u => u.house === house)) {
            const idx = area.units.findIndex(u => u.house === house);
            if (idx < 0) break;
            const unit = area.units.splice(idx, 1)[0];
            state.cas[house].availableUnits[unit.type] += 1;
            remaining--;
        }
        if (area.units.length === 0 && area.house === house && (area.type === 'Sea' || area.type === 'Port')) {
            area.house = null;
        }
    }
    console.log(`    💀 ${house}: Destroyed ${count - remaining} units`);
}

/** Replace knights with footmen for a house */
function replaceKnightsWithFootmen(state: GameState, house: HouseName, maxReplace: number) {
    let replaced = 0;
    let destroyed = 0;
    for (const area of Object.values(state.board)) {
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
    }
    console.log(`    💀 ${house}: ${replaced} Knights → Footmen, ${destroyed} Knights destroyed`);
}

/** Try to advance through remaining Westeros events */
// Try to advance through remaining Westeros events
function tryAdvanceWesteros(state: GameState): GameState {
    const newState = { ...state };

    // If cards are being displayed, wait for user acknowledgement
    if (newState.drawnWesterosCards || newState.currentWildlingCard) {
        return newState;
    }

    // If a pending decision exists (e.g. Horde Descends area choice), wait for it
    if (newState.pendingDecision) {
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

/** Resolve Game of Thrones: each house gains power for areas with crown icons */
export function resolveGameOfThrones(state: GameState): GameState {
    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    for (const house of state.turnOrder) {
        let powerGain = 0;
        Object.values(state.board).forEach(area => {
            if (area.house === house) {
                // Crown icons on areas (power value)
                if (area.power && area.power > 0) powerGain += area.power;
            }
        });
        if (powerGain > 0) {
            newState.cas[house].power = Math.min(20, newState.cas[house].power + powerGain);
            console.log(`🎭 ${house} gains ${powerGain} Power from crown areas`);
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

/** Destroy port ships when a land area is conquered by a different house */
export function destroyPortShips(state: GameState, landAreaId: string, oldOwner: HouseName | null | undefined): GameState {
    if (!oldOwner) return state;

    const portId = getPortForArea(state, landAreaId);
    if (!portId) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    const port = newState.board[portId];
    const shipsToDestroy = port.units.filter(u => u.house === oldOwner);
    if (shipsToDestroy.length > 0) {
        console.log(`  ⚓ ${shipsToDestroy.length} ${oldOwner} ship(s) destroyed in ${port.name}`);
        // Return ships to available pool
        if (newState.cas[oldOwner]) {
            newState.cas[oldOwner].availableUnits.Ship += shipsToDestroy.length;
        }
        port.units = port.units.filter(u => u.house !== oldOwner);
    }

    // Port ownership follows the land
    port.house = newState.board[landAreaId].house;

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
