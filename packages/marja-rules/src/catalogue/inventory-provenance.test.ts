import { describe, expect, it } from 'vitest';

import inventory from '../../../../docs/research/SOURCE_INVENTORY.md?raw';
import { PROVISIONAL_MARJA_CATALOGUE } from '../index';

/**
 * Cross-checks the catalogue against the canonical research inventory itself
 * (docs/research/SOURCE_INVENTORY.md), so any drift or unsupported claim fails CI.
 */

const cells = (row: string) =>
  row
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** First backticked token in a cell, e.g. "**`ACCESS_BLOCKED`** (HTTP 403)" → "ACCESS_BLOCKED". */
const token = (cell: string) => /`([A-Z_]+)`/.exec(cell)?.[1] ?? null;

const section = (heading: string, next: string) => {
  const start = inventory.indexOf(heading);
  const end = inventory.indexOf(next, start + 1);
  expect(start, `inventory section "${heading}"`).toBeGreaterThanOrEqual(0);
  return inventory.slice(start, end);
};

const LIFECYCLE: Record<string, 'LIVING' | 'DECEASED' | null> = {
  Living: 'LIVING',
  Deceased: 'DECEASED',
  '`PENDING_VERIFICATION`': null,
};

/** §2 register rows keyed by id. */
const register = new Map(
  section('## 2. Marja lifecycle register', '## 3.')
    .split('\n')
    .filter((line) => /^\| .*\(`[a-z-]+`\)/.test(line))
    .map((line) => {
      const [marja = '', lifecycle = '', , confidence = '', counted = '', human = ''] = cells(line);
      const id = /\(`([a-z-]+)`\)/.exec(marja)?.[1] ?? '';
      return [
        id,
        {
          proposed: LIFECYCLE[lifecycle],
          confidence: token(confidence),
          counted: counted === '—' ? [] : counted.split(',').map((s) => s.trim()),
          human: token(human),
        },
      ] as const;
    }),
);

/** §3 evidence item rows keyed by id. Columns: ID, URL, Class, Publisher, Published, Title, Access, Assessment, Recorded. */
const items = new Map(
  section('## 3. Lifecycle evidence', '## 4.')
    .split('\n')
    .filter((line) => /^\| E-[A-Z]+-\d+ /.test(line))
    .map((line) => {
      const c = cells(line);
      return [
        c[0] ?? '',
        {
          sourceClass: token(c[2] ?? ''),
          access: token(c[6] ?? ''),
          assessment: token(c[7] ?? ''),
        },
      ] as const;
    }),
);

describe('catalogue provenance (SOURCE_INVENTORY.md)', () => {
  it('parses the register and evidence tables', () => {
    expect(register.size).toBe(10);
    expect(items.size).toBe(14); // E-SIS-1, E-KHA-1…7, E-FAY-1…3, E-WAH-1…3
  });

  it('has exactly the register candidates', () => {
    expect(PROVISIONAL_MARJA_CATALOGUE.map((e) => e.id).sort()).toEqual(
      [...register.keys()].sort(),
    );
  });

  for (const entry of PROVISIONAL_MARJA_CATALOGUE) {
    describe(entry.id, () => {
      const row = register.get(entry.id);

      it('preserves the proposed lifecycle, confidence, counted items and verification', () => {
        expect(row).toBeDefined();
        expect(entry.lifecycle.proposed).toBe(row?.proposed);
        expect(entry.lifecycle.evidenceConfidence).toBe(row?.confidence);
        expect(entry.lifecycle.countedEvidence).toEqual(row?.counted);
        expect(entry.lifecycle.humanVerification).toBe(row?.human);
      });

      it('states a lifecycle only to the extent the inventory supports it', () => {
        // The inventory has no human-verified status, so no entry may claim one.
        if (row?.human !== 'VERIFIED') {
          expect(['PENDING_VERIFICATION', 'UNKNOWN']).toContain(entry.lifecycle.status);
        }
        if (entry.lifecycle.status === 'UNKNOWN') expect(row?.counted).toEqual([]);
      });

      it('copies every evidence item exactly, with no extra or missing items', () => {
        const prefix = entry.evidence[0]?.id.replace(/-\d+$/, '');
        if (prefix !== undefined) {
          const recorded = [...items.keys()].filter((id) => id.startsWith(`${prefix}-`));
          expect(entry.evidence.map((i) => i.id)).toEqual(recorded);
        }
        for (const item of entry.evidence) {
          const source = items.get(item.id);
          expect(source, item.id).toBeDefined();
          expect(item.sourceClass, item.id).toBe(source?.sourceClass);
          expect(item.accessStatus, item.id).toBe(source?.access);
          expect(item.assessment, item.id).toBe(source?.assessment);
          // §3 header: all items currently have human verification PENDING.
          expect(item.humanVerification, item.id).toBe('PENDING');
        }
        for (const id of entry.lifecycle.countedEvidence) expect(items.has(id), id).toBe(true);
      });
    });
  }

  it('assigns every recorded evidence item to a catalogue entry', () => {
    const used = new Set(PROVISIONAL_MARJA_CATALOGUE.flatMap((e) => e.evidence.map((i) => i.id)));
    expect([...items.keys()].filter((id) => !used.has(id))).toEqual([]);
  });
});
