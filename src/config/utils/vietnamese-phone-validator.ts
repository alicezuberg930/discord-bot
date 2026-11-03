import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export interface VietnameseMobileNumber {
  /** Vietnamese national format used for persistence, for example 0912345678. */
  national: string;
  /** International E.164 format, for example +84912345678. */
  e164: string;
}

/**
 * Parses a Vietnamese mobile number using libphonenumber's complete metadata.
 *
 * This validates number ranges for every carrier, but it cannot prove that a
 * number is assigned, reachable, or still belongs to its original carrier.
 */
export function parseVietnameseMobileNumber(
  value: string,
): VietnameseMobileNumber | null {
  const candidate = prepareForParsing(value);

  if (!candidate) {
    return null;
  }

  const phoneNumber = parsePhoneNumberFromString(candidate, {
    defaultCountry: 'VN',
    extract: false,
  });

  if (
    !phoneNumber ||
    phoneNumber.country !== 'VN' ||
    !phoneNumber.isValid() ||
    phoneNumber.getType() !== 'MOBILE'
  ) {
    return null;
  }

  return {
    national: `0${phoneNumber.nationalNumber}`,
    e164: phoneNumber.number,
  };
}

export function isValidVietnameseMobileNumber(value: string): boolean {
  return parseVietnameseMobileNumber(value) !== null;
}

export function normalizeVietnameseMobileNumber(value: string): string | null {
  return parseVietnameseMobileNumber(value)?.national ?? null;
}

function prepareForParsing(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '');

  if (!compact || !/^\+?\d+$/.test(compact)) {
    return null;
  }

  if (compact.startsWith('00')) {
    return `+${compact.slice(2)}`;
  }

  if (/^84\d{9}$/.test(compact)) {
    return `+${compact}`;
  }

  return compact;
}
