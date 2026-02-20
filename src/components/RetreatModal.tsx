import React from 'react';
import { GameState } from '../game/types';

interface RetreatModalProps {
    gameState: GameState;
    onResolve: (areaId: string) => void;
}

export const RetreatModal: React.FC<RetreatModalProps> = ({ gameState, onResolve }) => {
    const { pendingRetreat } = gameState;
    if (!pendingRetreat) return null;

    const { house, possibleAreas, fromAreaId } = pendingRetreat;
    const fromAreaName = gameState.board[fromAreaId]?.name;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300
        }}>
            <div style={{
                backgroundColor: '#1a1a2e',
                color: '#eee',
                padding: '30px',
                borderRadius: '12px',
                border: `2px solid ${gameState.cas[house].color}`,
                maxWidth: '500px',
                width: '90%',
                textAlign: 'center',
                boxShadow: '0 0 30px rgba(0,0,0,0.5)'
            }}>
                <h2 style={{ color: '#d4af37', marginTop: 0 }}>⚠️ RETREAT REQUIRED</h2>

                <p style={{ fontSize: '1.1em', marginBottom: '20px' }}>
                    <strong>{house}</strong> units in <strong>{fromAreaName}</strong> have been defeated!
                </p>

                <p>Choose where to retreat your survivors (they will be routed):</p>

                <div style={{ display: 'grid', gap: '10px', marginTop: '20px' }}>
                    {possibleAreas.map(areaId => {
                        const area = gameState.board[areaId];
                        return (
                            <button
                                key={areaId}
                                onClick={() => onResolve(areaId)}
                                style={{
                                    padding: '12px',
                                    backgroundColor: '#2a2a40',
                                    border: '1px solid #444',
                                    borderRadius: '6px',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '1em',
                                    transition: 'background 0.2s',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = '#3a3a55'}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = '#2a2a40'}
                            >
                                <span>{area.name}</span>
                                <span style={{ fontSize: '0.8em', color: '#aaa' }}>
                                    {area.house ? `(${area.house})` : '(Empty)'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
