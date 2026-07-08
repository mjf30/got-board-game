import { useCallback, useEffect, useRef, useState } from 'react'
import { createInitialGameState } from './game/setup'
import { biddingParticipants, getPortForArea } from './game/engine'
import { GameAction, applyAction } from './net/actions'
import { NetSession } from './net/online'
import { UnitPickerModal } from './components/UnitPickerModal'
import { OnlineLobby } from './components/OnlineLobby'
import { GameBoard } from './components/GameBoard'
import { CombatUI } from './components/CombatUI'
import { SetupScreen } from './components/SetupScreen'
import { GameTracks } from './components/GameTracks'
import { WesterosPhase } from './components/WesterosPhase'
import { RetreatModal } from './components/RetreatModal'
import { GameState, HouseName, UnitType, ORDER_TOKENS, getStarLimit, MUSTER_COSTS } from './game/types'
import { INITIAL_MAP } from './game/constants/map'

type InteractionState =
    | { type: 'NONE' }
    | { type: 'MARCH_SELECT_UNITS', fromAreaId: string }
    | { type: 'MARCH_SELECT_TO', fromAreaId: string, unitIds: string[] }
    | { type: 'RAID_SELECT_TO', fromAreaId: string }
    | { type: 'RETREAT_SELECT_TO' };

type Screen = 'menu' | 'online' | 'game';

function App() {
    const [screen, setScreen] = useState<Screen>('menu');
    const [net, setNet] = useState<NetSession | null>(null);
    const netRef = useRef<NetSession | null>(null);
    const [gameState, setGameState] = useState(() => createInitialGameState(6));
    const [selectedArea, setSelectedArea] = useState<string | null>(null);
    const [interaction, setInteraction] = useState<InteractionState>({ type: 'NONE' });
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [bidAmounts, setBidAmounts] = useState<Record<string, number>>({});

    // ─── Dispatch: local applies directly; online guests send to the host ───
    const dispatch = useCallback((a: GameAction) => {
        const n = netRef.current;
        if (!n || n.isHost) {
            setGameState(prev => applyAction(prev, a));
        } else {
            n.sendAction(a);
        }
    }, []);

    // Host: apply guest actions; Guest: adopt broadcast state
    useEffect(() => {
        netRef.current = net;
        if (!net) return;
        if (net.isHost) {
            net.onAction = (a) => setGameState(prev => applyAction(prev, a));
        } else {
            net.onState = (s) => setGameState(s);
        }
    }, [net]);

    // Host: broadcast every state change
    useEffect(() => {
        if (net?.isHost && screen === 'game') net.broadcastState(gameState);
    }, [gameState, net, screen]);

    // ─── Permissions ───
    const myHouses = net ? net.myHouses() : null;
    const canAct = (house?: HouseName | null) => !myHouses || (!!house && myHouses.includes(house));
    const isHostOrLocal = !net || net.isHost;

    const handleStartGame = (playerCount: number) => {
        setGameState(createInitialGameState(playerCount));
        setNet(null);
        setScreen('game');
    };

    const handleOnlineStart = (session: NetSession, state: GameState) => {
        setNet(session);
        setGameState(state);
        setScreen('game');
    };

    const handleNewGame = () => {
        if (net) {
            net.leave();
            window.location.reload();
            return;
        }
        setScreen('menu');
        setSelectedArea(null);
        setInteraction({ type: 'NONE' });
        setSelectedUnitIds([]);
        setBidAmounts({});
    };

    if (screen === 'menu') {
        return <SetupScreen onStartGame={handleStartGame} onOnline={() => setScreen('online')} />;
    }
    if (screen === 'online') {
        return <OnlineLobby onGameStart={handleOnlineStart} onBack={() => setScreen('menu')} />;
    }

    // ─── Area Click Handler ────────────────────────
    const handleAreaClick = (areaId: string) => {
        if (gameState.winner || gameState.pendingPowerTokenArea || gameState.pendingMustering ||
            gameState.pendingUnitSelection || gameState.pendingBidTieBreak ||
            gameState.pendingReconcile || gameState.pendingRavenPeek) return;

        // Retreat destination selection
        if (interaction.type === 'RETREAT_SELECT_TO' && gameState.pendingRetreat) {
            if (gameState.pendingRetreat.possibleAreas.includes(areaId) && canAct(gameState.pendingRetreat.house)) {
                dispatch({ t: 'retreat', areaId });
                setInteraction({ type: 'NONE' });
            }
            return;
        }

        // March destination
        if (interaction.type === 'MARCH_SELECT_TO') {
            dispatch({ t: 'marchMove', fromAreaId: interaction.fromAreaId, toAreaId: areaId, unitIds: interaction.unitIds });
            setInteraction({ type: 'NONE' });
            setSelectedUnitIds([]);
            setSelectedArea(areaId);
            return;
        }

        // Raid target
        if (interaction.type === 'RAID_SELECT_TO') {
            dispatch({ t: 'raid', fromAreaId: interaction.fromAreaId, toAreaId: areaId });
            setInteraction({ type: 'NONE' });
            return;
        }

        setSelectedArea(areaId);
    };

    // ─── Phase Advance ─────────────────────────────
    const handlePhaseAdvance = () => {
        if (gameState.winner || gameState.pendingPowerTokenArea || gameState.pendingMustering ||
            gameState.pendingRetreat || gameState.pendingUnitSelection || gameState.pendingDecision ||
            gameState.pendingBidTieBreak || gameState.pendingReconcile ||
            gameState.pendingRavenPeek || gameState.pendingRavenSwap) return;
        if (!isHostOrLocal) return; // online: only the host paces the game
        dispatch({ t: 'phaseAdvance' });
    };

    // ─── Order Placement ───────────────────────────
    const handlePlaceOrder = (tokenIndex: number) => {
        if (!selectedArea) return;
        const area = gameState.board[selectedArea];
        if (!area.house) return;
        // During the Messenger Raven step, placing a token means swapping via the raven
        if (gameState.pendingRavenSwap) {
            if (!canAct(gameState.pendingRavenSwap.holder)) return;
            dispatch({ t: 'ravenSwap', areaId: selectedArea, tokenIndex });
            return;
        }
        if (!canAct(area.house)) return;
        dispatch({ t: 'placeOrder', areaId: selectedArea, house: area.house!, tokenIndex });
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
            dispatch({ t: 'finishMarch', fromAreaId: interaction.fromAreaId });
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
        if (!canAct(house)) return;
        dispatch({ t: 'selectCard', house, cardId });
    };

    const handleResolveCombat = () => {
        const c = gameState.combat;
        if (!c) return;
        if (!canAct(c.attacker) && !canAct(c.defender)) return;
        dispatch({ t: 'resolveCombat' });
    };

    // ─── Valyrian Steel Blade ──────────────────────
    const handleUseBlade = () => {
        dispatch({ t: 'useBlade' });
    };

    // ─── Mustering ─────────────────────────────────
    const handleMuster = (areaId: string, unitType: UnitType) => {
        dispatch({ t: 'muster', areaId, unitType });
    };

    const handleSkipMustering = (areaId: string) => {
        dispatch({ t: 'skipMuster', areaId });
    };

    // ─── Bidding ──────────────────────────────────────────────
    const handleSubmitBid = (house: HouseName) => {
        if (!canAct(house)) return;
        const amount = bidAmounts[house] ?? 0;
        dispatch({ t: 'bid', house, amount });
    };

    const handleResolveBids = () => {
        dispatch({ t: 'resolveBids' });
        setBidAmounts({});
    };

    // ─── CP★ Mustering ────────────────────────────────────────
    const handleCPStarMuster = (areaId: string) => {
        dispatch({ t: 'cpStarMuster', areaId });
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

    // Online: orders are placed facedown — hide other players' orders during Planning
    const concealOrdersOf: HouseName[] =
        myHouses && gameState.phase === 'Planning' && !gameState.ravenPromptShown && !gameState.pendingRavenSwap
            ? gameState.turnOrder.filter(h => !myHouses.includes(h))
            : [];

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
                        {canAct(gameState.board[gameState.pendingPowerTokenArea]?.house) ? (
                            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
                                <button onClick={() => dispatch({ t: 'powerToken', keep: true })}
                                    disabled={gameState.board[gameState.pendingPowerTokenArea]?.house ? gameState.cas[gameState.board[gameState.pendingPowerTokenArea].house!].power <= 0 : true}
                                    style={{ padding: '8px 20px', background: '#4a4', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    💰 Yes, spend 1
                                </button>
                                <button onClick={() => dispatch({ t: 'powerToken', keep: false })}
                                    style={{ padding: '8px 20px', background: '#a44', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    ❌ No, lose it
                                </button>
                            </div>
                        ) : (
                            <div style={{ color: '#aaa', marginTop: '10px' }}>Aguardando {gameState.board[gameState.pendingPowerTokenArea]?.house}…</div>
                        )}
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
                            <div key={m.areaId} style={{ background: '#333', padding: '10px', borderRadius: '6px', marginBottom: '10px', opacity: canAct(m.house) ? 1 : 0.55 }}>
                                <div style={{ fontWeight: 'bold', color: gameState.cas[m.house].color }}>
                                    {gameState.board[m.areaId].name} ({m.house}) — {m.pointsRemaining} point(s)
                                    {!canAct(m.house) && <span style={{ color: '#888', fontWeight: 'normal', fontSize: '0.8em' }}> — aguardando {m.house}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                                    {(['Footman', 'Knight', 'SiegeEngine', 'Ship'] as UnitType[]).map(unitType => {
                                        const cost = MUSTER_COSTS[unitType];
                                        const available = gameState.cas[m.house].availableUnits[unitType] > 0;
                                        const affordable = cost <= m.pointsRemaining;
                                        const canPlace = available && affordable && canAct(m.house);
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
                                    {/* Upgrade Footman → Knight / Siege Engine (1 muster point each) */}
                                    {gameState.board[m.areaId].units.filter(u => u.type === 'Footman' && u.house === m.house).length > 0 &&
                                     m.pointsRemaining >= 1 && canAct(m.house) && (
                                        <>
                                            {gameState.cas[m.house].availableUnits.Knight > 0 && (
                                                <button
                                                    onClick={() => dispatch({ t: 'upgradeFootman', areaId: m.areaId, to: 'Knight' })}
                                                    style={{
                                                        padding: '4px 8px', fontSize: '0.8em',
                                                        background: '#a86f32', color: 'white',
                                                        border: '1px solid #c9873c', borderRadius: '3px',
                                                        cursor: 'pointer'
                                                    }}>
                                                    ⬆ Knight (1pt)
                                                </button>
                                            )}
                                            {gameState.cas[m.house].availableUnits.SiegeEngine > 0 && (
                                                <button
                                                    onClick={() => dispatch({ t: 'upgradeFootman', areaId: m.areaId, to: 'SiegeEngine' })}
                                                    style={{
                                                        padding: '4px 8px', fontSize: '0.8em',
                                                        background: '#6f5a32', color: 'white',
                                                        border: '1px solid #9c823c', borderRadius: '3px',
                                                        cursor: 'pointer'
                                                    }}>
                                                    ⬆ Cerco (1pt)
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {canAct(m.house) && (
                                        <button onClick={() => handleSkipMustering(m.areaId)}
                                            style={{ padding: '4px 8px', fontSize: '0.8em', background: '#555', color: '#ddd', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                            Skip
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isHostOrLocal && (
                            <button onClick={() => dispatch({ t: 'skipAllMuster' })}
                                style={{ padding: '6px 15px', background: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '5px' }}>
                                Skip All Mustering
                            </button>
                        )}
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
                                ? `🐺 Wildling Attack! (Força: ${gameState.pendingBidding.strengthOverride ?? gameState.wildlingThreat})`
                                : `👑 Clash of Kings: ${gameState.pendingBidding.currentTrack === 'ironThrone' ? 'Iron Throne' : gameState.pendingBidding.currentTrack === 'fiefdoms' ? 'Fiefdoms' : "King's Court"}`}
                        </h3>
                        <p style={{ fontSize: '0.85em', color: '#aaa', margin: '0 0 12px' }}>
                            {gameState.pendingBidding.type === 'wildling'
                                ? 'Todos lançam Power tokens. A soma deve IGUALAR ou exceder a força Wildling.'
                                : 'Each house bids Power tokens. Highest bidder gets position #1.'}
                            {gameState.pendingBidding.excludedHouses?.length ? (
                                <span style={{ color: '#f88' }}> (Não participa: {gameState.pendingBidding.excludedHouses.join(', ')})</span>
                            ) : null}
                        </p>
                        {biddingParticipants(gameState).map(house => {
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
                                        canAct(house) ? (
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
                                            <span style={{ color: '#888', fontSize: '0.85em' }}>aguardando…</span>
                                        )
                                    ) : (
                                        // Bids are secret: only reveal your own amount until everyone has bid
                                        <span style={{ color: '#8f8', fontWeight: 'bold' }}>
                                            {(!myHouses || canAct(house)) ? `✓ Bid: ${gameState.pendingBidding!.bids[house]}` : '✓ apostou'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        {biddingParticipants(gameState).every(h => gameState.pendingBidding!.bids[h] !== undefined) && (
                            <button onClick={handleResolveBids}
                                style={{ marginTop: '10px', padding: '8px 20px', background: '#d4af37', color: 'black', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>
                                Resolve Bids
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ BID TIE-BREAK (Iron Throne holder decides) ═══ */}
            {gameState.pendingBidTieBreak && (
                <div style={{ ...modalOverlayStyle, zIndex: 460 }}>
                    <div style={modalBoxStyle}>
                        <h2 style={{ color: '#d4af37', margin: '0 0 10px', textAlign: 'center' }}>👑 Empate no lance</h2>
                        <p style={{ textAlign: 'center', color: '#ccc' }}>
                            <strong style={{ color: gameState.cas[gameState.pendingBidTieBreak.decider]?.color }}>
                                {gameState.pendingBidTieBreak.decider}
                            </strong> (Trono de Ferro) decide{' '}
                            {gameState.pendingBidTieBreak.kind === 'track' ? 'quem fica com a melhor posição' :
                             gameState.pendingBidTieBreak.kind === 'wildling-high' ? 'quem é o MAIOR lançador' :
                             'quem é o MENOR lançador'}:
                        </p>
                        {canAct(gameState.pendingBidTieBreak.decider) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                {gameState.pendingBidTieBreak.tiedHouses.map(h => (
                                    <button key={h}
                                        onClick={() => dispatch({ t: 'tieBreak', house: h })}
                                        style={{ ...cardButtonStyle, borderColor: gameState.cas[h]?.color }}>
                                        <span style={{ color: gameState.cas[h]?.color, fontWeight: 'bold' }}>{h}</span>
                                        <span style={{ color: '#aaa', marginLeft: '8px' }}>
                                            (lance: {gameState.pendingBidding?.bids[h] ?? 0})
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#aaa' }}>Aguardando {gameState.pendingBidTieBreak.decider}…</div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ UNIT SELECTION (casualties, destruction, upgrades) ═══ */}
            {gameState.pendingUnitSelection && canAct(gameState.pendingUnitSelection.house) && (
                <UnitPickerModal
                    key={gameState.pendingUnitSelection.eligibleUnitIds.join(',') + gameState.pendingUnitSelection.purpose}
                    gameState={gameState}
                    onConfirm={(unitIds) => dispatch({ t: 'unitSelection', unitIds })}
                />
            )}
            {gameState.pendingUnitSelection && !canAct(gameState.pendingUnitSelection.house) && (
                <div style={{ ...modalOverlayStyle, zIndex: 400 }}>
                    <div style={{ ...modalBoxStyle, textAlign: 'center' }}>
                        <h3 style={{ color: '#d4af37' }}>⏳ Aguardando {gameState.pendingUnitSelection.house}</h3>
                        <p style={{ color: '#aaa' }}>{gameState.pendingUnitSelection.prompt}</p>
                    </div>
                </div>
            )}

            {/* ═══ SUPPLY RECONCILIATION ═══ */}
            {gameState.pendingReconcile && gameState.pendingReconcile.length > 0 && !gameState.pendingUnitSelection && (
                <div style={{ ...modalOverlayStyle, zIndex: 380 }}>
                    <div style={{ ...modalBoxStyle, maxWidth: '560px', maxHeight: '80vh', overflow: 'auto' }}>
                        <h2 style={{ color: '#d4af37', margin: '0 0 10px', textAlign: 'center' }}>📦 Reconciliar Exércitos</h2>
                        <p style={{ textAlign: 'center', color: '#ccc', fontSize: '0.9em' }}>
                            Os exércitos abaixo excedem o limite de suprimento. Clique nas unidades para destruí-las.
                        </p>
                        {gameState.pendingReconcile.map(entry => (
                            <div key={entry.house} style={{ marginBottom: '12px' }}>
                                <div style={{ color: gameState.cas[entry.house]?.color, fontWeight: 'bold' }}>{entry.house}</div>
                                {entry.violations.map(v => (
                                    <div key={v.areaId} style={{ background: '#252535', padding: '8px 10px', borderRadius: '6px', marginTop: '6px' }}>
                                        <div style={{ color: '#aaa', fontSize: '0.85em' }}>
                                            {gameState.board[v.areaId]?.name}: {v.currentSize} unidades (máx {v.maxAllowed})
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '5px' }}>
                                            {gameState.board[v.areaId]?.units.map((u, i) => (
                                                <button key={u.id}
                                                    disabled={!canAct(entry.house)}
                                                    onClick={() => canAct(entry.house) && dispatch({ t: 'reconcile', house: entry.house, areaId: v.areaId, unitIndex: i })}
                                                    style={{
                                                        padding: '4px 10px', borderRadius: '4px',
                                                        cursor: canAct(entry.house) ? 'pointer' : 'not-allowed',
                                                        background: canAct(entry.house) ? '#5a2a2a' : '#333',
                                                        border: '1px solid #a44', color: canAct(entry.house) ? 'white' : '#777', fontSize: '0.85em'
                                                    }}>
                                                    🗑️ {u.type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ MESSENGER RAVEN — PEEK WILDLING CARD (only the holder sees it) ═══ */}
            {gameState.pendingRavenPeek && (
                <div style={{ ...modalOverlayStyle, zIndex: 460 }}>
                    <div style={modalBoxStyle}>
                        <h2 style={{ color: '#d4af37', margin: '0 0 10px', textAlign: 'center' }}>🐦 Carta Wildling do topo</h2>
                        {canAct(gameState.pendingRavenPeek.holder) ? (<>
                            <div style={{ background: '#252535', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                                <h3 style={{ margin: '0 0 8px', textAlign: 'center' }}>{gameState.pendingRavenPeek.card.name}</h3>
                                <p style={{ fontSize: '0.8em', color: '#8f8' }}><strong>Vitória (maior lance):</strong> {gameState.pendingRavenPeek.card.highestBidderText}</p>
                                <p style={{ fontSize: '0.8em', color: '#f88' }}><strong>Derrota (menor lance):</strong> {gameState.pendingRavenPeek.card.lowestBidderText}</p>
                                <p style={{ fontSize: '0.8em', color: '#ccc' }}><strong>Demais:</strong> {gameState.pendingRavenPeek.card.everyoneElseText}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => dispatch({ t: 'ravenPeek', placement: 'top' })}
                                    style={{ ...actionBtnStyle, background: '#4a4', flex: 1 }}>
                                    Devolver ao topo
                                </button>
                                <button onClick={() => dispatch({ t: 'ravenPeek', placement: 'bottom' })}
                                    style={{ ...actionBtnStyle, background: '#a44', flex: 1 }}>
                                    Enterrar no fundo
                                </button>
                            </div>
                        </>) : (
                            <div style={{ textAlign: 'center', color: '#aaa' }}>
                                {gameState.pendingRavenPeek.holder} está espiando o baralho Wildling…
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ MESSENGER RAVEN — SWAP ORDER BANNER ═══ */}
            {gameState.pendingRavenSwap && (
                <div style={{
                    background: 'linear-gradient(90deg, #3a2a5a, #2a2a4a)', padding: '10px 16px',
                    borderRadius: '6px', marginBottom: '10px', textAlign: 'center',
                    border: '2px solid #d4af37', color: '#eee'
                }}>
                    🐦 <strong style={{ color: gameState.cas[gameState.pendingRavenSwap.holder]?.color }}>
                        {gameState.pendingRavenSwap.holder}
                    </strong>: selecione uma área sua e escolha o novo token para trocar a ordem.
                    {canAct(gameState.pendingRavenSwap.holder) && (
                        <button onClick={() => dispatch({ t: 'skipRavenSwap' })}
                            style={{ marginLeft: '12px', padding: '3px 10px', background: '#555', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                            Cancelar (não usar)
                        </button>
                    )}
                </div>
            )}

            {/* ═══ UI MESSAGE (e.g. mandatory orders) ═══ */}
            {gameState.uiMessage && gameState.phase === 'Planning' && (
                <div style={{
                    background: '#5a3a1a', padding: '8px 14px', borderRadius: '6px',
                    marginBottom: '10px', textAlign: 'center', color: '#fd6', border: '1px solid #a86'
                }}>
                    {gameState.uiMessage}
                </div>
            )}

            {/* ═══ VALYRIAN STEEL BLADE ═══ */}
            {gameState.combat && !gameState.valyrianSteelBladeUsed && canAct(bladeHolder) && (
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
                myHouses={myHouses}
                canContinue={isHostOrLocal}
                onContinue={() => {
                    if (!isHostOrLocal) return;
                    dispatch({ t: 'westerosContinue' });
                }}
                onDecision={(action) => {
                    dispatch({ t: 'decision', action });
                }}
            />

            {/* ═══ COMBAT UI ═══ */}
            <CombatUI
                gameState={gameState}
                myHouses={myHouses}
                onCardSelect={handleCardSelect}
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
                            {canAct(current.house) ? (
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
                                    {current.house !== pending.defender && (
                                        <button onClick={() => dispatch({ t: 'declareSupport', areaId: current.areaId, choice: 'attacker' })}
                                            style={{ ...actionBtnStyle, background: gameState.cas[pending.attacker]?.color || '#d44' }}>
                                            Support {pending.attacker}
                                        </button>
                                    )}
                                    {current.house !== pending.attacker && (
                                        <button onClick={() => dispatch({ t: 'declareSupport', areaId: current.areaId, choice: 'defender' })}
                                            style={{ ...actionBtnStyle, background: gameState.cas[pending.defender]?.color || '#44d' }}>
                                            Support {pending.defender}
                                        </button>
                                    )}
                                    <button onClick={() => dispatch({ t: 'declareSupport', areaId: current.areaId, choice: 'none' })}
                                        style={{ ...actionBtnStyle, background: '#555' }}>
                                        Refuse
                                    </button>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#aaa', marginTop: '15px' }}>Aguardando {current.house}…</div>
                            )}
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
                            {canAct(house) ? (<>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                    {otherCards.map(card => (
                                        <button key={card.id}
                                            onClick={() => dispatch({ t: 'aeronSwap', cardId: card.id })}
                                            style={{ ...cardButtonStyle, borderColor: '#6af' }}>
                                            <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                            <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                            {card.swords ? <span style={{ marginLeft: '6px' }}>🗡️×{card.swords}</span> : null}
                                            {card.fortifications ? <span style={{ marginLeft: '6px' }}>🛡️×{card.fortifications}</span> : null}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => dispatch({ t: 'aeronSwap', cardId: null })}
                                    style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                    Decline (keep Aeron)
                                </button>
                            </>) : (
                                <div style={{ textAlign: 'center', color: '#aaa' }}>Aguardando {house}…</div>
                            )}
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
                            {canAct(opponent) ? (<>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                    {otherCards.map(card => (
                                        <button key={card.id}
                                            onClick={() => dispatch({ t: 'tyrionPick', cardId: card.id })}
                                            style={{ ...cardButtonStyle, borderColor: '#c4a' }}>
                                            <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                            <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                            {card.swords ? <span style={{ marginLeft: '6px' }}>🗡️×{card.swords}</span> : null}
                                            {card.fortifications ? <span style={{ marginLeft: '6px' }}>🛡️×{card.fortifications}</span> : null}
                                        </button>
                                    ))}
                                </div>
                                {otherCards.length === 0 && (
                                    <button onClick={() => dispatch({ t: 'tyrionPick', cardId: null })}
                                        style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                        No other cards — continue
                                    </button>
                                )}
                            </>) : (
                                <div style={{ textAlign: 'center', color: '#aaa' }}>Aguardando {opponent}…</div>
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
                            {canAct(baratheonPlayer) ? (<>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                    {opponentCards.map(card => (
                                        <button key={card.id}
                                            onClick={() => dispatch({ t: 'patchface', cardId: card.id })}
                                            style={{ ...cardButtonStyle, borderColor: '#f8a' }}>
                                            <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                                            <span style={{ color: '#d4af37', marginLeft: '8px' }}>Str: {card.strength}</span>
                                            {card.text && <div style={{ fontSize: '0.7em', color: '#888', fontStyle: 'italic', marginTop: '3px' }}>{card.text}</div>}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => dispatch({ t: 'patchface', cardId: null })}
                                    style={{ ...actionBtnStyle, background: '#555', width: '100%' }}>
                                    Decline (discard nothing)
                                </button>
                            </>) : (
                                <div style={{ textAlign: 'center', color: '#aaa' }}>Aguardando {baratheonPlayer}…</div>
                            )}
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
                            {canAct(robbPlayer) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '12px 0' }}>
                                    {possibleAreas.map(areaId => (
                                        <button key={areaId}
                                            onClick={() => dispatch({ t: 'robbRetreat', areaId })}
                                            style={{ ...cardButtonStyle, borderColor: '#6c6' }}>
                                            {gameState.board[areaId]?.name || areaId}
                                            {gameState.pendingRobbRetreat?.lossByArea?.[areaId] ? (
                                                <span style={{ color: '#f88', marginLeft: '8px', fontSize: '0.8em' }}>
                                                    (-{gameState.pendingRobbRetreat.lossByArea[areaId]} por suprimento)
                                                </span>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#aaa' }}>Aguardando {robbPlayer}…</div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ═══ RETREAT UI ═══ */}
            <RetreatModal
                gameState={gameState}
                onResolve={(areaId) => {
                    if (!canAct(gameState.pendingRetreat?.house)) return;
                    dispatch({ t: 'retreat', areaId });
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
                    {interaction.type === 'RAID_SELECT_TO' && (
                        <button onClick={() => {
                            const fromId = interaction.fromAreaId;
                            dispatch({ t: 'raidNoEffect', fromAreaId: fromId });
                            setInteraction({ type: 'NONE' });
                        }}
                            style={{ marginLeft: '15px', padding: '3px 10px', background: '#888', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                            Remover sem efeito
                        </button>
                    )}
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
                    {net && (
                        <span style={{ fontSize: '0.7em', color: '#9cf', border: '1px solid #3a5a7a', borderRadius: '4px', padding: '2px 6px' }}>
                            🌐 Sala {net.roomCode} — você: {myHouses && myHouses.length > 0 ? myHouses.join(', ') : 'espectador'}{net.isHost ? ' (host)' : ''}
                        </span>
                    )}
                    <button onClick={handleNewGame} style={{ padding: '3px 8px', background: '#333', color: '#999', border: '1px solid #555', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7em' }}>{net ? 'Sair da sala' : 'New Game'}</button>
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
                    <GameBoard gameState={gameState} onAreaClick={handleAreaClick} selectedArea={selectedArea} concealOrdersOf={concealOrdersOf} />
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
                                                        <span key={i} style={{ marginRight: '8px' }}>🚢 {u.type}</span>
                                                    ))}
                                                    <div style={{ fontSize: '0.9em', color: '#678', marginTop: '2px' }}>
                                                        (navios saem do porto com uma ordem de Marcha no porto)
                                                    </div>
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

                                {area.order && concealOrdersOf.includes(area.order.house) && (
                                    <div style={{ marginTop: '8px', color: '#889' }}>
                                        <strong>Order:</strong> 🎴 oculta
                                    </div>
                                )}
                                {area.order && !concealOrdersOf.includes(area.order.house) && (
                                    <div style={{ marginTop: '8px', color: 'gold' }}>
                                        <strong>Order:</strong> {area.order.type}
                                        {area.order.star && <span style={{ color: 'yellow' }}> ★</span>}
                                        {area.order.strength !== 0 && (
                                            <span style={{ color: area.order.strength > 0 ? '#8f8' : '#f88' }}>
                                                {' '}({area.order.strength > 0 ? '+' : ''}{area.order.strength})
                                            </span>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'March' && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'March' && canAct(gameState.currentPlayerHouse) && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={handleExecuteMarch} style={actionBtnStyle}>Execute March</button>
                                            </div>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'Raid' && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'Raid' && canAct(gameState.currentPlayerHouse) && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={handleExecuteRaid} style={actionBtnStyle}>Execute Raid</button>
                                            </div>
                                        )}
                                        {gameState.phase === 'Action' && area.order.type === 'ConsolidatePower' && area.order.star && area.house === gameState.currentPlayerHouse && gameState.actionSubPhase === 'ConsolidatePower' && (area.castle || area.stronghold) && canAct(gameState.currentPlayerHouse) && (
                                            <div style={{ marginTop: '5px' }}>
                                                <button onClick={() => handleCPStarMuster(selectedArea!)} style={{ ...actionBtnStyle, background: '#d4af37', color: 'black' }}>🏗️ CP★ Muster</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Order Token Placement */}
                                {gameState.phase === 'Planning' && area.house && area.units.length > 0 && canAct(area.house) && (
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
