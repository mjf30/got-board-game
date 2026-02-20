import { WildlingCard } from './constants/wildlingCards';
import { WesterosCard } from './constants/westerosCards';

export type HouseName = 'Stark' | 'Lannister' | 'Baratheon' | 'Greyjoy' | 'Tyrell' | 'Martell';

export type UnitType = 'Footman' | 'Knight' | 'Ship' | 'SiegeEngine';

export type OrderType = 'March' | 'Raid' | 'Support' | 'Defense' | 'ConsolidatePower';

export type ActionSubPhase = 'Raid' | 'March' | 'ConsolidatePower' | 'Done';

export interface Unit {
    id: string;
    type: UnitType;
    house: HouseName;
    routed: boolean;
}

export interface Order {
    id: string;
    type: OrderType;
    house: HouseName;
    strength: number;
    star: boolean;
    tokenIndex: number;
}

/** Each house has 15 order tokens with fixed strengths */
export interface OrderTokenDef {
    type: OrderType;
    strength: number;
    star: boolean;
    label: string;
}

export const ORDER_TOKENS: OrderTokenDef[] = [
    // March (3 tokens)
    { type: 'March', strength: -1, star: false, label: 'March -1' },
    { type: 'March', strength: 0, star: false, label: 'March 0' },
    { type: 'March', strength: 1, star: true, label: 'March +1★' },
    // Defense (3 tokens)
    { type: 'Defense', strength: 1, star: false, label: 'Defense +1' },
    { type: 'Defense', strength: 1, star: false, label: 'Defense +1' },
    { type: 'Defense', strength: 2, star: true, label: 'Defense +2★' },
    // Support (3 tokens)
    { type: 'Support', strength: 0, star: false, label: 'Support' },
    { type: 'Support', strength: 0, star: false, label: 'Support' },
    { type: 'Support', strength: 1, star: true, label: 'Support +1★' },
    // Raid (3 tokens)
    { type: 'Raid', strength: 0, star: false, label: 'Raid' },
    { type: 'Raid', strength: 0, star: false, label: 'Raid' },
    { type: 'Raid', strength: 0, star: true, label: 'Raid★' },
    // Consolidate Power (3 tokens)
    { type: 'ConsolidatePower', strength: 0, star: false, label: 'CP' },
    { type: 'ConsolidatePower', strength: 0, star: false, label: 'CP' },
    { type: 'ConsolidatePower', strength: 0, star: true, label: 'CP★' },
];

/** King's Court track → max star orders allowed, keyed by player count then position (1-based).
 *  Official rulebook values for 3/4/5/6 players. */
export const STAR_ORDER_LIMITS: Record<number, Record<number, number>> = {
    6: { 1: 3, 2: 3, 3: 2, 4: 1, 5: 0, 6: 0 },
    5: { 1: 3, 2: 3, 3: 2, 4: 1, 5: 0 },
    4: { 1: 3, 2: 3, 3: 1, 4: 0 },
    3: { 1: 3, 2: 2, 3: 1 },
};

/** Get star order limit for a given position and player count */
export function getStarLimit(playerCount: number, position: number): number {
    const table = STAR_ORDER_LIMITS[playerCount] ?? STAR_ORDER_LIMITS[6];
    return table[position] ?? 0;
}

/** Mustering points: Stronghold = 2, Castle = 1. Unit costs: Footman=1, Knight=2, Ship=1, SiegeEngine=2 */
export const MUSTER_COSTS: Record<UnitType, number> = {
    Footman: 1,
    Knight: 2,
    Ship: 1,
    SiegeEngine: 2
};

export interface Card {
    id: string;
    name: string;
    house: HouseName;
    strength: number;
    text: string;
    swords?: number;
    fortifications?: number;
}

export interface Area {
    id: string;
    name: string;
    type: 'Land' | 'Sea' | 'Port';
    castle?: boolean;
    stronghold?: boolean;
    supply?: number;
    power?: number;
    adjacent: string[];
    units: Unit[];
    order?: Order | null;
    house?: HouseName | null;
    // Port-specific fields
    connectedLand?: string;   // For ports: which land area this port belongs to
    connectedSea?: string;    // For ports: which sea area this port opens into
    maxShips?: number;        // For ports: max ships (always 3)
    // Blocked region (3-player game: impassable areas)
    blocked?: boolean;
}

export interface HouseProfile {
    name: HouseName;
    color: string;
    influence: {
        ironThrone: number; // 1-6
        fiefdoms: number; // 1-6
        kingsCourt: number; // 1-6
    };
    supply: number;
    power: number;
    availableUnits: Record<UnitType, number>;
    cards: Card[];
    discards: Card[];
    usedOrderTokens: number[];
}

export interface GameState {
    round: number; // 1-10
    phase: 'Westeros' | 'Planning' | 'Action' | 'Combat';
    cas: Record<HouseName, HouseProfile>;
    board: Record<string, Area>;
    turnOrder: HouseName[];
    wildlingThreat: number; // 0-12
    combat?: CombatState;
    garrisons: Record<string, { house: HouseName; strength: number }>;
    currentPlayerHouse: HouseName;
    orderRestrictions?: OrderType[];
    winner?: HouseName;
    pendingPowerTokenArea?: string;
    // Action Phase tracking
    actionSubPhase: ActionSubPhase;
    actionPlayerIndex: number;
    // Valyrian Steel Blade & Messenger Raven
    valyrianSteelBladeUsed: boolean;
    messengerRavenUsed: boolean;
    // Mustering
    pendingMustering?: { house: HouseName; areaId: string; pointsRemaining: number }[];
    // Retreat
    pendingRetreat?: {
        house: HouseName;
        units: Unit[]; // Store full unit objects
        fromAreaId: string;
        possibleAreas: string[];
    };
    pendingDecision?: {
        cardName: string;
        chooser: HouseName; // The house who decides
        options: { label: string; action: string }[];
    };
    // Generic flag for transient UI messages
    uiMessage?: string;
    // Bidding (Clash of Kings, Wildling Attack)
    pendingBidding?: BiddingState;
    // Game of Thrones card (collect power from crown areas)
    pendingGameOfThrones?: boolean;
    // Westeros cards drawn this round (for display)
    drawnWesterosCards?: string[];
    // Current step in resolving Westeros cards (0, 1, 2)
    westerosActionIndex?: number;
    // Active Wildling Card (for display/resolution)
    currentWildlingCard?: WildlingCard;
    // Persistent shuffled Westeros decks (draw from index 0)
    westerosDeck1?: WesterosCard[];
    westerosDeck2?: WesterosCard[];
    westerosDeck3?: WesterosCard[];
    wildlingDeck?: WildlingCard[];
    // Star-only order restrictions (e.g. Rains of Autumn bans only March★)
    orderStarRestrictions?: OrderType[];

    // ═══ INTERACTIVE COMBAT SUB-STATES ═══

    // Support declaration: 3rd-party houses choose which side to support
    pendingSupportDeclarations?: {
        combatAreaId: string;
        attacker: HouseName;
        defender: HouseName;
        pendingHouses: { house: HouseName; areaId: string }[]; // Houses that need to declare
        decisions: Record<string, 'attacker' | 'defender' | 'none'>; // areaId → choice
    };

    // Tyrion Lannister: opponent must pick a new card
    pendingTyrionCancel?: {
        tyrionPlayer: HouseName;    // The side that played Tyrion
        opponent: HouseName;        // The side whose card was cancelled
        cancelledCardId: string;    // The card that was returned to hand
    };

    // Aeron Damphair: player may discard Aeron + 2 power to pick new card
    pendingAeronSwap?: {
        house: HouseName;           // The Aeron player
    };

    // Patchface: winner may view opponent's hand and discard one
    pendingPatchface?: {
        baratheonPlayer: HouseName;
        opponent: HouseName;
        opponentCards: Card[];      // Visible hand for UI
    };

    // Robb Stark: winner chooses defender's retreat area
    pendingRobbRetreat?: {
        robbPlayer: HouseName;
        retreatingHouse: HouseName;
        units: Unit[];
        fromAreaId: string;
        possibleAreas: string[];
    };

    // Reconcile Armies: houses must disband units to meet supply limits
    pendingReconcile?: {
        house: HouseName;
        violations: { areaId: string; currentSize: number; maxAllowed: number }[];
    }[];
}

export type BiddingType = 'ironThrone' | 'fiefdoms' | 'kingsCourt' | 'wildling';

export interface BiddingState {
    type: BiddingType;
    bids: Partial<Record<HouseName, number>>; // Submitted bids
    resolved: boolean;
    // For Clash of Kings: which track are we bidding on (cycles through 3)
    currentTrack?: 'ironThrone' | 'fiefdoms' | 'kingsCourt';
    // For sequential Clash of Kings: remaining tracks to bid
    remainingTracks?: ('ironThrone' | 'fiefdoms' | 'kingsCourt')[];
}

export interface CombatState {
    attacker: HouseName;
    defender: HouseName;
    areaId: string;
    attackingUnits: Unit[];
    defendingUnits: Unit[];
    attackerCard?: string;
    defenderCard?: string;
    attackerStrength: number;
    defenderStrength: number;
    marchFromArea?: string; // Origin of the attack (for retreat)
    attackerUsedBlade?: boolean;
    defenderUsedBlade?: boolean;
    // Third-party support decisions: areaId → side supported
    supportDecisions?: Record<string, 'attacker' | 'defender' | 'none'>;
    // Combat sub-phase tracking
    phase?: 'support' | 'cards' | 'pre-combat' | 'resolution' | 'post-combat';
    // Flags to track whether Aeron/Tyrion checks have been done
    aeronResolved?: boolean;
    tyrionResolved?: boolean;
}
