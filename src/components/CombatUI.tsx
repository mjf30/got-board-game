import React from 'react';
import { GameState, HouseName } from '../game/types';

interface CombatUIProps {
    gameState: GameState;
    onCardSelect: (house: HouseName, cardId: string) => void;
    onResolveCombat: () => void;
}

export const CombatUI: React.FC<CombatUIProps> = ({ gameState, onCardSelect, onResolveCombat }) => {
    const { combat } = gameState;
    if (!combat) return null;

    const { attacker, defender, attackerStrength, defenderStrength, attackerCard, defenderCard } = combat;

    // Use PLAYER'S CURRENT HAND — not all cards
    const attackerHand = gameState.cas[attacker].cards;
    const defenderHand = gameState.cas[defender].cards;
    const bothSelected = !!attackerCard && !!defenderCard;

    const renderCardButton = (card: typeof attackerHand[0], house: HouseName, isSelected: boolean, isDisabled: boolean) => (
        <button
            key={card.id}
            disabled={isDisabled}
            onClick={() => onCardSelect(house, card.id)}
            style={{
                padding: '8px 10px', background: isSelected ? 'rgba(212,175,55,0.2)' : '#2a2a2a',
                border: isSelected ? '2px solid #d4af37' : '1px solid #444',
                borderRadius: '6px', cursor: isDisabled ? 'default' : 'pointer',
                textAlign: 'left', minWidth: '140px', transition: 'all 0.15s',
                opacity: isDisabled && !isSelected ? 0.5 : 1
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#eee', fontSize: '0.85em', fontWeight: 'bold' }}>{card.name}</span>
                <span style={{ color: '#d4af37', fontSize: '1.2em', fontWeight: 'bold' }}>{card.strength}</span>
            </div>
            <div style={{ fontSize: '0.7em', color: '#888', marginTop: '3px', display: 'flex', gap: '8px' }}>
                {(card.swords ?? 0) > 0 && <span>🗡️×{card.swords}</span>}
                {(card.fortifications ?? 0) > 0 && <span>🛡️×{card.fortifications}</span>}
            </div>
            {card.text && <div style={{ fontSize: '0.65em', color: '#666', marginTop: '3px', fontStyle: 'italic' }}>{card.text}</div>}
        </button>
    );

    const sideStyle = (color: string): React.CSSProperties => ({
        width: '48%', background: `linear-gradient(180deg, ${color}15, transparent)`,
        borderRadius: '8px', padding: '12px', border: `1px solid ${color}44`
    });

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: '#1a1a2a', padding: '25px', borderRadius: '12px',
                border: '2px solid #d4af37', maxWidth: '700px', width: '95%',
                boxShadow: '0 0 40px rgba(212,175,55,0.15)'
            }}>
                <h2 style={{ textAlign: 'center', color: '#d4af37', margin: '0 0 5px', fontSize: '1.3em' }}>
                    ⚔️ COMBAT — {gameState.board[combat.areaId]?.name}
                </h2>

                {/* Strength Summary */}
                <div style={{
                    display: 'flex', justifyContent: 'space-around', marginBottom: '15px',
                    padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: gameState.cas[attacker].color, fontWeight: 'bold' }}>{attacker}</div>
                        <div style={{ fontSize: '1.8em', color: '#fff' }}>{attackerStrength}</div>
                        <div style={{ fontSize: '0.7em', color: '#888' }}>+ card strength</div>
                    </div>
                    <div style={{ color: '#d4af37', fontSize: '2em', display: 'flex', alignItems: 'center' }}>VS</div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ color: gameState.cas[defender].color, fontWeight: 'bold' }}>{defender}</div>
                        <div style={{ fontSize: '1.8em', color: '#fff' }}>{defenderStrength}</div>
                        <div style={{ fontSize: '0.7em', color: '#888' }}>+ card strength</div>
                    </div>
                </div>

                {/* Card Selection */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={sideStyle(gameState.cas[attacker].color)}>
                        <h4 style={{ margin: '0 0 8px', color: gameState.cas[attacker].color, fontSize: '0.85em' }}>
                            ATTACKER — {attacker} ({attackerHand.length} cards)
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {attackerHand.map(card =>
                                renderCardButton(card, attacker, attackerCard === card.id, !!attackerCard)
                            )}
                        </div>
                    </div>

                    <div style={sideStyle(gameState.cas[defender].color)}>
                        <h4 style={{ margin: '0 0 8px', color: gameState.cas[defender].color, fontSize: '0.85em' }}>
                            DEFENDER — {defender} ({defenderHand.length} cards)
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {defenderHand.map(card =>
                                renderCardButton(card, defender, defenderCard === card.id, !!defenderCard)
                            )}
                        </div>
                    </div>
                </div>

                {/* Resolve Button */}
                {bothSelected && (
                    <button onClick={onResolveCombat} style={{
                        width: '100%', marginTop: '15px', padding: '12px',
                        background: 'linear-gradient(135deg, #d4af37, #b8942e)',
                        color: '#1a1a1a', border: 'none', borderRadius: '6px',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '1em',
                        letterSpacing: '1px'
                    }}>
                        ⚔️ RESOLVE COMBAT
                    </button>
                )}
            </div>
        </div>
    );
};
