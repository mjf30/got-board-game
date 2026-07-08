import React, { useState } from 'react';
import { GameState } from '../game/types';

interface UnitPickerModalProps {
    gameState: GameState;
    onConfirm: (unitIds: string[]) => void;
}

/** Generic modal for choosing units (combat casualties, wildling destruction, upgrades...) */
export const UnitPickerModal: React.FC<UnitPickerModalProps> = ({ gameState, onConfirm }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const sel = gameState.pendingUnitSelection;
    if (!sel) return null;

    // Group eligible units by area for display
    const groups: { areaId: string; areaName: string; units: { id: string; type: string; routed: boolean }[] }[] = [];
    Object.entries(gameState.board).forEach(([areaId, area]) => {
        const units = area.units
            .filter(u => sel.eligibleUnitIds.includes(u.id))
            .map(u => ({ id: u.id, type: u.type, routed: u.routed }));
        if (units.length > 0) groups.push({ areaId, areaName: area.name, units });
    });
    // Units held aside during combat (attacking units are not on the board)
    const boardIds = new Set(groups.flatMap(g => g.units.map(u => u.id)));
    const combatUnits = (gameState.combat?.attackingUnits ?? [])
        .filter(u => sel.eligibleUnitIds.includes(u.id) && !boardIds.has(u.id))
        .map(u => ({ id: u.id, type: u.type, routed: u.routed }));
    if (combatUnits.length > 0) {
        groups.push({ areaId: '__combat__', areaName: 'Exército atacante', units: combatUnits });
    }

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id)
            ? prev.filter(x => x !== id)
            : (prev.length < sel.count ? [...prev, id] : prev));
    };

    const canConfirm = sel.upTo ? selected.length <= sel.count : selected.length === sel.count;

    const confirm = () => {
        const ids = [...selected];
        setSelected([]);
        onConfirm(ids);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: '#1a1a2a', padding: '25px', borderRadius: '12px',
                border: `2px solid ${gameState.cas[sel.house]?.color ?? '#d4af37'}`,
                maxWidth: '520px', width: '90%', maxHeight: '80vh', overflow: 'auto'
            }}>
                <h3 style={{ color: '#d4af37', marginTop: 0 }}>
                    {sel.purpose === 'crow-upgrade' || sel.purpose === 'renly-upgrade' ? '⬆️' : '☠️'}{' '}
                    <span style={{ color: gameState.cas[sel.house]?.color }}>{sel.house}</span>
                </h3>
                <p style={{ color: '#ccc' }}>{sel.prompt}</p>
                <p style={{ color: '#888', fontSize: '0.85em' }}>
                    Selecionadas: {selected.length} / {sel.count}{sel.upTo ? ' (até)' : ''}
                </p>

                {groups.map(g => (
                    <div key={g.areaId} style={{ marginBottom: '10px', background: '#252535', padding: '8px 10px', borderRadius: '6px' }}>
                        <div style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '5px' }}>{g.areaName}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {g.units.map(u => (
                                <button key={u.id}
                                    onClick={() => toggle(u.id)}
                                    style={{
                                        padding: '5px 10px', borderRadius: '4px', cursor: 'pointer',
                                        background: selected.includes(u.id) ? '#a33' : '#333',
                                        border: selected.includes(u.id) ? '2px solid #f66' : '1px solid #555',
                                        color: 'white', fontSize: '0.85em'
                                    }}>
                                    {u.type}{u.routed ? ' (derrotada)' : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                <button onClick={confirm} disabled={!canConfirm}
                    style={{
                        width: '100%', padding: '10px', marginTop: '8px',
                        background: canConfirm ? '#d4af37' : '#444',
                        color: canConfirm ? '#111' : '#777',
                        border: 'none', borderRadius: '6px', fontWeight: 'bold',
                        cursor: canConfirm ? 'pointer' : 'not-allowed'
                    }}>
                    {sel.upTo && selected.length === 0 ? 'Não usar' : 'Confirmar'}
                </button>
            </div>
        </div>
    );
};
