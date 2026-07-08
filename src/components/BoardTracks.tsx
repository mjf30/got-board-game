import React from 'react';
import { GameState, HouseName } from '../game/types';
import { TRACK_LAYOUT, TOKEN_SPRITES } from '../game/constants/layout';

const BASE = import.meta.env.BASE_URL;

interface BoardTracksProps {
    gameState: GameState;
    /** Board-size scale factor (1 at ~720px rendered width) */
    scale?: number;
}

/** Renders the physical tokens on the printed tracks of the board art:
 *  Influence (3 columns), Supply scroll, Victory, Round and Wildling threat. */
export const BoardTracks: React.FC<BoardTracksProps> = ({ gameState, scale = 1 }) => {
    const houses = gameState.turnOrder;

    const token = (
        key: string,
        spriteUrl: string,
        pos: { top: string; left: string } | undefined,
        sizePx: number,
        offset: { x: number; y: number } = { x: 0, y: 0 },
        title?: string
    ) => {
        if (!pos || !spriteUrl) return null;
        return (
            <div
                key={key}
                title={title}
                style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    width: `${sizePx}px`,
                    height: `${sizePx}px`,
                    backgroundImage: `url(${spriteUrl})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                    zIndex: 45,
                    pointerEvents: 'none',
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
                }}
            />
        );
    };

    const elements: React.ReactNode[] = [];

    // ── Influence tracks (one token per printed circle) ──
    (['ironThrone', 'fiefdoms', 'kingsCourt'] as const).forEach(track => {
        houses.forEach(house => {
            const pos = gameState.cas[house].influence[track]; // 1-6
            elements.push(token(
                `${track}-${house}`,
                TOKEN_SPRITES[`influence-${house}`],
                TRACK_LAYOUT[track]?.[pos - 1],
                40,
                { x: 0, y: 0 },
                `${house}: ${track} #${pos}`
            ));
        });
    });

    // ── Supply scroll (several houses can share a level → small offsets) ──
    {
        const byLevel: Record<number, HouseName[]> = {};
        houses.forEach(h => {
            const v = Math.max(0, Math.min(6, gameState.cas[h].supply));
            (byLevel[v] ??= []).push(h);
        });
        Object.entries(byLevel).forEach(([v, hs]) => {
            hs.forEach((house, i) => {
                elements.push(token(
                    `supply-${house}`,
                    TOKEN_SPRITES[`supply-${house}`],
                    TRACK_LAYOUT['supply']?.[parseInt(v)],
                    30,
                    { x: (i % 3 - 1) * 12 * scale, y: (Math.floor(i / 3) - 0.5) * 12 * scale },
                    `${house}: supply ${v}`
                ));
            });
        });
    }

    // ── Victory track (castles+strongholds; token enters the track at 1+) ──
    {
        const byPos: Record<number, HouseName[]> = {};
        houses.forEach(h => {
            let count = 0;
            Object.values(gameState.board).forEach(a => {
                if (a.house === h && (a.castle || a.stronghold)) count++;
            });
            if (count >= 1) (byPos[Math.min(count, 7)] ??= []).push(h);
        });
        Object.entries(byPos).forEach(([p, hs]) => {
            hs.forEach((house, i) => {
                elements.push(token(
                    `victory-${house}`,
                    TOKEN_SPRITES[`victory-${house}`],
                    TRACK_LAYOUT['victory']?.[parseInt(p) - 1],
                    32,
                    { x: (i % 3 - 1) * 12 * scale, y: (Math.floor(i / 3) - 0.5) * 12 * scale },
                    `${house}: ${p} castelo(s)/fortaleza(s)`
                ));
            });
        });
    }

    // ── Round marker ──
    elements.push(token(
        'round-marker',
        `${BASE}images/turn-marker.png`,
        TRACK_LAYOUT['round']?.[Math.max(0, Math.min(9, gameState.round - 1))],
        34,
        { x: 0, y: 0 },
        `Rodada ${gameState.round}`
    ));

    // ── Wildling threat token ──
    {
        const idx = Math.max(0, Math.min(6, Math.round(gameState.wildlingThreat / 2)));
        const pos = TRACK_LAYOUT['wildling']?.[idx];
        if (pos) {
            elements.push(
                <div
                    key="wildling-threat"
                    title={`Ameaça Wildling: ${gameState.wildlingThreat}`}
                    style={{
                        position: 'absolute',
                        top: pos.top,
                        left: pos.left,
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 30%, #6a7b8c, #1c242e 70%)',
                        border: '2px solid #cfd8e0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        transform: `translate(-50%, -50%) scale(${scale})`,
                        zIndex: 45,
                        pointerEvents: 'none'
                    }}
                >
                    🐺
                </div>
            );
        }
    }

    return <>{elements}</>;
};
