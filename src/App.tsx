import { useState } from 'react'
import { createInitialGameState } from './game/setup'
import {
    resolvePhase, placeOrder, resolveMarch, finishMarch,
    resolveRaid, resolveConsolidatePower, checkVictory,
    leavePowerToken, declinePowerToken,
    advanceActionTurn, useValyrianSteelBlade, useMessengerRaven,
    musterUnit, skipMustering, skipAllMustering, upgradeFootmanToKnight,
    resolveRetreat, submitBid, resolveBids,
    resolveGameOfThrones, triggerCPStarMustering,
    getPortForArea, moveShipFromPort,
    acknowledgeWesterosCards, acknowledgeWildlingCard,
    resolveNextWesterosCard, makeDecision
} from './game/engine'
import {
    selectHouseCard, resolveCombat,
    declareSupportChoice, resolveAeronSwap, resolveTyrionCancel,
    resolvePatchfaceDiscard, resolveRobbRetreat
} from './game/combat'
import { GameBoard } from './components/GameBoard'
import { CombatUI } from './components/CombatUI'
import { SetupScreen } from './components/SetupScreen'
import { GameTracks } from './components/GameTracks'
import { WesterosPhase } from './components/WesterosPhase'
import { RetreatModal } from './components/RetreatModal'
import { HouseName, UnitType, ORDER_TOKENS, STAR_ORDER_LIMITS, getStarLimit, MUSTER_COSTS } from './game/types'
import { INITIAL_MAP } from './game/constants/map'

type InteractionState =
    | { type: 'NONE' }
    | { type: 'MARCH_SELECT_UNITS', fromAreaId: string }
    | { type: 'MARCH_SELECT_TO', fromAreaId: string, unitIds: string[] }
    | { type: 'RAID_SELECT_TO', fromAreaId: string }
    | { type: 'RETREAT_SELECT_TO' }
    | { type: 'RAVEN_SELECT_AREA' };

// Debugging
import { SpriteDebugger } from './components/SpriteDebugger';

function App() {
    const [gameStarted, setGameStarted] = useState(false);
    const [gameState, setGameState] = useState(() => createInitialGameState(6));
    const [selectedArea, setSelectedArea] = useState<string | null>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'NONE' });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [bidAmounts, setBidAmounts] = useState<Record<string, number>>({});

    // Debug Toggle
    const [showDebug, setShowDebug] = useState(true); // START IN DEBUG MODE

    const handleStartGame = (playerCount: number) => {
        setGameState(createInitialGameState(playerCount));
        setGameStarted(true);
    };

    const handleNewGame = () => {
        setGameStarted(false);
        setSelectedArea(null);
        setInteraction({ type: 'NONE' });
        setSelectedUnitIds([]);
        setBidAmounts({});
    };

    if (!gameStarted) {
        return <SetupScreen onStartGame={handleStartGame} />;
    }

    // ─── Area Click Handler ────────────────────────
    const handleAreaClick = (areaId: string) => {
        if (gameState.winner || gameState.pendingPowerTokenArea || gameState.pendingMustering) return;

        // Retreat destination selection
        if (interaction.type === 'RETREAT_SELECT_TO' && gameState.pendingRetreat) {
            if (gameState.pendingRetreat.possibleAreas.includes(areaId)) {
                setGameState(prev => advanceActionTurn(resolveRetreat(prev, areaId)));
                setInteraction({ type: 'NONE' });
            }
            return;
        }

        // March destination
        if (interaction.type === 'MARCH_SELECT_TO') {
            const unitIds = interaction.unitIds;
            const fromId = interaction.fromAreaId;
            setGameState(prev => {
                let newState = resolveMarch(prev, fromId, areaId, unitIds);
                const fromArea = newState.board[fromId];
                if (newState.combat) {
                    // Combat initiated — order already consumed, turn advances after combat
                    setInteraction({ type: 'NONE' });
                    return newState;
                }
                if (!fromArea.order || fromArea.units.length === 0) {
                    // All units moved or order gone — consume order and advance turn
                    newState = finishMarch(newState, fromId);
                    newState = advanceActionTurn(newState);
                    setInteraction({ type: 'NONE' });
                    return newState;
                }
                // More units remain — split march, stay in unit selection
                setInteraction({ type: 'MARCH_SELECT_UNITS', fromAreaId: fromId });
                setSelectedUnitIds([]);
                return newState;
            });
            setSelectedArea(areaId);
            return;
        }

        // Raid target
        if (interaction.type === 'RAID_SELECT_TO') {
            setGameState(prev => {
                const newState = resolveRaid(prev, interaction.fromAreaId, areaId);
                return advanceActionTurn(newState);
            });
            setInteraction({ type: 'NONE' });
            return;
        }

        setSelectedArea(areaId);
    };

    // ─── Phase Advance ─────────────────────────────
    const handlePhaseAdvance = () => {
        if (gameState.winner || gameState.pendingPowerTokenArea || gameState.pendingMustering || gameState.pendingRetreat) return;
        if (gameState.phase === 'Action') {
            if (gameState.actionSubPhase === 'Done') {
                setGameState(prev => {
                    const withCP = resolveConsolidatePower(prev);
                    return resolvePhase(withCP);
                });
            } else {
                setGameState(prev => advanceActionTurn(prev));
            }
        } else if (gameState.phase === 'Westeros') {
            // If there are pending events, resolve them
            if (gameState.pendingGameOfThrones) {
                setGameState(prev => resolveGameOfThrones(prev));
            } else {
                // Let engine handle card drawing and phase transitions
                setGameState(prev => resolvePhase(prev));
            }
        } else {
            setGameState(prev => resolvePhase(prev));
        }
    };

    // ─── Order Placement ───────────────────────────
    const handlePlaceOrder = (tokenIndex: number) => {
        if (!selectedArea) return;
        const area = gameState.board[selectedArea];
        if (!area.house) return;
        setGameState(prev => placeOrder(prev, selectedArea, area.house!, tokenIndex));
    };

    // ─── March ─────────────────────────────────────
    const handleExecuteMarch = () => {
        if (!selectedArea) return;
        const area = gameState.board[selectedArea];
        setSelectedUnitIds(area.units.map(u => u.id));
        setInteraction({ type: 'MARCH_SELECT_UNITS', fromAreaId: selectedArea });
    };

    const handleConfirmUnitSelection = () => {
        if (interaction.type !== 'MARCH_SELECT_UNITS') return;
        if (selectedUnitIds.length === 0) return;
        setInteraction({ type: 'MARCH_SELECT_TO', fromAreaId: interaction.fromAreaId, unitIds: selectedUnitIds });
    };

    const handleFinishMarch = () => {
        if (interaction.type === 'MARCH_SELECT_UNITS') {
            setGameState(prev => {
                const newState = finishMarch(prev, interaction.fromAreaId);
                return advanceActionTurn(newState);
            });
            setInteraction({ type: 'NONE' });
            setSelectedUnitIds([]);
        }
    };

    // ─── Raid ──────────────────────────────────────
    const handleExecuteRaid = () => {
        if (!selectedArea) return;
        setInteraction({ type: 'RAID_SELECT_TO', fromAreaId: selectedArea });
    };

    // ─── Combat Card Selection ─────────────────────
    const handleCardSelect = (house: HouseName, cardId: string) => {
        setGameState(prev => selectHouseCard(prev, house, cardId));
    };

    const handleResolveCombat = () => {
        setGameState(prev => {
            if (!prev.combat?.attackerCard || !prev.combat?.defenderCard) return prev;
            let resolved = resolveCombat(prev);
            // Don't advance turn if any interactive combat sub-state is pending
            if (!resolved.pendingRetreat && !resolved.combat &&
                !resolved.pendingAeronSwap && !resolved.pendingTyrionCancel &&
                !resolved.pendingPatchface && !resolved.pendingRobbRetreat) {
                resolved = advanceActionTurn(resolved);
            }
            return resolved;
        });
    };

    // ─── Valyrian Steel Blade ──────────────────────
    const handleUseBlade = () => {
        setGameState(prev => useValyrianSteelBlade(prev));
    };

    // ─── Mustering ─────────────────────────────────
    const handleMuster = (areaId: string, unitType: UnitType) => {
        setGameState(prev => musterUnit(prev, areaId, unitType));
    };

    const handleSkipMustering = (areaId: string) => {
        setGameState(prev => skipMustering(prev, areaId));
    };

    // ─── Bidding ──────────────────────────────────────────────
    const handleSubmitBid = (house: HouseName) => {
        const amount = bidAmounts[house] ?? 0;
        setGameState(prev => submitBid(prev, house, amount));
    };

    const handleResolveBids = () => {
        setGameState(prev => resolveBids(prev));
        setBidAmounts({});
    };

    // ─── CP★ Mustering ────────────────────────────────────────
    const handleCPStarMuster = (areaId: string) => {
        setGameState(prev => triggerCPStarMustering(prev, areaId));
    };

    // ─── Retreat ───────────────────────────────────
    // Retreat UI is shown automatically when pendingRetreat is set

    // ─── Derived State ─────────────────────────────
    const castleCounts: Record<string, number> = {};
    gameState.turnOrder.forEach(house => {
        castleCounts[house] = Object.values(gameState.board).filter(
            a => a.house === house && (a.castle || a.stronghold)
        ).length;
    });

    const getAvailableTokens = () => {
        if (!selectedArea) return [];
        const area = gameState.board[selectedArea];
        if (!area.house) return [];
        const house = gameState.cas[area.house];
        const starCount = house.usedOrderTokens.filter(idx => ORDER_TOKENS[idx].star).length;
        const maxStars = getStarLimit(gameState.turnOrder.length, house.influence.kingsCourt);
        return ORDER_TOKENS.map((token, index) => ({
            ...token, index,
            used: house.usedOrderTokens.includes(index),
            restricted: (gameState.orderRestrictions?.includes(token.type) ?? false) || (token.star && (gameState.orderStarRestrictions?.includes(token.type) ?? false)),
            starLimitReached: token.star && starCount >= maxStars
        }));
    };

    // Blade holder info
    const bladeHolder = gameState.turnOrder.reduce((best, h) =>
        gameState.cas[h].influence.fiefdoms < gameState.cas[best].influence.fiefdoms ? h : best
        , gameState.turnOrder[0]);

    const ravenHolder = gameState.turnOrder.reduce((best, h) =>
        gameState.cas[h].influence.kingsCourt < gameState.cas[best].influence.kingsCourt ? h : best
        , gameState.turnOrder[0]);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', color: '#eee' }}>
            {/* ═══ VICTORY BANNER ═══ */}
            {gameState.winner && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ textAlign: 'center', color: 'gold', fontSize: '3em' }}>
                        <div>🏆</div><div>{gameState.winner} WINS!</div>
                    </div>
                </div>
            )}

            {/* ═══ POWER TOKEN PROMPT ═══ */}
            {gameState.pendingPowerTokenArea && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 150,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: '#333', padding: '25px', borderRadius: '10px', textAlign: 'center', border: '2px solid gold', maxWidth: '400px' }}>
                        <h3 style={{ margin: '0 0 10px', color: 'gold' }}>📌 Area Vacated!</h3>
                        <p><strong>{gameState.pendingPowerTokenArea}</strong> has no units. Spend 1 Power to keep control?</p>
                        <p style={{ fontSize: '0.85em', color: '#aaa' }}>
                            Power: <strong style={{ color: '#4f4' }}>{gameState.board[gameState.pendingPowerTokenArea]?.house ? gameState.cas[gameState.board[gameState.pendingPowerTokenArea].house!].power : 0}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
                            <button onClick={() => setGameState(prev => leavePowerToken(prev))}
                                disabled={gameState.board[gameState.pendingPowerTokenArea]?.house ? gameState.cas[gameState.board[gameState.pendingPowerTokenArea].house!].power <= 0 : true}
                                style={{ padding: '8px 20px', background: '#4a4', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                                💰 Yes, spend 1
                            </button>
                            <button onClick={() => setGameState(prev => declinePowerToken(prev))}
                                style={{ padding: '8px 20px', background: '#a44', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                                ❌ No, lose it
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ MUSTERING PANEL ═══ */}
            {gameState.pendingMustering && gameState.pendingMustering.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 150,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: '#2a2a2a', padding: '25px', borderRadius: '10px', border: '2px solid #d4af37', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' }}>
                        <h3 style={{ color: '#d4af37', margin: '0 0 15px' }}>🏗️ Mustering</h3>
                        {gameState.pendingMustering.map(m => (
                            <div key={m.areaId} style={{ background: '#333', padding: '10px', borderRadius: '6px', marginBottom: '10px' }}>
                                <div style={{ fontWeight: 'bold', color: gameState.cas[m.house].color }}>
                                    {gameState.board[m.areaId].name} ({m.house}) — {m.pointsRemaining} point(s)
                                </div>
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                                    {(['Footman', 'Knight', 'SiegeEngine', 'Ship'] as UnitType[]).map(unitType => {
                                        const cost = MUSTER_COSTS[unitType];
                                        const available = gameState.cas[m.house].availableUnits[unitType] > 0;
                                        const affordable = cost <= m.pointsRemaining;
                                        const canPlace = available && affordable;
                                        // Ships need adjacent sea
                                        return (
                                            <button key={unitType}
                                                onClick={() => handleMuster(m.areaId, unitType)}
                                                disabled={!canPlace}
                                                style={{
                                                    padding: '4px 8px', fontSize: '0.8em',
                                                    background: canPlace ? '#4a4' : '#333',
                                                    color: canPlace ? 'white' : '#666',
                                                    border: '1px solid #555', borderRadius: '3px',
                                                    cursor: canPlace ? 'pointer' : 'not-allowed'
                                                }}>
                                                {unitType} ({cost}pt)
                                            </button>
                                        );
                                    })}
                                    {/* Upgrade Footman → Knight (1 muster point) */}
                                    {gameState.board[m.areaId].units.filter(u => u.type === 'Footman' && u.house === m.house).length > 0 &&
                                     m.pointsRemaining >= 1 &&
                                     gameState.cas[m.house].availableUnits.Knight > 0 && (
                                        <button
                                            onClick={() => {
                                                const footman = gameState.board[m.areaId].units.find(u => u.type === 'Footman' && u.house === m.house);
                                                if (footman) setGameState(prev => upgradeFootmanToKnight(prev, m.areaId, footman.id));
                                            }}
                                            style={{
                                                padding: '4px 8px', fontSize: '0.8em',
                                                background: '#a86f32', color: 'white',
                                                border: '1px solid #c9873c', borderRadius: '3px',
                                                cursor: 'pointer'
                                            }}>
                                            ⬆ Upgrade (1pt)
                                        </button>
                                    )}
                                    <button onClick={() => handleSkipMustering(m.areaId)}
                                        style={{ padding: '4px 8px', fontSize: '0.8em', background: '#555', color: '#ddd', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                        Skip
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button onClick={() => setGameState(prev => skipAllMustering(prev))}
                            style={{ padding: '6px 15px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '5px' }}>
                            Skip All Mustering
                        </button>
                    </div>
                </div>
            )}

            {/* ═══ BIDDING MODAL ═══ */}
            {gameState.pendingBidding && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.7)', zIndex: 150,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ background: '#2a2a2a', padding: '25px', borderRadius: '10px', border: '2px solid #d4af37', maxWidth: '550px', maxHeight: '80vh', overflow: 'auto' }}>
                        <h3 style={{ color: '#d4af37', margin: '0 0 5px' }}>
                            {gameState.pendingBidding.type === 'wildling'
                                ? `🐺 Wildling Attack! (Threat: ${gameState.wildlingThreat})`
                                : `👑 Clash of Kings: ${gameState.pendingBidding.currentTrack === 'ironThrone' ? 'Iron Throne' : gameState.pendingBidding.currentTrack === 'fiefdoms' ? 'Fiefdoms' : "King's Court"}`}
                        </h3>
                        <p style={{ fontSize: '0.85em', color: '#aaa', margin: '0 0 12px' }}>
                            {gameState.pendingBidding.type === 'wildling'
                                ? 'All houses must bid Power tokens to defend. Total bid must exceed Wildling Threat!'
                                : 'Each house bids Power tokens. Highest bidder gets position #1.'}
                        </p>
                        {gameState.turnOrder.map(house => {
                            const hasBid = gameState.pendingBidding!.bids[house] !== undefined;
                            return (
                                <div key={house} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px', marginBottom: '5px', borderRadius: '4px',
                                    background: hasBid ? '#1a3a1a' : '#333',
                                    borderLeft: `3px solid ${gameState.cas[house].color}`
                                }}>
                                    <span style={{ color: gameState.cas[house].color, fontWeight: 'bold', minWidth: '80px' }}>{house}</span>
                                    <span style={{ color: '#aaa', fontSize: '0.85em' }}>💰{gameState.cas[house].power}</span>
                                    {!hasBid ? (
                                        <>
                                            <input type="number" min={0} max={gameState.cas[house].power}
                                                value={bidAmounts[house] ?? 0}
                                                onChange={e => setBidAmounts(prev => ({ ...prev, [house]: Math.max(0, Math.min(gameState.cas[house].power, parseInt(e.target.value) || 0)) }))}
                                                style={{ width: '50px', padding: '3px', background: '#444', color: 'white', border: '1px solid #666', borderRadius: '3px' }} />
                                            <button onClick={() => handleSubmitBid(house)}
                                                style={{ padding: '3px 10px', background: '#4a4', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.85em' }}>
                                                Bid
                                            </button>
                                        </>
                                    ) : (
                                        <span style={{ color: '#8f8', fontWeight: 'bold' }}>✓ Bid: {gameState.pendingBidding!.bids[house]}</span>
                                    )}
                                </div>
                            );
                        })}
                        {gameState.turnOrder.every(h => gameState.pendingBidding!.bids[h] !== undefined) && (
                            <button onClick={handleResolveBids}
                                style={{ marginTop: '10px', padding: '8px 20px', background: '#d4af37', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>
                                Resolve Bids
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ COMBAT MODAL (removed duplicate — rendered below) ═══ */}

            {/* ═══ VALYRIAN STEEL BLADE ═══ */}
            {gameState.combat && !gameState.valyrianSteelBladeUsed && (
                (gameState.combat.attacker === bladeHolder || gameState.combat.defender === bladeHolder) && (
                    <div style={{
                        position: 'fixed', bottom: '20px', right: '20px', zIndex: 100,
                        background: '#1a1a2e', padding: '12px 20px', borderRadius: '8px',
                        border: '2px solid #d4af37', boxShadow: '0 0 20px rgba(212,175,55,0.3)'
                    }}>
                        <button onClick={handleUseBlade} style={{
                            background: 'linear-gradient(135deg, #d4af37, #aa8a2e)',
                            color: 'white', border: 'none', padding: '8px 16px',
                            borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em'
                        }}>
                            🗡️ Use Valyrian Steel Blade (+1)
                        </button>
                        <div style={{ fontSize: '0.75em', color: '#aaa', marginTop: '4px' }}>
                            Holder: {bladeHolder}
                        </div>
                    </div>
                )
            )}

            {/* ═══ WESTEROS PHASE & WILDLING CARDS ═══ */}
            <WesterosPhase
                gameState={gameState}
                onContinue={() => {
                    if (gameState.currentWildlingCard) {
                        setGameState(prev => acknowledgeWildlingCard(prev));
                    } else if (gameState.drawnWesterosCards) {
                        setGameState(prev => resolveNextWesterosCard(prev));
                    }
                }}
                onDecision={(action) => {
                    setGameState(prev => makeDecision(prev, action));
                }}
            />

            {/* ═══ COMBAT UI ═══ */}
            <CombatUI
                gameState={gameState}
                onCardSelect={(house, cardId) => {
                    setGameState(prev => selectHouseCard(prev, house, cardId));
                }}
                onResolveCombat={handleResolveCombat}
            />

            {/* ═══ 3RD-PARTY SUPPORT DECLARATIONS ═══ */}
            {gameState.pendingSupportDeclarations && gameState.pendingSupportDeclarations.pendingHouses.length > 0 && (() => {
                const pending = gameState.pendingSupportDeclarations!;
                const current = pending.pendingHouses[0];
                return (
                    <div style={modalOverlayStyle}>
                        <div style={modalBoxStyle}>
                            <h2 style={{ color: '#d4af37', margin: '0 0 10px', textAlign: 'center' }}>🤝 Support Declaration</h2>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[current.house]?.color }}>{current.house}</strong> has a Support order in <strong>{gameState.board[current.areaId]?.name}</strong>.
                            </p>
                            <p style={{ textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>
                                Combat: <strong style={{ color: gameState.cas[pending.attacker]?.color }}>{pending.attacker}</strong> vs <strong style={{ color: gameState.cas[pending.defender]?.color }}>{pending.defender}</strong> in {gameState.board[pending.combatAreaId]?.name}
                            </p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
                                <button onClick={() => setGameState(prev => declareSupportChoice(prev, current.areaId, 'attacker'))}
                                    style={{ ...actionBtnStyle, background: gameState.cas[pending.attacker]?.color || '#d44' }}>
                                    Support {pending.attacker}
                                </button>
                                <button onClick={() => setGameState(prev => declareSupportChoice(prev, current.areaId, 'defender'))}
                                    style={{ ...actionBtnStyle, background: gameState.cas[pending.defender]?.color || '#44d' }}>
                                    Support {pending.defender}
                                </button>
                                <button onClick={() => setGameState(prev => declareSupportChoice(prev, current.areaId, 'none'))}
                                    style={{ ...actionBtnStyle, background: '#555' }}>
                                    Refuse
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ AERON DAMPHAIR ═══ */}
            {gameState.pendingAeronSwap && (() => {
                const house = gameState.pendingAeronSwap.house;
                const otherCards = gameState.cas[house].cards.filter(c => c.id !== 'grey-aeron');
                return (
                    <div style={modalOverlayStyle}>
                        <div style={modalBoxStyle}>
                            <h2 style={{ color: '#6af', margin: '0 0 10px', textAlign: 'center' }}>🦑 Aeron Damphair</h2>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[house]?.color }}>{house}</strong> may pay <strong style={{ color: '#fd6' }}>2 Power</strong> to discard Aeron and play a different card.
                            </p>
                            <p style={{ textAlign: 'center', color: '#888', fontSize: '0.85em' }}>Current power: {gameState.cas[house].power}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                {otherCards.map(card => (
                                    <button key={card.id}
                                        onClick={() => setGameState(prev => resolveAeronSwap(prev, card.id))}
                                        style={{ ...cardButtonStyle, borderColor: '#6af' }}>
                                        <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                        <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                        {card.swords ? <span style={{ marginLeft: '6px' }}>🗡️×{card.swords}</span> : null}
                                        {card.fortifications ? <span style={{ marginLeft: '6px' }}>🛡️×{card.fortifications}</span> : null}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setGameState(prev => resolveAeronSwap(prev, null))}
                                style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                Decline (keep Aeron)
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ TYRION LANNISTER ═══ */}
            {gameState.pendingTyrionCancel && (() => {
                const { tyrionPlayer, opponent, cancelledCardId } = gameState.pendingTyrionCancel;
                const otherCards = gameState.cas[opponent].cards.filter(c => c.id !== cancelledCardId);
                const cancelledCard = gameState.cas[opponent].cards.find(c => c.id === cancelledCardId);
                return (
                    <div style={modalOverlayStyle}>
                        <div style={modalBoxStyle}>
                            <h2 style={{ color: '#c4a', margin: '0 0 10px', textAlign: 'center' }}>🃏 Tyrion Lannister</h2>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[tyrionPlayer]?.color }}>{tyrionPlayer}</strong> played Tyrion!
                            </p>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[opponent]?.color }}>{opponent}</strong>'s <strong>{cancelledCard?.name}</strong> is cancelled.
                                Choose a replacement card:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                {otherCards.map(card => (
                                    <button key={card.id}
                                        onClick={() => setGameState(prev => resolveTyrionCancel(prev, card.id))}
                                        style={{ ...cardButtonStyle, borderColor: '#c4a' }}>
                                        <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                        <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                        {card.swords ? <span style={{ marginLeft: '6px' }}>🗡️×{card.swords}</span> : null}
                                        {card.fortifications ? <span style={{ marginLeft: '6px' }}>🛡️×{card.fortifications}</span> : null}
                                    </button>
                                ))}
                            </div>
                            {otherCards.length === 0 && (
                                <button onClick={() => setGameState(prev => resolveTyrionCancel(prev, null))}
                                    style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                    No other cards — continue
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ═══ PATCHFACE ═══ */}
            {gameState.pendingPatchface && (() => {
                const { baratheonPlayer, opponent, opponentCards } = gameState.pendingPatchface;
                return (
                    <div style={modalOverlayStyle}>
                        <div style={modalBoxStyle}>
                            <h2 style={{ color: '#f8a', margin: '0 0 10px', textAlign: 'center' }}>🤡 Patchface</h2>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[baratheonPlayer]?.color }}>{baratheonPlayer}</strong> may view and discard one of <strong style={{ color: gameState.cas[opponent]?.color }}>{opponent}</strong>'s cards:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                {opponentCards.map(card => (
                                    <button key={card.id}
                                        onClick={() => setGameState(prev => {
                                            let s = resolvePatchfaceDiscard(prev, card.id);
                                            if (!s.pendingRetreat && !s.combat && !s.pendingRobbRetreat) s = advanceActionTurn(s);
                                            return s;
                                        })}
                                        style={{ ...cardButtonStyle, borderColor: '#f8a' }}>
                                        <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                        <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                        {card.text && <div style={{ fontSize: '0.7em', color: '#888', fontStyle: 'italic', marginTop: '3px' }}>{card.text}</div>}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setGameState(prev => {
                                let s = resolvePatchfaceDiscard(prev, null);
                                if (!s.pendingRetreat && !s.combat && !s.pendingRobbRetreat) s = advanceActionTurn(s);
                                return s;
                            })}
                                style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                Decline (discard nothing)
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ ROBB STARK RETREAT ═══ */}
            {gameState.pendingRobbRetreat && (() => {
                const { robbPlayer, retreatingHouse, possibleAreas } = gameState.pendingRobbRetreat;
                return (
                    <div style={modalOverlayStyle}>
                        <div style={modalBoxStyle}>
                            <h2 style={{ color: '#6c6', margin: '0 0 10px', textAlign: 'center' }}>🐺 Robb Stark</h2>
                            <p style={{ textAlign: 'center', color: '#ccc' }}>
                                <strong style={{ color: gameState.cas[robbPlayer]?.color }}>{robbPlayer}</strong> chooses where <strong style={{ color: gameState.cas[retreatingHouse]?.color }}>{retreatingHouse}</strong>'s defeated units retreat:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                {possibleAreas.map(areaId => (
                                    <button key={areaId}
                                        onClick={() => setGameState(prev => {
                                            let s = resolveRobbRetreat(prev, areaId);
                                            s = advanceActionTurn(s);
                                            return s;
                                        })}
                                        style={{ ...cardButtonStyle, borderColor: '#6c6' }}>
                                        {gameState.board[areaId]?.name || areaId}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ RETREAT UI ═══ */}
            <RetreatModal
                gameState={gameState}
                onResolve={(areaId) => {
                    setGameState(prev => {
                        let s = resolveRetreat(prev, areaId);
                        if (!s.pendingPatchface && !s.pendingRobbRetreat && !s.combat) {
                            s = advanceActionTurn(s);
                        }
                        return s;
                    });
                }}
            />

            {/* ═══ TURN INDICATOR (Action Phase) ═══ */}
            {gameState.phase === 'Action' && gameState.actionSubPhase !== 'Done' && interaction.type === 'NONE' && !gameState.combat && !gameState.pendingRetreat && (
                <div style={{
                    background: 'linear-gradient(90deg, #1a1a3e, #2a2a5e)', padding: '12px 20px',
                    borderRadius: '6px', marginBottom: '10px', textAlign: 'center',
                    border: `2px solid ${gameState.cas[gameState.currentPlayerHouse]?.color || '#fff'}`,
                    boxShadow: `0 0 15px ${gameState.cas[gameState.currentPlayerHouse]?.color || '#fff'}33`
                }}>
                    <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: gameState.cas[gameState.currentPlayerHouse]?.color }}>
                        ⚔️ Resolving {gameState.actionSubPhase === 'ConsolidatePower' ? 'Consolidate Power' : gameState.actionSubPhase}: {gameState.currentPlayerHouse}'s turn
                    </span>
                    <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '3px' }}>
                        Select an area with a {gameState.actionSubPhase} order to execute, or skip turn
                    </div>
                </div>
            )}
            {gameState.phase === 'Action' && gameState.actionSubPhase === 'Done' && (
                <div style={{
                    background: '#2a3a2a', padding: '12px 20px', borderRadius: '6px',
                    marginBottom: '10px', textAlign: 'center', border: '2px solid #4a4'
                }}>
                    <span style={{ fontSize: '1.1em', fontWeight: 'bold', color: '#8f8' }}>
                        ✅ All orders resolved — click "End Round" to advance
                    </span>
                </div>
            )}

            {/* ═══ INTERACTION BANNER ═══ */}
            {interaction.type !== 'NONE' && (
                <div style={{
                    background: '#d44', color: 'white', padding: '10px', textAlign: 'center',
                    borderRadius: '4px', marginBottom: '10px', fontWeight: 'bold'
                }}>
                    {interaction.type === 'MARCH_SELECT_UNITS' && (
                        <div>
                            🗡️ Select units from {interaction.fromAreaId}:
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', marginTop: '5px' }}>
                                {gameState.board[interaction.fromAreaId]?.units.map(u => (
                                    <label key={u.id} style={{ background: selectedUnitIds.includes(u.id) ? '#4a4' : '#666', padding: '3px 8px', borderRadius: '3px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={selectedUnitIds.includes(u.id)}
                                            onChange={(e) => setSelectedUnitIds(prev =>
                                                e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                                            )} style={{ marginRight: '4px' }} />
                                        {u.type}
                                    </label>
                                ))}
                            </div>
                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button onClick={handleConfirmUnitSelection} disabled={selectedUnitIds.length === 0}
                                    style={{ padding: '5px 15px', background: '#4a4', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Select Destination →
                                </button>
                                <button onClick={handleFinishMarch}
                                    style={{ padding: '5px 15px', background: '#888', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                    Finish March
                                </button>
                                <button onClick={() => { setInteraction({ type: 'NONE' }); setSelectedUnitIds([]); }}
                                    style={{ padding: '5px 15px', background: 'white', color: '#d44', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    {interaction.type === 'MARCH_SELECT_TO' && `🗡️ Click destination for ${interaction.unitIds.length} unit(s)`}
                    {interaction.type === 'RAID_SELECT_TO' && `🔥 Select Raid target from ${interaction.fromAreaId}`}
                    {(interaction.type === 'MARCH_SELECT_TO' || interaction.type === 'RAID_SELECT_TO') && (
                        <button onClick={() => { setInteraction({ type: 'NONE' }); setSelectedUnitIds([]); }}
                            style={{ marginLeft: '15px', padding: '3px 10px', background: 'white', color: '#d44', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    )}
                </div>
            )}

            {/* ═══ HEADER ═══ */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #2a3a5a', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 style={{ margin: 0, fontSize: '1.2em', color: '#d4af37' }}>⚔️ Game of Thrones</h1>
                    <button onClick={handleNewGame} style={{ padding: '3px 8px', background: '#333', color: '#999', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7em' }}>New Game</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {gameState.orderRestrictions && (
                        <span style={{ color: '#ff8', fontSize: '0.75em' }}>⚡ Banned: {gameState.orderRestrictions.join(', ')}</span>
                    )}
                    <span style={{ fontSize: '0.75em', color: '#aaa' }}>
                        🗡️ Blade: {bladeHolder}{gameState.valyrianSteelBladeUsed ? ' (used)' : ''}
                        {' | '}🐦 Raven: {ravenHolder}{gameState.messengerRavenUsed ? ' (used)' : ''}
                    </span>
                    <button onClick={handlePhaseAdvance}
                        disabled={!!gameState.winner || !!gameState.pendingPowerTokenArea || !!gameState.pendingMustering || !!gameState.pendingRetreat}
                        style={{
                            padding: '5px 12px',
                            background: gameState.winner ? '#555' : 'linear-gradient(135deg, #d4af37, #b8942e)',
                            border: 'none', borderRadius: '4px',
                            cursor: gameState.winner ? 'default' : 'pointer', fontWeight: 'bold',
                            color: '#1a1a2e', fontSize: '0.8em'
                        }}>
                        {gameState.phase === 'Action' && gameState.actionSubPhase === 'Done' ? 'End Round' : 'Next Phase / Skip'}
                    </button>
                </div>
            </header>

            {/* ═══ MAIN 3-COLUMN LAYOUT ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 260px', gap: '12px', minHeight: 'calc(100vh - 80px)' }}>
                {/* LEFT: Game Tracks */}
                <div style={{ background: '#12182a', padding: '10px', borderRadius: '8px', border: '1px solid #2a3a5a', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
                    <GameTracks gameState={gameState} />
                </div>

                {/* CENTER: Map */}
                <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
                    <GameBoard gameState={gameState} onAreaClick={handleAreaClick} selectedArea={selectedArea} />
                </div>

                {/* RIGHT: Area Details */}
                <div style={{ background: '#12182a', padding: '12px', borderRadius: '8px', border: '1px solid #2a3a5a', overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
                    <h3>Selected Area</h3>
                    {selectedArea && gameState.board[selectedArea] ? (() => {
                        const area = gameState.board[selectedArea];
                        const mapDef = INITIAL_MAP[selectedArea];
                        return (
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '1.15em', marginBottom: '4px' }}>{area.name}</div>

                                {/* Area Type & Properties */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 600,
                                        background: area.type === 'Sea' ? '#1a3a5a' : area.type === 'Port' ? '#2a3a4a' : '#2a3020',
                                        border: `1px solid ${area.type === 'Sea' ? '#3a6a9a' : area.type === 'Port' ? '#4a6a8a' : '#4a6040'}`,
                                        color: area.type === 'Sea' ? '#6af' : area.type === 'Port' ? '#8ac' : '#aea',
                                    }}>{area.type}</span>
                                    {mapDef?.stronghold && (
                                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 600, background: '#3a2a10', border: '1px solid #8a6a20', color: '#fa4' }}>🏰 Stronghold</span>
                                    )}
                                    {mapDef?.castle && !mapDef?.stronghold && (
                                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75em', fontWeight: 600, background: '#2a2a3a', border: '1px solid #5a5a8a', color: '#aaf' }}>🏠 Castle</span>
                                    )}
                                </div>

                                {/* Supply & Power icons */}
                                {(mapDef?.supply || mapDef?.power) && (
                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '6px', padding: '4px 8px', background: '#1a1a2a', borderRadius: '6px', border: '1px solid #2a2a4a' }}>
                                        {mapDef?.supply ? (
                                            <div style={{ fontSize: '0.85em' }}>
                                                <span style={{ color: '#a86' }}>🛢️ Supply:</span>{' '}
                                                <strong style={{ color: '#da8' }}>{mapDef.supply}</strong>
                                            </div>
                                        ) : null}
                                        {mapDef?.power ? (
                                            <div style={{ fontSize: '0.85em' }}>
                                                <span style={{ color: '#aa6' }}>👑 Power:</span>{' '}
                                                <strong style={{ color: '#fd6' }}>{mapDef.power}</strong>
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                {/* Mustering points */}
                                {(mapDef?.stronghold || mapDef?.castle) && (
                                    <div style={{ fontSize: '0.8em', color: '#8af', marginBottom: '4px' }}>
                                        ⚒️ Muster points: <strong>{mapDef?.stronghold ? 2 : 1}</strong>
                                    </div>
                                )}

                                {area.house && <div style={{ marginBottom: '2px' }}>Controller: <strong style={{ color: gameState.cas[area.house]?.color }}>{area.house}</strong></div>}
                                {gameState.garrisons[selectedArea] && (
                                    <div style={{ fontSize: '0.85em', color: '#8f8' }}>🛡️ Garrison +{gameState.garrisons[selectedArea].strength}</div>
                                )}

                                {/* Port Info */}
                                {(() => {
                                    const portId = getPortForArea(gameState, selectedArea!);
                                    if (!portId) return null;
                                    const port = gameState.board[portId];
                                    if (!port) return null;
                                    return (
                                        <div style={{ marginTop: '6px', padding: '6px', background: '#1a2a3a', borderRadius: '4px', border: '1px solid #3a5a7a' }}>
                                            <div style={{ fontSize: '0.85em', color: '#6af' }}>⚓ {port.name} ({port.units.length}/{port.maxShips ?? 3} ships)</div>
                                            {port.units.length > 0 && (
                                                <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '3px' }}>
                                                    {port.units.map((u, i) => (
                                                        <span key={i} style={{ marginRight: '8px' }}>
                                                            🚢 {u.type}
                                                            {area.house === gameState.currentPlayerHouse && gameState.phase === 'Action' && (
                                                                <button onClick={() => setGameState(prev => moveShipFromPort(prev, portId, u.id))}
                                                                    style={{ marginLeft: '4px', padding: '1px 5px', background: '#3a5a7a', color: 'white', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8em' }}>
                                                                    → Sea
                                                                </button>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {port.units.length === 0 && <div style={{ fontSize: '0.8em', color: '#666' }}>Empty</div>}
                                        </div>
                                    );
                                })()}

                                {area.units.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                        <strong>Units:</strong>
                                        <ul style={{ paddingLeft: '18px', margin: '3px 0' }}>
                                            {area.units.map((u, i) => <li key={i} style={{ fontSize: '0.9em' }}>{u.type}</li>)}
                                        </ul>
                                    </div>
                                )}

                                {area.order && (
                                    <div style={{ marginTop: '8px', color: 'gold' }}>
                                        <strong>Order:</strong> {area.order.type}
                                        {area.order.star && <span style={{ color: 'yellow' }}> ★</span>}
                                        {area.order.strength !== 0 && (
                                            <span style={{ color: area.order.strength > 0 ? '#8f8' : '#f88' }}>
                                                {' '}({area.order.strength > 0 ? '+' : ''}{area.order.strength})
                                            </span>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'March' && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'March' && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={handleExecuteMarch} style={actionBtnStyle}>Execute March</button>
                                            </div>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'Raid' && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'Raid' && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={handleExecuteRaid} style={actionBtnStyle}>Execute Raid</button>
                                            </div>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'ConsolidatePower' && area.order.star && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'ConsolidatePower' && (area.castle || area.stronghold) && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={() => handleCPStarMuster(selectedArea!)} style={{ ...actionBtnStyle, background: '#d4af37', color: 'black' }}>🏗️ CP★ Muster</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Order Token Placement */}
                                {gameState.phase === 'Planning' && area.house && area.units.length > 0 && (
                                    <div style={{ marginTop: '12px', borderTop: '1px solid #555', paddingTop: '8px' }}>
                                        <strong>Place Order:</strong>
                                        <div style={{ fontSize: '0.7em', color: '#aaa', marginBottom: '4px' }}>
                                            ★ Limit: {getStarLimit(gameState.turnOrder.length, gameState.cas[area.house].influence.kingsCourt)} (KC #{gameState.cas[area.house].influence.kingsCourt})
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px' }}>
                                            {getAvailableTokens().map(token => {
                                                const disabled = token.used || token.restricted || token.starLimitReached;
                                                return (
                                                    <button key={token.index} onClick={() => handlePlaceOrder(token.index)} disabled={disabled}
                                                        title={token.used ? 'Already placed' : token.restricted ? 'Banned' : token.starLimitReached ? 'Star limit reached' : token.label}
                                                        style={{
                                                            padding: '3px 2px', fontSize: '0.65em',
                                                            background: disabled ? '#222' : (token.star ? '#665500' : '#444'),
                                                            color: disabled ? '#555' : (token.star ? 'gold' : 'white'),
                                                            border: `1px solid ${disabled ? '#333' : (token.star ? 'gold' : '#666')}`,
                                                            cursor: disabled ? 'not-allowed' : 'pointer',
                                                            borderRadius: '3px', opacity: disabled ? 0.4 : 1,
                                                            textDecoration: (token.used || token.restricted) ? 'line-through' : 'none',
                                                        }}>
                                                        {token.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Adjacent Areas */}
                                <div style={{ marginTop: '12px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                                    <strong style={{ fontSize: '0.85em', color: '#999' }}>Adjacent:</strong>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                                        {area.adjacent.map(adjId => {
                                            const adj = gameState.board[adjId];
                                            if (!adj) return null;
                                            const adjMapDef = INITIAL_MAP[adjId];
                                            const isSea = adj.type === 'Sea';
                                            const isPort = adj.type === 'Port';
                                            return (
                                                <button
                                                    key={adjId}
                                                    onClick={(e) => { e.stopPropagation(); handleAreaClick(adjId); }}
                                                    style={{
                                                        padding: '2px 6px', fontSize: '0.65em', borderRadius: '4px', cursor: 'pointer',
                                                        background: isSea ? '#0a1a3a' : isPort ? '#1a2a3a' : '#1a2a1a',
                                                        border: `1px solid ${adj.house ? (gameState.cas[adj.house]?.color || '#555') : '#333'}`,
                                                        color: adj.house ? gameState.cas[adj.house]?.color : '#aaa',
                                                    }}
                                                    title={`${adj.name}${adjMapDef?.stronghold ? ' 🏰' : adjMapDef?.castle ? ' 🏠' : ''}${adj.house ? ` [${adj.house}]` : ''}`}
                                                >
                                                    {adj.name.length > 16 ? adj.name.slice(0, 14) + '…' : adj.name}
                                                    {adjMapDef?.stronghold ? ' 🏰' : adjMapDef?.castle ? ' 🏠' : ''}
                                                    {adj.units.length > 0 ? ` ⚔${adj.units.length}` : ''}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })() : (
                        <p style={{ color: '#888', fontSize: '0.9em' }}>Click anywhere on the map to select an area.</p>
                    )}

                </div>
            </div>
        </div>
    );
}

const actionBtnStyle: React.CSSProperties = {
    padding: '5px 10px', background: '#d44', color: 'white',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
};

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)', zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const modalBoxStyle: React.CSSProperties = {
    background: '#1a1a2a', padding: '25px', borderRadius: '12px',
    border: '2px solid #d4af37', maxWidth: '500px', width: '90%',
    boxShadow: '0 0 40px rgba(212,175,55,0.2)',
};

const cardButtonStyle: React.CSSProperties = {
    padding: '10px 14px', background: '#2a2a3a', border: '1px solid #555',
    borderRadius: '6px', cursor: 'pointer', color: '#eee', textAlign: 'left',
    fontSize: '0.9em', transition: 'all 0.15s',
};

export default App
