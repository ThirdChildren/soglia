// The tuning registry (task T6.A1, decision D66): limits, requests, layers, order of the palm angles, log lines.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TUNING_DEFAULTS,
  TUNING_NAMES,
  TUNING_TABLE,
  applyTuning,
  clearTuning,
  formatTuningClamped,
  formatTuningIgnored,
  formatTuningSet,
  formatTuningTable,
  getTuning,
  needsDebugLines,
  parseTuningNumber,
  parseTuningText,
  printableName,
  resetTuning,
  tuningEntry,
  tuningLines,
  tuningOverrides,
} from '../../src/logic/tuning';

afterEach(() => resetTuning());

const req = (name: string, raw: string) => ({ name, raw });

describe('the table', () => {
  it('has the 25 knobs of the plan, each name once, in the same order as TUNING_NAMES', () => {
    expect(TUNING_TABLE.map((e) => e.name)).toEqual([...TUNING_NAMES]);
    expect(new Set(TUNING_NAMES).size).toBe(25);
  });

  for (const entry of TUNING_TABLE) {
    it(`${entry.name}: limits are ordered and the default is inside them (or off)`, () => {
      expect(entry.min).toBeLessThan(entry.max);
      if (entry.default === null) expect(entry.name).toBe('foveation');
      else if (entry.off === entry.default) expect(entry.name).toBe('fovMask');
      else {
        expect(entry.default).toBeGreaterThanOrEqual(entry.min);
        expect(entry.default).toBeLessThanOrEqual(entry.max);
      }
    });
  }

  it('tuningEntry finds a name and answers undefined for a stranger', () => {
    expect(tuningEntry('longPress')?.default).toBe(0.8);
    expect(tuningEntry('bogus')).toBeUndefined();
    expect(tuningEntry('constructor')).toBeUndefined();
  });

  it('the table is frozen', () => {
    expect(Object.isFrozen(TUNING_TABLE)).toBe(true);
    expect(Object.isFrozen(TUNING_DEFAULTS)).toBe(true);
  });
});

describe('getTuning', () => {
  it('returns the same object every time, also after a change and a reset', () => {
    const first = getTuning();
    applyTuning([req('longPress', '1.1')], 'url');
    expect(getTuning()).toBe(first);
    resetTuning();
    expect(getTuning()).toBe(first);
  });

  it('starts at the defaults', () => {
    expect({ ...getTuning() }).toEqual({ ...TUNING_DEFAULTS });
  });

  it('follows a change at once and goes back with reset', () => {
    applyTuning([req('pinRadius', '0.04')], 'url');
    expect(getTuning().pinRadius).toBe(0.04);
    resetTuning();
    expect(getTuning().pinRadius).toBe(0.02);
  });
});

describe('parseTuningNumber', () => {
  it('accepts plain decimals', () => {
    expect(parseTuningNumber('1')).toBe(1);
    expect(parseTuningNumber('0.25')).toBe(0.25);
    expect(parseTuningNumber('.5')).toBe(0.5);
    expect(parseTuningNumber('-2')).toBe(-2);
    expect(parseTuningNumber(' 3 ')).toBe(3);
  });

  it('refuses everything else', () => {
    for (const raw of ['', 'abc', 'NaN', 'Infinity', '-Infinity', '1e3', '0x10', '1,5', '1.2.3', '--1', '+1']) {
      expect(parseTuningNumber(raw), raw).toBeNull();
    }
  });
});

describe('applyTuning: values, limits, unknown names', () => {
  it('sets a value and reports it with its default and source', () => {
    const report = applyTuning([req('longPress', '1.1')], 'url');
    expect(getTuning().longPress).toBe(1.1);
    expect(report.set).toEqual([{ name: 'longPress', value: 1.1, default: 0.8, source: 'url' }]);
    expect(report.clamped).toEqual([]);
    expect(report.ignored).toEqual([]);
  });

  it('clamps above the maximum and below the minimum, and reports both', () => {
    const report = applyTuning([req('pinnedDistance', '3'), req('longPress', '0.1')], 'url');
    expect(getTuning().pinnedDistance).toBe(0.75);
    expect(getTuning().longPress).toBe(0.4);
    expect(report.clamped).toEqual([
      { name: 'longPress', requested: 0.1, applied: 0.4 },
      { name: 'pinnedDistance', requested: 3, applied: 0.75 },
    ]);
    // A clamped value is also set, at the limit.
    expect(report.set.map((s) => [s.name, s.value])).toEqual([
      ['longPress', 0.4],
      ['pinnedDistance', 0.75],
    ]);
  });

  it('accepts the limits themselves without a clamp', () => {
    const report = applyTuning([req('longPress', '0.4'), req('rotateWindow', '30')], 'url');
    expect(report.clamped).toEqual([]);
    expect(getTuning().rotateWindow).toBe(30);
  });

  it('drops NaN, Infinity, empty and text values', () => {
    const report = applyTuning(
      [req('longPress', 'abc'), req('pinRadius', 'Infinity'), req('pickDepth', ''), req('deadZone', 'NaN')],
      'url',
    );
    expect(report.ignored.map((i) => [i.name, i.reason])).toEqual([
      ['longPress', 'not-a-number'],
      ['pinRadius', 'not-a-number'],
      ['pickDepth', 'not-a-number'],
      ['deadZone', 'not-a-number'],
    ]);
    expect(getTuning().longPress).toBe(0.8);
    expect(getTuning().pinRadius).toBe(0.02);
  });

  it('drops an unknown name and prints it safely', () => {
    const report = applyTuning([req('bogus', '1'), req('<b>x</b>', '1')], 'url');
    expect(report.ignored).toEqual([
      { name: 'bogus', reason: 'unknown' },
      { name: '?b?x??b?', reason: 'unknown' },
    ]);
    expect(report.set).toEqual([]);
  });

  it('a name that is a prototype property is unknown, not a crash', () => {
    const report = applyTuning([req('__proto__', '1'), req('toString', '1')], 'url');
    expect(report.ignored.map((i) => i.reason)).toEqual(['unknown', 'unknown']);
  });

  it('a request with several values for a name: the later one wins inside applyTuning', () => {
    applyTuning([req('longPress', '1.0'), req('longPress', '1.2')], 'url');
    expect(getTuning().longPress).toBe(1.2);
  });

  it('more values in one call all apply', () => {
    applyTuning([req('longPress', '1.1'), req('palmOpenHold', '0.6'), req('anchorForward', '0.55')], 'url');
    expect(getTuning().longPress).toBe(1.1);
    expect(getTuning().palmOpenHold).toBe(0.6);
    expect(getTuning().anchorForward).toBe(0.55);
  });

  it('applying the same text again reports nothing new', () => {
    applyTuning([req('longPress', '1.1')], 'live');
    expect(applyTuning([req('longPress', '1.1')], 'live').set).toEqual([]);
  });

  it('the fovMask accepts 0 as off and clamps the rest to 20..55', () => {
    applyTuning([req('fovMask', '0')], 'url');
    expect(getTuning().fovMask).toBe(0);
    applyTuning([req('fovMask', '10')], 'url');
    expect(getTuning().fovMask).toBe(20);
    applyTuning([req('fovMask', '90')], 'url');
    expect(getTuning().fovMask).toBe(55);
  });

  it('foveation starts as null and takes 0..1', () => {
    expect(getTuning().foveation).toBeNull();
    applyTuning([req('foveation', '0')], 'url');
    expect(getTuning().foveation).toBe(0);
    const report = applyTuning([req('foveation', '7')], 'url');
    expect(getTuning().foveation).toBe(1);
    expect(report.clamped).toEqual([{ name: 'foveation', requested: 7, applied: 1 }]);
  });
});

describe('the palm angles keep their order', () => {
  it('refuses the close angle when it is not above the open one, in the order of the table', () => {
    const report = applyTuning([req('palmOpenDeg', '50'), req('palmCloseDeg', '45')], 'url');
    expect(report.ignored).toEqual([{ name: 'palmCloseDeg', reason: 'order' }]);
    expect(getTuning().palmOpenDeg).toBe(50);
    expect(getTuning().palmCloseDeg).toBe(55);
  });

  it('is the same when the close angle comes first in the text', () => {
    const report = applyTuning([req('palmCloseDeg', '45'), req('palmOpenDeg', '50')], 'url');
    expect(report.ignored).toEqual([{ name: 'palmCloseDeg', reason: 'order' }]);
    expect(getTuning().palmOpenDeg).toBe(50);
  });

  it('refuses an equal pair', () => {
    const report = applyTuning([req('palmOpenDeg', '45'), req('palmCloseDeg', '45')], 'url');
    expect(report.ignored.map((i) => i.reason)).toEqual(['order']);
  });

  it('accepts a pair in order', () => {
    const report = applyTuning([req('palmOpenDeg', '30'), req('palmCloseDeg', '45')], 'url');
    expect(report.ignored).toEqual([]);
    expect(getTuning().palmCloseDeg).toBe(45);
  });

  it('checks the close angle against an open angle that another layer holds', () => {
    applyTuning([req('palmOpenDeg', '50')], 'url');
    const report = applyTuning([req('palmCloseDeg', '45')], 'live');
    expect(report.ignored).toEqual([{ name: 'palmCloseDeg', reason: 'order' }]);
    expect(getTuning().palmCloseDeg).toBe(55);
  });

  it('a layer change of the open angle that breaks a close angle of another layer: the close one goes back to the default', () => {
    applyTuning([req('palmCloseDeg', '45')], 'url');
    expect(getTuning().palmCloseDeg).toBe(45);
    applyTuning([req('palmOpenDeg', '48')], 'live');
    expect(getTuning().palmOpenDeg).toBe(48);
    expect(getTuning().palmCloseDeg).toBe(55);
    clearTuning('live');
    expect(getTuning().palmCloseDeg).toBe(45);
  });
});

describe('layers: live > url > file > default', () => {
  it('the strongest layer wins', () => {
    applyTuning([req('longPress', '1.0')], 'file');
    expect(getTuning().longPress).toBe(1.0);
    applyTuning([req('longPress', '1.2')], 'url');
    expect(getTuning().longPress).toBe(1.2);
    applyTuning([req('longPress', '1.4')], 'live');
    expect(getTuning().longPress).toBe(1.4);
    expect(tuningOverrides().find((o) => o[0] === 'longPress')).toEqual(['longPress', 1.4, 'live']);
  });

  it('clearing the live layer returns to the url values; the report is true once', () => {
    applyTuning([req('pinnedDistance', '0.6')], 'url');
    applyTuning([req('pinnedDistance', '0.62')], 'live');
    expect(getTuning().pinnedDistance).toBe(0.62);
    expect(clearTuning('live')).toBe(true);
    expect(getTuning().pinnedDistance).toBe(0.6);
    expect(clearTuning('live')).toBe(false);
  });

  it('clearing an empty layer changes nothing', () => {
    expect(clearTuning('url')).toBe(false);
    expect({ ...getTuning() }).toEqual({ ...TUNING_DEFAULTS });
  });

  it('a value that leaves the live layer is reported with the value it went back to', () => {
    applyTuning([req('pinRadius', '0.03')], 'url');
    applyTuning([req('pinRadius', '0.04'), req('pickMargin', '0.02')], 'live');
    const report = applyTuning([req('pickMargin', '0.02')], 'live');
    expect(getTuning().pinRadius).toBe(0.03);
    expect(report.set).toEqual([{ name: 'pinRadius', value: 0.03, default: 0.02, source: 'url' }]);
  });

  it('a value that leaves the only layer goes back to the default, source default', () => {
    applyTuning([req('pinRadius', '0.04')], 'live');
    const report = applyTuning([], 'live');
    expect(getTuning().pinRadius).toBe(0.02);
    expect(report.set).toEqual([{ name: 'pinRadius', value: 0.02, default: 0.02, source: 'default' }]);
  });

  it('applying a layer replaces the layer: names no longer in it return to the lower layers', () => {
    applyTuning([req('longPress', '1.1'), req('pinRadius', '0.03')], 'live');
    applyTuning([req('longPress', '1.2')], 'live');
    expect(getTuning().longPress).toBe(1.2);
    expect(getTuning().pinRadius).toBe(0.02);
  });
});

describe('parseTuningText', () => {
  it('reads the t_ pairs and nothing else', () => {
    expect(parseTuningText('house=apartment-a&debug=1&t_longPress=1.1&t_pinRadius=0.03&time=2026-12-21T10:00')).toEqual([
      { name: 'longPress', raw: '1.1' },
      { name: 'pinRadius', raw: '0.03' },
    ]);
  });

  it('accepts a leading ?', () => {
    expect(parseTuningText('?t_longPress=1')).toEqual([{ name: 'longPress', raw: '1' }]);
  });

  it('in the URL the first value of a repeated name wins', () => {
    expect(parseTuningText('t_longPress=1&t_longPress=2', 'first')).toEqual([{ name: 'longPress', raw: '1' }]);
  });

  it('in a file the last value of a repeated name wins', () => {
    expect(parseTuningText('t_longPress=1&t_longPress=2', 'last')).toEqual([{ name: 'longPress', raw: '2' }]);
  });

  it('a bare t_ key and an empty text give nothing', () => {
    expect(parseTuningText('t_=1')).toEqual([]);
    expect(parseTuningText('')).toEqual([]);
    expect(parseTuningText('debug=1')).toEqual([]);
  });

  it('keeps the unknown and the non numeric ones for applyTuning to judge', () => {
    const requests = parseTuningText('t_bogus=1&t_longPress=abc&t_pinRadius=');
    expect(requests.length).toBe(3);
    const report = applyTuning(requests, 'url');
    expect(report.ignored.map((i) => i.reason)).toEqual(['unknown', 'not-a-number', 'not-a-number']);
  });

  it('looks at no more than 64 pairs', () => {
    const text = Array.from({ length: 100 }, (_, i) => `t_n${i}=1`).join('&');
    expect(parseTuningText(text).length).toBe(64);
  });

  it('a file with one invalid line applies the valid ones', () => {
    const report = applyTuning(parseTuningText('t_pinRadius=0.03&t_pickMargin=0.02&t_zzz=1', 'last'), 'live');
    expect(getTuning().pinRadius).toBe(0.03);
    expect(getTuning().pickMargin).toBe(0.02);
    expect(report.ignored).toEqual([{ name: 'zzz', reason: 'unknown' }]);
    expect(report.set.map((s) => s.source)).toEqual(['live', 'live']);
  });
});

describe('log lines', () => {
  it('formats the table line', () => {
    expect(formatTuningTable(true)).toBe('tuning table count=25 debug=true');
  });

  it('formats set, clamped and ignored as in the contract', () => {
    expect(formatTuningSet({ name: 'longPress', value: 1.1, default: 0.8, source: 'url' })).toBe(
      'tuning set longPress=1.1 default=0.8 source=url',
    );
    expect(formatTuningSet({ name: 'foveation', value: 0.5, default: null, source: 'live' })).toBe(
      'tuning set foveation=0.5 default=unset source=live',
    );
    expect(formatTuningClamped({ name: 'pinnedDistance', requested: 3, applied: 0.75 })).toBe(
      'tuning clamped name=pinnedDistance requested=3 applied=0.75',
    );
    expect(formatTuningIgnored({ name: 'bogus', reason: 'unknown' })).toBe('tuning ignored name=bogus reason=unknown');
  });

  it('tuningLines puts ignored and clamped (warn) before set (log)', () => {
    const report = applyTuning(parseTuningText('t_pinnedDistance=3&t_bogus=1&t_longPress=abc&t_palmOpenDeg=50&t_palmCloseDeg=45'), 'file');
    const lines = tuningLines(report);
    expect(lines.filter((l) => l.level === 'warn').map((l) => l.text)).toEqual([
      'tuning ignored name=bogus reason=unknown',
      'tuning ignored name=longPress reason=not-a-number',
      'tuning ignored name=palmCloseDeg reason=order',
      'tuning clamped name=pinnedDistance requested=3 applied=0.75',
    ]);
    expect(lines.filter((l) => l.level === 'log').map((l) => l.text)).toEqual([
      'tuning set palmOpenDeg=50 default=35 source=file',
      'tuning set pinnedDistance=0.75 default=0.55 source=file',
    ]);
  });

  it('needsDebugLines gives one warning per name, whatever the value', () => {
    const lines = needsDebugLines(parseTuningText('t_pinnedDistance=0.65&t_longPress=1.2&t_bogus=x'));
    expect(lines).toEqual([
      { level: 'warn', text: 'tuning ignored name=pinnedDistance reason=needs-debug' },
      { level: 'warn', text: 'tuning ignored name=longPress reason=needs-debug' },
      { level: 'warn', text: 'tuning ignored name=bogus reason=needs-debug' },
    ]);
    expect(needsDebugLines([])).toEqual([]);
  });

  it('printableName cuts and cleans', () => {
    expect(printableName('a/b c')).toBe('a?b?c');
    expect(printableName('x'.repeat(40))).toBe(`${'x'.repeat(32)}...`);
  });
});

describe('purity', () => {
  it('does not import anything', () => {
    const source = readFileSync(new URL('../../src/logic/tuning.ts', import.meta.url), 'utf8');
    expect(/^\s*import\s/m.test(source)).toBe(false);
    expect(source).not.toMatch(/from\s+['"](@iwsdk\/core|three)['"]/);
  });
});
