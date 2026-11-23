export interface WalletRecordRef {
  recordType: 'expense' | 'topup';
  recordId: string;
}

export function walletRecordKey(recordType: 'expense' | 'topup', recordId: string): string {
  return `${recordType}:${recordId}`;
}

export function deduplicateWalletRecordRefs(records: WalletRecordRef[]): WalletRecordRef[] {
  const seen = new Map<string, WalletRecordRef>();
  for (const rec of records) {
    const key = walletRecordKey(rec.recordType, rec.recordId);
    if (!seen.has(key)) {
      seen.set(key, rec);
    }
  }
  return Array.from(seen.values());
}

export function chunkArray<T>(items: T[], chunkSize = 450): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function getRangeKeys(
  orderedKeys: string[],
  anchorKey: string | null,
  targetKey: string
): string[] {
  const targetIdx = orderedKeys.indexOf(targetKey);
  if (targetIdx === -1) return [];
  const anchorIdx = anchorKey ? orderedKeys.indexOf(anchorKey) : -1;
  if (anchorIdx === -1) return [targetKey];
  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  return orderedKeys.slice(start, end + 1);
}
