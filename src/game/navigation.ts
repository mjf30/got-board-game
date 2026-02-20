import { GameState, Area, HouseName } from './types';

/**
 * Checks if a move is valid, considering direct adjacency and ship transport.
 */
export function isMoveValid(state: GameState, fromAreaId: string, toAreaId: string, house: HouseName): boolean {
    const fromArea = state.board[fromAreaId];
    const toArea = state.board[toAreaId];

    // Blocked regions are impassable (3-player game)
    if (toArea?.blocked) {
        return false;
    }

    // Basic adjacency check for direct move
    if (fromArea.adjacent.includes(toAreaId)) {
        return true;
    }

    // Ship Transport Check
    // Rules: Land units can move to another Land area via a chain of Friendly Ships in Sea areas.
    // 1. Must be Land -> Land (or Port, handled later)
    // 2. Units STARTING in a Port cannot use Ship Transport (Must move to adjacent sea or land directly).
    if (fromArea.type === 'Sea' || fromArea.type === 'Port') return false;
    if (toArea.type === 'Sea') return false;

    // BFS to find a path through friendly seas
    const queue: string[] = [fromAreaId];
    const visited = new Set<string>();
    visited.add(fromAreaId);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentArea = state.board[currentId];

        // Check neighbors
        for (const adjId of currentArea.adjacent) {
            if (visited.has(adjId)) continue;

            const adjArea = state.board[adjId];

            if (adjId === toAreaId) {
                // We reached the destination!
                // Valid only if we came from a Sea link or direct adjacency (already checked separately)
                // But wait, BFS naturally finds connections.
                // The constraint is: The "Bridge" must be Seas with Friendly Ships.

                // If we are evaluating the neighbor "toAreaId":
                // If currentId was a Sea with Friendly Ship, then yes we can land here.
                if (currentArea.type === 'Sea' && hasFriendlyShip(currentArea, house)) {
                    return true;
                }
                // If currentId was the starting Land area, we already returned true at top (direct adjacency).
                // So this case usually means we found it via a chain.
            }

            // Can we traverse into adjArea?
            if (adjArea.type === 'Sea' && hasFriendlyShip(adjArea, house)) {
                visited.add(adjId);
                queue.push(adjId);
            }
        }
    }

    return false;
}

function hasFriendlyShip(area: Area, house: HouseName): boolean {
    return area.units.some(u => u.type === 'Ship' && u.house === house);
}
