export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractRedeemCodes(...texts: string[]): string[] {
  const codes = new Set<string>();
  const sourceText = texts.filter(Boolean).join('\n');
  const explicitAsciiCodePattern = /(?:兑换码|礼包码|CDK|cdk)\s*[：:：\s]\s*([A-Za-z0-9][A-Za-z0-9_-]{2,31})/gu;
  const explicitUnicodeCodePattern =
    /(^|[^\p{L}\p{N}_-])(?:兑换码|礼包码|CDK|cdk)\s*[：:：\s]\s*([\p{Script=Han}A-Za-z0-9][\p{Script=Han}A-Za-z0-9_-]{1,31})/gu;

  for (const match of sourceText.matchAll(explicitAsciiCodePattern)) {
    const code = match[1]?.replace(/[^A-Za-z0-9_-]/g, '').trim();
    if (code) {
      codes.add(code.toUpperCase());
    }
  }

  for (const match of sourceText.matchAll(explicitUnicodeCodePattern)) {
    const code = match[2]?.replace(/[^\p{Script=Han}A-Za-z0-9_-]/gu, '').trim();
    if (code) {
      codes.add(code.toUpperCase());
    }
  }

  return Array.from(codes);
}
