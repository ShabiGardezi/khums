import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Field } from './field';
import { Input } from './input';
import { NativeSelect } from './native-select';
import { Textarea } from './textarea';

describe('Field', () => {
  it('associates the label with the control', () => {
    render(
      <Field label="Amount">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Amount').tagName).toBe('INPUT');
  });

  it('wires description and error into aria-describedby and marks the control invalid', () => {
    render(
      <Field
        label="Amount"
        description="Use a decimal like 1234.56"
        error="Enter a valid amount"
        required
      >
        <Input />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /Amount/ });
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Use a decimal like 1234.56', 'Enter a valid amount']);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('does not mark the control invalid without an error', () => {
    render(
      <Field label="Note" description="Optional">
        <Textarea />
      </Field>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Note' });
    expect(textarea.getAttribute('aria-invalid')).toBeNull();
  });

  it('respects an explicit id', () => {
    render(
      <Field label="Currency" id="currency">
        <NativeSelect>
          <option value="USD">US dollar</option>
        </NativeSelect>
      </Field>,
    );
    expect(screen.getByLabelText('Currency').id).toBe('currency');
  });
});

describe('form controls', () => {
  it('Input accepts typing', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Name');
    await user.type(input, 'Savings');
    expect(input.value).toBe('Savings');
  });

  it('NativeSelect is a real combobox with options and a decorative chevron', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Field label="Currency">
        <NativeSelect defaultValue="USD">
          <option value="USD">US dollar</option>
          <option value="GBP">Pound sterling</option>
        </NativeSelect>
      </Field>,
    );
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency' });
    await user.selectOptions(select, 'GBP');
    expect(select.value).toBe('GBP');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
