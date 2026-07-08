import { GameState, HouseName, UnitType } from '../game/types';
import {
    resolvePhase, placeOrder, resolveMarch, finishMarch,
    resolveRaid, resolveRaidNoEffect, resolveConsolidatePower,
    leavePowerToken, declinePowerToken,
    advanceActionTurn, useValyrianSteelBlade, useMessengerRaven,
    musterUnit, skipMustering, skipAllMustering, upgradeFootman,
    resolveRetreat, submitBid, resolveBids, chooseBidTieBreak,
    resolveGameOfThrones, triggerCPStarMustering,
    acknowledgeWildlingCard, resolveNextWesterosCard, makeDecision,
    resolveUnitSelection, resolveReconcileArmy,
    resolveRavenPeek, skipRavenSwap
} from '../game/engine';
import {
    selectHouseCard, resolveCombat, declareSupportChoice,
    resolveAeronSwap, resolveTyrionCancel, resolvePatchfaceDiscard, resolveRobbRetreat
} from '../game/combat';

/** Every player interaction, serializable so guests can send them to the host */
export type GameAction =
    | { t: 'placeOrder'; areaId: string; house: HouseName; tokenIndex: number }
    | { t: 'ravenSwap'; areaId: string; tokenIndex: number }
    | { t: 'skipRavenSwap' }
    | { t: 'ravenPeek'; placement: 'top' | 'bottom' }
    | { t: 'phaseAdvance' }
    | { t: 'marchMove'; fromAreaId: string; toAreaId: string; unitIds: string[] }
    | { t: 'finishMarch'; fromAreaId: string }
    | { t: 'raid'; fromAreaId: string; toAreaId: string }
    | { t: 'raidNoEffect'; fromAreaId: string }
    | { t: 'selectCard'; house: HouseName; cardId: string }
    | { t: 'resolveCombat' }
    | { t: 'declareSupport'; areaId: string; choice: 'attacker' | 'defender' | 'none' }
    | { t: 'aeronSwap'; cardId: string | null }
    | { t: 'tyrionPick'; cardId: string | null }
    | { t: 'patchface'; cardId: string | null }
    | { t: 'robbRetreat'; areaId: string }
    | { t: 'retreat'; areaId: string }
    | { t: 'unitSelection'; unitIds: string[] }
    | { t: 'decision'; action: string }
    | { t: 'bid'; house: HouseName; amount: number }
    | { t: 'resolveBids' }
    | { t: 'tieBreak'; house: HouseName }
    | { t: 'muster'; areaId: string; unitType: UnitType }
    | { t: 'skipMuster'; areaId: string }
    | { t: 'skipAllMuster' }
    | { t: 'upgradeFootman'; areaId: string; to: 'Knight' | 'SiegeEngine' }
    | { t: 'cpStarMuster'; areaId: string }
    | { t: 'powerToken'; keep: boolean }
    | { t: 'reconcile'; house: HouseName; areaId: string; unitIndex: number }
    | { t: 'useBlade' }
    | { t: 'westerosContinue' };

/** Pure reducer: the single entry point that both local play and the online host use */
export function applyAction(s: GameState, a: GameAction): GameState {
    switch (a.t) {
        case 'placeOrder':
            return placeOrder(s, a.areaId, a.house, a.tokenIndex);

        case 'ravenSwap':
            return useMessengerRaven(s, a.areaId, a.tokenIndex);

        case 'skipRavenSwap':
            return skipRavenSwap(s);

        case 'ravenPeek':
            return resolveRavenPeek(s, a.placement);

        case 'phaseAdvance': {
            if (s.winner || s.pendingPowerTokenArea || s.pendingMustering || s.pendingRetreat ||
                s.pendingUnitSelection || s.pendingDecision || s.pendingBidTieBreak ||
                s.pendingReconcile || s.pendingRavenPeek || s.pendingRavenSwap) return s;
            if (s.phase === 'Action') {
                if (s.actionSubPhase === 'Done') {
                    return resolvePhase(resolveConsolidatePower(s));
                }
                return advanceActionTurn(s);
            }
            if (s.phase === 'Westeros' && s.pendingGameOfThrones) {
                return resolveGameOfThrones(s);
            }
            return resolvePhase(s);
        }

        case 'marchMove': {
            let ns = resolveMarch(s, a.fromAreaId, a.toAreaId, a.unitIds);
            if (ns === s) return s;
            if (ns.combat) return ns;
            const fromArea = ns.board[a.fromAreaId];
            if (!fromArea.order || fromArea.units.length === 0) {
                ns = finishMarch(ns, a.fromAreaId);
                ns = advanceActionTurn(ns);
            }
            return ns;
        }

        case 'finishMarch':
            return advanceActionTurn(finishMarch(s, a.fromAreaId));

        case 'raid': {
            const ns = resolveRaid(s, a.fromAreaId, a.toAreaId);
            if (ns === s) return s;
            return advanceActionTurn(ns);
        }

        case 'raidNoEffect': {
            const ns = resolveRaidNoEffect(s, a.fromAreaId);
            if (ns === s) return s;
            return advanceActionTurn(ns);
        }

        case 'selectCard':
            return selectHouseCard(s, a.house, a.cardId);

        case 'resolveCombat': {
            const c = s.combat;
            if (!c) return s;
            if ((!c.attackerCard && !c.attackerNoCard) || (!c.defenderCard && !c.defenderNoCard)) return s;
            return resolveCombat(s);
        }

        case 'declareSupport':
            return declareSupportChoice(s, a.areaId, a.choice);

        case 'aeronSwap':
            return resolveAeronSwap(s, a.cardId);

        case 'tyrionPick':
            return resolveTyrionCancel(s, a.cardId);

        case 'patchface':
            return resolvePatchfaceDiscard(s, a.cardId);

        case 'robbRetreat':
            return resolveRobbRetreat(s, a.areaId);

        case 'retreat':
            return resolveRetreat(s, a.areaId);

        case 'unitSelection':
            return resolveUnitSelection(s, a.unitIds);

        case 'decision':
            return makeDecision(s, a.action);

        case 'bid':
            return submitBid(s, a.house, a.amount);

        case 'resolveBids':
            return resolveBids(s);

        case 'tieBreak':
            return chooseBidTieBreak(s, a.house);

        case 'muster':
            return musterUnit(s, a.areaId, a.unitType);

        case 'skipMuster':
            return skipMustering(s, a.areaId);

        case 'skipAllMuster':
            return skipAllMustering(s);

        case 'upgradeFootman': {
            const footman = s.board[a.areaId]?.units.find(
                u => u.type === 'Footman' && u.house === s.board[a.areaId].house
            );
            if (!footman) return s;
            return upgradeFootman(s, a.areaId, footman.id, a.to);
        }

        case 'cpStarMuster':
            return triggerCPStarMustering(s, a.areaId);

        case 'powerToken':
            return a.keep ? leavePowerToken(s) : declinePowerToken(s);

        case 'reconcile':
            return resolveReconcileArmy(s, a.house, a.areaId, a.unitIndex);

        case 'useBlade':
            return useValyrianSteelBlade(s);

        case 'westerosContinue': {
            if (s.currentWildlingCard) return acknowledgeWildlingCard(s);
            if (s.drawnWesterosCards) return resolveNextWesterosCard(s);
            return s;
        }
    }
}
