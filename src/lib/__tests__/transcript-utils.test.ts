import { describe, it, expect } from 'vitest';
import { groupTranscriptBySpeaker, parseTimeToSeconds } from '../transcript-utils';

describe('parseTimeToSeconds', () => {
  it('parses "m:ss" format', () => {
    expect(parseTimeToSeconds('0:00')).toBe(0);
    expect(parseTimeToSeconds('1:30')).toBe(90);
    expect(parseTimeToSeconds('10:05')).toBe(605);
  });

  it('returns 0 for invalid input', () => {
    expect(parseTimeToSeconds('')).toBe(0);
    expect(parseTimeToSeconds('abc')).toBe(0);
  });
});

describe('groupTranscriptBySpeaker', () => {
  it('returns empty for empty input', () => {
    expect(groupTranscriptBySpeaker([])).toEqual([]);
  });

  it('groups consecutive same-speaker lines', () => {
    const items = [
      { speaker: 'You', time: '0:00', text: 'Hello.', originalIndex: 0 },
      { speaker: 'You', time: '0:02', text: 'How are you?', originalIndex: 1 },
    ];
    const groups = groupTranscriptBySpeaker(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].speaker).toBe('You');
    expect(groups[0].text).toBe('Hello. How are you?');
    expect(groups[0].indices).toEqual([0, 1]);
  });

  it('splits on speaker change', () => {
    const items = [
      { speaker: 'You', time: '0:00', text: 'Hello.', originalIndex: 0 },
      { speaker: 'Others', time: '0:02', text: 'Hi.', originalIndex: 1 },
    ];
    const groups = groupTranscriptBySpeaker(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].speaker).toBe('You');
    expect(groups[1].speaker).toBe('Others');
  });

  it('splits on time gap >= 45 seconds', () => {
    const items = [
      { speaker: 'You', time: '0:00', text: 'First.', originalIndex: 0 },
      { speaker: 'You', time: '1:00', text: 'After a long pause.', originalIndex: 1 },
    ];
    const groups = groupTranscriptBySpeaker(items);
    expect(groups).toHaveLength(2);
  });

  it('splits long groups exceeding max sentences', () => {
    // Create a group with 25 sentences (max is 20)
    const longText = Array.from({ length: 25 }, (_, i) => `Sentence ${i + 1}.`).join(' ');
    const items = [{ speaker: 'You', time: '0:00', text: longText, originalIndex: 0 }];
    const groups = groupTranscriptBySpeaker(items);
    expect(groups.length).toBeGreaterThan(1);
  });
});
