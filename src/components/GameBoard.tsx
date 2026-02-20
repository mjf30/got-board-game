import React, { useCallback, useRef, useState } from 'react';
import { GameState, HouseName } from '../game/types';
import { INITIAL_MAP } from '../game/constants/map';
import { HOUSE_SETUP } from '../game/constants/houses';
import { AREA_LAYOUT, UNIT_SPRITES, TOKEN_SPRITES } from '../game/constants/layout';
import { BoardTracks } from './BoardTracks';

interface GameBoardProps {
    gameState: GameState;
    onAreaClick: (areaId: string) => void;
    selectedArea?: string | null;
}

// Parse "45%" → 45
const pct = (s: string) => parseFloat(s);

// Precompute numeric positions once
const AREA_POSITIONS = Object.entries(AREA_LAYOUT).map(([id, pos]) => ({
    id,
    x: pct(pos.left),
    y: pct(pos.top),
}));

function findNearestArea(xPct: number, yPct: number): string | null {
    let nearest = '';
    let minDist = Infinity;
    for (const { id, x, y } of AREA_POSITIONS) {
        const dist = (xPct - x) ** 2 + (yPct - y) ** 2;
        if (dist < minDist) {
            minDist = dist;
            nearest = id;
        }
    }
    return nearest || null;
}

export const GameBoard: React.FC<GameBoardProps> = ({ gameState, onAreaClick, selectedArea }) => {
    const boardRef = useRef<HTMLDivElement>(null);
    const [hoveredArea, setHoveredArea] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const getUnitSprite = (unitType: string, house: HouseName) => {
        const key = `${house}-${unitType}`;
        return UNIT_SPRITES[key] || '';
    };

    const getTokenSprite = (tokenType: string) => {
        return TOKEN_SPRITES[tokenType] || '';
    };

    const getClickPosition = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!boardRef.current) return null;
        const rect = boardRef.current.getBoundingClientRect();
        return {
            xPct: (e.clientX - rect.left) / rect.width * 100,
            yPct: (e.clientY - rect.top) / rect.height * 100,
            clientX: e.clientX,
            clientY: e.clientY,
        };
    }, []);

    const handleBoardClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const pos = getClickPosition(e);
        if (!pos) return;
        const nearest = findNearestArea(pos.xPct, pos.yPct);
        if (nearest) onAreaClick(nearest);
    }, [getClickPosition, onAreaClick]);

    const handleBoardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const pos = getClickPosition(e);
        if (!pos) return;
        const nearest = findNearestArea(pos.xPct, pos.yPct);
        setHoveredArea(nearest);
        setTooltipPos({ x: pos.clientX, y: pos.clientY });
    }, [getClickPosition]);

    // Build tooltip text for hovered area
    const tooltipContent = hoveredArea ? (() => {
        const area = gameState.board[hoveredArea];
        if (!area) return hoveredArea;
        const mapDef = INITIAL_MAP[hoveredArea];
        const parts: string[] = [area.name];
        if (mapDef?.stronghold) parts.push('🏰');
        if (mapDef?.castle) parts.push('🏠');
        if (mapDef?.supply) parts.push('🛢'.repeat(mapDef.supply));
        if (mapDef?.power) parts.push('👑'.repeat(mapDef.power));
        if (area.house) parts.push(`[${area.house}]`);
        return parts.join(' ');
    })() : '';

    return (
        <div
            ref={boardRef}
            className="game-board-container"
            onClick={handleBoardClick}
            onMouseMove={handleBoardMouseMove}
            onMouseLeave={() => setHoveredArea(null)}
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1464 / 2175',
                backgroundImage: `url(${import.meta.env.BASE_URL}images/board.png)`,
                backgroundSize: '100% 100%',
                margin: '0 auto',
                overflow: 'hidden',
                cursor: 'pointer',
            }}
        >
            {/* Hover tooltip */}
            {hoveredArea && hoveredArea !== selectedArea && (
                <div style={{
                    position: 'fixed',
                    left: tooltipPos.x + 14,
                    top: tooltipPos.y - 10,
                    background: 'rgba(10,15,30,0.92)',
                    color: '#eee',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    border: '1px solid #4a5a8a',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>
                    {tooltipContent}
                </div>
            )}

            {/* Area markers, units, tokens */}
            {Object.entries(AREA_LAYOUT).map(([areaId, position]) => {
                const area = gameState.board[areaId];
                if (!area) return null;

                const mapDef = INITIAL_MAP[areaId];
                const isPort = area.type === 'Port';
                const isSea = area.type === 'Sea';
                const units = area.units || [];
                const order = area.order;
                const garrison = gameState.garrisons[areaId];
                const isSelected = selectedArea === areaId;
                const isHovered = hoveredArea === areaId && !isSelected;

                return (
                    <div
                        key={areaId}
                        style={{
                            position: 'absolute',
                            top: position.top,
                            left: position.left,
                            transform: 'translate(-50%, -50%)',
                            zIndex: isSelected ? 12 : 10,
                            pointerEvents: 'none', // clicks handled by board
                        }}
                    >
                        {/* Selection highlight ring */}
                        {isSelected && (
                            <div className="area-selected-ring" style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: isPort ? '44px' : isSea ? '56px' : '64px',
                                height: isPort ? '44px' : isSea ? '56px' : '64px',
                                borderRadius: '50%',
                                border: '3px solid #ffd700',
                                boxShadow: '0 0 14px 3px rgba(255,215,0,0.45), inset 0 0 8px rgba(255,215,0,0.15)',
                                background: 'rgba(255,215,0,0.08)',
                                zIndex: 5,
                                pointerEvents: 'none',
                            }} />
                        )}

                        {/* Hover highlight ring */}
                        {isHovered && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: isPort ? '40px' : isSea ? '50px' : '58px',
                                height: isPort ? '40px' : isSea ? '50px' : '58px',
                                borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,0.35)',
                                boxShadow: '0 0 8px rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.04)',
                                zIndex: 5,
                                pointerEvents: 'none',
                            }} />
                        )}

                        {/* Area icons strip (supply barrels, crowns, castle/stronghold) — land only */}
                        {!isPort && !isSea && (mapDef?.supply || mapDef?.power || mapDef?.stronghold || mapDef?.castle) && (
                            <div style={{
                                position: 'absolute',
                                top: '-24px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                gap: '1px',
                                fontSize: '9px',
                                zIndex: 9,
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                                textShadow: '0 0 3px #000, 0 0 6px #000',
                                opacity: (isSelected || isHovered) ? 1 : 0.7,
                            }}>
                                {mapDef?.stronghold && <span title="Stronghold">🏰</span>}
                                {mapDef?.castle && !mapDef?.stronghold && <span title="Castle">🏠</span>}
                                {mapDef?.supply ? Array.from({ length: mapDef.supply }, (_, i) => <span key={`s${i}`} title="Supply">🛢️</span>) : null}
                                {mapDef?.power ? Array.from({ length: mapDef.power }, (_, i) => <span key={`p${i}`} title="Power">👑</span>) : null}
                            </div>
                        )}

                        {/* Units */}
                        {units.map((unit, index) => {
                            const spritePos = getUnitSprite(unit.type, unit.house);
                            if (!spritePos) return null;

                            return (
                                <div
                                    key={unit.id}
                                    style={{
                                        position: 'absolute',
                                        width: '62px',
                                        height: '62px',
                                        backgroundImage: `url(${spritePos})`,
                                        backgroundSize: 'contain',
                                        backgroundRepeat: 'no-repeat',
                                        transform: `scale(0.65) ${unit.routed ? 'rotate(90deg)' : ''}`,
                                        transformOrigin: 'center center',
                                        top: `${-20 - (index * 4)}px`,
                                        left: `${-20 + (index * 6)}px`,
                                        pointerEvents: 'none',
                                        zIndex: 20 + index,
                                        opacity: unit.routed ? 0.6 : 1,
                                        filter: unit.routed ? 'grayscale(100%)' : 'none'
                                    }}
                                />
                            );
                        })}

                        {/* Garrison */}
                        {garrison && (
                            <div style={{
                                position: 'absolute',
                                top: '-40px',
                                left: '0px',
                                width: '30px',
                                height: '30px',
                                background: 'linear-gradient(to right, #000, #666)',
                                borderRadius: '0 0 50% 50%',
                                color: 'white',
                                textAlign: 'center',
                                fontSize: '18px',
                                fontWeight: 'bold',
                                lineHeight: '30px',
                                zIndex: 30,
                                border: '2px solid silver',
                                marginLeft: '-15px',
                                pointerEvents: 'none',
                            }}>
                                {garrison.strength}
                            </div>
                        )}

                        {/* Order Token */}
                        {order && (
                            <div style={{
                                position: 'absolute',
                                width: '62px',
                                height: '62px',
                                backgroundImage: `url(${getTokenSprite(`order-${order.type}-${order.star ? '1' : '0'}`) || ''})`,
                                backgroundSize: 'contain',
                                backgroundRepeat: 'no-repeat',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) scale(0.55)',
                                zIndex: 40,
                                pointerEvents: 'none',
                            }} />
                        )}

                        {/* Power Token (Control) */}
                        {area.house && !units.length && !garrison && !isPort && (() => {
                            const isHomeArea = HOUSE_SETUP[area.house]?.homeArea === areaId;
                            if (isHomeArea) return null;

                            return (
                                <div style={{
                                    position: 'absolute',
                                    width: '62px',
                                    height: '62px',
                                    backgroundImage: `url(${getTokenSprite(`power-${area.house}`)})`,
                                    backgroundSize: 'contain',
                                    backgroundRepeat: 'no-repeat',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%) scale(0.5)',
                                    zIndex: 5,
                                    opacity: 0.8,
                                    pointerEvents: 'none',
                                }} />
                            );
                        })()}
                    </div>
                );
            })}

            {/* Turn Marker, Wildling Track, Supply Track, Victory Track, etc. */}
            <BoardTracks gameState={gameState} />
        </div>
    );
};
