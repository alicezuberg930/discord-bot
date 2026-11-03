import {
  CCCD_PROVINCES,
  isValidCccd,
  normalizeCccd,
  parseCccd,
} from './cccd-validator.js';

describe('CCCD validator', () => {
  it('contains all 63 province and municipality codes from the reference', () => {
    expect(Object.keys(CCCD_PROVINCES)).toHaveLength(63);
  });

  it('decodes the reference CCCD example', () => {
    expect(parseCccd('037153000257')).toEqual({
      value: '037153000257',
      provinceCode: '037',
      province: 'Ninh Bình',
      genderCenturyCode: 1,
      gender: 'Nữ',
      century: 20,
      birthYear: 1953,
      randomSequence: '000257',
    });
  });

  it.each([
    ['0', 'Nam', 20, 1953],
    ['1', 'Nữ', 20, 1953],
    ['2', 'Nam', 21, 2053],
    ['3', 'Nữ', 21, 2053],
    ['4', 'Nam', 22, 2153],
    ['5', 'Nữ', 22, 2153],
    ['6', 'Nam', 23, 2253],
    ['7', 'Nữ', 23, 2253],
    ['8', 'Nam', 24, 2353],
    ['9', 'Nữ', 24, 2353],
  ] as const)(
    'decodes gender/century code %s as %s in century %i',
    (code, gender, century, birthYear) => {
      const result = parseCccd(`001${code}53000257`);

      expect(result).toMatchObject({ gender, century, birthYear });
    },
  );

  it('removes whitespace before validation', () => {
    expect(normalizeCccd('037 153 000 257')).toBe('037153000257');
  });

  it('accepts an unlisted province code without a province name', () => {
    expect(parseCccd('003153000257')).toMatchObject({
      value: '003153000257',
      provinceCode: '003',
      province: null,
    });
  });

  it.each(['', '03715300025', '0371530002570', '03715300025A'])(
    'rejects malformed CCCD values: %s',
    (value) => {
      expect(isValidCccd(value)).toBe(false);
    },
  );
});
