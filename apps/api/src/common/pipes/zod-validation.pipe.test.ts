import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { InvariantError } from '@khums/utils';
import { decimalStringSchema } from '@khums/validation';

import { RequestValidationException } from '../errors/request-validation.exception';
import { createZodDto, ZodValidationPipe } from './zod-validation.pipe';

// Request contracts are strict (docs/ARCHITECTURE.md §12): unexpected fields are rejected.
class ExampleDto extends createZodDto(
  z.strictObject({ amount: decimalStringSchema, note: z.string().max(5).optional() }),
) {}

const pipe = new ZodValidationPipe();
const body = { type: 'body', metatype: ExampleDto } as const;

describe('ZodValidationPipe', () => {
  it('returns parsed data for valid input', () => {
    expect(pipe.transform({ amount: '10.50' }, body)).toEqual({ amount: '10.50' });
  });

  it('rejects unexpected fields for strict request contracts', () => {
    try {
      pipe.transform({ amount: '1', isAdmin: true }, body);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      expect((error as RequestValidationException).fieldErrors[0]?.code).toBe('unrecognized_keys');
    }
  });

  it('throws RequestValidationException with field paths and no input values', () => {
    try {
      pipe.transform({ amount: 10.5, note: 'too long' }, body);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RequestValidationException);
      const { fieldErrors } = error as RequestValidationException;
      expect(fieldErrors.map((e) => e.path)).toEqual(['body.amount', 'body.note']);
      expect(JSON.stringify(fieldErrors)).not.toContain('10.5');
    }
  });

  it('allows plain string path parameters', () => {
    expect(pipe.transform('raw', { type: 'param', metatype: String, data: 'id' })).toBe('raw');
  });

  it('passes custom parameter decorators through untouched', () => {
    expect(pipe.transform('x', { type: 'custom' })).toBe('x');
  });

  it.each([
    ['body typed as unknown/interface', { type: 'body', metatype: Object }],
    ['body without type metadata', { type: 'body' }],
    ['query typed as string', { type: 'query', metatype: String, data: 'page' }],
    ['whole query object without DTO', { type: 'query', metatype: Object }],
    [
      'param typed as number (would really be a string)',
      { type: 'param', metatype: Number, data: 'id' },
    ],
  ] as const)('fails closed for %s', (_label, metadata) => {
    expect(() => pipe.transform({ amount: 12.5 }, metadata)).toThrow(InvariantError);
  });
});
