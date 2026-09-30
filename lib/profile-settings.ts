export const DEFAULT_BUY_AMOUNT = 10_000;
export const MAX_BUY_AMOUNT = 100_000_000;

export class ProfileSettingsError extends Error {}

export async function saveBuyPreset(db: D1Database, userId: string, amount: unknown) {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_BUY_AMOUNT) {
    throw new ProfileSettingsError('Enter a buy amount between $0.01 and $1,000,000, with up to two decimal places.');
  }
  await db.prepare('INSERT INTO accounts (user_id,default_buy_amount) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET default_buy_amount=excluded.default_buy_amount').bind(userId,amount).run();
  return amount;
}
