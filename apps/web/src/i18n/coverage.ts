/**
 * Translation coverage checker: compares a locale's content tree with the English source.
 * Used by the test suite to block missing keys, empty strings and untranslated text.
 */
export interface CoverageIssue {
  readonly path: string;
  readonly problem:
    | 'missing-key'
    | 'extra-key'
    | 'type-mismatch'
    | 'length-mismatch'
    | 'empty'
    | 'untranslated'
    | 'placeholder-mismatch'
    | 'changed-identifier';
}

/** Keys whose values are identifiers, not text: they must be identical in every locale. */
const IDENTIFIER_KEYS = new Set(['id', 'icon']);

const SCRIPT_PATTERNS: Readonly<Record<string, RegExp>> = {
  // Arabic script (covers Urdu letters such as ٹ ڈ ڑ ں ہ ے).
  ur: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/,
};

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}|%s/g)].map((m) => m[0]).sort();

export function checkTranslationCoverage(
  source: unknown,
  target: unknown,
  locale: string,
): CoverageIssue[] {
  const issues: CoverageIssue[] = [];
  const script = SCRIPT_PATTERNS[locale];

  const walk = (en: unknown, tr: unknown, path: string, key: string) => {
    if (typeof en !== typeof tr || Array.isArray(en) !== Array.isArray(tr)) {
      issues.push({ path, problem: 'type-mismatch' });
      return;
    }
    if (typeof en === 'string' && typeof tr === 'string') {
      if (IDENTIFIER_KEYS.has(key)) {
        if (en !== tr) issues.push({ path, problem: 'changed-identifier' });
        return;
      }
      if (tr.trim() === '') issues.push({ path, problem: 'empty' });
      else if (script !== undefined && /[A-Za-z]/.test(en) && !script.test(tr))
        issues.push({ path, problem: 'untranslated' });
      if (placeholders(en).join() !== placeholders(tr).join())
        issues.push({ path, problem: 'placeholder-mismatch' });
      return;
    }
    if (Array.isArray(en) && Array.isArray(tr)) {
      if (en.length !== tr.length) issues.push({ path, problem: 'length-mismatch' });
      en.forEach((item, index) => {
        if (index < tr.length) walk(item, tr[index], `${path}[${index}]`, key);
      });
      return;
    }
    if (typeof en === 'object' && en !== null && typeof tr === 'object' && tr !== null) {
      const enRecord = en as Record<string, unknown>;
      const trRecord = tr as Record<string, unknown>;
      for (const k of Object.keys(enRecord)) {
        if (!(k in trRecord)) issues.push({ path: `${path}.${k}`, problem: 'missing-key' });
        else walk(enRecord[k], trRecord[k], `${path}.${k}`, k);
      }
      for (const k of Object.keys(trRecord)) {
        if (!(k in enRecord)) issues.push({ path: `${path}.${k}`, problem: 'extra-key' });
      }
    }
  };

  walk(source, target, '$', '');
  return issues;
}
