export interface SplitNameResult {
  isSplit: boolean;
  line1: string;
  line2?: string;
}

/**
 * Splits a person's full name into two balanced rows if the name is tall/long.
 * If the name is short (e.g. <= 20 characters and < 4 words), it remains on one row.
 */
export function splitFullName(fullName?: string | null): SplitNameResult {
  if (!fullName) return { isSplit: false, line1: '' };
  const trimmed = fullName.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // If not tall / long: 1 word, or <= 20 chars and < 4 words
  if (words.length < 2 || (trimmed.length <= 20 && words.length < 4)) {
    return { isSplit: false, line1: trimmed };
  }

  // Find the word boundary that balances line lengths most evenly
  let bestIndex = Math.ceil(words.length / 2);
  let minDiff = Infinity;

  for (let i = 1; i < words.length; i++) {
    const part1 = words.slice(0, i).join(' ');
    const part2 = words.slice(i).join(' ');
    const diff = Math.abs(part1.length - part2.length);
    if (diff < minDiff) {
      minDiff = diff;
      bestIndex = i;
    }
  }

  return {
    isSplit: true,
    line1: words.slice(0, bestIndex).join(' '),
    line2: words.slice(bestIndex).join(' ')
  };
}
