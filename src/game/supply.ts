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
