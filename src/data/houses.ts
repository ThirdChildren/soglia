// Houses the app may load. An id outside this list never reaches the network, so an
// unknown house shows the error panel without a 404 in the console.

export const KNOWN_HOUSES = ['apartment-a', 'apartment-b', 'apartment-c'] as const;

export type KnownHouseId = (typeof KNOWN_HOUSES)[number];

export function isKnownHouse(id: string): id is KnownHouseId {
  return (KNOWN_HOUSES as readonly string[]).includes(id);
}

/** URL of a house file. Only call with an id that passed `isKnownHouse`. */
export function houseUrl(id: string): string {
  return `${import.meta.env.BASE_URL}houses/${id}.json`;
}

/** Houses that come with a demo file of issues (`public/demo/issues-<id>.json`). Others never request one: no 404. */
export const DEMO_ISSUE_HOUSES: readonly string[] = ['apartment-a'];

export function hasDemoIssues(id: string): boolean {
  return DEMO_ISSUE_HOUSES.includes(id);
}

/** URL of the demo issues of a house. Only call with an id that passed `hasDemoIssues`. */
export function demoIssuesUrl(id: string): string {
  return `${import.meta.env.BASE_URL}demo/issues-${id}.json`;
}
