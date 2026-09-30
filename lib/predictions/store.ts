import { tradingFee,PREDICTION_FEE_BPS } from "../trading-fees";
import {isTakeLive,LIVE_TAKE_GUARD} from '../take-lifecycle';
import type { Thesis } from "../data";
import {
  HOUR,
  REFUND_DELAY,
  PredictionError,
  freezeBasket,
  roundTimes,
  poolPayouts,
  weightedReturn,
  type Round,
  type Bet,
  type Period,
  type Side,
  type PayoutBet,
  type BasketToken,
} from "./model";
import type { BoundaryPrices } from "./prices";
type RoundRow = {
  id: string;
  thesis_id: string;
  days: Period;
  sequence: number;
  thesis_version: number;
  title: string;
  basket: string;
  starts_at: number;
  ends_at: number;
  status: Round["status"];
  outcome: Round["outcome"];
  return_micropct: number | null;
  reason: string | null;
  prices: string | null;
  right?: number;
  wrong?: number;
  bettors?: number;
};
export const publicRound = (r: RoundRow): Round => ({
  id: r.id,
  thesisId: r.thesis_id,
  days: r.days,
  sequence: r.sequence,
  thesisVersion: r.thesis_version,
  title: r.title,
  basket: JSON.parse(r.basket),
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  outcome: r.outcome,
  returnPct: r.return_micropct === null ? null : r.return_micropct / 1e6,
  reason: r.reason,
  right: r.right || 0,
  wrong: r.wrong || 0,
  bettors: r.bettors || 0,
});
export async function latestRound(
  db: D1Database,
  thesisId: string,
  days: Period,
) {
  return db
    .prepare(
      "SELECT * FROM prediction_rounds WHERE thesis_id=? AND days=? ORDER BY sequence DESC LIMIT 1",
    )
    .bind(thesisId, days)
    .first<RoundRow>();
}
export async function readPredictions(db: D1Database, userId?: string) {
  const rounds = await db
    .prepare(
      `SELECT r.*,COALESCE(SUM(CASE WHEN b.side='right' THEN b.stake ELSE 0 END),0) AS right,COALESCE(SUM(CASE WHEN b.side='wrong' THEN b.stake ELSE 0 END),0) AS wrong,COUNT(DISTINCT b.user_id) AS bettors FROM prediction_rounds r LEFT JOIN prediction_bets b ON b.round_id=r.id WHERE NOT EXISTS(SELECT 1 FROM theses t WHERE t.id=r.thesis_id AND t.visibility='private') AND NOT EXISTS(SELECT 1 FROM prediction_rounds newer WHERE newer.thesis_id=r.thesis_id AND newer.days=r.days AND newer.sequence>r.sequence) GROUP BY r.id ORDER BY r.starts_at DESC LIMIT 1000`,
    )
    .all<RoundRow>();
  const bets = userId
    ? (
        await db
          .prepare(
            `SELECT b.id,b.round_id AS roundId,r.thesis_id AS thesisId,r.days,b.side,b.amount,b.stake,b.fee,b.payout,b.created_at AS createdAt,r.starts_at AS startsAt,r.ends_at AS endsAt,r.outcome FROM prediction_bets b JOIN prediction_rounds r ON r.id=b.round_id WHERE b.user_id=? ORDER BY b.payout IS NOT NULL,b.created_at DESC LIMIT 1000`,
          )
          .bind(userId)
          .all<Bet>()
      ).results
    : [];
  const account = userId
    ? await db
        .prepare("SELECT balance FROM accounts WHERE user_id=?")
        .bind(userId)
        .first<{ balance: number }>()
    : null;
  return {
    rounds: rounds.results.map(publicRound),
    bets,
    balance: account?.balance ?? null,
    signedIn: !!userId,
    checkedAt: Date.now(),
  };
}
export type BetInput = {
  id: string;
  days: Period;
  side: Side;
  amount: number;
  expectedRoundId: string | null;
};
export async function placeBet(
  db: D1Database,
  userId: string,
  thesis: Thesis,
  input: BetInput,
  clock = () => Date.now(),
) {
  if (
    ![1, 30, 90].includes(input.days) ||
    !["right", "wrong"].includes(input.side) ||
    !Number.isSafeInteger(input.amount) ||
    input.amount < 100 ||
    input.amount > 100_000_000
  )
    throw new PredictionError(
      "Choose a side, period, and paper amount from $1 to $1,000,000.",
    );
  const requestKey = JSON.stringify([
    thesis.id,
    input.days,
    input.side,
    input.amount,
    input.expectedRoundId,
  ]);
  const prior = await db
    .prepare("SELECT user_id,request_key FROM prediction_bets WHERE id=?")
    .bind(input.id)
    .first<{ user_id: string; request_key: string }>();
  if (prior) {
    if (prior.user_id !== userId || prior.request_key !== requestKey)
      throw new PredictionError("This request ID was already used.", 409);
    return { ok: true, duplicate: true };
  }
  if(!isTakeLive(thesis))throw new PredictionError('This take is closed to new sentiment bets.',409);
  const account = await db
    .prepare("SELECT balance,revision FROM accounts WHERE user_id=?")
    .bind(userId)
    .first<{ balance: number; revision: number }>();
  if (!account || account.balance < input.amount)
    throw new PredictionError("Not enough available paper funds.");
  const previous = await latestRound(db, thesis.id, input.days);
  if ((previous?.id ?? null) !== input.expectedRoundId)
    throw new PredictionError(
      "The pool changed. Refresh and review it before confirming.",
      409,
    );
  const isNew = !previous || previous.status === "settled";
  const now = clock();
  if (!isNew && now >= previous.starts_at)
    throw new PredictionError(
      "Betting is closed for this round. A new round opens after settlement.",
      409,
    );
  const id = isNew ? crypto.randomUUID() : previous.id;
  const fee = tradingFee(input.amount,PREDICTION_FEE_BPS),
    stake = input.amount - fee,
    operation = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (isNew) {
    const times = roundTimes(input.days, now);
    statements.push(
      db
        .prepare(
          `INSERT INTO prediction_rounds(id,thesis_id,days,sequence,thesis_version,title,basket,starts_at,ends_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND revision=?) ON CONFLICT(thesis_id,days,sequence) DO NOTHING`,
        )
        .bind(
          id,
          thesis.id,
          input.days,
          (previous?.sequence ?? 0) + 1,
          thesis.version,
          thesis.title,
          JSON.stringify(freezeBasket(thesis)),
          times.startsAt,
          times.endsAt,
          userId,
          account.revision,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO prediction_bets(id,round_id,user_id,side,amount,stake,fee,request_key,operation_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND revision=? AND balance>=?) AND EXISTS(SELECT 1 FROM prediction_rounds WHERE id=? AND status='open' AND starts_at>?) AND NOT EXISTS(SELECT 1 FROM prediction_bets WHERE round_id=? AND user_id=? AND side<>?) AND (SELECT COUNT(*) FROM prediction_bets WHERE round_id=?)<500 AND (SELECT COUNT(*) FROM prediction_bets WHERE user_id=? AND payout IS NULL)<500 AND ${LIVE_TAKE_GUARD} ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        input.id,
        id,
        userId,
        input.side,
        input.amount,
        stake,
        fee,
        requestKey,
        operation,
        now,
        userId,
        account.revision,
        input.amount,
        id,
        clock(),
        id,
        userId,
        input.side,
        id,
        userId,
        thesis.id,
      ),
  );
  const guard =
    "EXISTS(SELECT 1 FROM prediction_bets WHERE id=? AND operation_id=?)";
  statements.push(
    db
      .prepare(
        `UPDATE accounts SET balance=balance-?,revision=revision+1 WHERE user_id=? AND ${guard}`,
      )
      .bind(input.amount, userId, input.id, operation),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO orders(id,user_id,thesis_id,side,amount,trading_fee,created_at) SELECT ?,?,?,'prediction-stake',?,?,? WHERE ${guard}`,
      )
      .bind(
        "prediction:" + input.id,
        userId,
        thesis.id,
        input.amount,
        fee,
        now,
        input.id,
        operation,
      ),
  );
  // Do not leave an empty round if a concurrent spend or first-bet race lost.
  if (isNew)
    statements.push(
      db
        .prepare(
          "DELETE FROM prediction_rounds WHERE id=? AND NOT EXISTS(SELECT 1 FROM prediction_bets WHERE round_id=?)",
        )
        .bind(id, id),
    );
  await db.batch(statements);
  const saved = await db
    .prepare("SELECT user_id,request_key FROM prediction_bets WHERE id=?")
    .bind(input.id)
    .first<{ user_id: string; request_key: string }>();
  if (!saved || saved.user_id !== userId || saved.request_key !== requestKey)
    throw new PredictionError(
      "Your balance or pool changed. You can back one side per round. Refresh and try again.",
      409,
    );
  return { ok: true };
}
export async function settleRound(
  db: D1Database,
  id: string,
  priceLoader: (
    basket: BasketToken[],
    start: number,
    end: number,
    resume: BoundaryPrices,
    onProgress: (prices: BoundaryPrices) => Promise<void>,
  ) => Promise<BoundaryPrices>,
  now = Date.now(),
) {
  const round = await db
    .prepare("SELECT * FROM prediction_rounds WHERE id=?")
    .bind(id)
    .first<RoundRow>();
  if (!round) throw new PredictionError("This round is unavailable.", 404);
  if (round.status === "settled") return { ok: true, duplicate: true };
  if (now < round.ends_at + HOUR)
    throw new PredictionError(
      "The round settles after its deadline and a one-hour price-data window.",
      409,
    );
  const bets = (
    await db
      .prepare(
        "SELECT id,user_id AS userId,side,stake,amount FROM prediction_bets WHERE round_id=? ORDER BY id",
      )
      .bind(id)
      .all<PayoutBet>()
  ).results;
  let outcome: Side | "refund" = "refund",
    pct: number | null = null,
    prices: BoundaryPrices | null = null;
  let reason =
    "Only one side was backed. All stakes and entry fees were refunded.";
  if (
    bets.some((b) => b.side === "right") &&
    bets.some((b) => b.side === "wrong")
  ) {
    try {
      prices = await priceLoader(
        JSON.parse(round.basket),
        round.starts_at,
        round.ends_at,
        round.prices ? (JSON.parse(round.prices) as BoundaryPrices) : {},
        async (partial) => {
          await db
            .prepare(
              "UPDATE prediction_rounds SET prices=json_patch(COALESCE(prices,'{}'),?) WHERE id=? AND status='open'",
            )
            .bind(JSON.stringify(partial), id)
            .run();
        },
      );
      pct = weightedReturn(JSON.parse(round.basket), prices);
      outcome = pct > 0 ? "right" : pct < 0 ? "wrong" : "refund";
      reason =
        outcome === "refund"
          ? "The basket finished flat. All stakes and entry fees were refunded."
          : `The frozen basket finished ${outcome === "right" ? "above" : "below"} its starting value.`;
    } catch (e) {
      if (now < round.ends_at + REFUND_DELAY) throw e;
      reason =
        "Boundary prices could not be verified within 7 days. All stakes and entry fees were refunded.";
    }
  }
  const payouts = poolPayouts(bets, outcome);
  const data = JSON.stringify(
    payouts.map((b) => ({ id: b.id, userId: b.userId, payout: b.payout })),
  );
  const operation = crypto.randomUUID();
  const guard =
    "EXISTS(SELECT 1 FROM prediction_rounds WHERE id=? AND settlement_id=?)";
  await db.batch([
    db
      .prepare(
        "UPDATE prediction_rounds SET status='settled',outcome=?,return_micropct=?,reason=?,prices=?,settlement_id=?,settled_at=? WHERE id=? AND status='open'",
      )
      .bind(
        outcome,
        pct === null ? null : Math.round(pct * 1e6),
        reason,
        prices ? JSON.stringify(prices) : null,
        operation,
        now,
        id,
      ),
    db
      .prepare(
        `UPDATE prediction_bets SET payout=(SELECT json_extract(value,'$.payout') FROM json_each(?) WHERE json_extract(value,'$.id')=prediction_bets.id) WHERE round_id=? AND ${guard}`,
      )
      .bind(data, id, id, operation),
    db
      .prepare(
        `UPDATE accounts SET balance=balance+(SELECT COALESCE(SUM(json_extract(value,'$.payout')),0) FROM json_each(?) WHERE json_extract(value,'$.userId')=accounts.user_id),revision=revision+1 WHERE user_id IN (SELECT user_id FROM prediction_bets WHERE round_id=?) AND ${guard}`,
      )
      .bind(data, id, id, operation),
    db
      .prepare(
        `INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) SELECT 'prediction-result:'||id,user_id,?,?,payout,? FROM prediction_bets WHERE round_id=? AND ${guard}`,
      )
      .bind(
        round.thesis_id,
        outcome === "refund" ? "prediction-refund" : "prediction-payout",
        now,
        id,
        id,
        operation,
      ),
  ]);
  return { ok: true };
}
