import React from 'react';
import { GameState } from '../game/types';
import { WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3 } from '../game/constants/westerosCards';

interface WesterosPhaseProps {
    gameState: GameState;
    onContinue: () => void;
    onDecision: (action: string) => void;
}

export const WesterosPhase: React.FC<WesterosPhaseProps> = ({ gameState, onContinue, onDecision }) => {
    // Current step is derived from Game Engine State now
    const currentStep = gameState.westerosActionIndex ?? 0;

    // Helper to find card text
    const getCardText = (name: string, deckIndex: number) => {
        const deck = [WESTEROS_DECK_1, WESTEROS_DECK_2, WESTEROS_DECK_3][deckIndex];
        const card = deck?.find(c => c.name === name);
        return card?.text || '';
    };

    // Decision UI
    if (gameState.pendingDecision) {
        const { chooser, options, cardName } = gameState.pendingDecision;
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 200,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'white'
            }}>
                <h2>❓ DECISION REQUIRED</h2>
                <div style={{
                    border: '2px solid gold', padding: '30px', borderRadius: '8px',
                    maxWidth: '500px', textAlign: 'center', backgroundColor: '#222',
                    boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)'
                }}>
                    <h3 style={{ color: '#ffd700', marginTop: 0 }}>{cardName}</h3>
                    <p style={{ fontSize: '1.2em' }}>
                        <strong>{chooser}</strong> must choose:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                        {options.map((opt, i) => (
                            <button
                                key={i}
                                onClick={() => onDecision(opt.action)}
                                style={{
                                    padding: '12px 20px', fontSize: '18px', cursor: 'pointer',
                                    backgroundColor: '#444', border: '1px solid #666', borderRadius: '4px',
                                    color: 'white', transition: 'background 0.2s',
                                    fontWeight: 'bold'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#666'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#444'}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // If we have a Wildling Card, show it primarily
    if (gameState.currentWildlingCard) {
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 200,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'white'
            }}>
                <h2>🐺 WILDLING ATTACK RESOLVED!</h2>
                <div style={{
                    border: '2px solid white', padding: '20px', borderRadius: '8px',
                    maxWidth: '400px', textAlign: 'center', backgroundColor: '#333'
                }}>
                    <h3>{gameState.currentWildlingCard.name}</h3>
                    <hr style={{ borderColor: '#666' }} />
                    <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#4caf50' }}>Winner (Highest Bidder):</strong><br />
                        {gameState.currentWildlingCard.highestBidderText}
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#f44336' }}>Loser (Lowest Bidder):</strong><br />
                        {gameState.currentWildlingCard.lowestBidderText}
                    </div>
                    <div>
                        <strong>Everyone Else:</strong><br />
                        {gameState.currentWildlingCard.everyoneElseText}
                    </div>
                </div>
                <button
                    onClick={onContinue}
                    style={{ marginTop: '20px', padding: '10px 20px', fontSize: '18px', cursor: 'pointer' }}
                >
                    Continue
                </button>
            </div>
        );
    }

    // Hide Westeros Phase UI if there are pending interactive events (Mustering, Bidding, etc.)
    if (gameState.pendingBidding || gameState.pendingMustering || gameState.pendingGameOfThrones || gameState.pendingPowerTokenArea || gameState.pendingRetreat) {
        return null;
    }

    // Westeros Cards Phase (Sequential View)
    if (gameState.phase === 'Westeros' && gameState.drawnWesterosCards) {
        if (currentStep >= gameState.drawnWesterosCards.length) {
            return (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 200,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white'
                }}>
                    <h2>Westeros Phase Complete</h2>
                    <button
                        onClick={onContinue}
                        style={{
                            padding: '12px 30px', fontSize: '18px', cursor: 'pointer',
                            backgroundColor: '#d4af37', border: 'none', borderRadius: '6px',
                            fontWeight: 'bold', color: '#1a1a1a'
                        }}
                    >
                        Finish Phase
                    </button>
                </div>
            );
        }

        const cardName = gameState.drawnWesterosCards[currentStep];
        const deckName = ['I', 'II', 'III'][currentStep];

        if (!cardName) return null;

        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 200,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'white'
            }}>
                <h2>Winter is Coming... (Round {gameState.round})</h2>

                <div style={{
                    width: '320px', height: '450px',
                    backgroundColor: '#1a1a1a', border: '3px solid gold',
                    borderRadius: '12px', padding: '20px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    boxShadow: '0 0 40px rgba(255, 215, 0, 0.2)',
                    marginTop: '20px', marginBottom: '30px',
                    animation: 'fadeIn 0.5s ease-in-out',
                    position: 'relative'
                }}>
                    {gameState.uiMessage && (
                        <div style={{
                            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
                            backgroundColor: '#ff9800', color: 'black', padding: '8px 16px', borderRadius: '20px',
                            fontWeight: 'bold', border: '2px solid white', whiteSpace: 'nowrap',
                            animation: 'bounce 0.5s'
                        }}>
                            {gameState.uiMessage}
                        </div>
                    )}

                    <h3 style={{ borderBottom: '2px solid gold', width: '100%', textAlign: 'center', paddingBottom: '10px', marginTop: 0, color: '#ffd700' }}>
                        Deck {deckName}
                    </h3>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        <h2 style={{ color: '#fff', fontSize: '1.6em', marginBottom: '20px' }}>{String(cardName)}</h2>
                        <div style={{ width: '80%', height: '2px', backgroundColor: '#444', marginBottom: '20px' }}></div>
                        <p style={{ fontSize: '1.2em', color: '#ddd', lineHeight: '1.5' }}>
                            {getCardText(String(cardName), currentStep)}
                        </p>
                    </div>

                    <div style={{ fontSize: '0.9em', color: '#666', marginTop: 'auto' }}>
                        Card {currentStep + 1} of 3
                    </div>
                </div>

                <button
                    onClick={onContinue}
                    style={{
                        padding: '12px 30px', fontSize: '18px', cursor: 'pointer',
                        backgroundColor: '#d4af37', border: 'none', borderRadius: '6px',
                        fontWeight: 'bold', color: '#1a1a1a',
                        boxShadow: '0 4px 10px rgba(212, 175, 55, 0.4)'
                    }}
                >
                    Resolve Card Effect
                </button>
            </div>
        );
    }

    return null;
};
