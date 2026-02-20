import React from 'react';
import { GameState, HouseName } from '../game/types';
import { TRACK_LAYOUT, TOKEN_SPRITES } from '../game/constants/layout';

interface BoardTracksProps {
    gameState: GameState;
}

export const BoardTracks: React.FC<BoardTracksProps> = ({ gameState }) => {

    // Helper to render a token at a specific track position
    const renderToken = (
        key: string,
        houseOrType: string,
        trackId: keyof typeof TRACK_LAYOUT,
        positionIndex: number,
        offset: { x: number, y: number } = { x: 0, y: 0 }
    ) => {
        const layout = TRACK_LAYOUT[trackId];
        // Ensure position exists (clamp or hide if overflow)
        // Adjust for 1-based indexing if needed. 
        // Logic: 
        // Iron Throne/Fiefdoms/KingsCourt: Value 1-6 -> Index 0-5
        // Supply: Value 0-6 -> Index 0-6
        // Victory: Value 1-7 -> Index 0-6?
        // Wildling: Value 0,2,4... -> Need mapping?
        // Round: Value 1-10 -> Index 0-9

        let safeIndex = positionIndex;
        if (trackId === 'wildling') {
            // Map 0,2,4,6,8,10,12 -> 0,1,2,3,4,5,6
            safeIndex = positionIndex / 2;
        } else if (trackId === 'victory') {
            // Map 1-7 -> 0-6
            safeIndex = positionIndex - 1;
        } else if (trackId === 'round') {
            safeIndex = positionIndex - 1;
        } else if (['ironThrone', 'fiefdoms', 'kingsCourt'].includes(trackId)) {
            safeIndex = positionIndex - 1;
        }

        const pos = layout?.[safeIndex];
        if (!pos) return null;

        // Determine sprite
        // Power tokens usually used for Influence Tracks and Victory
        // Supply uses Supply tokens
        // Wildling uses ?? Maybe a generic token or threat marker?
        // Round uses Round marker?

        let spriteKey = '';
        if (trackId === 'supply') {
            spriteKey = `supply-${houseOrType}`;
        } else if (trackId === 'victory') {
            spriteKey = `victory-${houseOrType}`;
        } else if (trackId === 'wildling') {
            // Use "wildling-token" if exists, or maybe a Neutral Power Token?
            // Since we don't have a specific Wildling sprite in TOKEN_SPRITES yet, I'll use a placeholder or generic.
            // Actually, I'll use 'power-Stark' as temporary or add 'wildling' to sprites later.
            // Wait, let's use 'order-Raid-0' as a visual hack or generic token.
            spriteKey = 'order-Raid-0'; // Temporary
        } else if (trackId === 'round') {
            spriteKey = 'order-March-0'; // Temporary
        } else {
            // Influence Tracks (Iron Throne, Fiefdoms, King's Court)
            spriteKey = `influence-${houseOrType}`;
        }

        // Check if spriteKey is a valid individual file or fallback
        const spriteUrl = TOKEN_SPRITES[spriteKey];
        if (!spriteUrl) return null;

        return (
            <div
                key={key}
                style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    width: '62px',
                    height: '62px',
                    backgroundImage: `url(${spriteUrl})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    transform: 'translate(-50%, -50%) scale(0.6)', // Adjust scale as needed
                    zIndex: 50,
                    marginLeft: `${offset.x}px`,
                    marginTop: `${offset.y}px`,
                    pointerEvents: 'none'
                }}
                title={`${houseOrType} on ${trackId} #${positionIndex}`}
            />
        );
    };

    return null;
};
