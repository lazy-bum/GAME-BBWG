import { ACCOUNT_STATUS } from './constants.js';

export function getDefaultRedeemStatus(status) {
  if (status === ACCOUNT_STATUS.redeemed) {
    return { code: ACCOUNT_STATUS.redeemed, text: '已兑换' };
  }
  if (status === ACCOUNT_STATUS.failed) {
    return { code: ACCOUNT_STATUS.failed, text: '兑换失败' };
  }
  return { code: ACCOUNT_STATUS.pending, text: '未兑换' };
}

export function extractFailureReason(message, fallback) {
  const separatorIndex = message.lastIndexOf(' - ');
  if (separatorIndex !== -1) {
    const separatedReason = message.slice(separatorIndex + 3).trim();
    return separatedReason || fallback;
  }

  const colonIndex = message.indexOf(':');
  if (colonIndex === -1) {
    return fallback;
  }

  const reason = message.slice(colonIndex + 1).trim();
  const cleanedReason = reason
    .replace(/^[^(]+?\([^)]+\)\s*/u, '')
    .replace(/\([^)]+\)\s*$/u, '')
    .trim();

  return cleanedReason || fallback;
}
