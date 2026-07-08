import React, { useEffect, useRef, useState } from 'react';
import { GameState, HouseName } from '../game/types';
import { createInitialGameState } from '../game/setup';
import { NetSession, LobbyState, activeHousesFor, randomRoomCode, lastHostedRoom, savedRoom } from '../net/online';

interface OnlineLobbyProps {
    onGameStart: (session: NetSession, state: GameState) => void;
    onBack: () => void;
}

const HOUSE_META: Record<HouseName, { color: string; sigil: string }> = {
    Stark: { color: '#8899aa', sigil: '🐺' },
    Lannister: { color: '#c8102e', sigil: '🦁' },
    Baratheon: { color: '#f5c518', sigil: '🦌' },
    Greyjoy: { color: '#2d5a27', sigil: '🐙' },
    Tyrell: { color: '#4a8c3f', sigil: '🌹' },
    Martell: { color: '#e87511', sigil: '☀️' },
};

const panelStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px',
    border: '1px solid rgba(212,175,55,0.2)', marginBottom: '16px'
};

export const OnlineLobby: React.FC<OnlineLobbyProps> = ({ onGameStart, onBack }) => {
    const [name, setName] = useState(() => localStorage.getItem('got-player-name') ?? '');
    const [joinCode, setJoinCode] = useState('');
    const [session, setSession] = useState<NetSession | null>(null);
    const [lobby, setLobby] = useState<LobbyState | null>(null);
    const [error, setError] = useState('');
    const startedRef = useRef(false);

    const resumable = lastHostedRoom();
    const resumableSave = resumable ? savedRoom(resumable) : null;

    useEffect(() => () => { if (!startedRef.current) session?.leave(); }, [session]);

    const connect = (code: string, isHost: boolean, resume = false) => {
        if (!name.trim()) { setError('Digite seu nome primeiro'); return; }
        localStorage.setItem('got-player-name', name.trim());
        setError('');
        const s = new NetSession(code, isHost, name.trim(), resume);
        s.onLobby = (l) => setLobby({ ...l, claims: { ...l.claims } });
        s.onState = (gs) => {
            if (s.lobby.started && !startedRef.current) {
                startedRef.current = true;
                onGameStart(s, gs);
            }
        };
        setSession(s);
        setLobby({ ...s.lobby, claims: { ...s.lobby.claims } });
        // Host resuming a game already in progress
        if (resume && s.lobby.started && s.gameState) {
            startedRef.current = true;
            onGameStart(s, s.gameState);
        }
    };

    const toggleClaim = (house: HouseName) => {
        if (!session || !lobby) return;
        const owner = lobby.claims[house];
        const mine = owner?.clientId === session.clientId;
        if (owner && !mine) return; // taken by someone else
        if (session.isHost) {
            session.hostClaim(house, !mine);
            setLobby({ ...session.lobby, claims: { ...session.lobby.claims } });
        } else {
            session.guestClaim(house, !mine);
        }
    };

    const startGame = () => {
        if (!session || !lobby) return;
        const state = createInitialGameState(lobby.playerCount);
        startedRef.current = true;
        session.hostStart(state);
        onGameStart(session, state);
    };

    const shell = (content: React.ReactNode) => (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 40%, #0a0a2a 100%)',
            fontFamily: "'Cinzel', 'Georgia', serif", color: '#eee'
        }}>
            <div style={{ maxWidth: '640px', width: '100%', padding: '30px' }}>
                <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                    <div style={{ fontSize: '2.2em', fontWeight: 'bold', color: '#d4af37' }}>🌐 Jogo Online</div>
                    <div style={{ fontSize: '0.85em', color: '#8899aa', fontFamily: 'Inter, sans-serif' }}>
                        P2P — sem servidor: o criador da sala hospeda a partida no navegador
                    </div>
                </div>
                {content}
                <button onClick={onBack} style={{
                    width: '100%', padding: '10px', marginTop: '4px', background: 'transparent',
                    color: '#888', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer'
                }}>
                    ← Voltar
                </button>
            </div>
        </div>
    );

    // ─── Step 1: connect ───
    if (!session || !lobby) {
        return shell(
            <>
                <div style={panelStyle}>
                    <div style={{ fontSize: '0.85em', color: '#d4af37', marginBottom: '8px', fontWeight: 'bold' }}>SEU NOME</div>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="ex.: Murilo"
                        style={{
                            width: '100%', padding: '10px', background: '#1a1a2e', color: 'white',
                            border: '1px solid #444', borderRadius: '6px', fontSize: '1em', boxSizing: 'border-box'
                        }} />
                </div>

                <div style={panelStyle}>
                    <div style={{ fontSize: '0.85em', color: '#d4af37', marginBottom: '10px', fontWeight: 'bold' }}>CRIAR SALA</div>
                    <button onClick={() => connect(randomRoomCode(), true)} style={{
                        width: '100%', padding: '12px', background: 'linear-gradient(135deg, #d4af37, #b8942e)',
                        color: '#1a1a1a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1em'
                    }}>
                        ⚔️ Criar nova sala (você será o host)
                    </button>
                    {resumable && resumableSave?.lobby?.started && (
                        <button onClick={() => connect(resumable, true, true)} style={{
                            width: '100%', padding: '10px', marginTop: '8px', background: '#2a4a2a',
                            color: '#cfc', border: '1px solid #4a6a4a', borderRadius: '8px', cursor: 'pointer'
                        }}>
                            ♻️ Retomar sala {resumable} (partida salva)
                        </button>
                    )}
                </div>

                <div style={panelStyle}>
                    <div style={{ fontSize: '0.85em', color: '#d4af37', marginBottom: '10px', fontWeight: 'bold' }}>ENTRAR NUMA SALA</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CÓDIGO"
                            maxLength={5}
                            style={{
                                flex: 1, padding: '10px', background: '#1a1a2e', color: 'white', letterSpacing: '4px',
                                border: '1px solid #444', borderRadius: '6px', fontSize: '1.1em', textAlign: 'center', boxSizing: 'border-box'
                            }} />
                        <button onClick={() => joinCode.length >= 4 && connect(joinCode, false)} style={{
                            padding: '10px 20px', background: '#3a5a7a', color: 'white',
                            border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
                        }}>
                            Entrar
                        </button>
                    </div>
                </div>
                {error && <div style={{ color: '#f88', textAlign: 'center', marginBottom: '10px' }}>{error}</div>}
            </>
        );
    }

    // ─── Step 2: lobby ───
    const active = activeHousesFor(lobby.playerCount);
    const allClaimed = active.every(h => lobby.claims[h]);
    const myCount = active.filter(h => lobby.claims[h]?.clientId === session.clientId).length;

    return shell(
        <>
            <div style={{ ...panelStyle, textAlign: 'center' }}>
                <div style={{ fontSize: '0.8em', color: '#888', fontFamily: 'Inter, sans-serif' }}>CÓDIGO DA SALA</div>
                <div style={{ fontSize: '2.2em', letterSpacing: '10px', color: '#d4af37', fontWeight: 'bold' }}>{session.roomCode}</div>
                <div style={{ fontSize: '0.75em', color: '#888', fontFamily: 'Inter, sans-serif' }}>
                    compartilhe este código com os amigos • {session.isHost ? 'você é o HOST (mantenha a aba aberta)' : `host: ${lobby.hostName}`}
                </div>
            </div>

            {session.isHost && (
                <div style={panelStyle}>
                    <div style={{ fontSize: '0.85em', color: '#d4af37', marginBottom: '10px', fontWeight: 'bold' }}>NÚMERO DE CASAS</div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        {[3, 4, 5, 6].map(n => (
                            <button key={n} onClick={() => { session.hostSetPlayerCount(n); setLobby({ ...session.lobby, claims: { ...session.lobby.claims } }); }}
                                style={{
                                    width: '50px', height: '50px', fontSize: '1.3em', fontWeight: 'bold',
                                    background: lobby.playerCount === n ? 'linear-gradient(135deg, #d4af37, #b8942e)' : 'rgba(255,255,255,0.05)',
                                    color: lobby.playerCount === n ? '#1a1a1a' : '#888',
                                    border: lobby.playerCount === n ? '2px solid #d4af37' : '1px solid #333',
                                    borderRadius: '8px', cursor: 'pointer'
                                }}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div style={panelStyle}>
                <div style={{ fontSize: '0.85em', color: '#d4af37', marginBottom: '10px', fontWeight: 'bold' }}>
                    ESCOLHA SUA(S) CASA(S) — clique para reivindicar
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {active.map(h => {
                        const meta = HOUSE_META[h];
                        const owner = lobby.claims[h];
                        const mine = owner?.clientId === session.clientId;
                        return (
                            <button key={h} onClick={() => toggleClaim(h)} style={{
                                padding: '12px', borderRadius: '8px', cursor: owner && !mine ? 'not-allowed' : 'pointer',
                                background: mine ? `${meta.color}33` : owner ? 'rgba(120,120,120,0.15)' : 'rgba(255,255,255,0.04)',
                                border: mine ? `2px solid ${meta.color}` : '1px solid #333',
                                color: '#eee', textAlign: 'left', fontFamily: 'Inter, sans-serif'
                            }}>
                                <div style={{ fontWeight: 'bold', color: meta.color }}>{meta.sigil} {h}</div>
                                <div style={{ fontSize: '0.78em', color: owner ? '#cfc' : '#666', marginTop: '3px' }}>
                                    {owner ? `👤 ${owner.name}${mine ? ' (você)' : ''}` : 'livre'}
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div style={{ fontSize: '0.75em', color: '#888', marginTop: '8px', fontFamily: 'Inter, sans-serif' }}>
                    Um jogador pode controlar mais de uma casa (útil com menos amigos que casas).
                </div>
            </div>

            {session.isHost ? (
                <button onClick={startGame} disabled={!allClaimed} style={{
                    width: '100%', padding: '14px', fontSize: '1.1em', fontWeight: 'bold',
                    background: allClaimed ? 'linear-gradient(135deg, #d4af37, #b8942e)' : '#333',
                    color: allClaimed ? '#1a1a1a' : '#666', border: 'none', borderRadius: '10px',
                    cursor: allClaimed ? 'pointer' : 'not-allowed', marginBottom: '10px'
                }}>
                    {allClaimed ? '⚔️ Começar a partida' : `Aguardando: ${active.filter(h => !lobby.claims[h]).join(', ')}`}
                </button>
            ) : (
                <div style={{ textAlign: 'center', color: '#aaa', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>
                    {myCount > 0 ? `Você controla ${myCount} casa(s). ` : ''}Aguardando o host iniciar…
                </div>
            )}
        </>
    );
};
