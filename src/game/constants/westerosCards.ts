export interface WesterosCard {
    deck: 1 | 2 | 3;
    id: string;
    name: string;
    text: string;
    wildlingIcon?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
// Official 2nd Edition card composition (from Swords & Ravens reference)
// Each deck has exactly 10 cards with proper duplicate quantities.
// ═══════════════════════════════════════════════════════════════════════

export const WESTEROS_DECK_1: WesterosCard[] = [
    // Supply ×3
    { deck: 1, id: 'w1-supply-1', name: 'Supply', text: 'Adjust Supply track. Reconcile armies.' },
    { deck: 1, id: 'w1-supply-2', name: 'Supply', text: 'Adjust Supply track. Reconcile armies.' },
    { deck: 1, id: 'w1-supply-3', name: 'Supply', text: 'Adjust Supply track. Reconcile armies.' },
    // Mustering ×3
    { deck: 1, id: 'w1-mustering-1', name: 'Mustering', text: 'Muster units in Strongholds and Castles.' },
    { deck: 1, id: 'w1-mustering-2', name: 'Mustering', text: 'Muster units in Strongholds and Castles.' },
    { deck: 1, id: 'w1-mustering-3', name: 'Mustering', text: 'Muster units in Strongholds and Castles.' },
    // A Throne of Blades ×2 (wildling icon)
    { deck: 1, id: 'w1-throne-of-blades-1', name: 'A Throne of Blades', text: 'Holder of Iron Throne chooses: Supply or Mustering.', wildlingIcon: true },
    { deck: 1, id: 'w1-throne-of-blades-2', name: 'A Throne of Blades', text: 'Holder of Iron Throne chooses: Supply or Mustering.', wildlingIcon: true },
    // Winter is Coming ×1
    { deck: 1, id: 'w1-winter-is-coming', name: 'Winter is Coming', text: 'Reshuffle this deck. Draw a new card.' },
    // Last Days of Summer ×1 (wildling icon)
    { deck: 1, id: 'w1-last-days-of-summer', name: 'Last Days of Summer', text: 'Nothing happens.', wildlingIcon: true },
];

export const WESTEROS_DECK_2: WesterosCard[] = [
    // Clash of Kings ×3
    { deck: 2, id: 'w2-clash-of-kings-1', name: 'Clash of Kings', text: 'Bid Power tokens on Influence Tracks.' },
    { deck: 2, id: 'w2-clash-of-kings-2', name: 'Clash of Kings', text: 'Bid Power tokens on Influence Tracks.' },
    { deck: 2, id: 'w2-clash-of-kings-3', name: 'Clash of Kings', text: 'Bid Power tokens on Influence Tracks.' },
    // Game of Thrones ×3
    { deck: 2, id: 'w2-game-of-thrones-1', name: 'Game of Thrones', text: 'Collect Power tokens from Consolidate Power orders.' },
    { deck: 2, id: 'w2-game-of-thrones-2', name: 'Game of Thrones', text: 'Collect Power tokens from Consolidate Power orders.' },
    { deck: 2, id: 'w2-game-of-thrones-3', name: 'Game of Thrones', text: 'Collect Power tokens from Consolidate Power orders.' },
    // Dark Wings, Dark Words ×2 (wildling icon)
    { deck: 2, id: 'w2-dark-wings-1', name: 'Dark Wings, Dark Words', text: 'Holder of Messenger Raven chooses: Clash of Kings or Game of Thrones.', wildlingIcon: true },
    { deck: 2, id: 'w2-dark-wings-2', name: 'Dark Wings, Dark Words', text: 'Holder of Messenger Raven chooses: Clash of Kings or Game of Thrones.', wildlingIcon: true },
    // Winter is Coming ×1
    { deck: 2, id: 'w2-winter-is-coming', name: 'Winter is Coming', text: 'Reshuffle this deck. Draw a new card.' },
    // Last Days of Summer ×1 (wildling icon)
    { deck: 2, id: 'w2-last-days-of-summer', name: 'Last Days of Summer', text: 'Nothing happens.', wildlingIcon: true },
];

export const WESTEROS_DECK_3: WesterosCard[] = [
    // Wildling Attack ×3
    { deck: 3, id: 'w3-wildling-attack-1', name: 'Wildling Attack', text: 'Wildlings Attack! Bid Power to defend.' },
    { deck: 3, id: 'w3-wildling-attack-2', name: 'Wildling Attack', text: 'Wildlings Attack! Bid Power to defend.' },
    { deck: 3, id: 'w3-wildling-attack-3', name: 'Wildling Attack', text: 'Wildlings Attack! Bid Power to defend.' },
    // Put to the Sword ×2 (wildling icon)
    { deck: 3, id: 'w3-put-to-the-sword-1', name: 'Put to the Sword', text: 'Holder of Valyrian Steel Blade chooses one restriction.', wildlingIcon: true },
    { deck: 3, id: 'w3-put-to-the-sword-2', name: 'Put to the Sword', text: 'Holder of Valyrian Steel Blade chooses one restriction.', wildlingIcon: true },
    // Sea of Storms ×1 (wildling icon)
    { deck: 3, id: 'w3-sea-of-storms', name: 'Sea of Storms', text: 'No Raid orders this round.', wildlingIcon: true },
    // Rains of Autumn ×1 (wildling icon)
    { deck: 3, id: 'w3-rains-of-autumn', name: 'Rains of Autumn', text: 'No March +1 orders this round.', wildlingIcon: true },
    // Feast for Crows ×1 (wildling icon)
    { deck: 3, id: 'w3-feast-for-crows', name: 'Feast for Crows', text: 'No Consolidate Power orders this round.', wildlingIcon: true },
    // Web of Lies ×1 (wildling icon)
    { deck: 3, id: 'w3-web-of-lies', name: 'Web of Lies', text: 'No Support orders this round.', wildlingIcon: true },
    // Storm of Swords ×1 (wildling icon)
    { deck: 3, id: 'w3-storm-of-swords', name: 'Storm of Swords', text: 'No Defense orders this round.', wildlingIcon: true },
];

export const SUPPLY_LIMITS = [
    // 0..6 supply
    { armies: [2, 2] }, // 0
    { armies: [3, 2] }, // 1
    { armies: [3, 2, 2] }, // 2
    { armies: [3, 2, 2, 2] }, // 3
    { armies: [3, 3, 2, 2] }, // 4
    { armies: [4, 3, 2, 2] }, // 5
    { armies: [4, 3, 2, 2, 2] }, // 6
];
