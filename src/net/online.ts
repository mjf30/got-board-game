import { joinRoom } from 'trystero';
import { GameState, HouseName } from '../game/types';
import { HOUSE_SETUP } from '../game/constants/houses';
import { PLAYABLE_HOUSES } from '../game/setup';
import { GameAction } from './actions';

const APP_ID = 'mjf30-got-board-game-v1';

export interface LobbyClaim { clientId: string; name: string }

export interface LobbyState {
    playerCount: number;
    claims: Partial<Record<HouseName, LobbyClaim>>;
    started: boolean;
    hostClientId: string;
    hostName: string;
}

export function activeHousesFor(playerCount: number): HouseName[] {
    return PLAYABLE_HOUSES.filter(h => HOUSE_SETUP[h].minimumPlayers <= playerCount);
}

/** Stable identity across page refreshes */
export function getClientId(): string {
    let id = localStorage.getItem('got-client-id');
    if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('got-client-id', id);
    }
    return id;
}

export function randomRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

const storageKey = (code: string) => `got-room-${code}`;

export function savedRoom(code: string): { lobby: LobbyState; state: GameState | null } | null {
    try {
        const raw = localStorage.getItem(storageKey(code));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function lastHostedRoom(): string | null {
    return localStorage.getItem('got-last-room');
}

/** P2P session (Trystero/WebRTC). The room creator is the authoritative host:
 *  guests send GameActions; the host applies them via the engine and broadcasts the state. */
export class NetSession {
    readonly roomCode: string;
    readonly isHost: boolean;
    readonly clientId: string;
    readonly playerName: string;

    lobby: LobbyState;
    gameState: GameState | null = null;

    onLobby: ((l: LobbyState) => void) | null = null;
    onState: ((s: GameState) => void) | null = null;
    onAction: ((a: GameAction) => void) | null = null;

    private room: ReturnType<typeof joinRoom>;
    private sendLobby: (l: LobbyState, to?: string) => void;
    private sendState: (s: GameState, to?: string) => void;
    private sendClaim: (c: { clientId: string; name: string; house: HouseName | null; claim: boolean }) => void;
    private sendAct: (a: GameAction) => void;
    private sendHello: (h: { clientId: string; name: string }, to?: string) => void;

    constructor(roomCode: string, isHost: boolean, playerName: string, resume = false) {
        this.roomCode = roomCode.toUpperCase();
        this.isHost = isHost;
        this.clientId = getClientId();
        this.playerName = playerName;

        const saved = resume ? savedRoom(this.roomCode) : null;
        this.lobby = saved?.lobby ?? {
            playerCount: 6,
            claims: {},
            started: false,
            hostClientId: this.clientId,
            hostName: playerName
        };
        this.gameState = saved?.state ?? null;

        this.room = joinRoom({ appId: APP_ID }, this.roomCode);

        // trystero ≥0.25: makeAction returns { send, onMessage }
        const helloAction = this.room.makeAction('hello');
        const lobbyAction = this.room.makeAction('lobby');
        const claimAction = this.room.makeAction('claim');
        const stateAction = this.room.makeAction('state');
        const actAction = this.room.makeAction('act');

        this.sendHello = (h, to) => { void helloAction.send(h as never, to ? { target: to } : undefined); };
        this.sendLobby = (l, to) => { void lobbyAction.send(l as never, to ? { target: to } : undefined); };
        this.sendClaim = (c) => { void claimAction.send(c as never); };
        this.sendState = (s, to) => { void stateAction.send(s as never, to ? { target: to } : undefined); };
        this.sendAct = (a) => { void actAction.send(a as never); };

        if (isHost) {
            // Any peer that appears gets the current lobby (and state, mid-game)
            this.room.onPeerJoin = (peerId: string) => {
                this.sendLobby(this.lobby, peerId);
                if (this.gameState) this.sendState(this.gameState, peerId);
            };
            helloAction.onMessage = (_h, ctx) => {
                this.sendLobby(this.lobby, ctx.peerId);
                if (this.gameState) this.sendState(this.gameState, ctx.peerId);
            };
            claimAction.onMessage = (data) => {
                const c = data as unknown as { clientId: string; name: string; house: HouseName | null; claim: boolean };
                if (this.lobby.started) return;
                if (c.claim && c.house) {
                    const owner = this.lobby.claims[c.house];
                    if (!owner || owner.clientId === c.clientId) {
                        this.lobby.claims[c.house] = { clientId: c.clientId, name: c.name };
                    }
                } else if (c.house) {
                    const owner = this.lobby.claims[c.house];
                    if (owner?.clientId === c.clientId) delete this.lobby.claims[c.house];
                }
                this.broadcastLobby();
            };
            actAction.onMessage = (data) => {
                this.onAction?.(data as unknown as GameAction);
            };
        } else {
            lobbyAction.onMessage = (data) => {
                const l = data as unknown as LobbyState;
                this.lobby = l;
                this.onLobby?.(l);
            };
            stateAction.onMessage = (data) => {
                const s = data as unknown as GameState;
                this.gameState = s;
                this.onState?.(s);
            };
            // Announce ourselves (also helps when the host missed our join event)
            this.room.onPeerJoin = () => this.sendHello({ clientId: this.clientId, name: this.playerName });
            setTimeout(() => this.sendHello({ clientId: this.clientId, name: this.playerName }), 1500);
        }
    }

    /** Houses this client controls */
    myHouses(): HouseName[] {
        return (Object.entries(this.lobby.claims) as [HouseName, LobbyClaim][])
            .filter(([, c]) => c && c.clientId === this.clientId)
            .map(([h]) => h);
    }

    // ── host-side lobby operations ──
    private persist() {
        if (!this.isHost) return;
        try {
            localStorage.setItem(storageKey(this.roomCode), JSON.stringify({ lobby: this.lobby, state: this.gameState }));
            localStorage.setItem('got-last-room', this.roomCode);
        } catch { /* storage full — ignore */ }
    }

    broadcastLobby() {
        this.onLobby?.(this.lobby);
        this.sendLobby(this.lobby);
        this.persist();
    }

    hostSetPlayerCount(n: number) {
        this.lobby.playerCount = n;
        const active = activeHousesFor(n);
        (Object.keys(this.lobby.claims) as HouseName[]).forEach(h => {
            if (!active.includes(h)) delete this.lobby.claims[h];
        });
        this.broadcastLobby();
    }

    hostClaim(house: HouseName, claim: boolean) {
        if (claim) {
            const owner = this.lobby.claims[house];
            if (!owner || owner.clientId === this.clientId) {
                this.lobby.claims[house] = { clientId: this.clientId, name: this.playerName };
            }
        } else if (this.lobby.claims[house]?.clientId === this.clientId) {
            delete this.lobby.claims[house];
        }
        this.broadcastLobby();
    }

    hostStart(initialState: GameState) {
        this.lobby.started = true;
        this.gameState = initialState;
        this.broadcastLobby();
        this.sendState(initialState);
        this.persist();
    }

    /** Host: publish a new authoritative state */
    broadcastState(s: GameState) {
        this.gameState = s;
        this.sendState(s);
        this.persist();
    }

    // ── guest-side operations ──
    guestClaim(house: HouseName, claim: boolean) {
        this.sendClaim({ clientId: this.clientId, name: this.playerName, house, claim });
    }

    /** Guest: ask the host to apply an action */
    sendAction(a: GameAction) {
        this.sendAct(a);
    }

    leave() {
        try { this.room.leave(); } catch { /* already gone */ }
    }
}
