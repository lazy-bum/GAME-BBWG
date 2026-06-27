import crypto from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface ParsedPasswordHash {
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: Buffer;
}

function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return null;
  }

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const hash = Buffer.from(parts[5], 'hex');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || hash.length === 0) {
    return null;
  }

  return {
    N,
    r,
    p,
    salt,
    hash
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });

  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt, derivedKey.toString('hex')].join('$');
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p
  });

  if (derivedKey.length !== parsed.hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedKey, parsed.hash);
}
