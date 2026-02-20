// Base URL for asset paths — works both in dev ("/") and on GitHub Pages ("/got-board-game/")
const BASE = import.meta.env.BASE_URL;

export const AREA_LAYOUT: Record<string, { top: string; left: string }> = {
    // --- North ---
    'Castle Black': { top: '11%', left: '46%' },
    'Karhold': { top: '19%', left: '58%' },
    'The Stony Shore': { top: '32%', left: '18%' },
    'Winterfell': { top: '31%', left: '33%' },
    'Winterfell Port': { top: '17%', left: '21%' },
    'White Harbor': { top: '28%', left: '44%' },
    'White Harbor Port': { top: '36%', left: '46%' },
    "Widow's Watch": { top: '28%', left: '54%' },

    // --- Riverlands / Central ---
    'Moat Cailin': { top: '42%', left: '33%' },
    'Greywater Watch': { top: '38%', left: '26%' },
    "Flint's Finger": { top: '39%', left: '18%' },
    'Seagard': { top: '48%', left: '30%' },
    'The Twins': { top: '47%', left: '38%' },
    'The Fingers': { top: '44%', left: '51%' },
    'The Mountains of the Moon': { top: '48%', left: '57%' },
    'The Eyrie': { top: '53%', left: '56%' },

    // --- Westerlands ---
    'Riverrun': { top: '53%', left: '31%' },
    'Lannisport': { top: '60%', left: '20%' },
    'Lannisport Port': { top: '59%', left: '14%' },
    'Stoney Sept': { top: '59%', left: '32%' },
    'Searoad Marches': { top: '66%', left: '19%' },

    // --- Crownlands ---
    'Harrenhal': { top: '58%', left: '40%' },
    'Crackclaw Point': { top: '60%', left: '51%' },
    "King's Landing": { top: '67%', left: '48%' },
    'Blackwater': { top: '66%', left: '39%' },
    'Kingswood': { top: '71%', left: '54%' },

    // --- South ---
    "Storm's End": { top: '77%', left: '53%' },
    "Storm's End Port": { top: '77%', left: '60%' },
    'Highgarden': { top: '77%', left: '20%' },
    'The Reach': { top: '74%', left: '29%' },
    'Dornish Marches': { top: '79%', left: '29%' },
    'Oldtown': { top: '84%', left: '16%' },
    'Oldtown Port': { top: '81%', left: '10%' },
    'Three Towers': { top: '88%', left: '22%' },

    // --- Dorne ---
    'The Boneway': { top: '81%', left: '41%' },
    "Prince's Pass": { top: '84%', left: '29%' },
    'Yronwood': { top: '88%', left: '40%' },
    'Starfall': { top: '92%', left: '32%' },
    'Salt Shore': { top: '92%', left: '43%' },
    'Sunspear': { top: '89%', left: '58%' },
    'Sunspear Port': { top: '90%', left: '67%' },

    // --- Islands ---
    'Pyke': { top: '47%', left: '12%' },
    'Pyke Port': { top: '47%', left: '18%' },
    'Dragonstone': { top: '60%', left: '67%' },
    'Dragonstone Port': { top: '65%', left: '71%' },
    'The Arbor': { top: '94%', left: '9%' },

    // --- Seas ---
    'Bay of Ice': { top: '32%', left: '5%' },
    'The Shivering Sea': { top: '27%', left: '64%' },
    'Sunset Sea': { top: '67.5%', left: '7%' },
    "Ironman's Bay": { top: '53%', left: '7%' },
    'The Golden Sound': { top: '61%', left: '8%' },
    'The Narrow Sea': { top: '41%', left: '70%' },
    'Blackwater Bay': { top: '64%', left: '58%' },
    'Shipbreaker Bay': { top: '74%', left: '70%' },
    'Redwyne Straits': { top: '87%', left: '6%' },
    'West Summer Sea': { top: '74%', left: '5%' },
    'East Summer Sea': { top: '96%', left: '69%' },
    'Sea of Dorne': { top: '85%', left: '60%' },
};

// Tokens sprite map
// Row 0 spans the ENTIRE sheet (cols 0-10) for Order tokens.
// Rows 1-4 left (cols 0-5) are house-specific tokens.
export const TOKEN_SPRITES: Record<string, string> = {
    // === Order Tokens (Row 0, cols 0-10) ===
    // March: -1, 0, +1★
    'order-March--1': `${BASE}images/sprite_left_r0_c0.png`,
    'order-March-0': `${BASE}images/sprite_left_r0_c1.png`,
    'order-March-1': `${BASE}images/sprite_left_r0_c2.png`,
    'order-Defense-0': `${BASE}images/sprite_left_r0_c3.png`,
    'order-Defense-1': `${BASE}images/sprite_left_r0_c4.png`,
    'order-Support-0': `${BASE}images/sprite_left_r0_c5.png`,
    'order-Support-1': `${BASE}images/sprite_right_r0_c6.png`,
    'order-Raid-0': `${BASE}images/sprite_right_r0_c7.png`,
    'order-Raid-1': `${BASE}images/sprite_right_r0_c8.png`,
    'order-ConsolidatePower-0': `${BASE}images/sprite_right_r0_c9.png`,
    'order-ConsolidatePower-1': `${BASE}images/sprite_right_r0_c10.png`,

    'influence-Lannister': `${BASE}images/sprite_left_r1_c0.png`,
    'influence-Stark': `${BASE}images/sprite_left_r1_c1.png`,
    'influence-Baratheon': `${BASE}images/sprite_left_r1_c2.png`,
    'influence-Greyjoy': `${BASE}images/sprite_left_r1_c3.png`,
    'influence-Tyrell': `${BASE}images/sprite_left_r1_c4.png`,
    'influence-Martell': `${BASE}images/sprite_left_r1_c5.png`,

    'power-Lannister': `${BASE}images/sprite_left_r2_c0.png`,
    'power-Stark': `${BASE}images/sprite_left_r2_c1.png`,
    'power-Baratheon': `${BASE}images/sprite_left_r2_c2.png`,
    'power-Greyjoy': `${BASE}images/sprite_left_r2_c3.png`,
    'power-Tyrell': `${BASE}images/sprite_left_r2_c4.png`,
    'power-Martell': `${BASE}images/sprite_left_r2_c5.png`,

    'supply-Lannister': `${BASE}images/sprite_left_r3_c0.png`,
    'supply-Stark': `${BASE}images/sprite_left_r3_c1.png`,
    'supply-Baratheon': `${BASE}images/sprite_left_r3_c2.png`,
    'supply-Greyjoy': `${BASE}images/sprite_left_r3_c3.png`,
    'supply-Tyrell': `${BASE}images/sprite_left_r3_c4.png`,
    'supply-Martell': `${BASE}images/sprite_left_r3_c5.png`,

    'victory-Lannister': `${BASE}images/sprite_left_r4_c0.png`,
    'victory-Stark': `${BASE}images/sprite_left_r4_c1.png`,
    'victory-Baratheon': `${BASE}images/sprite_left_r4_c2.png`,
    'victory-Greyjoy': `${BASE}images/sprite_left_r4_c3.png`,
    'victory-Tyrell': `${BASE}images/sprite_left_r4_c4.png`,
    'victory-Martell': `${BASE}images/sprite_left_r4_c5.png`,
};

// Unit Sprites (Right Side = Cols 6-11, Rows 1-4)
// Cols 6-9: Lannister(r1), Stark(r2), Baratheon(r3), Greyjoy(r4)
// Col 10: Tyrell (rows 1-4), Col 11: Martell (rows 1-4)
// Within each house: Footman, Knight, Ship, SiegeEngine
export const UNIT_SPRITES: Record<string, string> = {
    'Lannister-Footman': `${BASE}images/sprite_right_r1_c6.png`,
    'Lannister-Knight': `${BASE}images/sprite_right_r1_c7.png`,
    'Lannister-Ship': `${BASE}images/sprite_right_r1_c8.png`,
    'Lannister-SiegeEngine': `${BASE}images/sprite_right_r1_c9.png`,

    'Stark-Footman': `${BASE}images/sprite_right_r2_c6.png`,
    'Stark-Knight': `${BASE}images/sprite_right_r2_c7.png`,
    'Stark-Ship': `${BASE}images/sprite_right_r2_c8.png`,
    'Stark-SiegeEngine': `${BASE}images/sprite_right_r2_c9.png`,

    'Baratheon-Footman': `${BASE}images/sprite_right_r3_c6.png`,
    'Baratheon-Knight': `${BASE}images/sprite_right_r3_c7.png`,
    'Baratheon-Ship': `${BASE}images/sprite_right_r3_c8.png`,
    'Baratheon-SiegeEngine': `${BASE}images/sprite_right_r3_c9.png`,

    'Greyjoy-Footman': `${BASE}images/sprite_right_r4_c6.png`,
    'Greyjoy-Knight': `${BASE}images/sprite_right_r4_c7.png`,
    'Greyjoy-Ship': `${BASE}images/sprite_right_r4_c8.png`,
    'Greyjoy-SiegeEngine': `${BASE}images/sprite_right_r4_c9.png`,

    'Tyrell-Footman': `${BASE}images/sprite_right_r1_c10.png`,
    'Tyrell-Knight': `${BASE}images/sprite_right_r2_c10.png`,
    'Tyrell-Ship': `${BASE}images/sprite_right_r3_c10.png`,
    'Tyrell-SiegeEngine': `${BASE}images/sprite_right_r4_c10.png`,

    'Martell-Footman': `${BASE}images/sprite_right_r1_c11.png`,
    'Martell-Knight': `${BASE}images/sprite_right_r2_c11.png`,
    'Martell-Ship': `${BASE}images/sprite_right_r3_c11.png`,
    'Martell-SiegeEngine': `${BASE}images/sprite_right_r4_c11.png`,
};

// Track Layout (Estimated Positions based on Screenshot)
// Board is tall (1464x2175). Assumed top-left origin.
export const TRACK_LAYOUT: Record<string, { top: string; left: string }[]> = {
    // Iron Throne (1-6) - Top Right, Vertical
    'ironThrone': [
        { top: '8%', left: '76%' },
        { top: '8%', left: '81%' },
        { top: '8%', left: '86%' },
        { top: '8%', left: '91%' },
        { top: '8%', left: '96%' },
        { top: '12%', left: '96%' },
    ],
    // Fiefdoms (1-6) - Middle Right
    'fiefdoms': [
        { top: '18%', left: '76%' },
        { top: '18%', left: '81%' },
        { top: '18%', left: '86%' },
        { top: '18%', left: '91%' },
        { top: '18%', left: '96%' },
        { top: '22%', left: '96%' },
    ],
    // King's Court (1-6) - Lower Right
    'kingsCourt': [
        { top: '28%', left: '76%' },
        { top: '28%', left: '81%' },
        { top: '28%', left: '86%' },
        { top: '28%', left: '91%' },
        { top: '28%', left: '96%' },
        { top: '32%', left: '96%' },
    ],
    // Supply (Vertical Column, Right side below Influence)
    'supply': [
        { top: '65%', left: '84%' }, // 0 (Bottom?)
        { top: '60%', left: '84%' }, // 1
        { top: '55%', left: '84%' }, // 2
        { top: '50%', left: '84%' }, // 3
        { top: '45%', left: '84%' }, // 4
        { top: '40%', left: '84%' }, // 5
        { top: '35%', left: '84%' }, // 6 (Top)
    ],
    // Wildling (Top Center-Left, Horizontal)
    'wildling': [
        { top: '2%', left: '25%' }, // 0
        { top: '2%', left: '30%' }, // 2
        { top: '2%', left: '35%' }, // 4
        { top: '2%', left: '40%' }, // 6
        { top: '2%', left: '45%' }, // 8
        { top: '2%', left: '50%' }, // 10
        { top: '2%', left: '60%' }, // 12 (Jump?)
    ],
    // Round (Bottom Right, Vertical Column, Left of Victory)
    'round': [
        { top: '75%', left: '78%' }, // 1
        { top: '78%', left: '78%' }, // 2
        { top: '81%', left: '78%' }, // 3
        { top: '84%', left: '78%' }, // 4
        { top: '87%', left: '78%' }, // 5
        { top: '90%', left: '78%' }, // 6
        { top: '93%', left: '78%' }, // 7
        { top: '96%', left: '78%' }, // 8
        { top: '99%', left: '78%' }, // 9
        { top: '99%', left: '82%' }, // 10
    ],
    // Victory (Bottom Right, Vertical Column, Rightmost)
    'victory': [
        { top: '75%', left: '92%' }, // 1
        { top: '78%', left: '92%' }, // 2
        { top: '81%', left: '92%' }, // 3
        { top: '84%', left: '92%' }, // 4
        { top: '87%', left: '92%' }, // 5
        { top: '90%', left: '92%' }, // 6
        { top: '93%', left: '92%' }, // 7
    ]
};
