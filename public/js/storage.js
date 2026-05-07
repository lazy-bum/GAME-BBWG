const REDEEM_CODE_STORAGE_KEY = 'bb-web:redeem-code';

export function readStoredRedeemCode() {
  try {
    return window.localStorage.getItem(REDEEM_CODE_STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function writeStoredRedeemCode(value) {
  try {
    if (value) {
      window.localStorage.setItem(REDEEM_CODE_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(REDEEM_CODE_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}
