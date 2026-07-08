import { GameState, HouseName } from './types';

// Supply Limits: index = supply value (0-6)
// value = array of max army sizes. e.g. [3, 2] means one army of 3, one of 2.
// Armies are groups of 2+ units in a land area. Single units don't count towards limits (but unlimited single units allowed).
const SUPPLY_LIMITS_DATA = [
    [2, 2], // 0
    [3, 2], // 1
    [3, 2, 2], // 2
    [3, 2, 2, 2], // 3
    [3, 3, 2, 2], // 4
    [4, 3, 2, 2], // 5
    [4, 3, 2, 2, 2], // 6
];

/** Check whether a set of army sizes fits within the limits for a supply level */
export function fitsArmies(sizes: number[], supply: number): boolean {
    const limits = SUPPLY_LIMITS_DATA[Math.max(0, Math.min(supply, 6))];
    const armies = sizes.filter(s => s >= 2).sort((a, b) => b - a);
    if (armies.length > limits.length) return false;
    for (let i = 0; i < armies.length; i++) {
        if (armies[i] > limits[i]) return false;
    }
    return true;
}

/** Army sizes (2+ units) for a house, optionally excluding one area */
export function armySizes(state: GameState, house: HouseName, excludeAreaId?: string): number[] {
    const sizes: number[] = [];
    Object.entries(state.board).forEach(([aId, area]) => {
        if (aId === excludeAreaId) return;
        if (area.house === house && area.units.length >= 2) sizes.push(area.units.length);
    });
    return sizes;
}

/** How many additional units of `house` can be placed in `areaId` without exceeding supply.
 *  Ports are additionally capped at 3 ships total. */
export function maxUnitsAddable(state: GameState, house: HouseName, areaId: string): number {
    const area = state.board[areaId];
    if (!area) return 0;
    const supply = Math.min(state.cas[house].supply, 6);
    const others = armySizes(state, house, areaId);
    const current = area.units.filter(u => u.house === house).length;
    const hardCap = area.type === 'Port' ? Math.max(0, (area.maxShips ?? 3) - current) : 20;

    let best = 0;
    for (let add = 1; add <= hardCap; add++) {
        const target = current + add;
        if (fitsArmies([...others, target], supply)) best = add;
        else break;
    }
    return best;
}

export function checkSupplyLimits(state: GameState): Record<HouseName, boolean> {
    const violations: Record<string, boolean> = {};

    Object.keys(state.cas).forEach(houseNameString => {
        const houseName = houseNameString as HouseName;
        const house = state.cas[houseName];
        const supply = Math.min(house.supply, 6);
        const limits = SUPPLY_LIMITS_DATA[supply];

        // Calculate current armies (2+ units in same area)
        // Group by area.
        const armies: number[] = [];

        Object.values(state.board).forEach(area => {
            // Any group of 2+ units in the same area (land OR sea) counts as an army for supply
            if (area.house === houseName && area.units.length >= 2) {
                armies.push(area.units.length);
            }
        });

        // Sort both descending to match biggest army to biggest slot
        armies.sort((a, b) => b - a);
        // limits is already sorted (e.g. [3,2])

        let valid = true;

        // If you have more armies than slots, invalid immediately
        if (armies.length > limits.length) {
            valid = false;
        } else {
            // Check if each army fits in its slot
            for (let i = 0; i < armies.length; i++) {
                if (armies[i] > limits[i]) {
                    valid = false;
                    break;
                }
            }
        }

        violations[houseName] = !valid;
    });

    return violations;
}
