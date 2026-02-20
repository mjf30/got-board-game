import React from 'react';
import { GameState, HouseName } from '../game/types';

interface GameTracksProps {
    gameState: GameState;
}

const HOUSE_COLORS: Record<string, string> = {
    Stark: '#7a8fa6', Lannister: '#c8302e', Baratheon: '#daa520',
    Greyjoy: '#3a6a3a', Tyrell: '#5aaa4f', Martell: '#d87020',
};

const trackBox: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '10px',
    border: '1px solid #2a3a5a', marginBottom: '10px'
};

const trackTitle: React.CSSProperties = {
    fontSize: '0.7em', color: '#d4af37', fontWeight: 'bold', marginBottom: '6px',
    letterSpacing: '1px', textTransform: 'uppercase' as const, fontFamily: 'Cinzel, serif'
};

export const GameTracks: React.FC<GameTracksProps> = ({ gameState }) => {
    const houses = gameState.turnOrder;

    const renderInfluenceTrack = (trackName: string, trackKey: 'ironThrone' | 'fiefdoms' | 'kingsCourt', icon: string) => {
        const sorted = [...houses].sort((a, b) =>
            gameState.cas[a].influence[trackKey] - gameState.cas[b].influence[trackKey]
        );
        return (
            <div style={trackBox}>
                <div style={trackTitle}>{icon} {trackName}</div>
                <div style={{ display: 'flex', gap: '3px' }}>
                    {sorted.map((house, idx) => (
                        <div key={house} style={{
                            flex: 1, textAlign: 'center', padding: '4px 2px',
                            background: `${HOUSE_COLORS[house]}25`,
                            border: `1px solid ${HOUSE_COLORS[house]}55`,
                            borderRadius: '3px', fontSize: '0.65em',
                        }}>
                            <div style={{ color: HOUSE_COLORS[house], fontWeight: 'bold' }}>{idx + 1}</div>
                            <div style={{ color: '#ccc', fontSize: '0.85em' }}>{house.slice(0, 3)}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ fontSize: '0.9em' }}>
            {/* ── ROUND / PHASE ────────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>📅 Turn Track</div>
                <div style={{ display: 'flex', gap: '2px' }}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(round => (
                        <div key={round} style={{
                            flex: 1, textAlign: 'center', padding: '3px 0',
                            background: gameState.round === round ? '#d4af37' : 'rgba(255,255,255,0.05)',
                            color: gameState.round === round ? '#1a1a2e' : '#555',
                            borderRadius: '3px', fontSize: '0.75em', fontWeight: 'bold',
                        }}>
                            {round}
                        </div>
                    ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '0.8em', color: '#aaa' }}>
                    Phase: <span style={{ color: '#d4af37', fontWeight: 'bold' }}>{gameState.phase}</span>
                    {gameState.phase === 'Action' && gameState.actionSubPhase !== 'Done' && (
                        <span> → {gameState.actionSubPhase}</span>
                    )}
                </div>
            </div>

            {/* ── WILDLING THREAT ────────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>🐺 Wildling Threat</div>
                <div style={{ display: 'flex', gap: '2px' }}>
                    {Array.from({ length: 13 }, (_, i) => i).map(level => (
                        <div key={level} style={{
                            flex: 1, textAlign: 'center', padding: '3px 0',
                            background: gameState.wildlingThreat >= level
                                ? (level >= 10 ? '#a22' : level >= 6 ? '#884' : '#446')
                                : 'rgba(255,255,255,0.03)',
                            color: gameState.wildlingThreat >= level ? '#fff' : '#333',
                            borderRadius: '2px', fontSize: '0.6em', fontWeight: 'bold',
                        }}>
                            {level}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── INFLUENCE TRACKS ───────────────── */}
            {renderInfluenceTrack('Iron Throne', 'ironThrone', '👑')}
            {renderInfluenceTrack('Fiefdoms', 'fiefdoms', '🗡️')}
            {renderInfluenceTrack("King's Court", 'kingsCourt', '🏛️')}

            {/* ── SUPPLY TRACK ───────────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>📦 Supply</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {houses.map(house => (
                        <div key={house} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{
                                width: '40px', fontSize: '0.65em', color: HOUSE_COLORS[house],
                                fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                {house.slice(0, 4)}
                            </div>
                            <div style={{ display: 'flex', gap: '1px', flex: 1 }}>
                                {Array.from({ length: 7 }, (_, i) => i).map(level => (
                                    <div key={level} style={{
                                        flex: 1, height: '12px',
                                        background: gameState.cas[house].supply >= level
                                            ? `${HOUSE_COLORS[house]}99`
                                            : 'rgba(255,255,255,0.03)',
                                        borderRadius: '1px',
                                    }} />
                                ))}
                            </div>
                            <div style={{ width: '14px', fontSize: '0.7em', color: '#aaa', textAlign: 'right' }}>
                                {gameState.cas[house].supply}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── POWER TOKENS ───────────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>💰 Power Tokens</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {houses.map(house => (
                        <div key={house} style={{
                            flex: '1 0 45%', display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '3px 5px', background: `${HOUSE_COLORS[house]}15`,
                            border: `1px solid ${HOUSE_COLORS[house]}33`, borderRadius: '3px'
                        }}>
                            <span style={{ color: HOUSE_COLORS[house], fontWeight: 'bold', fontSize: '0.7em' }}>
                                {house.slice(0, 3)}
                            </span>
                            <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: '0.85em', marginLeft: 'auto' }}>
                                {gameState.cas[house].power}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── CASTLES / VICTORY ──────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>🏰 Strongholds & Castles</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {houses.map(house => {
                        const count = Object.values(gameState.board).filter(
                            a => a.house === house && (a.castle || a.stronghold)
                        ).length;
                        return (
                            <div key={house} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '40px', fontSize: '0.65em', color: HOUSE_COLORS[house], fontWeight: 'bold' }}>
                                    {house.slice(0, 4)}
                                </span>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    {Array.from({ length: 7 }, (_, i) => (
                                        <div key={i} style={{
                                            width: '10px', height: '10px', borderRadius: '2px',
                                            background: i < count ? HOUSE_COLORS[house] : 'rgba(255,255,255,0.05)',
                                            border: i === 6 ? '1px solid gold' : 'none'
                                        }} />
                                    ))}
                                </div>
                                <span style={{ fontSize: '0.7em', color: count >= 7 ? 'gold' : '#aaa', fontWeight: count >= 7 ? 'bold' : 'normal' }}>
                                    {count}/7
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── WESTEROS CARDS ──────────────────── */}
            {gameState.drawnWesterosCards && gameState.phase === 'Westeros' && (
                <div style={trackBox}>
                    <div style={trackTitle}>📜 Westeros Cards</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {gameState.drawnWesterosCards.map((card, idx) => (
                            <div key={idx} style={{
                                padding: '5px 8px', borderRadius: '4px',
                                background: idx === 0 ? '#3a2a1a' : idx === 1 ? '#2a2a3a' : '#2a1a1a',
                                border: `1px solid ${idx === 0 ? '#6a4a2a' : idx === 1 ? '#4a4a6a' : '#5a2a2a'}`,
                                fontSize: '0.72em'
                            }}>
                                <span style={{ color: '#888', fontSize: '0.85em' }}>Deck {idx + 1}: </span>
                                <span style={{ color: '#ddd', fontWeight: 'bold' }}>{card}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── HOUSE CARDS IN HAND ────────────── */}
            <div style={trackBox}>
                <div style={trackTitle}>🃏 Cards In Hand</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                    {houses.map(house => (
                        <div key={house} style={{
                            flex: '1 0 30%', textAlign: 'center', padding: '3px',
                            background: `${HOUSE_COLORS[house]}15`, borderRadius: '3px',
                            border: `1px solid ${HOUSE_COLORS[house]}33`
                        }}>
                            <div style={{ color: HOUSE_COLORS[house], fontSize: '0.65em', fontWeight: 'bold' }}>{house.slice(0, 3)}</div>
                            <div style={{ fontSize: '0.85em', color: '#ccc', fontWeight: 'bold' }}>{gameState.cas[house].cards.length}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
