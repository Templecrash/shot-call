import {paperPerformance,type PaperOrder} from './performance';
import type {Position} from './data';

export async function loadPaperProfile(db:D1Database,userId:string,now=Date.now()){
  const [account,positions,orders]=await db.batch([
    db.prepare('SELECT balance,revision,(SELECT COALESCE(SUM(stake),0) FROM prediction_bets WHERE user_id=accounts.user_id AND payout IS NULL) AS predictionLocked FROM accounts WHERE user_id=?').bind(userId),
    db.prepare('SELECT id,thesis_id AS thesisId,amount,invested,take_profit AS takeProfit,stop_loss AS stopLoss FROM positions WHERE user_id=?').bind(userId),
    db.prepare('SELECT id,thesis_id AS thesisId,side,amount,cost_basis AS costBasis,creator_fee AS creatorFee,trading_fee AS tradingFee,platform_profit_fee AS platformProfitFee,fee_policy AS feePolicy,execution_mode AS executionMode,leverage,execution_reason AS executionReason,created_at AS createdAt FROM orders WHERE user_id=? ORDER BY created_at ASC,rowid ASC').bind(userId),
  ]);
  const saved=account.results[0] as {balance:number;revision:number;predictionLocked:number}|undefined;
  return {...paperPerformance(orders.results as PaperOrder[],positions.results as Position[],saved?.balance??1000000,now,saved?.predictionLocked??0),revision:saved?.revision??0};
}
