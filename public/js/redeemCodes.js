export const REDEEM_CODE_SPLIT_PATTERN = /[\s,，;；]+/u;

export function parseRedeemCodeInput(value) {
  const rawCodes = String(value)
    .split(REDEEM_CODE_SPLIT_PATTERN)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const codes = Array.from(new Set(rawCodes));

  return {
    rawCount: rawCodes.length,
    duplicateCount: rawCodes.length - codes.length,
    codes
  };
}
