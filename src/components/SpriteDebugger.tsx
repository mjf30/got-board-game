import React, { useState } from 'react';
// Import existing keys to populate the dropdown options
import { UNIT_SPRITES, TOKEN_SPRITES } from '../game/constants/layout';

// Generate list of all file paths based on our split script logic
const ALL_IMAGES: string[] = [];
// Left Side: Cols 0-5, Rows 0-4
for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= 5; c++) {
        ALL_IMAGES.push(`${import.meta.env.BASE_URL}images/sprite_left_r${r}_c${c}.png`);
    }
}
// Right Side: Cols 6-11, Rows 0-4
for (let r = 0; r < 5; r++) {
    for (let c = 6; c <= 11; c++) {
        ALL_IMAGES.push(`${import.meta.env.BASE_URL}images/sprite_right_r${r}_c${c}.png`);
    }
}

// Combine all valid keys a user might want to assign
// This includes Unit types and Token types.
const ALL_KEYS = [
    // Special 'Unassigned' option
    '--- Ignore/Unused ---',

    // Units
    ...Object.keys(UNIT_SPRITES),

    // Tokens
    ...Object.keys(TOKEN_SPRITES)
].sort();

export const SpriteDebugger: React.FC = () => {
    // State to store mappings: Record<ImageFilename, AssignedKey>
    const [assignments, setAssignments] = useState<Record<string, string>>({});
    const [filter, setFilter] = useState('');

    const handleAssign = (img: string, key: string) => {
        setAssignments(prev => ({
            ...prev,
            [img]: key
        }));
    };

    const generateConfig = () => {
        // Invert map: Key -> Image
        const unitConfig: Record<string, string> = {};
        const tokenConfig: Record<string, string> = {};

        Object.entries(assignments).forEach(([img, key]) => {
            if (key === '--- Ignore/Unused ---' || !key) return;

            // Heuristic to split into UNIT or TOKEN map
            // We check if the key exists in the original maps
            if (Object.keys(UNIT_SPRITES).includes(key)) {
                unitConfig[key] = img;
            } else {
                tokenConfig[key] = img;
            }
        });

        // Current mappings in layout.ts might utilize keys NOT assigned here.
        // But this output is for REPLACING layout.ts content.

        const output = `
// PASTE THIS INTO layout.ts

export const TOKEN_SPRITES: Record<string, string> = ${JSON.stringify(tokenConfig, null, 4)};

export const UNIT_SPRITES: Record<string, string> = ${JSON.stringify(unitConfig, null, 4)};
        `;

        console.log(output);
        alert("Configuration generated in Console (F12)!");
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: '#1a1a2e',
            color: 'white',
            zIndex: 9999,
            overflow: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Sprite Debugger</h1>
                <div style={{ gap: '10px', display: 'flex' }}>
                    <button onClick={generateConfig} style={{ padding: '10px 20px', fontSize: '1.2em', cursor: 'pointer' }}>
                        GENERATE CONFIG (Check Console)
                    </button>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px', background: 'red' }}>
                        Close / Reload
                    </button>
                </div>
            </div>

            <p>Identify each image below. Select what it represents in the game.</p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '15px'
            }}>
                {ALL_IMAGES.map(img => {
                    const assigned = assignments[img] || '';
                    const isAssigned = assigned && assigned !== '--- Ignore/Unused ---';

                    return (
                        <div key={img} style={{
                            border: isAssigned ? '2px solid #4caf50' : '1px solid #444',
                            padding: '10px',
                            background: '#222',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <img src={img} alt="sprite" style={{ width: '62px', height: '62px', background: 'rgba(0,0,0,0.5)' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                <span style={{ fontSize: '0.8em', color: '#888', marginBottom: '5px' }}>{img.split('/').pop()}</span>
                                <select
                                    value={assigned}
                                    onChange={(e) => handleAssign(img, e.target.value)}
                                    style={{
                                        padding: '5px',
                                        background: isAssigned ? '#1e3a1e' : '#333',
                                        color: 'white',
                                        border: '1px solid #555'
                                    }}
                                >
                                    <option value="">-- Select Meaning --</option>
                                    {ALL_KEYS.map(k => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
