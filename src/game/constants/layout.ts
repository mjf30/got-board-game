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

/** Extra hit-testing anchors for large/irregular areas (mostly seas).
 *  Clicks pick the nearest anchor among AREA_LAYOUT + these. */
export const AREA_EXTRA_ANCHORS: Record<string, { top: string; left: string }[]> = {
    'Bay of Ice': [
        { top: '13%', left: '7%' }, { top: '20%', left: '4%' }, { top: '27%', left: '8%' },
    ],
    'Sunset Sea': [
        { top: '30%', left: '3%' }, { top: '38%', left: '4%' }, { top: '47%', left: '4%' }, { top: '58%', left: '4%' },
    ],
    'The Shivering Sea': [
        { top: '9%', left: '60%' }, { top: '13%', left: '69%' }, { top: '20%', left: '70%' },
    ],
    'The Narrow Sea': [
        { top: '34%', left: '71%' }, { top: '48%', left: '70%' }, { top: '55%', left: '68%' },
    ],
    "Ironman's Bay": [
        { top: '44%', left: '12%' }, { top: '50%', left: '17%' },
    ],
    'The Golden Sound': [
        { top: '60%', left: '13%' },
    ],
    'Blackwater Bay': [
        { top: '62%', left: '63%' },
    ],
    'Shipbreaker Bay': [
        { top: '69%', left: '70%' }, { top: '78%', left: '67%' },
    ],
    'Sea of Dorne': [
        { top: '83%', left: '63%' },
    ],
    'East Summer Sea': [
        { top: '97%', left: '55%' }, { top: '93%', left: '66%' }, { top: '99%', left: '62%' },
    ],
    'West Summer Sea': [
        { top: '78%', left: '4%' }, { top: '85%', left: '4%' }, { top: '96%', left: '15%' }, { top: '97%', left: '30%' },
    ],
    'Redwyne Straits': [
        { top: '83%', left: '7%' }, { top: '90%', left: '4%' },
    ],
    'The Stony Shore': [
        { top: '27%', left: '15%' },
    ],
};

/** Board regions that are art, not playable areas (clicks are ignored):
 *  the tracks panel on the right and the Wildlings strip on top. */
export const BOARD_DEAD_ZONES = {
    /** x% beyond which the printed tracks panel starts */
    tracksPanelLeft: 73.5,
    /** y% above which the wildling track strip sits */
    wildlingStripBottom: 5.5,
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

// Track Layout — calibrated against the printed tracks on board.png (1464x2175).
// Influence columns: position 1 is at the BOTTOM (next to the dominance token boxes).
const INFLUENCE_Y = ['29.8%', '25.0%', '19.7%', '14.6%', '9.4%', '4.4%']; // index 0 = position 1

export const TRACK_LAYOUT: Record<string, { top: string; left: string }[]> = {
    // Iron Throne (positions 1-6) — leftmost printed column
    'ironThrone': INFLUENCE_Y.map(top => ({ top, left: '79.0%' })),
    // Fiefdoms (1-6) — middle column
    'fiefdoms': INFLUENCE_Y.map(top => ({ top, left: '87.2%' })),
    // King's Court (1-6) — rightmost column (with the printed stars)
    'kingsCourt': INFLUENCE_Y.map(top => ({ top, left: '94.9%' })),
    // Supply scroll (values 0-6, bottom → top)
    'supply': [
        { top: '63.1%', left: '80.3%' }, // 0
        { top: '59.9%', left: '80.3%' }, // 1
        { top: '56.4%', left: '80.3%' }, // 2
        { top: '53.4%', left: '80.3%' }, // 3
        { top: '50.2%', left: '80.3%' }, // 4
        { top: '47.2%', left: '80.3%' }, // 5
        { top: '43.8%', left: '80.3%' }, // 6
    ],
    // Wildlings strip on top (threat 0,2,4,...,12)
    'wildling': [
        { top: '3.5%', left: '20.3%' }, // 0
        { top: '3.5%', left: '25.7%' }, // 2
        { top: '3.5%', left: '31.1%' }, // 4
        { top: '3.5%', left: '36.5%' }, // 6
        { top: '3.5%', left: '41.9%' }, // 8
        { top: '3.5%', left: '47.3%' }, // 10
        { top: '3.5%', left: '52.7%' }, // 12
    ],
    // Round track (1 at the bottom → 10 at the top)
    'round': [
        { top: '96.8%', left: '81.6%' }, // 1
        { top: '93.8%', left: '81.6%' }, // 2
        { top: '90.9%', left: '81.6%' }, // 3
        { top: '87.9%', left: '81.6%' }, // 4
        { top: '84.9%', left: '81.6%' }, // 5
        { top: '81.8%', left: '81.6%' }, // 6
        { top: '78.9%', left: '81.6%' }, // 7
        { top: '75.9%', left: '81.6%' }, // 8
        { top: '73.1%', left: '81.6%' }, // 9
        { top: '70.1%', left: '81.6%' }, // 10
    ],
    // Victory track (1 at the bottom → 7 at the top, gold)
    'victory': [
        { top: '97.0%', left: '93.2%' }, // 1
        { top: '93.1%', left: '93.2%' }, // 2
        { top: '88.2%', left: '93.2%' }, // 3
        { top: '83.9%', left: '93.2%' }, // 4
        { top: '79.1%', left: '93.2%' }, // 5
        { top: '74.9%', left: '93.2%' }, // 6
        { top: '70.1%', left: '93.2%' }, // 7
    ]
};
