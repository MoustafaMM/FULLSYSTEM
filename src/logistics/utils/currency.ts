/**
 * Unified currency formatting utility for Pioneer-4ss Logistics Platform.
 * Standard currency: Malaysian Ringgit (RM).
 */

export const CURRENCY_CODE = 'MYR';
export const CURRENCY_SYMBOL = 'RM';

/**
 * Formats a numeric value or numeric string to standard Malaysian Ringgit format: `RM XX.XX`
 * Example: formatCurrency(150) => "RM 150.00"
 */
export const formatCurrency = (amount: number | string | undefined | null): string => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  if (isNaN(num)) return 'RM 0.00';
  return `RM ${num.toFixed(2)}`;
};

/**
 * Formats an amount with an explicit plus or minus sign and RM prefix.
 * Example: formatAmountWithSign(50, 'topup') => "+RM 50.00"
 * Example: formatAmountWithSign(25.5, 'expense') => "-RM 25.50"
 */
export const formatAmountWithSign = (
  amount: number | string | undefined | null, 
  type: 'topup' | 'expense' | 'incoming' | 'outgoing' | 'positive' | 'negative'
): string => {
  const num = Math.abs(typeof amount === 'number' ? amount : parseFloat(String(amount || 0))) || 0;
  if (type === 'topup' || type === 'incoming' || type === 'positive') {
    return `+RM ${num.toFixed(2)}`;
  }
  return `-RM ${num.toFixed(2)}`;
};
