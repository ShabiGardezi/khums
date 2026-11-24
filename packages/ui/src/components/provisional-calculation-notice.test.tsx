import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MOCK_CALCULATION_LABEL } from './mock-calculation-notice';
import {
  PROVISIONAL_CALCULATION_LABEL,
  ProvisionalCalculationNotice,
} from './provisional-calculation-notice';

describe('ProvisionalCalculationNotice (M4.5a)', () => {
  it('uses the exact mandated wording', () => {
    expect(PROVISIONAL_CALCULATION_LABEL).toBe('PROVISIONAL — FOR SCHOLAR REVIEW ONLY');
  });

  it('renders a labelled note in the reserved provisional colour role, never the mock one', () => {
    render(
      <ProvisionalCalculationNotice>Proposed rules under review.</ProvisionalCalculationNotice>,
    );
    const note = screen.getByRole('note', { name: 'Provisional calculation notice' });
    expect(note.textContent).toContain(PROVISIONAL_CALCULATION_LABEL);
    expect(note.textContent).not.toContain(MOCK_CALCULATION_LABEL);
    expect(note.textContent).toContain('Proposed rules under review.');
    expect(note.className).toContain('bg-provisional');
    expect(note.className).not.toContain('bg-mock');
  });

  it('keeps the canonical English label next to a translation, and in the inline variant', () => {
    const urdu = 'عارضی — صرف علما کے جائزے کے لیے';
    render(<ProvisionalCalculationNotice label={urdu} ariaLabel="عارضی حساب کی اطلاع" />);
    const note = screen.getByRole('note', { name: 'عارضی حساب کی اطلاع' });
    expect(note.textContent).toContain(urdu);
    expect(screen.getByText(PROVISIONAL_CALCULATION_LABEL).getAttribute('lang')).toBe('en');
  });

  it('has an inline variant that still shows the full label', () => {
    render(<ProvisionalCalculationNotice variant="inline" />);
    expect(screen.getAllByText(PROVISIONAL_CALCULATION_LABEL)).toHaveLength(1);
  });
});
