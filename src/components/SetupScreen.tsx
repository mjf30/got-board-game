import React, { useState } from 'react';
import { HouseName } from '../game/types';

interface SetupScreenProps {
    onStartGame: (playerCount: number) => void;
}

const HOUSES: { name: HouseName; color: string; sigil: string; words: string; desc: string }[] = [
    { name: 'Stark', color: '#8899aa', sigil: '🐺', words: 'Winter Is Coming', desc: 'The North — Defensive position, strong cards' },
    { name: 'Lannister', color: '#c8102e', sigil: '🦁', words: 'Hear Me Roar', desc: 'The Westerlands — Rich in gold and intrigue' },
    { name: 'Baratheon', color: '#f5c518', sigil: '🦌', words: 'Ours Is the Fury', desc: 'Dragonstone — Naval power, strategic position' },
    { name: 'Greyjoy', color: '#2d5a27', sigil: '🐙', words: 'We Do Not Sow', desc: 'The Iron Islands — Naval dominance' },
    { name: 'Tyrell', color: '#4a8c3f', sigil: '🌹', words: 'Growing Strong', desc: 'The Reach — Abundant supply and mustering' },
    { name: 'Martell', color: '#e87511', sigil: '☀️', words: 'Unbowed, Unbent, Unbroken', desc: 'Dorne — Isolated, strong defense' },
];

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartGame }) => {
    const [playerCount, setPlayerCount] = useState(6);

    const activeHouses = HOUSES.slice(0, playerCount);
    const neutralHouses = HOUSES.slice(playerCount);

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 40%, #0a0a2a 100%)',
            fontFamily: "'Cinzel', 'Georgia', serif"
        }}>
            <div style={{ maxWidth: '750px', width: '100%', padding: '30px' }}>
                {/* Title */}
                <div style={{ textAlign: 'center', marginBottom: '35px' }}>
                    <div style={{ fontSize: '2.8em', fontWeight: 'bold', color: '#d4af37', textShadow: '0 0 30px rgba(212,175,55,0.3)', letterSpacing: '2px' }}>
                        ⚔️ A Game of Thrones
                    </div>
                    <div style={{ fontSize: '1em', color: '#8899aa', marginTop: '6px', fontFamily: 'Inter, sans-serif', letterSpacing: '3px', textTransform: 'uppercase' }}>
                        The Board Game — Second Edition
                    </div>
                </div>

                {/* Player Count */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px',
                    border: '1px solid rgba(212,175,55,0.2)', marginBottom: '20px'
                }}>
                    <div style={{ fontSize: '0.9em', color: '#d4af37', marginBottom: '12px', fontWeight: 'bold' }}>
                        NUMBER OF PLAYERS
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        {[3, 4, 5, 6].map(n => (
                            <button key={n} onClick={() => setPlayerCount(n)} style={{
                                width: '60px', height: '60px', fontSize: '1.5em', fontWeight: 'bold',
                                background: playerCount === n
                                    ? 'linear-gradient(135deg, #d4af37, #b8942e)'
                                    : 'rgba(255,255,255,0.05)',
                                color: playerCount === n ? '#1a1a1a' : '#888',
                                border: playerCount === n ? '2px solid #d4af37' : '1px solid #333',
                                borderRadius: '10px', cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: playerCount === n ? '0 0 15px rgba(212,175,55,0.3)' : 'none'
                            }}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Houses Grid */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px',
                    border: '1px solid rgba(212,175,55,0.2)', marginBottom: '25px'
                }}>
                    <div style={{ fontSize: '0.9em', color: '#d4af37', marginBottom: '12px', fontWeight: 'bold' }}>
                        GREAT HOUSES
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {HOUSES.map((house, idx) => {
                            const isActive = idx < playerCount;
                            const isNeutral = !isActive;
                            return (
                                <div key={house.name} style={{
                                    padding: '14px', borderRadius: '8px',
                                    background: isActive
                                        ? `linear-gradient(135deg, rgba(${hexToRgb(house.color)},0.15), rgba(${hexToRgb(house.color)},0.05))`
                                        : 'rgba(100,100,100,0.08)',
                                    border: isActive ? `1px solid ${house.color}55` : '1px solid #2a2a2a',
                                    opacity: isActive ? 1 : 0.45,
                                    transition: 'all 0.3s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.6em' }}>{house.sigil}</span>
                                        <div>
                                            <div style={{
                                                fontWeight: 'bold', color: isActive ? house.color : '#555',
                                                fontSize: '1em'
                                            }}>
                                                House {house.name}
                                            </div>
                                            <div style={{
                                                fontSize: '0.7em', color: isActive ? '#aaa' : '#444',
                                                fontStyle: 'italic', fontFamily: 'Inter, sans-serif'
                                            }}>
                                                "{house.words}"
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: '0.72em', color: isActive ? '#777' : '#333',
                                        marginTop: '6px', fontFamily: 'Inter, sans-serif'
                                    }}>
                                        {isNeutral ? '⚔️ Neutral garrison' : house.desc}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Info */}
                <div style={{
                    fontSize: '0.78em', color: '#666', textAlign: 'center',
                    marginBottom: '20px', fontFamily: 'Inter, sans-serif'
                }}>
                    {neutralHouses.length > 0 && (
                        <span>Neutral forces: {neutralHouses.map(h => h.name).join(', ')} — guarded by garrisons</span>
                    )}
                </div>

                {/* Start Button */}
                <button onClick={() => onStartGame(playerCount)} style={{
                    width: '100%', padding: '16px', fontSize: '1.2em', fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #d4af37, #b8942e)',
                    color: '#1a1a1a', border: 'none', borderRadius: '10px',
                    cursor: 'pointer', fontFamily: "'Cinzel', serif",
                    letterSpacing: '2px', textTransform: 'uppercase',
                    boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
                    transition: 'all 0.2s'
                }}>
                    ⚔️ Begin the Game
                </button>
            </div>
        </div>
    );
};

function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}
