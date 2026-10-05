// Houses the app may load. An id outside this list never reaches the network, so an
// unknown house shows the error panel without a 404 in the console.

export const KNOWN_HOUSES = ['apartment-a', 'apartment-b'] as const;

export type KnownHouseId = (typeof KNOWN_HOUSES)[number];

export function isKnownHouse(id: string): id is KnownHouseId {
  return (KNOWN_HOUSES as readonly string[]).includes(id);
}

/** URL of a house file. Only call with an id that passed `isKnownHouse`. */
export function houseUrl(id: string): string {
  return `${import.meta.env.BASE_URL}houses/${id}.json`;
}
