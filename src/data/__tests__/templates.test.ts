import { describe, it, expect } from 'vitest';
import { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_IDS } from '../templates';

describe('BUILTIN_TEMPLATES', () => {
  it('has at least 5 templates', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('each template has id, name, and icon', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.icon).toBeTruthy();
    }
  });

  it('all IDs are unique', () => {
    const ids = BUILTIN_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes general template', () => {
    expect(BUILTIN_TEMPLATE_IDS.has('general')).toBe(true);
  });

  it('BUILTIN_TEMPLATE_IDS matches BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATE_IDS.size).toBe(BUILTIN_TEMPLATES.length);
    for (const t of BUILTIN_TEMPLATES) {
      expect(BUILTIN_TEMPLATE_IDS.has(t.id)).toBe(true);
    }
  });
});
