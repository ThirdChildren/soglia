import { afterEach, describe, expect, it, vi } from 'vitest';

// A fresh module per test: the loader keeps one pending request per house.
async function load() {
  vi.resetModules();
  return import('../../src/data/load-issues');
}

const info = (id: string, houseId = 'apartment-a') => ({
  id,
  houseId,
  kind: 'info',
  position: [1, 1, 1],
  category: 'plumbing',
  urgency: 'low',
  text: 'A note.',
  history: [{ at: '2026-09-30T10:00:00+02:00', by: 'agent', event: 'created' }],
});
const issue = (id: string) => ({
  id,
  houseId: 'apartment-a',
  kind: 'issue',
  position: [1, 1, 1],
  category: 'plumbing',
  urgency: 'low',
  text: 'A leak.',
  status: 'open',
  history: [{ at: '2026-10-30T19:02:00+01:00', by: 'tenant', event: 'created' }],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadInfoPoints', () => {
  it('asks for nothing for a house without a demo file (no request, no 404)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { loadInfoPoints } = await load();
    expect(await loadInfoPoints('apartment-b')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the info entries and shares ONE request with the seed', async () => {
    const body = JSON.stringify([issue('issue-001'), info('info-001'), info('info-002')]);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => body }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadInfoPoints, loadIssues } = await load();
    const points = await loadInfoPoints('apartment-a');
    const seed = await loadIssues('apartment-a');
    expect(points.map((p) => p.id)).toEqual(['info-001', 'info-002']);
    expect(seed.ok && seed.issues.map((i) => i.id)).toEqual(['issue-001']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives an empty list and one warning when the file cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadInfoPoints } = await load();
    expect(await loadInfoPoints('apartment-a')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('info points unavailable reason=http-404');
  });

  it('gives an empty list for a file that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '{oops' })));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadInfoPoints } = await load();
    expect(await loadInfoPoints('apartment-a')).toEqual([]);
  });
});
