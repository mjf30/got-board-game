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
 *  Official rulebook values for 3/4/5/6 players (3-4p use the King's Court overlay: 3/2/1/0). */
export const STAR_ORDER_LIMITS: Record<number, Record<number, number>> = {
    6: { 1: 3, 2: 3, 3: 2, 4: 1, 5: 0, 6: 0 },
    5: { 1: 3, 2: 3, 3: 2, 4: 1, 5: 0 },
    4: { 1: 3, 2: 2, 3: 1, 4: 0 },
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
    /** Power token placed on the board to establish control (stays until an enemy takes the area) */
    powerToken?: HouseName | null;
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
    /** Garrison / Neutral Force tokens. house = null → neutral force (no house card combat, ≥ strength beats it) */
    garrisons: Record<string, { house: HouseName | null; strength: number }>;
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
        /** Units that must be destroyed for supply if this destination is chosen */
        lossByArea?: Record<string, number>;
    };
    pendingDecision?: Decision;
    /** Queue of decisions resolved one at a time (e.g. wildling penalties in turn order) */
    pendingDecisionQueue?: Decision[];

    /** Interactive unit picking (combat casualties, wildling destruction, upgrades, retreat supply losses) */
    pendingUnitSelection?: UnitSelection;
    pendingUnitSelectionQueue?: UnitSelection[];

    /** Bid ties are decided by the holder of the Iron Throne token */
    pendingBidTieBreak?: {
        kind: 'track' | 'wildling-high' | 'wildling-low';
        decider: HouseName;
        tiedHouses: HouseName[];
        /** For 'track': houses already ordered (best position first) */
        ordered: HouseName[];
    };

    /** Messenger Raven: peeked top wildling card awaiting top/bottom placement */
    pendingRavenPeek?: { holder: HouseName; card: WildlingCard };
    /** Messenger Raven: holder chose to swap one order (UI flow) */
    pendingRavenSwap?: { holder: HouseName };
    /** Whether the raven holder was already prompted this round */
    ravenPromptShown?: boolean;
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
        lossByArea?: Record<string, number>;
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
    /** Wildling: houses that do not participate (Preemptive Raid winner) */
    excludedHouses?: HouseName[];
    /** Wildling: fixed attack strength that ignores the threat track (Preemptive Raid re-attack = 6) */
    strengthOverride?: number;
    /** Wildling: highest/lowest bidders (after Iron Throne tie-breaking, if needed) */
    chosenHighest?: HouseName;
    chosenLowest?: HouseName;
}

export interface DecisionOption { label: string; action: string }

export interface Decision {
    cardName: string;
    chooser: HouseName; // The house who decides
    options: DecisionOption[];
}

export type UnitSelectionPurpose =
    | 'combat-casualties'   // loser destroys `count` of his combat units
    | 'destroy-units'       // wildling penalties: destroy `count` units anywhere
    | 'retreat-supply'      // destroy `count` retreating units to respect supply
    | 'crow-upgrade'        // Crow Killers reward: up to 2 footmen → knights
    | 'crow-downgrade'      // Crow Killers penalty: choose `count` knights → footmen
    | 'renly-upgrade';      // Renly: up to 1 participating/supporting footman → knight

export interface UnitSelection {
    purpose: UnitSelectionPurpose;
    house: HouseName;
    count: number;
    /** May pick fewer than count (rewards phrased as "may ... up to") */
    upTo?: boolean;
    eligibleUnitIds: string[];
    prompt: string;
    context?: Record<string, string>;
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
    /** Original march order data (needed by Loras, who moves the token into the conquered area) */
    marchOrderStrength?: number;
    marchOrderTokenIndex?: number;
    attackerUsedBlade?: boolean;
    defenderUsedBlade?: boolean;
    // Support decisions per supporting area: areaId → side supported (includes own support, which may be refused)
    supportDecisions?: Record<string, 'attacker' | 'defender' | 'none'>;
    /** Support strength actually granted per area (used by Queen of Thorns / Salladhor Saan) */
    supportContributions?: Record<string, { side: 'attacker' | 'defender'; amount: number; house: HouseName; ships: number }>;
    // Combat sub-phase tracking
    phase?: 'support' | 'cards' | 'pre-combat' | 'casualties' | 'post-combat';
    // Flags for one-time reveal abilities
    aeronResolved?: boolean;
    tyrionResolved?: boolean;
    doranResolved?: boolean;
    queenResolved?: boolean;
    revealEffectsDone?: boolean;
    /** Tyrion cancelled the card and opponent had no replacement → fights without a card */
    attackerNoCard?: boolean;
    defenderNoCard?: boolean;
    // Resolution result (set once winner is determined)
    attackerWon?: boolean;
    kills?: number;                 // casualties owed by the loser
    /** Post-combat effects remaining (processed in order by continueCombat) */
    postQueue?: string[];
    /** Defender units that survived casualties and must retreat */
    survivingDefenders?: Unit[];
    /** Attacker units held aside while resolving retreat supply losses */
    retreatingUnits?: Unit[];
}
