import {
  isValidVietnameseMobileNumber,
  normalizeVietnameseMobileNumber,
  parseVietnameseMobileNumber,
} from './vietnamese-phone-validator.js';

describe('Vietnamese phone utilities', () => {
  it.each([
    '0321234567',
    '0559123456',
    '0701234567',
    '0879123456',
    '0886123456',
    '0901234567',
    '0921234567',
    '0991234567',
  ])(
    'accepts the mobile numbering families used by Vietnamese carriers: %s',
    (phone) => {
      expect(isValidVietnameseMobileNumber(phone)).toBe(true);
    },
  );

  it.each([
    ['091 234 5678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84-912-345-678', '0912345678'],
    ['0084 912 345 678', '0912345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeVietnameseMobileNumber(input)).toBe(expected);
  });

  it('returns both national and E.164 formats', () => {
    expect(parseVietnameseMobileNumber('0912345678')).toEqual({
      national: '0912345678',
      e164: '+84912345678',
    });
  });

  it.each([
    '',
    'not-a-number',
    '123',
    '02412345678',
    '+14155552671',
    '09123456789',
  ])('rejects non-mobile or invalid input: %s', (phone) => {
    expect(parseVietnameseMobileNumber(phone)).toBeNull();
  });
});
