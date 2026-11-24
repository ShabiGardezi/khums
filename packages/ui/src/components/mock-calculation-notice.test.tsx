import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MOCK_CALCULATION_LABEL, MockCalculationNotice } from './mock-calculation-notice';

describe('MockCalculationNotice', () => {
  it('uses the exact mandated wording', () => {
    expect(MOCK_CALCULATION_LABEL).toBe(
      'MOCK CALCULATION — NOT RELIGIOUS GUIDANCE — NOT FOR PRODUCTION',
    );
  });

  it('renders a labelled note with the full label and extra explanation', () => {
    render(<MockCalculationNotice>Figures come from a mock rule pack.</MockCalculationNotice>);
    const note = screen.getByRole('note', { name: 'Mock calculation notice' });
    expect(note.textContent).toContain(MOCK_CALCULATION_LABEL);
    expect(note.textContent).toContain('Figures come from a mock rule pack.');
    expect(note.className).toContain('bg-mock');
  });

  it('has an inline variant that still shows the full label', () => {
    render(<MockCalculationNotice variant="inline" />);
    expect(screen.getByText(MOCK_CALCULATION_LABEL)).toBeTruthy();
  });
});

describe('MockCalculationNotice — localized', () => {
  const urdu = 'فرضی حساب — دینی رہنمائی نہیں — حقیقی استعمال کے لیے نہیں';

  it('shows the translated label and always keeps the canonical English label', () => {
    render(<MockCalculationNotice label={urdu} ariaLabel="فرضی حساب کی اطلاع" />);
    const note = screen.getByRole('note', { name: 'فرضی حساب کی اطلاع' });
    expect(note.textContent).toContain(urdu);
    expect(note.textContent).toContain(MOCK_CALCULATION_LABEL);
    expect(screen.getByText(MOCK_CALCULATION_LABEL).getAttribute('lang')).toBe('en');
  });

  it('does not duplicate the label when it is the canonical English one', () => {
    render(<MockCalculationNotice variant="inline" label={MOCK_CALCULATION_LABEL} />);
    expect(screen.getAllByText(MOCK_CALCULATION_LABEL)).toHaveLength(1);
  });
});
