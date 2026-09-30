import {database} from '@/db/raw';
import {publicCreator,type CreatorRow} from '@/lib/creator-store';
import {paperRankings,rankWeeklyPnl,type BoardOrder,type BoardPosition,type LeaderboardData} from '@/lib/leaderboard';

export async function GET(){
  try{
    const db=database();
    const [accountResult,orderResult,positionResult]=await db.batch([
      db.prepare('SELECT c.*,a.balance FROM creator_profiles c JOIN accounts a ON a.user_id=c.user_id WHERE c.leaderboard_opt_in=1 LIMIT 1001'),
      db.prepare('SELECT o.id,o.user_id AS userId,o.thesis_id AS thesisId,o.side,o.amount,o.creator_fee AS creatorFee,o.trading_fee AS tradingFee,platform_profit_fee AS platformProfitFee,o.created_at AS createdAt FROM orders o JOIN creator_profiles c ON c.user_id=o.user_id WHERE c.leaderboard_opt_in=1 ORDER BY o.created_at ASC,o.rowid ASC LIMIT 50001'),
      db.prepare('SELECT p.user_id AS userId,p.thesis_id AS thesisId,p.amount FROM positions p JOIN creator_profiles c ON c.user_id=p.user_id WHERE c.leaderboard_opt_in=1 LIMIT 50001'),
    ]);
    if(accountResult.results.length>1000||orderResult.results.length>50000||positionResult.results.length>50000)throw new Error('Leaderboard snapshot exceeds replay capacity.');
    const checkedAt=Date.now();
    const accounts=(accountResult.results as (CreatorRow&{balance:number})[]).map(creator=>({userId:creator.user_id,balance:creator.balance,creator:publicCreator(creator),enrolled:true}));
    const scores=paperRankings(accounts,orderResult.results as BoardOrder[],positionResult.results as BoardPosition[],'week',checkedAt);
    const data:LeaderboardData={basis:'paper',start:scores.start,resetsAt:scores.start+7*86400000,checkedAt,participants:scores.investors.length,excluded:scores.excluded,entries:rankWeeklyPnl(scores.investors).slice(0,100)};
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('Leaderboard unavailable',error);
    return Response.json({error:'The leaderboard is unavailable. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
