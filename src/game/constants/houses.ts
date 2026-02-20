import { HouseName, Card, HouseProfile, UnitType } from '../types';

// ═══════════════════════════════════════════════════════════════════════
// House Cards — ported from verified Ruby implementation (house_card.rb)
// ═══════════════════════════════════════════════════════════════════════

export const HOUSE_CARDS: Record<HouseName, Card[]> = {
    Stark: [
        { id: 'stark-eddard', name: 'Eddard Stark', house: 'Stark', strength: 4, swords: 2, text: '' },
        { id: 'stark-robb', name: 'Robb Stark', house: 'Stark', strength: 3, text: 'If you win this combat, you may choose the area to which your opponent retreats. You must choose a legal area where your opponent loses the fewest units.' },
        { id: 'stark-greatjon', name: 'Greatjon Umber', house: 'Stark', strength: 2, swords: 2, text: '' },
        { id: 'stark-bolton', name: 'Roose Bolton', house: 'Stark', strength: 2, text: 'If you lose this combat, return your entire House card discard pile into your hand (including this card).' },
        { id: 'stark-blackfish', name: 'The Blackfish', house: 'Stark', strength: 1, text: 'You do not take casualties in this combat from House card abilities, Combat icons, or Tides of Battle cards.' },
        { id: 'stark-ser-rodrick', name: 'Ser Rodrik Cassel', house: 'Stark', strength: 1, fortifications: 2, text: '' },
        { id: 'stark-catelyn', name: 'Catelyn Stark', house: 'Stark', strength: 0, text: 'If you have a Defense Order token in the embattled area, its defense value is doubled.' },
    ],
    Lannister: [
        { id: 'lan-tywin', name: 'Tywin Lannister', house: 'Lannister', strength: 4, text: 'If you win this combat, gain two Power tokens.' },
        { id: 'lan-gregor', name: 'Ser Gregor Clegane', house: 'Lannister', strength: 3, swords: 3, text: '' },
        { id: 'lan-jaime', name: 'Ser Jaime Lannister', house: 'Lannister', strength: 2, swords: 1, text: '' },
        { id: 'lan-hound', name: 'The Hound', house: 'Lannister', strength: 2, fortifications: 2, text: '' },
        { id: 'lan-tyrion', name: 'Tyrion Lannister', house: 'Lannister', strength: 1, text: "You may immediately cancel your opponent's House card and return it to his hand. He must then choose a different House card to reveal. If he has no other House cards in hand, he cannot use a House card this combat." },
        { id: 'lan-kevan', name: 'Ser Kevan Lannister', house: 'Lannister', strength: 1, text: 'If you are attacking, all of your participating Footmen (including supporting Lannister footmen) add +2 combat strength instead of +1.' },
        { id: 'lan-cersei', name: 'Cersei Lannister', house: 'Lannister', strength: 0, text: "If you win this combat, you may remove one of the losing opponent's Order tokens from anywhere on the board." },
    ],
    Baratheon: [
        { id: 'bar-stannis', name: 'Stannis Baratheon', house: 'Baratheon', strength: 4, text: 'If your opponent has a higher position on the Iron Throne Influence track than you, this card gains +1 combat strength.' },
        { id: 'bar-renly', name: 'Renly Baratheon', house: 'Baratheon', strength: 3, text: 'If you win this combat, you may upgrade one of your participating Footmen (or one supporting Baratheon Footman) to a Knight.' },
        { id: 'bar-brienne', name: 'Brienne of Tarth', house: 'Baratheon', strength: 2, swords: 1, fortifications: 1, text: '' },
        { id: 'bar-davos', name: 'Ser Davos Seaworth', house: 'Baratheon', strength: 2, text: 'If "Stannis Baratheon" is in your discard pile, this card gains +1 combat strength and a sword icon.' },
        { id: 'bar-melisandre', name: 'Melisandre', house: 'Baratheon', strength: 1, swords: 1, text: '' },
        { id: 'bar-salla', name: 'Salladhor Saan', house: 'Baratheon', strength: 1, text: 'If you are being supported in this combat, the combat strength of all non-Baratheon Ships is reduced to 0.' },
        { id: 'bar-patchface', name: 'Patchface', house: 'Baratheon', strength: 0, text: "After combat, you may look at your opponent's hand and discard one card of your choice." },
    ],
    Greyjoy: [
        { id: 'grey-euron', name: "Euron Crow's Eye", house: 'Greyjoy', strength: 4, swords: 1, text: '' },
        { id: 'grey-victarion', name: 'Victarion Greyjoy', house: 'Greyjoy', strength: 3, text: 'If you are attacking, all of your participating Ships (incl. supporting Greyjoy Ships) add +2 combat strength instead of +1.' },
        { id: 'grey-balon', name: 'Balon Greyjoy', house: 'Greyjoy', strength: 2, text: "The printed combat strength of your opponent's House card is reduced to 0." },
        { id: 'grey-theon', name: 'Theon Greyjoy', house: 'Greyjoy', strength: 2, text: 'If you are defending an area that contains either a Stronghold or a Castle, this card gains +1 combat strength and a sword icon.' },
        { id: 'grey-asha', name: 'Asha Greyjoy', house: 'Greyjoy', strength: 1, text: 'If you are not being supported in this combat, this card gains two sword icons and one fortification icon.' },
        { id: 'grey-dagmer', name: 'Dagmer Cleftjaw', house: 'Greyjoy', strength: 1, swords: 1, fortifications: 1, text: '' },
        { id: 'grey-aeron', name: 'Aeron Damphair', house: 'Greyjoy', strength: 0, text: 'You may immediately discard two of your available Power tokens to discard Aeron Damphair and choose a different House card from your hand (if able).' },
    ],
    Tyrell: [
        { id: 'tyr-mace', name: 'Mace Tyrell', house: 'Tyrell', strength: 4, text: "Immediately destroy one of your opponent's attacking or defending Footman units." },
        { id: 'tyr-loras', name: 'Ser Loras Tyrell', house: 'Tyrell', strength: 3, text: 'If you are attacking and win this combat, move the March Order token into the conquered area. The March Order may be resolved again later this round.' },
        { id: 'tyr-garlan', name: 'Ser Garlan Tyrell', house: 'Tyrell', strength: 2, swords: 2, text: '' },
        { id: 'tyr-randyll', name: 'Randyll Tarly', house: 'Tyrell', strength: 2, swords: 2, text: '' },
        { id: 'tyr-margaery', name: 'Margaery Tyrell', house: 'Tyrell', strength: 1, fortifications: 1, text: '' },
        { id: 'tyr-alester', name: 'Alester Florent', house: 'Tyrell', strength: 1, fortifications: 1, text: '' },
        { id: 'tyr-queen', name: 'Queen of Thorns', house: 'Tyrell', strength: 0, text: "Immediately remove one of your opponent's Order tokens in any one area adjacent to the embattled area. You may not remove the March Order token used to start this combat." },
    ],
    Martell: [
        { id: 'mar-viper', name: 'The Red Viper', house: 'Martell', strength: 4, swords: 2, fortifications: 1, text: '' },
        { id: 'mar-areo', name: 'Areo Hotah', house: 'Martell', strength: 3, fortifications: 1, text: '' },
        { id: 'mar-obara', name: 'Obara Sand', house: 'Martell', strength: 2, swords: 1, text: '' },
        { id: 'mar-darkstar', name: 'Darkstar', house: 'Martell', strength: 2, swords: 1, text: '' },
        { id: 'mar-nymeria', name: 'Nymeria Sand', house: 'Martell', strength: 1, text: 'If you are defending, this card gains a fortification icon. If you are attacking, this card gains a sword icon.' },
        { id: 'mar-arianne', name: 'Arianne Martell', house: 'Martell', strength: 1, text: 'If you are defending and lose this combat, your opponent may not move his units into the embattled area. They return to the area from which they marched. Your own units must still retreat.' },
        { id: 'mar-doran', name: 'Doran Martell', house: 'Martell', strength: 0, text: 'Immediately move your opponent to the bottom of one Influence track of your choice.' },
    ]
};

// ═══════════════════════════════════════════════════════════════════════
// Starting positions — ported from verified Ruby implementation (house.rb)
// ═══════════════════════════════════════════════════════════════════════

export interface StartingUnit {
    area: string;
    units: UnitType[];
}

export interface HouseSetup {
    homeArea: string;
    initialSupply: number;
    minimumPlayers: number;
    startingPositions: {
        ironThrone: number;
        fiefdoms: number;
        kingsCourt: number;
    };
    startingUnits: StartingUnit[];
}

export const HOUSE_SETUP: Record<HouseName, HouseSetup> = {
    Stark: {
        homeArea: 'Winterfell',
        initialSupply: 1,
        minimumPlayers: 3,
        startingPositions: { ironThrone: 3, fiefdoms: 4, kingsCourt: 2 },
        startingUnits: [
            { area: 'Winterfell', units: ['Knight', 'Footman'] },
            { area: 'White Harbor', units: ['Footman'] },
            { area: 'The Shivering Sea', units: ['Ship'] },
        ],
    },
    Lannister: {
        homeArea: 'Lannisport',
        initialSupply: 2,
        minimumPlayers: 3,
        startingPositions: { ironThrone: 2, fiefdoms: 6, kingsCourt: 1 },
        startingUnits: [
            { area: 'Lannisport', units: ['Knight', 'Footman'] },
            { area: 'Stoney Sept', units: ['Footman'] },
            { area: 'The Golden Sound', units: ['Ship'] },
        ],
    },
    Baratheon: {
        homeArea: 'Dragonstone',
        initialSupply: 2,
        minimumPlayers: 3,
        startingPositions: { ironThrone: 1, fiefdoms: 5, kingsCourt: 4 },
        startingUnits: [
            { area: 'Dragonstone', units: ['Knight', 'Footman'] },
            { area: 'Kingswood', units: ['Footman'] },
            { area: 'Shipbreaker Bay', units: ['Ship', 'Ship'] },
        ],
    },
    Greyjoy: {
        homeArea: 'Pyke',
        initialSupply: 2,
        minimumPlayers: 4,
        startingPositions: { ironThrone: 5, fiefdoms: 1, kingsCourt: 6 },
        startingUnits: [
            { area: 'Pyke', units: ['Knight', 'Footman'] },
            { area: 'Pyke Port', units: ['Ship'] },
            { area: 'Greywater Watch', units: ['Footman'] },
            { area: "Ironman's Bay", units: ['Ship'] },
        ],
    },
    Tyrell: {
        homeArea: 'Highgarden',
        initialSupply: 2,
        minimumPlayers: 5,
        startingPositions: { ironThrone: 6, fiefdoms: 2, kingsCourt: 5 },
        startingUnits: [
            { area: 'Highgarden', units: ['Knight', 'Footman'] },
            { area: 'Dornish Marches', units: ['Footman'] },
            { area: 'Redwyne Straits', units: ['Ship'] },
        ],
    },
    Martell: {
        homeArea: 'Sunspear',
        initialSupply: 2,
        minimumPlayers: 6,
        startingPositions: { ironThrone: 4, fiefdoms: 3, kingsCourt: 3 },
        startingUnits: [
            { area: 'Sunspear', units: ['Knight', 'Footman'] },
            { area: 'Salt Shore', units: ['Footman'] },
            { area: 'Sea of Dorne', units: ['Ship'] },
        ],
    },
};

// ═══════════════════════════════════════════════════════════════════════
// Initial house profiles (used by engine.ts during game setup)
// ═══════════════════════════════════════════════════════════════════════

export const INITIAL_HOUSE_ESTIMATES: Record<HouseName, Partial<HouseProfile>> = {
    Stark: {
        color: '#E0E0E0',
        influence: { ironThrone: 3, fiefdoms: 4, kingsCourt: 2 },
        supply: 1,
        power: 5
    },
    Lannister: {
        color: '#D81B1B',
        influence: { ironThrone: 2, fiefdoms: 6, kingsCourt: 1 },
        supply: 2,
        power: 5
    },
    Baratheon: {
        color: '#FFE200',
        influence: { ironThrone: 1, fiefdoms: 5, kingsCourt: 4 },
        supply: 2,
        power: 5
    },
    Greyjoy: {
        color: '#383838',
        influence: { ironThrone: 5, fiefdoms: 1, kingsCourt: 6 },
        supply: 2,
        power: 5
    },
    Tyrell: {
        color: '#269018',
        influence: { ironThrone: 6, fiefdoms: 2, kingsCourt: 5 },
        supply: 2,
        power: 5
    },
    Martell: {
        color: '#E87D00',
        influence: { ironThrone: 4, fiefdoms: 3, kingsCourt: 3 },
        supply: 2,
        power: 5
    }
};
