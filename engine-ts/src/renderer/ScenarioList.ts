export interface ScenarioInfo {
    id: string;
    name: string;
    description: string;
    path: string;
    preview?: string; // Path to image if we had one
}

export const ScenarioList: ScenarioInfo[] = [
    {
        id: 'zerg_rush',
        name: 'Zerg Rush',
        description: 'Defend against a swarm of enemies.',
        path: '/game-data/scenarios/zerg_rush.json'
    },
    // Add more scenarios here as they are created
];
