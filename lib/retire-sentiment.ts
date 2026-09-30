// Retain historical outcomes, but return every unsettled gross stake, including
// its entry fee. D1 executes this batch atomically across all affected accounts.
export async function retireSentiment(db:D1Database){
 if(!await db.prepare("SELECT 1 FROM prediction_bets WHERE payout IS NULL UNION ALL SELECT 1 FROM prediction_rounds WHERE status='open' LIMIT 1").first())return;
 if(await db.prepare('SELECT 1 FROM prediction_bets b LEFT JOIN prediction_rounds r ON r.id=b.round_id WHERE b.payout IS NULL AND r.id IS NULL LIMIT 1').first())throw new Error('Unsettled prediction records need their missing round restored before retirement.');
 const now=Date.now();
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO accounts (user_id) SELECT DISTINCT user_id FROM prediction_bets WHERE payout IS NULL'),
  db.prepare("INSERT INTO orders (id,user_id,thesis_id,side,amount,operation_id,created_at) SELECT 'retired-prediction:'||b.id,b.user_id,r.thesis_id,'prediction-refund',b.amount,'sentiment-retired',? FROM prediction_bets b JOIN prediction_rounds r ON r.id=b.round_id WHERE b.payout IS NULL").bind(now),
  db.prepare('UPDATE accounts SET balance=balance+(SELECT COALESCE(SUM(b.amount),0) FROM prediction_bets b WHERE b.user_id=accounts.user_id AND b.payout IS NULL),revision=revision+1 WHERE EXISTS(SELECT 1 FROM prediction_bets b WHERE b.user_id=accounts.user_id AND b.payout IS NULL)'),
  db.prepare('UPDATE prediction_bets SET payout=amount WHERE payout IS NULL'),
  db.prepare("UPDATE prediction_rounds SET status='settled',outcome='refund',reason='Sentiment betting was removed. Unsettled stakes and entry fees were refunded.',settlement_id='sentiment-retired',settled_at=? WHERE status='open'").bind(now),
 ]);
}
