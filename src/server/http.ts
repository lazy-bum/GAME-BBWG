import net from 'node:net';
import type express from 'express';

export function normalizeIpAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function isValidIpAddress(value: string): boolean {
  return net.isIP(normalizeIpAddress(value)) !== 0;
}

export function sendJsonError(res: express.Response, error: unknown, status = 500): void {
  res.status(status).json({
    ok: false,
    error: error instanceof Error ? error.message : '未知错误'
  });
}
