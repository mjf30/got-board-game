import { GameState, HouseName, Unit, Card } from './types';
import { HOUSE_CARDS } from './constants/houses';
import { initiateRetreat, destroyPortShips } from './engine';

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
    fromAreaId?: string
): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    const area = newState.board[areaId];

    const attackingStrength = calculateUnitStrength(newState, attackingUnits, areaId, true);
    const defendingStrength = calculateUnitStrength(newState, area.units, areaId, false);

    const attackBonus = marchOrderStrength;

    let defenseBonus = 0;
    if (area.order?.type === 'Defense') {
        defenseBonus = area.order.strength;
    }

    let garrisonBonus = 0;
    const garrison = state.garrisons[areaId];
    if (garrison?.house === defender) {
        garrisonBonus = garrison.strength;
        console.log(`  🏰 Garrison: +${garrisonBonus}`);
    }

    // Identify 3rd-party houses with Support orders adjacent to combat area
    const thirdPartySupporters: { house: HouseName; areaId: string }[] = [];
    let attackerAutoSupport = 0;
    let defenderAutoSupport = 0;

    Object.entries(newState.board).forEach(([saId, supportArea]) => {
        if (!supportArea.order || supportArea.order.type !== 'Support') return;
        if (!supportArea.adjacent.includes(areaId)) return;
        if (supportArea.type === 'Port' && supportArea.connectedSea !== areaId) return;
        if (!supportArea.house) return;

        const supportStrength = calculateSupportStrength(supportArea.units);
        const supportBonus = supportArea.order.star ? 1 : 0;
        const totalSupport = supportStrength + supportBonus;

        if (supportArea.house === attacker) {
            // Attacker's own support: auto-applied
            attackerAutoSupport += totalSupport;
        } else if (supportArea.house === defender) {
            // Defender's own support: auto-applied
            defenderAutoSupport += totalSupport;
        } else {
            // 3rd party: must choose!
            thirdPartySupporters.push({ house: supportArea.house, areaId: saId });
        }
    });

    console.log(`⚔️ Combat in ${area.name}:`);
    console.log(`  ${attacker}: units=${attackingStrength} march=${attackBonus} ownSupport=${attackerAutoSupport}`);
    console.log(`  ${defender}: units=${defendingStrength} defense=${defenseBonus} garrison=${garrisonBonus} ownSupport=${defenderAutoSupport}`);

    newState.combat = {
        attacker,
        defender,
        areaId,
        attackingUnits,
        defendingUnits: area.units.map(u => ({ ...u })),
        attackerStrength: attackingStrength + attackBonus + attackerAutoSupport,
        defenderStrength: defendingStrength + defenseBonus + garrisonBonus + defenderAutoSupport,
        marchFromArea: fromAreaId,
        phase: thirdPartySupporters.length > 0 ? 'support' : 'cards',
        supportDecisions: {}
    };

    // If 3rd-party supporters exist, set up interactive support declarations
    if (thirdPartySupporters.length > 0) {
        newState.pendingSupportDeclarations = {
            combatAreaId: areaId,
            attacker,
            defender,
            pendingHouses: thirdPartySupporters,
            decisions: {}
        };
        console.log(`  🤝 Awaiting support declarations from: ${thirdPartySupporters.map(s => s.house).join(', ')}`);
    }

    return newState;
}

/** Declare support for a 3rd-party house during combat */
export function declareSupportChoice(
    state: GameState,
    supportAreaId: string,
    choice: 'attacker' | 'defender' | 'none'
): GameState {
    if (!state.pendingSupportDeclarations || !state.combat) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.combat = { ...state.combat };
    newState.pendingSupportDeclarations = {
        ...state.pendingSupportDeclarations,
        pendingHouses: [...state.pendingSupportDeclarations.pendingHouses],
        decisions: { ...state.pendingSupportDeclarations.decisions }
    };

    const pending = newState.pendingSupportDeclarations;
    const entry = pending.pendingHouses.find(p => p.areaId === supportAreaId);
    if (!entry) return state;

    pending.decisions[supportAreaId] = choice;
    pending.pendingHouses = pending.pendingHouses.filter(p => p.areaId !== supportAreaId);

    // Apply support strength
    if (choice !== 'none') {
        const supportArea = newState.board[supportAreaId];
        const supportStrength = calculateSupportStrength(supportArea.units);
        const supportBonus = supportArea.order?.star ? 1 : 0;
        const totalSupport = supportStrength + supportBonus;

        if (choice === 'attacker') {
            newState.combat.attackerStrength += totalSupport;
            console.log(`  🤝 ${entry.house} supports ${newState.combat.attacker} (+${totalSupport})`);
        } else {
            newState.combat.defenderStrength += totalSupport;
            console.log(`  🤝 ${entry.house} supports ${newState.combat.defender} (+${totalSupport})`);
        }
    } else {
        console.log(`  🤝 ${entry.house} refuses to support`);
    }

    // Store decision on combat state
    if (!newState.combat.supportDecisions) newState.combat.supportDecisions = {};
    newState.combat.supportDecisions[supportAreaId] = choice;

    // All declarations made? Move to card selection phase
    if (pending.pendingHouses.length === 0) {
        newState.pendingSupportDeclarations = undefined;
        newState.combat.phase = 'cards';
        console.log(`  🤝 All support declarations complete`);
    }

    return newState;
}

// ═══════════════════════════════════════════════
// STRENGTH CALCULATIONS
// ═══════════════════════════════════════════════

function calculateUnitStrength(state: GameState, units: Unit[], targetAreaId: string, isAttacking: boolean): number {
    let strength = 0;
    const targetArea = state.board[targetAreaId];

    units.forEach(u => {
        switch (u.type) {
            case 'Footman': strength += 1; break;
            case 'Knight': strength += 2; break;
            case 'Ship': strength += 1; break;
            case 'SiegeEngine':
                if (isAttacking && (targetArea.castle || targetArea.stronghold)) {
                    strength += 4;
                }
                break;
        }
    });
    return strength;
}

function calculateSupportStrength(units: Unit[]): number {
    let strength = 0;
    units.forEach(u => {
        switch (u.type) {
            case 'Footman': strength += 1; break;
            case 'Knight': strength += 2; break;
            case 'Ship': strength += 1; break;
            case 'SiegeEngine': break; // No support strength
        }
    });
    return strength;
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
// COMBAT RESOLUTION (with Retreat)
// ═══════════════════════════════════════════════

export function resolveCombat(state: GameState): GameState {
    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));

    if (!newState.combat) return state;
    newState.combat = { ...newState.combat };

    const { attacker, defender, attackerCard, defenderCard, areaId } = newState.combat;

    const aCard = HOUSE_CARDS[attacker].find(c => c.id === attackerCard);
    const dCard = HOUSE_CARDS[defender].find(c => c.id === defenderCard);
    if (!aCard || !dCard) return state;

    // ═══ PRE-COMBAT: AERON DAMPHAIR CHECK ═══
    if (!newState.combat.aeronResolved) {
        newState.combat.aeronResolved = true;
        // Aeron fires first since it replaces the owner's own card
        const aeronAttacker = aCard.id === 'grey-aeron' &&
            newState.cas[attacker].power >= 2 &&
            newState.cas[attacker].cards.filter(c => c.id !== 'grey-aeron').length > 0;
        const aeronDefender = dCard.id === 'grey-aeron' &&
            newState.cas[defender].power >= 2 &&
            newState.cas[defender].cards.filter(c => c.id !== 'grey-aeron').length > 0;

        if (aeronAttacker) {
            newState.pendingAeronSwap = { house: attacker };
            newState.combat.phase = 'pre-combat';
            console.log(`  🦑 Aeron Damphair: ${attacker} may swap card (pay 2 power)`);
            return newState;
        }
        if (aeronDefender) {
            newState.pendingAeronSwap = { house: defender };
            newState.combat.phase = 'pre-combat';
            console.log(`  🦑 Aeron Damphair: ${defender} may swap card (pay 2 power)`);
            return newState;
        }
    }

    // ═══ PRE-COMBAT: TYRION LANNISTER CHECK ═══
    if (!newState.combat.tyrionResolved) {
        newState.combat.tyrionResolved = true;
        if (aCard.id === 'lan-tyrion' && newState.cas[defender].cards.filter(c => c.id !== defenderCard).length > 0) {
            newState.pendingTyrionCancel = {
                tyrionPlayer: attacker,
                opponent: defender,
                cancelledCardId: defenderCard!
            };
            newState.combat.phase = 'pre-combat';
            console.log(`  🃏 Tyrion Lannister: ${attacker} cancels ${defender}'s card`);
            return newState;
        }
        if (dCard.id === 'lan-tyrion' && newState.cas[attacker].cards.filter(c => c.id !== attackerCard).length > 0) {
            newState.pendingTyrionCancel = {
                tyrionPlayer: defender,
                opponent: attacker,
                cancelledCardId: attackerCard!
            };
            newState.combat.phase = 'pre-combat';
            console.log(`  🃏 Tyrion Lannister: ${defender} cancels ${attacker}'s card`);
            return newState;
        }
    }

    newState.combat.phase = 'resolution';

    const area = newState.board[areaId];

    // ═══ PRE-COMBAT CARD ABILITIES ═══
    let aCardStrength = aCard.strength;
    let dCardStrength = dCard.strength;
    let aSwords = aCard.swords ?? 0;
    let dSwords = dCard.swords ?? 0;
    let aForts = aCard.fortifications ?? 0;
    let dForts = dCard.fortifications ?? 0;

    // [Card Effects Logic - mostly unchanged except for type fixes]
    // ── Balon Greyjoy ──
    if (aCard.id === 'grey-balon') dCardStrength = 0;
    if (dCard.id === 'grey-balon') aCardStrength = 0;

    // ── Stannis ──
    if (aCard.id === 'bar-stannis' && newState.cas[defender].influence.ironThrone < newState.cas[attacker].influence.ironThrone) aCardStrength += 1;
    if (dCard.id === 'bar-stannis' && newState.cas[attacker].influence.ironThrone < newState.cas[defender].influence.ironThrone) dCardStrength += 1;

    // ── Ser Davos ──
    if (aCard.id === 'bar-davos' && newState.cas[attacker].discards.some(c => c.id === 'bar-stannis')) { aCardStrength += 1; aSwords += 1; }
    if (dCard.id === 'bar-davos' && newState.cas[defender].discards.some(c => c.id === 'bar-stannis')) { dCardStrength += 1; dSwords += 1; }

    // ── Kevan Lannister (attacking footmen + supporting Lannister footmen get +2 instead of +1) ──
    if (aCard.id === 'lan-kevan') {
        const attackingFootmen = newState.combat!.attackingUnits.filter(u => u.type === 'Footman').length;
        let supportingFootmen = 0;
        Object.values(newState.board).forEach(sa => {
            if (sa.order?.type === 'Support' && sa.house === attacker && sa.adjacent.includes(areaId)) {
                if (sa.type === 'Port' && sa.connectedSea !== areaId) return;
                supportingFootmen += sa.units.filter(u => u.type === 'Footman' && u.house === attacker).length;
            }
        });
        aCardStrength += attackingFootmen + supportingFootmen;
    }

    // ── Victarion (attacking ships + supporting Greyjoy ships get +2 instead of +1) ──
    if (aCard.id === 'grey-victarion') {
        const attackingShips = newState.combat!.attackingUnits.filter(u => u.type === 'Ship').length;
        let supportingShips = 0;
        Object.values(newState.board).forEach(sa => {
            if (sa.order?.type === 'Support' && sa.house === attacker && sa.adjacent.includes(areaId)) {
                if (sa.type === 'Port' && sa.connectedSea !== areaId) return;
                supportingShips += sa.units.filter(u => u.type === 'Ship' && u.house === attacker).length;
            }
        });
        aCardStrength += attackingShips + supportingShips;
    }

    // ── Catelyn ──
    if (dCard.id === 'stark-catelyn' && area.order?.type === 'Defense') {
        newState.combat!.defenderStrength += area.order.strength;
    }

    // ── Theon ──
    if (dCard.id === 'grey-theon' && (area.castle || area.stronghold)) { dCardStrength += 1; dSwords += 1; }

    // ── Asha ──
    if (aCard.id === 'grey-asha') {
        const hasOwnSupport = Object.values(newState.board).some(a => a.order?.type === 'Support' && a.house === attacker && a.adjacent.includes(areaId));
        const hasThirdPartySupport = Object.values(newState.combat!.supportDecisions || {}).some(choice => choice === 'attacker');
        if (!hasOwnSupport && !hasThirdPartySupport) { aSwords += 2; aForts += 1; }
    }
    if (dCard.id === 'grey-asha') {
        const hasOwnSupport = Object.values(newState.board).some(a => a.order?.type === 'Support' && a.house === defender && a.adjacent.includes(areaId));
        const hasThirdPartySupport = Object.values(newState.combat!.supportDecisions || {}).some(choice => choice === 'defender');
        if (!hasOwnSupport && !hasThirdPartySupport) { dSwords += 2; dForts += 1; }
    }

    // ── Nymeria Sand ──
    if (aCard.id === 'mar-nymeria') aSwords += 1;
    if (dCard.id === 'mar-nymeria') dForts += 1;

    // ── Salladhor Saan: opponent's non-Baratheon supporting ships count as 0 ──
    if (aCard.id === 'bar-salla') {
        // Salladhor Saan: only activates if Baratheon (attacker) is being supported
        const sallaAttackerSupported = Object.values(newState.board).some(sa =>
            sa.order?.type === 'Support' && sa.house === attacker && sa.adjacent.includes(areaId) && (sa.type !== 'Port' || sa.connectedSea === areaId)
        ) || Object.values(newState.combat!.supportDecisions || {}).some(choice => choice === 'attacker');
        if (sallaAttackerSupported) {
            Object.entries(newState.board).forEach(([saId, sa]) => {
                if (!sa.order || sa.order.type !== 'Support') return;
                if (!sa.adjacent.includes(areaId)) return;
                if (sa.type === 'Port' && sa.connectedSea !== areaId) return;
                if (sa.house === attacker || sa.house === 'Baratheon') return;
                const shipCount = sa.units.filter(u => u.type === 'Ship').length;
                if (shipCount > 0 && newState.combat!.supportDecisions?.[saId] === 'defender') {
                    newState.combat!.defenderStrength -= shipCount;
                    console.log(`  ⚓ Salladhor Saan: ${sa.house}'s ${shipCount} ship support zeroed`);
                }
            });
        }
    }
    if (dCard.id === 'bar-salla') {
        // Salladhor Saan: only activates if Baratheon (defender) is being supported
        const sallaDefenderSupported = Object.values(newState.board).some(sa =>
            sa.order?.type === 'Support' && sa.house === defender && sa.adjacent.includes(areaId) && (sa.type !== 'Port' || sa.connectedSea === areaId)
        ) || Object.values(newState.combat!.supportDecisions || {}).some(choice => choice === 'defender');
        if (sallaDefenderSupported) {
            Object.entries(newState.board).forEach(([saId, sa]) => {
                if (!sa.order || sa.order.type !== 'Support') return;
                if (!sa.adjacent.includes(areaId)) return;
                if (sa.type === 'Port' && sa.connectedSea !== areaId) return;
                if (sa.house === defender || sa.house === 'Baratheon') return;
                const shipCount = sa.units.filter(u => u.type === 'Ship').length;
                if (shipCount > 0 && newState.combat!.supportDecisions?.[saId] === 'attacker') {
                    newState.combat!.attackerStrength -= shipCount;
                    console.log(`  ⚓ Salladhor Saan: ${sa.house}'s ${shipCount} ship support zeroed`);
                }
            });
        }
    }

    // ═══ CALCULATE STRENGTH ═══
    const finalAttackerStrength = newState.combat.attackerStrength + aCardStrength;
    const finalDefenderStrength = newState.combat.defenderStrength + dCardStrength;
    console.log(`📊 Final: ${attacker}(${finalAttackerStrength}) vs ${defender}(${finalDefenderStrength})`);

    // ═══ DETERMINE WINNER ═══
    let attackerWins = false;
    if (finalAttackerStrength > finalDefenderStrength) attackerWins = true;
    else if (finalDefenderStrength > finalAttackerStrength) attackerWins = false;
    else {
        const aFief = newState.cas[attacker].influence.fiefdoms;
        const dFief = newState.cas[defender].influence.fiefdoms;
        attackerWins = aFief < dFief;
    }

    // ═══ SWORD/FORT RESOLUTION ═══
    const effectiveAttackerKills = Math.max(0, aSwords - dForts);
    const effectiveDefenderKills = Math.max(0, dSwords - aForts);
    const attackerImmune = aCard.id === 'stark-blackfish';
    const defenderImmune = dCard.id === 'stark-blackfish';

    // ── Mace Tyrell (Immediate Kill) ──
    if (aCard.id === 'tyr-mace') {
        const idx = area.units.findIndex(u => u.type === 'Footman');
        if (idx >= 0) {
            area.units.splice(idx, 1);
            newState.cas[defender].availableUnits.Footman += 1;
        }
    }
    if (dCard.id === 'tyr-mace') {
        const idx = newState.combat.attackingUnits.findIndex(u => u.type === 'Footman');
        if (idx >= 0) {
            newState.combat.attackingUnits.splice(idx, 1);
            newState.cas[attacker].availableUnits.Footman += 1;
        }
    }

    // ═══ RESOLVE OUTCOME ═══
    if (attackerWins) {
        console.log(`🏆 ${attacker} wins!`);
        const oldOwner = area.house;
        const marchFromArea = newState.combat!.marchFromArea;
        const arianneActive = dCard.id === 'mar-arianne';

        // Defender Casualties
        const defenderUnits = [...area.units];
        if (!defenderImmune) {
            for (let i = 0; i < effectiveAttackerKills && defenderUnits.length > 0; i++) {
                const killed = defenderUnits.pop()!;
                newState.cas[defender].availableUnits[killed.type] += 1;
            }
        }

        // Attacker Casualties
        const attackingUnits = newState.combat!.attackingUnits;
        if (!attackerImmune) {
            for (let i = 0; i < effectiveDefenderKills && attackingUnits.length > 0; i++) {
                const killed = attackingUnits.pop()!;
                newState.cas[attacker].availableUnits[killed.type] += 1;
            }
        }

        if (arianneActive) {
            // Arianne Martell: attacker cannot enter the area
            area.units = [];
            area.house = null;
            if (marchFromArea) {
                const origin = newState.board[marchFromArea];
                origin.units.push(...attackingUnits);
                if (!origin.house) origin.house = attacker;
            }
            console.log(`  🛡️ Arianne: ${attacker} cannot enter ${area.name}`);
        } else {
            // Normal: clear area and move attacker in
            area.units = [];
            area.house = attacker;
            area.units.push(...attackingUnits);

            // Handle Port Ships
            const portResult = destroyPortShips(newState, areaId, oldOwner);
            Object.assign(newState.board, portResult.board);
            Object.assign(newState.cas, portResult.cas);
        }

        // ── Winner Card Effects ──
        if (aCard.id === 'lan-tywin') newState.cas[attacker].power = Math.min(20, newState.cas[attacker].power + 2);
        if (aCard.id === 'bar-renly') {
            let upgraded = false;
            // Check combat area for participating footmen
            const idx = area.units.findIndex(u => u.type === 'Footman' && u.house === attacker);
            if (idx >= 0 && newState.cas[attacker].availableUnits.Knight > 0) {
                area.units[idx].type = 'Knight';
                newState.cas[attacker].availableUnits.Footman++;
                newState.cas[attacker].availableUnits.Knight--;
                upgraded = true;
            }
            // Also check supporting Baratheon footmen in adjacent areas
            if (!upgraded) {
                for (const sa of Object.values(newState.board)) {
                    if (sa.order?.type === 'Support' && sa.house === attacker && sa.adjacent.includes(areaId)) {
                        if (sa.type === 'Port' && sa.connectedSea !== areaId) continue;
                        const fIdx = sa.units.findIndex(u => u.type === 'Footman' && u.house === attacker);
                        if (fIdx >= 0 && newState.cas[attacker].availableUnits.Knight > 0) {
                            sa.units[fIdx].type = 'Knight';
                            newState.cas[attacker].availableUnits.Footman++;
                            newState.cas[attacker].availableUnits.Knight--;
                            break;
                        }
                    }
                }
            }
        }

        // ── Cersei: remove one of loser's orders ──
        if (aCard.id === 'lan-cersei') {
            for (const [aId, a] of Object.entries(newState.board)) {
                if (a.order && a.order.house === defender) {
                    console.log(`  👑 Cersei: Removed ${defender}'s ${a.order.type} from ${a.name}`);
                    a.order = null;
                    break;
                }
            }
        }

        // ── Loras: march order follows to conquered area ──
        if (aCard.id === 'tyr-loras' && !arianneActive) {
            area.order = {
                id: `loras-march-${Date.now()}`,
                type: 'March',
                house: attacker,
                strength: 0,
                star: false,
                tokenIndex: 1
            };
            console.log(`  🌟 Loras: March order placed in ${area.name}`);
        }

        // ── Queen of Thorns (either side) ──
        [aCard, dCard].forEach(card => {
            if (card.id === 'tyr-queen') {
                const opponent = card.house === attacker ? defender : attacker;
                for (const adjId of area.adjacent) {
                    const adj = newState.board[adjId];
                    if (adj?.order && adj.order.house === opponent && adjId !== marchFromArea) {
                        console.log(`  🌹 Queen of Thorns: Removed ${opponent}'s ${adj.order.type} from ${adj.name}`);
                        adj.order = null;
                        break;
                    }
                }
            }
        });

        // ── Doran Martell (either side) ──
        if (aCard.id === 'mar-doran') applyDoran(newState, attacker, defender);
        if (dCard.id === 'mar-doran') applyDoran(newState, defender, attacker);

        // Discard combat cards
        discardCombatCards(newState, attacker, defender, attackerCard!, defenderCard!);

        // ── Roose Bolton: return discards on loss ──
        if (dCard.id === 'stark-bolton') {
            newState.cas[defender].cards.push(...newState.cas[defender].discards);
            newState.cas[defender].discards = [];
            console.log(`  ♻️ Roose Bolton: ${defender} returned all discards to hand`);
        }

        // ── Patchface: winner views opponent's hand and discards one ──
        if (aCard.id === 'bar-patchface' && newState.cas[defender].cards.length > 0) {
            newState.pendingPatchface = {
                baratheonPlayer: attacker,
                opponent: defender,
                opponentCards: [...newState.cas[defender].cards]
            };
            console.log(`  🤡 Patchface: ${attacker} may discard one of ${defender}'s cards`);
        }

        newState.combat = undefined;
        newState.phase = 'Action';

        // ── Robb Stark: winner chooses where defender retreats ──
        if (defenderUnits.length > 0 && aCard.id === 'stark-robb') {
            const possibleAreas = findRetreatAreas(newState, defender, areaId, marchFromArea);
            if (possibleAreas.length > 0) {
                newState.pendingRobbRetreat = {
                    robbPlayer: attacker,
                    retreatingHouse: defender,
                    units: defenderUnits,
                    fromAreaId: areaId,
                    possibleAreas
                };
                console.log(`  🐺 Robb Stark: ${attacker} chooses retreat area for ${defender}`);
                return newState;
            }
        }

        if (defenderUnits.length > 0) {
            return initiateRetreat(newState, defender, defenderUnits, areaId, marchFromArea);
        }

    } else {
        console.log(`🛡️ ${defender} defends!`);

        // Attacker Casualties (attacker's own Blackfish protects attacker)
        const attackingUnits = newState.combat!.attackingUnits;
        if (!attackerImmune) {
            for (let i = 0; i < effectiveDefenderKills && attackingUnits.length > 0; i++) {
                const killed = attackingUnits.pop()!;
                newState.cas[attacker].availableUnits[killed.type] += 1;
            }
        }

        // Defender Casualties (defender's own Blackfish protects defender)
        if (!defenderImmune) {
            for (let i = 0; i < effectiveAttackerKills && area.units.length > 0; i++) {
                const killed = area.units.pop()!;
                newState.cas[defender].availableUnits[killed.type] += 1;
            }
        }

        // ── Winner Card Effects ──
        if (dCard.id === 'lan-tywin') newState.cas[defender].power = Math.min(20, newState.cas[defender].power + 2);
        if (dCard.id === 'bar-renly') {
            let upgraded = false;
            const idx = area.units.findIndex(u => u.type === 'Footman' && u.house === defender);
            if (idx >= 0 && newState.cas[defender].availableUnits.Knight > 0) {
                area.units[idx].type = 'Knight';
                newState.cas[defender].availableUnits.Footman++;
                newState.cas[defender].availableUnits.Knight--;
                upgraded = true;
            }
            // Also check supporting Baratheon footmen
            if (!upgraded) {
                for (const sa of Object.values(newState.board)) {
                    if (sa.order?.type === 'Support' && sa.house === defender && sa.adjacent.includes(areaId)) {
                        if (sa.type === 'Port' && sa.connectedSea !== areaId) continue;
                        const fIdx = sa.units.findIndex(u => u.type === 'Footman' && u.house === defender);
                        if (fIdx >= 0 && newState.cas[defender].availableUnits.Knight > 0) {
                            sa.units[fIdx].type = 'Knight';
                            newState.cas[defender].availableUnits.Footman++;
                            newState.cas[defender].availableUnits.Knight--;
                            break;
                        }
                    }
                }
            }
        }

        // ── Cersei: remove one of loser's orders ──
        if (dCard.id === 'lan-cersei') {
            for (const [aId, a] of Object.entries(newState.board)) {
                if (a.order && a.order.house === attacker) {
                    console.log(`  👑 Cersei: Removed ${attacker}'s ${a.order.type} from ${a.name}`);
                    a.order = null;
                    break;
                }
            }
        }

        // ── Queen of Thorns (either side) ──
        [aCard, dCard].forEach(card => {
            if (card.id === 'tyr-queen') {
                const opponent = card.house === attacker ? defender : attacker;
                for (const adjId of area.adjacent) {
                    const adj = newState.board[adjId];
                    if (adj?.order && adj.order.house === opponent) {
                        console.log(`  🌹 Queen of Thorns: Removed ${opponent}'s ${adj.order.type} from ${adj.name}`);
                        adj.order = null;
                        break;
                    }
                }
            }
        });

        // ── Doran Martell (either side) ──
        if (aCard.id === 'mar-doran') applyDoran(newState, attacker, defender);
        if (dCard.id === 'mar-doran') applyDoran(newState, defender, attacker);

        // Capture retreat origin
        const marchFromArea = newState.combat!.marchFromArea;

        discardCombatCards(newState, attacker, defender, attackerCard!, defenderCard!);

        // ── Roose Bolton: return discards on loss ──
        if (aCard.id === 'stark-bolton') {
            newState.cas[attacker].cards.push(...newState.cas[attacker].discards);
            newState.cas[attacker].discards = [];
            console.log(`  ♻️ Roose Bolton: ${attacker} returned all discards to hand`);
        }

        // ── Patchface: winner views opponent's hand and discards one ──
        if (dCard.id === 'bar-patchface' && newState.cas[attacker].cards.length > 0) {
            newState.pendingPatchface = {
                baratheonPlayer: defender,
                opponent: attacker,
                opponentCards: [...newState.cas[attacker].cards]
            };
            console.log(`  🤡 Patchface: ${defender} may discard one of ${attacker}'s cards`);
        }

        newState.combat = undefined;
        newState.phase = 'Action';

        // ── Robb Stark: winner chooses where attacker retreats ──
        if (marchFromArea && attackingUnits.length > 0 && dCard.id === 'stark-robb') {
            const possibleAreas = findRetreatAreas(newState, attacker, areaId);
            if (possibleAreas.length > 0) {
                newState.pendingRobbRetreat = {
                    robbPlayer: defender,
                    retreatingHouse: attacker,
                    units: attackingUnits,
                    fromAreaId: areaId,
                    possibleAreas
                };
                console.log(`  🐺 Robb Stark: ${defender} chooses retreat area for ${attacker}`);
                return newState;
            }
        }

        // Attacker Retreat
        if (marchFromArea && attackingUnits.length > 0) {
            const origin = newState.board[marchFromArea];
            // Add survivors to origin as ROUTED
            origin.units.push(...attackingUnits.map(u => ({ ...u, routed: true })));
            if (!origin.house) origin.house = attacker;
            console.log(`  🏳️ Attacker retreats to ${origin.name}`);
        }
    }

    return newState;
}

// Helper: Discard combat cards and recycle when needed
function discardCombatCards(state: GameState, attacker: HouseName, defender: HouseName, attackerCardId: string, defenderCardId: string) {
    const aCardObj = state.cas[attacker].cards.find(c => c.id === attackerCardId);
    const dCardObj = state.cas[defender].cards.find(c => c.id === defenderCardId);

    if (aCardObj) {
        state.cas[attacker].cards = state.cas[attacker].cards.filter(c => c.id !== attackerCardId);
        state.cas[attacker].discards.push(aCardObj);
    }
    if (dCardObj) {
        state.cas[defender].cards = state.cas[defender].cards.filter(c => c.id !== defenderCardId);
        state.cas[defender].discards.push(dCardObj);
    }

    // Recycle when all cards spent
    if (state.cas[attacker].cards.length === 0) {
        state.cas[attacker].cards = [...state.cas[attacker].discards];
        state.cas[attacker].discards = [];
        console.log(`  ♻️ ${attacker}'s cards recycled`);
    }
    if (state.cas[defender].cards.length === 0) {
        state.cas[defender].cards = [...state.cas[defender].discards];
        state.cas[defender].discards = [];
        console.log(`  ♻️ ${defender}'s cards recycled`);
    }
}

/** Apply Doran Martell: move opponent to bottom of their best Influence track */
function applyDoran(state: GameState, doranPlayer: HouseName, opponent: HouseName) {
    const tracks = ['ironThrone', 'fiefdoms', 'kingsCourt'] as const;
    // Auto-choose: the track where opponent has the best (lowest number) position
    const bestTrack = tracks.reduce((best, t) =>
        state.cas[opponent].influence[t] < state.cas[opponent].influence[best] ? t : best
    , tracks[0]);
    const oldPos = state.cas[opponent].influence[bestTrack];
    const totalPositions = Object.keys(state.cas).length;
    Object.keys(state.cas).forEach(h => {
        if (h !== opponent && state.cas[h as HouseName].influence[bestTrack] > oldPos) {
            state.cas[h as HouseName].influence[bestTrack] -= 1;
        }
    });
    state.cas[opponent].influence[bestTrack] = totalPositions;
    console.log(`  🐍 Doran: ${opponent} moved to bottom of ${bestTrack}`);
}

// ═══════════════════════════════════════════════
// RETREAT AREA FINDER (for Robb Stark and normal retreat)
// ═══════════════════════════════════════════════

/** Find all valid retreat areas for a house from a combat area */
function findRetreatAreas(state: GameState, house: HouseName, combatAreaId: string, excludeAreaId?: string): string[] {
    const combatArea = state.board[combatAreaId];
    if (!combatArea) return [];

    const possibleAreas: string[] = [];
    for (const adjId of combatArea.adjacent) {
        if (adjId === excludeAreaId) continue;
        const adj = state.board[adjId];
        if (!adj) continue;
        // Can retreat to areas with no enemy units
        if (adj.type === 'Sea' || adj.type === 'Port') continue; // Can't retreat to sea/port
        if (adj.house && adj.house !== house) continue; // Can't retreat to enemy area
        possibleAreas.push(adjId);
    }
    return possibleAreas;
}

// ═══════════════════════════════════════════════
// AERON DAMPHAIR RESOLUTION
// ═══════════════════════════════════════════════

/** Aeron Damphair: Player pays 2 power to swap their card, or declines */
export function resolveAeronSwap(state: GameState, newCardId: string | null): GameState {
    if (!state.pendingAeronSwap || !state.combat) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.combat = { ...state.combat };
    const house = state.pendingAeronSwap.house;

    if (newCardId) {
        // Pay 2 power
        newState.cas[house].power -= 2;

        // Discard Aeron (move to discards)
        const aeronCard = newState.cas[house].cards.find(c => c.id === 'grey-aeron');
        if (aeronCard) {
            newState.cas[house].cards = newState.cas[house].cards.filter(c => c.id !== 'grey-aeron');
            newState.cas[house].discards.push(aeronCard);
        }

        // Set new card
        if (house === newState.combat.attacker) {
            newState.combat.attackerCard = newCardId;
        } else {
            newState.combat.defenderCard = newCardId;
        }
        console.log(`  🦑 Aeron: ${house} swapped card to ${newCardId} (paid 2 power)`);
    } else {
        console.log(`  🦑 Aeron: ${house} declined to swap`);
    }

    newState.pendingAeronSwap = undefined;

    // Continue to Tyrion check — re-enter resolveCombat
    return resolveCombat(newState);
}

// ═══════════════════════════════════════════════
// TYRION LANNISTER RESOLUTION
// ═══════════════════════════════════════════════

/** Tyrion: the opponent whose card was cancelled picks a new one
 *  If cancelledCardId is null, Tyrion player chose NOT to use the ability */
export function resolveTyrionCancel(state: GameState, newCardId: string | null): GameState {
    if (!state.pendingTyrionCancel || !state.combat) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    newState.combat = { ...state.combat };
    const { opponent, cancelledCardId } = state.pendingTyrionCancel;

    if (newCardId) {
        // Opponent picks a different card
        if (opponent === newState.combat.attacker) {
            newState.combat.attackerCard = newCardId;
        } else {
            newState.combat.defenderCard = newCardId;
        }
        console.log(`  🃏 Tyrion: ${opponent} forced to play ${newCardId} instead of ${cancelledCardId}`);
    } else {
        // Tyrion player chose not to cancel
        console.log(`  🃏 Tyrion: chose not to cancel`);
    }

    newState.pendingTyrionCancel = undefined;

    // Continue combat resolution
    return resolveCombat(newState);
}

// ═══════════════════════════════════════════════
// PATCHFACE RESOLUTION
// ═══════════════════════════════════════════════

/** Patchface: Baratheon player picks one card from opponent's hand to discard */
export function resolvePatchfaceDiscard(state: GameState, discardCardId: string | null): GameState {
    if (!state.pendingPatchface) return state;

    const newState = { ...state };
    newState.cas = JSON.parse(JSON.stringify(state.cas));
    const { opponent } = state.pendingPatchface;

    if (discardCardId) {
        const cardToDiscard = newState.cas[opponent].cards.find(c => c.id === discardCardId);
        if (cardToDiscard) {
            newState.cas[opponent].cards = newState.cas[opponent].cards.filter(c => c.id !== discardCardId);
            newState.cas[opponent].discards.push(cardToDiscard);
            console.log(`  🤡 Patchface: Discarded ${cardToDiscard.name} from ${opponent}'s hand`);
        }
    } else {
        console.log(`  🤡 Patchface: Declined to discard`);
    }

    newState.pendingPatchface = undefined;
    return newState;
}

// ═══════════════════════════════════════════════
// ROBB STARK RETREAT RESOLUTION
// ═══════════════════════════════════════════════

/** Robb Stark: The winner chooses which area the loser retreats to */
export function resolveRobbRetreat(state: GameState, chosenAreaId: string): GameState {
    if (!state.pendingRobbRetreat) return state;

    const newState = { ...state };
    newState.board = JSON.parse(JSON.stringify(state.board));
    const { retreatingHouse, units } = state.pendingRobbRetreat;

    const targetArea = newState.board[chosenAreaId];
    if (targetArea) {
        targetArea.units.push(...units.map(u => ({ ...u, routed: true })));
        if (!targetArea.house) targetArea.house = retreatingHouse;
        console.log(`  🐺 Robb: ${retreatingHouse} forced to retreat to ${targetArea.name}`);
    }

    newState.pendingRobbRetreat = undefined;
    return newState;
}
