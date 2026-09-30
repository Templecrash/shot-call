export const TRADING_FEE_BPS = 5;
export const PLATFORM_PROFIT_SHARE_BPS = 300;
export const PREDICTION_FEE_BPS = 200;
// Integer cents, rounded to the nearest cent. Avoid floating dollar arithmetic.
export function tradingFee(amount: number, basisPoints = TRADING_FEE_BPS): number {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Invalid trade amount.");
  if(!Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>10000)throw new Error('Invalid fee rate.');
  return Number((BigInt(amount)*BigInt(basisPoints)+5000n)/10000n);
}
export function parseCents(value: string): number | null {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
export function percentAmount(available: number, percent: number): number {
  return Math.min(available, Math.round((available * percent) / 100));
}
