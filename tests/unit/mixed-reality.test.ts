import { describe, expect, it } from 'vitest';
import {
  MR_SESSION_MODE,
  MR_XR_FEATURES,
  decideMrEntry,
  sceneFeatureStatus,
} from '../../src/logic/mixed-reality';

describe('decideMrEntry', () => {
  it('stays in VR without mr, whatever the browser supports', () => {
    expect(decideMrEntry(false, true)).toEqual({ mode: 'vr', reason: 'not-requested' });
    expect(decideMrEntry(false, false)).toEqual({ mode: 'vr', reason: 'not-requested' });
  });

  it('goes to AR with mr when immersive-ar is supported', () => {
    expect(decideMrEntry(true, true)).toEqual({ mode: 'ar' });
  });

  it('falls back to VR with mr when immersive-ar is not supported', () => {
    expect(decideMrEntry(true, false)).toEqual({ mode: 'vr', reason: 'no-immersive-ar' });
  });
});

describe('sceneFeatureStatus', () => {
  it('is unknown when the session does not list its features', () => {
    expect(sceneFeatureStatus(undefined)).toEqual({ kind: 'unknown' });
    expect(sceneFeatureStatus(null)).toEqual({ kind: 'unknown' });
  });

  it('is granted when plane and mesh detection are both there', () => {
    expect(sceneFeatureStatus(['local-floor', 'plane-detection', 'mesh-detection'])).toEqual({ kind: 'granted' });
  });

  it('names what is missing', () => {
    expect(sceneFeatureStatus(['plane-detection'])).toEqual({ kind: 'missing', missing: ['mesh-detection'], all: false });
    expect(sceneFeatureStatus(['mesh-detection'])).toEqual({ kind: 'missing', missing: ['plane-detection'], all: false });
  });

  it('reports all missing for a session without scene understanding', () => {
    expect(sceneFeatureStatus(['local-floor', 'hand-tracking'])).toEqual({
      kind: 'missing',
      missing: ['plane-detection', 'mesh-detection'],
      all: true,
    });
    expect(sceneFeatureStatus([])).toMatchObject({ kind: 'missing', all: true });
  });
});

describe('constants', () => {
  it('asks for immersive-ar and both detections', () => {
    expect(MR_SESSION_MODE).toBe('immersive-ar');
    expect(MR_XR_FEATURES).toEqual({ planeDetection: true, meshDetection: true });
  });
});
