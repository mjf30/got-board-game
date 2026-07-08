import { GameState, HouseName, Unit, Card, Area } from './types';
import { HOUSE_CARDS } from './constants/houses';
import {
    checkVictory, advanceActionTurn, getPortForArea,
    shiftToBottom, syncTurnOrder, homeCrestOwner, portOwner
} from './engine';
import { maxUnitsAddable } from './supply';

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function cloneForCombat(state: GameState): GameState {
    const s = { ...state };
    s.board = JSON.parse(JSON.stringify(state.board));
    s.cas = JSON.parse(JSON.stringify(state.cas));
    if (state.combat) s.combat = JSON.parse(JSON.stringify(state.combat));
    return s;
}

/** Combat strength of units fighting in an area. Routed units provide 0. */
function combatUnitStrength(units: Unit[], targetArea: Area, isAttacking: boolean): number {
    let strength = 0;
    units.forEach(u => {
        if (u.routed) return; // Routed units provide no Combat Strength
        switch (u.type) {
            case 'Footman': strength += 1; break;
            case 'Knight': strength += 2; break;
            case 'Ship': strength += 1; break;
            case 'SiegeEngine':
                if (isAttacking && (targetArea.castle || targetArea.stronghold)) strength += 4;
                break;
        }
    });
    return strength;
}

/** Supporting strength contributed by an area to a combat.
 *  - Land units never support combat in a sea area.
 *  - Siege Engines only support the attacker against a castle/stronghold area.
 *  - Routed units provide no strength.
 *  - Special Support order adds its printed bonus. */
export function supportAreaStrength(
    supportArea: Area, combatArea: Area, side: 'attacker' | 'defender'
): { total: number; ships: number } {
    let strength = 0;
    let ships = 0;
    supportArea.units.forEach(u => {
        if (u.routed) return;
        if (u.type === 'Ship') { strength += 1; ships += 1; return; }
        if (combatArea.type === 'Sea') return; // Footmen/Knights/Siege never support sea combat
        if (u.type === 'Footman') strength += 1;
        else if (u.type === 'Knight') strength += 2;
        else if (u.type === 'SiegeEngine') {
            if (side === 'attacker' && (combatArea.castle || combatArea.stronghold)) strength += 4;
        }
    });
    const starBonus = supportArea.order?.type === 'Support' && supportArea.order.star
        ? (supportArea.order.strength || 1) : 0;
    return { total: strength + starBonus, ships };
}

function cardOf(state: GameState, house: HouseName, cardId?: string): Card | null {
    if (!cardId) return null;
    return HOUSE_CARDS[house].find(c => c.id === cardId) ?? null;
}

// ═══════════════════════════════════════════════
// COMBAT INITIATION
// ═══════════════════════════════════════════════

export function initiateCombat(
    state: GameState,
    areaId: string,
    attacker: HouseName,
    defender: HouseName,
    attackingUnits: Unit[],
    marchOrderStrength: number = 0,
    fromAreaId?: string,
    marchOrderTokenIndex?: number
): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    const area = newState.board[areaId];

    const attackingStrength = combatUnitStrength(attackingUnits, area, true);
    const defendingStrength = combatUnitStrength(area.units, area, false);

    let defenseBonus = 0;
    if (area.order?.type === 'Defense') {
        defenseBonus = area.order.strength;
    }

    let garrisonBonus = 0;
    const garrison = state.garrisons[areaId];
    if (garrison && garrison.house === defender) {
        garrisonBonus = garrison.strength;
        console.log(`  🏰 Garrison: +${garrisonBonus}`);
    }

    // Every Support order adjacent to the embattled area must declare (or refuse) support,
    // including the attacker's and defender's own support (which they may refuse).
    const supporters: { house: HouseName; areaId: string }[] = [];
    Object.entries(newState.board).forEach(([saId, supportArea]) => {
        if (!supportArea.order || supportArea.order.type !== 'Support') return;
        if (!supportArea.adjacent.includes(areaId)) return;
        if (supportArea.type === 'Port' && supportArea.connectedSea !== areaId) return;
        if (!supportArea.house) return;
        supporters.push({ house: supportArea.house, areaId: saId });
    });
    // Support is declared in turn order
    supporters.sort((a, b) => state.turnOrder.indexOf(a.house) - state.turnOrder.indexOf(b.house));

    console.log(`⚔️ Combat in ${area.name}: ${attacker} vs ${defender}`);

    newState.combat = {
        attacker,
        defender,
        areaId,
        attackingUnits,
        defendingUnits: area.units.map(u => ({ ...u })),
        attackerStrength: attackingStrength + marchOrderStrength,
        defenderStrength: defendingStrength + defenseBonus + garrisonBonus,
        marchFromArea: fromAreaId,
        marchOrderStrength,
        marchOrderTokenIndex,
        phase: supporters.length > 0 ? 'support' : 'cards',
        supportDecisions: {},
        supportContributions: {}
    };

    if (supporters.length > 0) {
        newState.pendingSupportDeclarations = {
            combatAreaId: areaId,
            attacker,
            defender,
            pendingHouses: supporters,
            decisions: {}
        };
        console.log(`  🤝 Awaiting support declarations from: ${supporters.map(s => s.house).join(', ')}`);
    }

    return newState;
}

/** Declare support during combat (own support may be refused; never against your own units) */
export function declareSupportChoice(
    state: GameState,
    supportAreaId: string,
    choice: 'attacker' | 'defender' | 'none'
): GameState {
    if (!state.pendingSupportDeclarations || !state.combat) return state;

    const entryCheck = state.pendingSupportDeclarations.pendingHouses.find(p => p.areaId === supportAreaId);
    if (!entryCheck) return state;

    // A player may never support an opponent in combat against his own units
    if (entryCheck.house === state.combat.attacker && choice === 'defender') return state;
    if (entryCheck.house === state.combat.defender && choice === 'attacker') return state;

    const newState = cloneForCombat(state);
    newState.pendingSupportDeclarations = {
        ...state.pendingSupportDeclarations,
        pendingHouses: [...state.pendingSupportDeclarations.pendingHouses],
        decisions: { ...state.pendingSupportDeclarations.decisions }
    };

    const pending = newState.pendingSupportDeclarations;
    const entry = pending.pendingHouses.find(p => p.areaId === supportAreaId)!;

    pending.decisions[supportAreaId] = choice;
    pending.pendingHouses = pending.pendingHouses.filter(p => p.areaId !== supportAreaId);

    const combat = newState.combat!;
    if (choice !== 'none') {
        const supportArea = newState.board[supportAreaId];
        const combatArea = newState.board[combat.areaId];
        const { total, ships } = supportAreaStrength(supportArea, combatArea, choice);

        if (choice === 'attacker') combat.attackerStrength += total;
        else combat.defenderStrength += total;

        combat.supportContributions![supportAreaId] = {
            side: choice, amount: total, house: entry.house, ships
        };
        console.log(`  🤝 ${entry.house} supports ${choice === 'attacker' ? combat.attacker : combat.defender} (+${total})`);
    } else {
        console.log(`  🤝 ${entry.house} refuses to support`);
    }

    combat.supportDecisions![supportAreaId] = choice;

    if (pending.pendingHouses.length === 0) {
        newState.pendingSupportDeclarations = undefined;
        combat.phase = 'cards';
        console.log(`  🤝 All support declarations complete`);
    }

    return newState;
}

// ═══════════════════════════════════════════════
// HOUSE CARD SELECTION
// ═══════════════════════════════════════════════

export function selectHouseCard(state: GameState, house: HouseName, cardId: string): GameState {
    const newState = { ...state };
    if (!newState.combat) return state;
    newState.combat = { ...newState.combat };

    if (house === newState.combat.attacker) {
        newState.combat.attackerCard = cardId;
    } else if (house === newState.combat.defender) {
        newState.combat.defenderCard = cardId;
    }

    return newState;
}

// ═══════════════════════════════════════════════
// COMBAT RESOLUTION
// ═══════════════════════════════════════════════

export function resolveCombat(state: GameState): GameState {
    if (!state.combat) return state;
    const c0 = state.combat;

    // Both sides must have chosen a card (unless Tyrion left a side without one)
    if (!c0.attackerNoCard && !c0.attackerCard) return state;
    if (!c0.defenderNoCard && !c0.defenderCard) return state;
    if (state.pendingSupportDeclarations) return state;

    const newState = cloneForCombat(state);
    const c = newState.combat!;
    const { attacker, defender, areaId } = c;
    const area = newState.board[areaId];

    const aCard = c.attackerNoCard ? null : cardOf(newState, attacker, c.attackerCard);
    const dCard = c.defenderNoCard ? null : cardOf(newState, defender, c.defenderCard);

    // ═══ 1. TYRION LANNISTER (cancel abilities resolve first) ═══
    if (!c.tyrionResolved) {
        c.tyrionResolved = true;
        const tyrionSide = aCard?.id === 'lan-tyrion' ? attacker : dCard?.id === 'lan-tyrion' ? defender : null;
        if (tyrionSide) {
            const opponent = tyrionSide === attacker ? defender : attacker;
            const opponentCardId = tyrionSide === attacker ? c.defenderCard : c.attackerCard;
            if (opponentCardId) {
                c.phase = 'pre-combat';
                newState.pendingDecision = {
                    cardName: 'Tyrion Lannister',
                    chooser: tyrionSide,
                    options: [
                        { label: `Cancelar a carta de ${opponent}`, action: 'combat:tyrion:use' },
                        { label: 'Não usar a habilidade', action: 'combat:tyrion:skip' }
                    ]
                };
                console.log(`  🃏 Tyrion: ${tyrionSide} may cancel ${opponent}'s card`);
                return newState;
            }
        }
    }

    // ═══ 2. AERON DAMPHAIR ═══
    if (!c.aeronResolved) {
        c.aeronResolved = true;
        const aeronAttacker = aCard?.id === 'grey-aeron' &&
            newState.cas[attacker].power >= 2 &&
            newState.cas[attacker].cards.filter(cc => cc.id !== 'grey-aeron').length > 0;
        const aeronDefender = dCard?.id === 'grey-aeron' &&
            newState.cas[defender].power >= 2 &&
            newState.cas[defender].cards.filter(cc => cc.id !== 'grey-aeron').length > 0;

        if (aeronAttacker || aeronDefender) {
            newState.pendingAeronSwap = { house: aeronAttacker ? attacker : defender };
            c.phase = 'pre-combat';
            console.log(`  🦑 Aeron Damphair: ${newState.pendingAeronSwap.house} may swap card (pay 2 power)`);
            return newState;
        }
    }

    // ═══ 3. DORAN MARTELL (immediate — before the outcome) ═══
    if (!c.doranResolved) {
        c.doranResolved = true;
        const doranSide = aCard?.id === 'mar-doran' ? attacker : dCard?.id === 'mar-doran' ? defender : null;
        if (doranSide) {
            const opponent = doranSide === attacker ? defender : attacker;
            c.phase = 'pre-combat';
            newState.pendingDecision = {
                cardName: 'Doran Martell',
                chooser: doranSide,
                options: [
                    { label: `Trono de Ferro (${opponent} → último)`, action: 'combat:doran:ironThrone' },
                    { label: `Feudos (${opponent} → último)`, action: 'combat:doran:fiefdoms' },
                    { label: `Corte do Rei (${opponent} → último)`, action: 'combat:doran:kingsCourt' }
                ]
            };
            console.log(`  🐍 Doran: ${doranSide} chooses a track for ${opponent}`);
            return newState;
        }
    }

    // ═══ 4. QUEEN OF THORNS (immediate — remove one adjacent enemy order) ═══
    if (!c.queenResolved) {
        c.queenResolved = true;
        const queenSide = aCard?.id === 'tyr-queen' ? attacker : dCard?.id === 'tyr-queen' ? defender : null;
        if (queenSide) {
            const opponent = queenSide === attacker ? defender : attacker;
            const options = area.adjacent
                .filter(adjId => newState.board[adjId]?.order?.house === opponent)
                .map(adjId => ({
                    label: `${newState.board[adjId].name} (${newState.board[adjId].order!.type}${newState.board[adjId].order!.star ? '★' : ''})`,
                    action: `combat:queen:${adjId}`
                }));
            if (options.length > 0) {
                c.phase = 'pre-combat';
                newState.pendingDecision = {
                    cardName: 'Queen of Thorns',
                    chooser: queenSide,
                    options
                };
                console.log(`  🌹 Queen of Thorns: ${queenSide} removes one of ${opponent}'s adjacent orders`);
                return newState;
            }
        }
    }

    // ═══ 5. FINAL RESOLUTION ═══
    if (c.postQueue) return continueCombat(newState);

    let aCardStrength = aCard?.strength ?? 0;
    let dCardStrength = dCard?.strength ?? 0;
    let aSwords = aCard?.swords ?? 0;
    let dSwords = dCard?.swords ?? 0;
    let aForts = aCard?.fortifications ?? 0;
    let dForts = dCard?.fortifications ?? 0;

    // ── Balon Greyjoy (printed strength of opponent's card → 0) ──
    if (aCard?.id === 'grey-balon') dCardStrength = 0;
    if (dCard?.id === 'grey-balon') aCardStrength = 0;

    // ── Stannis ──
    if (aCard?.id === 'bar-stannis' && newState.cas[defender].influence.ironThrone < newState.cas[attacker].influence.ironThrone) aCardStrength += 1;
    if (dCard?.id === 'bar-stannis' && newState.cas[attacker].influence.ironThrone < newState.cas[defender].influence.ironThrone) dCardStrength += 1;

    // ── Ser Davos ──
    if (aCard?.id === 'bar-davos' && newState.cas[attacker].discards.some(cc => cc.id === 'bar-stannis')) { aCardStrength += 1; aSwords += 1; }
    if (dCard?.id === 'bar-davos' && newState.cas[defender].discards.some(cc => cc.id === 'bar-stannis')) { dCardStrength += 1; dSwords += 1; }

    // ── Kevan Lannister (attacking footmen + supporting Lannister footmen: +2 instead of +1) ──
    if (aCard?.id === 'lan-kevan') {
        let footmen = c.attackingUnits.filter(u => u.type === 'Footman' && !u.routed).length;
        Object.entries(c.supportContributions ?? {}).forEach(([saId, sc]) => {
            if (sc.side === 'attacker' && sc.house === attacker) {
                footmen += newState.board[saId].units.filter(u => u.type === 'Footman' && !u.routed).length;
            }
        });
        aCardStrength += footmen;
    }

    // ── Victarion (attacking ships + supporting Greyjoy ships: +2 instead of +1) ──
    if (aCard?.id === 'grey-victarion') {
        let ships = c.attackingUnits.filter(u => u.type === 'Ship' && !u.routed).length;
        Object.entries(c.supportContributions ?? {}).forEach(([saId, sc]) => {
            if (sc.side === 'attacker' && sc.house === attacker) {
                ships += newState.board[saId].units.filter(u => u.type === 'Ship' && !u.routed).length;
            }
        });
        aCardStrength += ships;
    }

    // ── Catelyn (defense order value doubled) ──
    if (dCard?.id === 'stark-catelyn' && area.order?.type === 'Defense') {
        c.defenderStrength += area.order.strength;
    }

    // ── Theon ──
    if (dCard?.id === 'grey-theon' && (area.castle || area.stronghold)) { dCardStrength += 1; dSwords += 1; }

    // ── Asha (no support granted to her side) ──
    const attackerSupported = Object.values(c.supportContributions ?? {}).some(sc => sc.side === 'attacker');
    const defenderSupported = Object.values(c.supportContributions ?? {}).some(sc => sc.side === 'defender');
    if (aCard?.id === 'grey-asha' && !attackerSupported) { aSwords += 2; aForts += 1; }
    if (dCard?.id === 'grey-asha' && !defenderSupported) { dSwords += 2; dForts += 1; }

    // ── Nymeria Sand ──
    if (aCard?.id === 'mar-nymeria') aSwords += 1;
    if (dCard?.id === 'mar-nymeria') dForts += 1;

    // ── Salladhor Saan: if supported, ALL non-Baratheon ships count 0 ──
    const applySalla = (sallaSide: 'attacker' | 'defender') => {
        const supported = sallaSide === 'attacker' ? attackerSupported : defenderSupported;
        if (!supported) return;
        const oppSide: 'attacker' | 'defender' = sallaSide === 'attacker' ? 'defender' : 'attacker';
        const oppHouse = sallaSide === 'attacker' ? defender : attacker;
        // Opponent's ships in the combat itself
        if (oppHouse !== 'Baratheon') {
            const oppUnits = oppSide === 'attacker' ? c.attackingUnits : area.units;
            const oppShips = oppUnits.filter(u => u.type === 'Ship' && !u.routed).length;
            if (oppShips > 0) {
                if (oppSide === 'attacker') c.attackerStrength -= oppShips;
                else c.defenderStrength -= oppShips;
                console.log(`  ⚓ Salladhor Saan: ${oppHouse}'s ${oppShips} combat ship(s) zeroed`);
            }
        }
        // Supporting ships from non-Baratheon houses (both sides)
        Object.values(c.supportContributions ?? {}).forEach(sc => {
            if (sc.house === 'Baratheon' || sc.ships === 0) return;
            if (sc.side === 'attacker') c.attackerStrength -= sc.ships;
            else c.defenderStrength -= sc.ships;
            console.log(`  ⚓ Salladhor Saan: ${sc.house}'s ${sc.ships} supporting ship(s) zeroed`);
        });
    };
    if (aCard?.id === 'bar-salla') applySalla('attacker');
    if (dCard?.id === 'bar-salla') applySalla('defender');

    // ── Mace Tyrell: immediately destroy an opposing Footman (reduces that side's strength) ──
    if (aCard?.id === 'tyr-mace' && dCard?.id !== 'stark-blackfish') {
        const idx = area.units.findIndex(u => u.type === 'Footman' && !u.routed);
        if (idx >= 0) {
            area.units.splice(idx, 1);
            c.defendingUnits = area.units.map(u => ({ ...u }));
            newState.cas[defender].availableUnits.Footman += 1;
            c.defenderStrength -= 1;
            console.log(`  💥 Mace Tyrell: destroyed a ${defender} Footman (-1 strength)`);
        }
    }
    if (dCard?.id === 'tyr-mace' && aCard?.id !== 'stark-blackfish') {
        const idx = c.attackingUnits.findIndex(u => u.type === 'Footman' && !u.routed);
        if (idx >= 0) {
            c.attackingUnits.splice(idx, 1);
            newState.cas[attacker].availableUnits.Footman += 1;
            c.attackerStrength -= 1;
            console.log(`  💥 Mace Tyrell: destroyed a ${attacker} Footman (-1 strength)`);
        }
    }

    // ═══ FINAL STRENGTH & WINNER ═══
    const finalAttackerStrength = c.attackerStrength + aCardStrength;
    const finalDefenderStrength = c.defenderStrength + dCardStrength;
    console.log(`📊 Final: ${attacker}(${finalAttackerStrength}) vs ${defender}(${finalDefenderStrength})`);

    let attackerWins: boolean;
    if (finalAttackerStrength !== finalDefenderStrength) {
        attackerWins = finalAttackerStrength > finalDefenderStrength;
    } else {
        // Tie → higher position on the Fiefdoms track wins
        attackerWins = newState.cas[attacker].influence.fiefdoms < newState.cas[defender].influence.fiefdoms;
    }
    c.attackerWon = attackerWins;
    console.log(attackerWins ? `🏆 ${attacker} wins!` : `🛡️ ${defender} defends!`);

    // ═══ CASUALTIES: only the DEFEATED player suffers them ═══
    const winnerSwords = attackerWins ? aSwords : dSwords;
    const loserForts = attackerWins ? dForts : aForts;
    const loserCard = attackerWins ? dCard : aCard;
    const loserImmune = loserCard?.id === 'stark-blackfish';
    const kills = loserImmune ? 0 : Math.max(0, winnerSwords - loserForts);
    c.kills = kills;
    c.phase = 'casualties';

    // Post-combat pipeline
    c.postQueue = [
        ...(attackerWins ? ['conquest'] : []),
        'tywin', 'renly', 'cersei', 'loras', 'cards', 'bolton', 'patchface', 'retreat', 'finish'
    ];

    // Loser chooses casualties (routed units may never be chosen)
    const loser = attackerWins ? defender : attacker;
    const loserPool = attackerWins ? area.units : c.attackingUnits;
    const eligible = loserPool.filter(u => !u.routed);
    const count = Math.min(kills, eligible.length);

    if (count > 0) {
        newState.pendingUnitSelection = {
            purpose: 'combat-casualties',
            house: loser,
            count,
            eligibleUnitIds: eligible.map(u => u.id),
            prompt: `${loser} sofreu ${count} baixa(s) — escolha quais unidades destruir`
        };
        console.log(`  ☠️ ${loser} must destroy ${count} unit(s)`);
        return newState;
    }

    return continueCombat(newState);
}

/** Apply the loser's chosen casualties, then continue the post-combat pipeline */
export function applyCombatCasualties(state: GameState, unitIds: string[]): GameState {
    if (!state.combat || !state.pendingUnitSelection) return state;

    const newState = cloneForCombat(state);
    const c = newState.combat!;
    const area = newState.board[c.areaId];
    const loser = c.attackerWon ? c.defender : c.attacker;

    for (const id of unitIds) {
        let idx = area.units.findIndex(u => u.id === id);
        if (idx >= 0) {
            const killed = area.units.splice(idx, 1)[0];
            newState.cas[loser].availableUnits[killed.type] += 1;
            continue;
        }
        idx = c.attackingUnits.findIndex(u => u.id === id);
        if (idx >= 0) {
            const killed = c.attackingUnits.splice(idx, 1)[0];
            newState.cas[loser].availableUnits[killed.type] += 1;
        }
    }
    c.defendingUnits = area.units.map(u => ({ ...u }));
    newState.pendingUnitSelection = undefined;
    console.log(`  ☠️ ${loser} destroyed ${unitIds.length} unit(s)`);

    return continueCombat(newState);
}

// ═══════════════════════════════════════════════
// POST-COMBAT PIPELINE
// ═══════════════════════════════════════════════

/** Process the remaining post-combat steps; pauses whenever player input is required */
export function continueCombat(state: GameState): GameState {
    if (!state.combat?.postQueue) return state;
    // Never proceed while an interactive sub-state is waiting for input
    if (state.pendingUnitSelection || state.pendingDecision || state.pendingRetreat ||
        state.pendingRobbRetreat || state.pendingPatchface || state.pendingAeronSwap ||
        state.pendingTyrionCancel || state.pendingSupportDeclarations) {
        return state;
    }
    let s = cloneForCombat(state);

    while (s.combat && s.combat.postQueue && s.combat.postQueue.length > 0) {
        const step = s.combat.postQueue[0];
        s.combat.postQueue = s.combat.postQueue.slice(1);
        const result = processPostStep(s, step);
        s = result.state;
        if (result.paused) return s;
    }
    return s;
}

function processPostStep(s: GameState, step: string): { state: GameState; paused: boolean } {
    const c = s.combat!;
    const { attacker, defender, areaId } = c;
    const area = s.board[areaId];
    const aCard = c.attackerNoCard ? null : cardOf(s, attacker, c.attackerCard);
    const dCard = c.defenderNoCard ? null : cardOf(s, defender, c.defenderCard);
    const winner = c.attackerWon ? attacker : defender;
    const loser = c.attackerWon ? defender : attacker;
    const winnerCard = c.attackerWon ? aCard : dCard;
    const loserCard = c.attackerWon ? dCard : aCard;

    switch (step) {
        case 'conquest': {
            // Surviving defenders will retreat later
            c.survivingDefenders = area.units.map(u => ({ ...u }));
            area.units = [];

            // Combat cleanup on attacker win: defender's order, power token and garrison are removed
            area.order = null;
            if (area.powerToken && area.powerToken !== attacker) area.powerToken = undefined;
            if (s.garrisons[areaId]) {
                console.log(`  🏰 Garrison in ${area.name} permanently destroyed`);
                delete s.garrisons[areaId];
            }

            const arianne = dCard?.id === 'mar-arianne';
            if (arianne) {
                // Attacker may not enter; units return to the origin area (not routed — they won)
                if (c.marchFromArea) {
                    const origin = s.board[c.marchFromArea];
                    origin.units.push(...c.attackingUnits);
                    origin.house = attacker;
                }
                area.house = area.powerToken ?? homeCrestOwner(areaId) ?? null;
                console.log(`  🛡️ Arianne: ${attacker} cannot enter ${area.name}`);
                return { state: s, paused: false };
            }

            area.units.push(...c.attackingUnits);
            area.house = attacker;

            // Port capture: remove old owner's ships; winner may replace them with his own
            const portId = getPortForArea(s, areaId);
            if (portId) {
                const port = s.board[portId];
                const enemyShips = port.units.filter(u => u.house !== attacker);
                if (enemyShips.length > 0) {
                    enemyShips.forEach(u => { s.cas[u.house].availableUnits.Ship += 1; });
                    port.units = port.units.filter(u => u.house === attacker);
                    console.log(`  ⚓ ${enemyShips.length} enemy ship(s) removed from ${port.name}`);

                    const maxReplace = Math.min(
                        enemyShips.length,
                        s.cas[attacker].availableUnits.Ship,
                        maxUnitsAddable(s, attacker, portId)
                    );
                    if (maxReplace > 0) {
                        const options = [];
                        for (let n = 0; n <= maxReplace; n++) {
                            options.push({
                                label: n === 0 ? 'Não substituir' : `Colocar ${n} navio(s)`,
                                action: `combat:portreplace:${portId}:${n}`
                            });
                        }
                        s.pendingDecision = { cardName: 'Captura de Porto', chooser: attacker, options };
                        return { state: s, paused: true };
                    }
                }
                port.house = attacker;
            }
            return { state: s, paused: false };
        }

        case 'tywin':
            if (winnerCard?.id === 'lan-tywin') {
                s.cas[winner].power = Math.min(20, s.cas[winner].power + 2);
                console.log(`  💰 Tywin: ${winner} +2 Power`);
            }
            return { state: s, paused: false };

        case 'renly': {
            if (winnerCard?.id !== 'bar-renly') return { state: s, paused: false };
            if (s.cas[winner].availableUnits.Knight <= 0) return { state: s, paused: false };
            // Eligible: winner's participating footmen (in the embattled area) + supporting footmen
            const eligible: string[] = [];
            area.units.forEach(u => {
                if (u.type === 'Footman' && u.house === winner) eligible.push(u.id);
            });
            const winnerSide: 'attacker' | 'defender' = c.attackerWon ? 'attacker' : 'defender';
            Object.entries(c.supportContributions ?? {}).forEach(([saId, sc]) => {
                if (sc.side !== winnerSide || sc.house !== winner) return;
                s.board[saId].units.forEach(u => {
                    if (u.type === 'Footman' && u.house === winner) eligible.push(u.id);
                });
            });
            if (eligible.length === 0) return { state: s, paused: false };
            s.pendingUnitSelection = {
                purpose: 'renly-upgrade',
                house: winner,
                count: 1,
                upTo: true,
                eligibleUnitIds: eligible,
                prompt: 'Renly: você pode promover 1 Footman participante/apoiador a Knight'
            };
            return { state: s, paused: true };
        }

        case 'cersei': {
            if (winnerCard?.id !== 'lan-cersei') return { state: s, paused: false };
            const options = Object.entries(s.board)
                .filter(([, a]) => a.order && a.order.house === loser)
                .map(([aId, a]) => ({
                    label: `${a.name} (${a.order!.type}${a.order!.star ? '★' : ''})`,
                    action: `combat:cersei:${aId}`
                }));
            if (options.length === 0) return { state: s, paused: false };
            options.push({ label: 'Não remover nenhuma ordem', action: 'combat:cersei:skip' });
            s.pendingDecision = { cardName: 'Cersei Lannister', chooser: winner, options };
            return { state: s, paused: true };
        }

        case 'loras':
            if (c.attackerWon && aCard?.id === 'tyr-loras' && dCard?.id !== 'mar-arianne') {
                area.order = {
                    id: `loras-march-${Date.now()}`,
                    type: 'March',
                    house: attacker,
                    strength: c.marchOrderStrength ?? 0,
                    star: c.marchOrderTokenIndex === 2,
                    tokenIndex: c.marchOrderTokenIndex ?? 1
                };
                console.log(`  🌟 Loras: March order moved into ${area.name}`);
            }
            return { state: s, paused: false };

        case 'cards': {
            // Discard both played cards; when a player used his 7th card,
            // the other six return to hand and the played card stays in the discard pile.
            const discardFor = (house: HouseName, cardId?: string, noCard?: boolean) => {
                if (noCard || !cardId) return;
                const cardObj = s.cas[house].cards.find(cc => cc.id === cardId);
                if (!cardObj) return;
                s.cas[house].cards = s.cas[house].cards.filter(cc => cc.id !== cardId);
                s.cas[house].discards.push(cardObj);
                if (s.cas[house].cards.length === 0) {
                    s.cas[house].cards = s.cas[house].discards.filter(cc => cc.id !== cardId);
                    s.cas[house].discards = s.cas[house].discards.filter(cc => cc.id === cardId);
                    console.log(`  ♻️ ${house}'s cards recycled (last played card stays discarded)`);
                }
            };
            discardFor(attacker, c.attackerCard, c.attackerNoCard);
            discardFor(defender, c.defenderCard, c.defenderNoCard);
            return { state: s, paused: false };
        }

        case 'bolton':
            if (loserCard?.id === 'stark-bolton') {
                s.cas[loser].cards.push(...s.cas[loser].discards);
                s.cas[loser].discards = [];
                console.log(`  ♻️ Roose Bolton: ${loser} returned all discards to hand`);
            }
            return { state: s, paused: false };

        case 'patchface': {
            // "After combat" — triggers for the Patchface player whether he won or lost
            const patchSide = aCard?.id === 'bar-patchface' ? attacker : dCard?.id === 'bar-patchface' ? defender : null;
            if (!patchSide) return { state: s, paused: false };
            const opponent = patchSide === attacker ? defender : attacker;
            if (s.cas[opponent].cards.length === 0) return { state: s, paused: false };
            s.pendingPatchface = {
                baratheonPlayer: patchSide,
                opponent,
                opponentCards: [...s.cas[opponent].cards]
            };
            console.log(`  🤡 Patchface: ${patchSide} may discard one of ${opponent}'s cards`);
            return { state: s, paused: true };
        }

        case 'retreat': {
            if (c.attackerWon) {
                // Defender retreats from the embattled area
                const units = c.survivingDefenders ?? [];
                return setupLoserRetreat(s, defender, units, areaId, c.marchFromArea, aCard?.id === 'stark-robb');
            }
            // Attacker retreats back to the origin area (mandatory destination)
            const survivors = c.attackingUnits;
            if (!c.marchFromArea || survivors.length === 0) return { state: s, paused: false };

            // Siege engines cannot retreat — destroyed
            const { retreaters, destroyed } = splitRetreaters(s, attacker, survivors);
            if (destroyed > 0) console.log(`  💀 ${destroyed} unit(s) destroyed (cannot retreat)`);
            if (retreaters.length === 0) return { state: s, paused: false };

            const origin = s.board[c.marchFromArea];
            const spare = maxUnitsAddable(s, attacker, c.marchFromArea);
            const excess = Math.max(0, retreaters.length - spare);
            if (excess > 0) {
                s.pendingUnitSelection = {
                    purpose: 'retreat-supply',
                    house: attacker,
                    count: excess,
                    eligibleUnitIds: retreaters.map(u => u.id),
                    prompt: `Limite de suprimento: destrua ${excess} unidade(s) antes de recuar para ${origin.name}`,
                    context: { toAreaId: c.marchFromArea, mode: 'attacker-return' }
                };
                c.retreatingUnits = retreaters;
                return { state: s, paused: true };
            }
            origin.units.push(...retreaters.map(u => ({ ...u, routed: true })));
            origin.house = attacker;
            console.log(`  🏳️ ${attacker} retreats to ${origin.name} (routed)`);
            return { state: s, paused: false };
        }

        case 'finish': {
            s.combat = undefined;
            s.phase = 'Action';
            s = checkVictory(s);
            if (!s.winner && !hasCombatPendings(s)) {
                s = advanceActionTurn(s);
            }
            return { state: s, paused: false };
        }
    }
    return { state: s, paused: false };
}

function hasCombatPendings(s: GameState): boolean {
    return !!(s.pendingRetreat || s.pendingRobbRetreat || s.pendingUnitSelection ||
        s.pendingDecision || s.pendingPatchface || s.pendingAeronSwap || s.pendingTyrionCancel);
}

/** Routed units and Siege Engines are destroyed instead of retreating */
function splitRetreaters(s: GameState, house: HouseName, units: Unit[]): { retreaters: Unit[]; destroyed: number } {
    const retreaters: Unit[] = [];
    let destroyed = 0;
    for (const u of units) {
        if (u.routed || u.type === 'SiegeEngine') {
            s.cas[house].availableUnits[u.type] += 1;
            destroyed++;
        } else {
            retreaters.push(u);
        }
    }
    return { retreaters, destroyed };
}

/** Set up the defeated defender's retreat (normal or Robb Stark) */
function setupLoserRetreat(
    s: GameState, house: HouseName, units: Unit[], fromAreaId: string,
    attackOrigin: string | undefined, robbActive: boolean
): { state: GameState; paused: boolean } {
    if (units.length === 0) return { state: s, paused: false };

    const { retreaters, destroyed } = splitRetreaters(s, house, units);
    if (destroyed > 0) console.log(`  💀 ${destroyed} unit(s) destroyed (routed/siege cannot retreat)`);
    if (retreaters.length === 0) return { state: s, paused: false };

    const { options, lossByArea } = computeRetreatOptions(s, house, fromAreaId, retreaters, attackOrigin);

    if (options.length === 0) {
        retreaters.forEach(u => { s.cas[house].availableUnits[u.type] += 1; });
        console.log(`  💀 No legal retreat for ${house} — ${retreaters.length} unit(s) destroyed`);
        return { state: s, paused: false };
    }

    if (robbActive) {
        // Robb Stark: winner chooses, but must pick an area where the opponent loses the fewest units
        const minLoss = Math.min(...options.map(o => lossByArea[o] ?? 0));
        const constrained = options.filter(o => (lossByArea[o] ?? 0) === minLoss);
        s.pendingRobbRetreat = {
            robbPlayer: s.combat!.attacker,
            retreatingHouse: house,
            units: retreaters,
            fromAreaId,
            possibleAreas: constrained,
            lossByArea
        };
        console.log(`  🐺 Robb Stark: winner chooses ${house}'s retreat area`);
        return { state: s, paused: true };
    }

    s.pendingRetreat = { house, units: retreaters, fromAreaId, possibleAreas: options, lossByArea };
    return { state: s, paused: true };
}

/** Legal retreat destinations, including ship transport for land units.
 *  Areas that force supply losses are only legal when no loss-free option exists. */
export function computeRetreatOptions(
    state: GameState, house: HouseName, fromAreaId: string, units: Unit[], excludeAreaId?: string
): { options: string[]; lossByArea: Record<string, number> } {
    const from = state.board[fromAreaId];
    const shipsOnly = units.every(u => u.type === 'Ship');
    const candidates = new Set<string>();

    for (const adjId of from.adjacent) {
        if (adjId === excludeAreaId) continue;
        const adj = state.board[adjId];
        if (!adj || adj.blocked) continue;
        if (shipsOnly) {
            if (adj.type === 'Sea') {
                if (!adj.house || adj.house === house) candidates.add(adjId);
            } else if (adj.type === 'Port') {
                if (portOwner(state, adjId) === house) candidates.add(adjId);
            }
        } else {
            if (adj.type === 'Sea' || adj.type === 'Port') continue;
            if (!adj.house || adj.house === house) candidates.add(adjId);
        }
    }

    // Land units may retreat using ship transport (chains of friendly ships)
    if (!shipsOnly) {
        const visited = new Set<string>([fromAreaId]);
        const queue = [fromAreaId];
        while (queue.length > 0) {
            const cur = state.board[queue.shift()!];
            for (const adjId of cur.adjacent) {
                const adj = state.board[adjId];
                if (!adj || visited.has(adjId)) continue;
                if (adj.type === 'Sea' && adj.units.some(u => u.type === 'Ship' && u.house === house)) {
                    visited.add(adjId);
                    queue.push(adjId);
                    // Land areas adjacent to this friendly-ship sea are reachable
                    for (const landId of adj.adjacent) {
                        if (landId === excludeAreaId || landId === fromAreaId) continue;
                        const land = state.board[landId];
                        if (!land || land.blocked || land.type !== 'Land') continue;
                        if (!land.house || land.house === house) candidates.add(landId);
                    }
                }
            }
        }
    }

    const lossByArea: Record<string, number> = {};
    candidates.forEach(aId => {
        lossByArea[aId] = Math.max(0, units.length - maxUnitsAddable(state, house, aId));
    });

    let options = [...candidates];
    const lossFree = options.filter(o => lossByArea[o] === 0);
    // May not retreat into an area exceeding supply — unless it's the only kind of option
    if (lossFree.length > 0) options = lossFree;
    // Destroying ALL retreating units to "fit" is not a retreat
    options = options.filter(o => lossByArea[o] < units.length);

    return { options, lossByArea };
}

// ═══════════════════════════════════════════════
// RETREAT RESOLUTION
// ═══════════════════════════════════════════════

/** Execute retreat to chosen area (may require destroying units for supply first) */
export function resolveRetreat(state: GameState, toAreaId: string): GameState {
    if (!state.pendingRetreat) return state;
    const { possibleAreas, lossByArea, units, house } = state.pendingRetreat;
    if (!possibleAreas.includes(toAreaId)) {
        console.warn('Invalid retreat destination');
        return state;
    }

    const loss = lossByArea?.[toAreaId] ?? 0;
    if (loss > 0) {
        const newState = cloneForCombat(state);
        newState.pendingUnitSelection = {
            purpose: 'retreat-supply',
            house,
            count: loss,
            eligibleUnitIds: units.map(u => u.id),
            prompt: `Limite de suprimento: destrua ${loss} unidade(s) antes de recuar para ${state.board[toAreaId].name}`,
            context: { toAreaId, mode: 'defender-retreat' }
        };
        return newState;
    }

    return placeRetreatingUnits(state, toAreaId, units, house, 'pendingRetreat');
}

/** Robb Stark: the winner picks the destination among minimum-loss legal areas */
export function resolveRobbRetreat(state: GameState, chosenAreaId: string): GameState {
    if (!state.pendingRobbRetreat) return state;
    const { possibleAreas, lossByArea, units, retreatingHouse } = state.pendingRobbRetreat;
    if (!possibleAreas.includes(chosenAreaId)) return state;

    const loss = lossByArea?.[chosenAreaId] ?? 0;
    if (loss > 0) {
        const newState = cloneForCombat(state);
        newState.pendingUnitSelection = {
            purpose: 'retreat-supply',
            house: retreatingHouse,
            count: loss,
            eligibleUnitIds: units.map(u => u.id),
            prompt: `Limite de suprimento: destrua ${loss} unidade(s) antes de recuar para ${state.board[chosenAreaId].name}`,
            context: { toAreaId: chosenAreaId, mode: 'robb-retreat' }
        };
        return newState;
    }

    return placeRetreatingUnits(state, chosenAreaId, units, retreatingHouse, 'pendingRobbRetreat');
}

/** Destroy units chosen for supply compliance, then complete the retreat */
export function applyRetreatSupplyLoss(state: GameState, unitIds: string[]): GameState {
    const sel = state.pendingUnitSelection;
    if (!sel || sel.purpose !== 'retreat-supply') return state;
    const toAreaId = sel.context!.toAreaId;
    const mode = sel.context!.mode;

    let newState = cloneForCombat(state);
    newState.pendingUnitSelection = undefined;

    const takeUnits = (units: Unit[]): Unit[] => {
        const kept: Unit[] = [];
        for (const u of units) {
            if (unitIds.includes(u.id)) {
                newState.cas[sel.house].availableUnits[u.type] += 1;
            } else {
                kept.push(u);
            }
        }
        return kept;
    };

    if (mode === 'attacker-return') {
        const c = newState.combat!;
        const kept = takeUnits(c.retreatingUnits ?? []);
        const origin = newState.board[toAreaId];
        origin.units.push(...kept.map(u => ({ ...u, routed: true })));
        origin.house = sel.house;
        c.retreatingUnits = undefined;
        console.log(`  🏳️ ${sel.house} retreats to ${origin.name} (routed, ${unitIds.length} destroyed)`);
        return continueCombat(newState);
    }

    if (mode === 'robb-retreat' && newState.pendingRobbRetreat) {
        const kept = takeUnits(newState.pendingRobbRetreat.units);
        return placeRetreatingUnits(newState, toAreaId, kept, sel.house, 'pendingRobbRetreat');
    }

    if (newState.pendingRetreat) {
        const kept = takeUnits(newState.pendingRetreat.units);
        return placeRetreatingUnits(newState, toAreaId, kept, sel.house, 'pendingRetreat');
    }
    return newState;
}

function placeRetreatingUnits(
    state: GameState, toAreaId: string, units: Unit[], house: HouseName,
    pendingKey: 'pendingRetreat' | 'pendingRobbRetreat'
): GameState {
    const newState = cloneForCombat(state);
    const toArea = newState.board[toAreaId];
    toArea.units.push(...units.map(u => ({ ...u, routed: true })));
    if (toArea.type !== 'Port') toArea.house = house;
    console.log(`  🏃 ${house} retreated ${units.length} unit(s) to ${toArea.name} (routed)`);

    if (pendingKey === 'pendingRetreat') newState.pendingRetreat = undefined;
    else newState.pendingRobbRetreat = undefined;

    if (newState.combat?.postQueue) return continueCombat(newState);
    return newState;
}

// ═══════════════════════════════════════════════
// COMBAT DECISION DISPATCH (called from engine.makeDecision)
// ═══════════════════════════════════════════════

export function handleCombatDecision(state: GameState, action: string): GameState {
    const parts = action.split(':');
    const kind = parts[1];

    if (!state.combat && kind !== 'portreplace') return state;
    let newState = cloneForCombat(state);
    newState.pendingDecision = undefined;
    const c = newState.combat;

    switch (kind) {
        case 'tyrion': {
            if (!c) return state;
            if (parts[2] === 'use') {
                const tyrionSide = cardOf(newState, c.attacker, c.attackerCard)?.id === 'lan-tyrion' ? c.attacker : c.defender;
                const opponent = tyrionSide === c.attacker ? c.defender : c.attacker;
                const cancelledCardId = tyrionSide === c.attacker ? c.defenderCard! : c.attackerCard!;
                const otherCards = newState.cas[opponent].cards.filter(cc => cc.id !== cancelledCardId);
                if (otherCards.length > 0) {
                    newState.pendingTyrionCancel = { tyrionPlayer: tyrionSide, opponent, cancelledCardId };
                    console.log(`  🃏 Tyrion: ${opponent} must choose a replacement card`);
                    return newState;
                }
                // No other cards: opponent fights without a House card
                if (opponent === c.attacker) { c.attackerCard = undefined; c.attackerNoCard = true; }
                else { c.defenderCard = undefined; c.defenderNoCard = true; }
                console.log(`  🃏 Tyrion: ${opponent} has no other cards — fights without a House card`);
            } else {
                console.log(`  🃏 Tyrion: chose not to cancel`);
            }
            return resolveCombat(newState);
        }

        case 'doran': {
            if (!c) return state;
            const track = parts[2] as 'ironThrone' | 'fiefdoms' | 'kingsCourt';
            const doranSide = cardOf(newState, c.attacker, c.attackerCard)?.id === 'mar-doran' ? c.attacker : c.defender;
            const opponent = doranSide === c.attacker ? c.defender : c.attacker;
            shiftToBottom(newState, opponent, track);
            newState = syncTurnOrder(newState);
            console.log(`  🐍 Doran: ${opponent} moved to bottom of ${track}`);
            return resolveCombat(newState);
        }

        case 'queen': {
            if (!c) return state;
            const targetAreaId = parts.slice(2).join(':');
            const target = newState.board[targetAreaId];
            if (target?.order) {
                const removedType = target.order.type;
                target.order = null;
                // If that order had granted support in THIS combat, remove its contribution
                const sc = c.supportContributions?.[targetAreaId];
                if (sc) {
                    if (sc.side === 'attacker') c.attackerStrength -= sc.amount;
                    else c.defenderStrength -= sc.amount;
                    delete c.supportContributions![targetAreaId];
                }
                console.log(`  🌹 Queen of Thorns: removed ${removedType} from ${target.name}`);
            }
            return resolveCombat(newState);
        }

        case 'cersei': {
            if (parts[2] !== 'skip') {
                const targetAreaId = parts.slice(2).join(':');
                const target = newState.board[targetAreaId];
                if (target?.order) {
                    console.log(`  👑 Cersei: removed ${target.order.type} from ${target.name}`);
                    target.order = null;
                }
            }
            return continueCombat(newState);
        }

        case 'portreplace': {
            const n = parseInt(parts[parts.length - 1]);
            const portId = parts.slice(2, -1).join(':');
            const port = newState.board[portId];
            const owner = port ? portOwner(newState, portId) : null;
            if (port && owner && n > 0) {
                for (let i = 0; i < n && newState.cas[owner].availableUnits.Ship > 0; i++) {
                    newState.cas[owner].availableUnits.Ship -= 1;
                    port.units.push({
                        id: `${owner}-Ship-${Date.now()}-${Math.random()}`,
                        type: 'Ship', house: owner, routed: false
                    });
                }
                console.log(`  ⚓ ${owner} placed ${n} ship(s) in ${port.name}`);
            }
            if (port) port.house = owner;
            if (newState.combat?.postQueue) return continueCombat(newState);
            return newState;
        }
    }
    return newState;
}

/** Renly: upgrade the chosen footman to a knight (or skip with empty selection) */
export function applyRenlyUpgrade(state: GameState, unitIds: string[]): GameState {
    if (!state.pendingUnitSelection) return state;
    const sel = state.pendingUnitSelection;
    const newState = cloneForCombat(state);
    newState.pendingUnitSelection = undefined;

    if (unitIds.length > 0) {
        const id = unitIds[0];
        for (const a of Object.values(newState.board)) {
            const idx = a.units.findIndex(u => u.id === id && u.type === 'Footman');
            if (idx >= 0 && newState.cas[sel.house].availableUnits.Knight > 0) {
                a.units[idx] = { ...a.units[idx], type: 'Knight' };
                newState.cas[sel.house].availableUnits.Knight -= 1;
                newState.cas[sel.house].availableUnits.Footman += 1;
                console.log(`  ⬆️ Renly: ${sel.house} upgraded a Footman to Knight in ${a.name}`);
                break;
            }
        }
    }
    return continueCombat(newState);
}

// ═══════════════════════════════════════════════
// AERON DAMPHAIR RESOLUTION
// ═══════════════════════════════════════════════

/** Aeron Damphair: Player pays 2 power to swap their card, or declines */
export function resolveAeronSwap(state: GameState, newCardId: string | null): GameState {
    if (!state.pendingAeronSwap || !state.combat) return state;

    const newState = cloneForCombat(state);
    const house = state.pendingAeronSwap.house;

    if (newCardId) {
        newState.cas[house].power -= 2;
        const aeronCard = newState.cas[house].cards.find(cc => cc.id === 'grey-aeron');
        if (aeronCard) {
            newState.cas[house].cards = newState.cas[house].cards.filter(cc => cc.id !== 'grey-aeron');
            newState.cas[house].discards.push(aeronCard);
        }
        if (house === newState.combat!.attacker) newState.combat!.attackerCard = newCardId;
        else newState.combat!.defenderCard = newCardId;
        console.log(`  🦑 Aeron: ${house} swapped card to ${newCardId} (paid 2 power)`);
    } else {
        console.log(`  🦑 Aeron: ${house} declined to swap`);
    }

    newState.pendingAeronSwap = undefined;
    return resolveCombat(newState);
}

// ═══════════════════════════════════════════════
// TYRION LANNISTER RESOLUTION (opponent picks the replacement card)
// ═══════════════════════════════════════════════

export function resolveTyrionCancel(state: GameState, newCardId: string | null): GameState {
    if (!state.pendingTyrionCancel || !state.combat) return state;

    const newState = cloneForCombat(state);
    const { opponent, cancelledCardId } = state.pendingTyrionCancel;

    if (newCardId) {
        if (opponent === newState.combat!.attacker) newState.combat!.attackerCard = newCardId;
        else newState.combat!.defenderCard = newCardId;
        console.log(`  🃏 Tyrion: ${opponent} plays ${newCardId} instead of ${cancelledCardId}`);
    }

    newState.pendingTyrionCancel = undefined;
    return resolveCombat(newState);
}

// ═══════════════════════════════════════════════
// PATCHFACE RESOLUTION
// ═══════════════════════════════════════════════

/** Patchface: Baratheon player picks one card from opponent's hand to discard */
export function resolvePatchfaceDiscard(state: GameState, discardCardId: string | null): GameState {
    if (!state.pendingPatchface) return state;

    const newState = cloneForCombat(state);
    const { opponent } = state.pendingPatchface;

    if (discardCardId) {
        const cardToDiscard = newState.cas[opponent].cards.find(cc => cc.id === discardCardId);
        if (cardToDiscard) {
            newState.cas[opponent].cards = newState.cas[opponent].cards.filter(cc => cc.id !== discardCardId);
            newState.cas[opponent].discards.push(cardToDiscard);
            console.log(`  🤡 Patchface: discarded ${cardToDiscard.name} from ${opponent}'s hand`);
        }
    } else {
        console.log(`  🤡 Patchface: declined to discard`);
    }

    newState.pendingPatchface = undefined;
    if (newState.combat?.postQueue) return continueCombat(newState);
    return newState;
}
