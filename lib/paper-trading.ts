import {startFeeTerms,readFeeTerms,settlePositionFees} from './performance-fees';
import {hasPerps,creatorConfigKey,validateExecution,readExecutionState,startExecution,addExecution,executionTotals,scaleExecution,alignExecutionExits,markExecution} from './creator-execution';
import {loadCreatorCoverage} from './perps';
import {validateCounterOutcomes} from './counter-generation';
import {evaluateMarkedExits} from './exit-plan';
import {validateExitPlan,readExitState,startExitState,scaleExitState,evaluateExitState,markExitState} from './exit-plan';
import {
  perpScenario,
  type PerpCoverage,
} from "./perps";
import { tradingFee } from "./trading-fees";
import type { Thesis } from "./data";
import {externalStrategy,stockScenarioPct} from './external-strategy';
import { hasCreatorShare } from "./profit-share";
import {isTakeLive,LIVE_TAKE_GUARD} from './take-lifecycle';
export class TradeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type PositionRow = {
  id: string;
  fee_terms:string|null;
  exit_state:string|null;
  execution_state:string|null;
  amount: number;
  invested: number;
  take_profit: number | null;
  stop_loss: number | null;
  share_eligible: number;
  share_creator: string | null;
  share_realized: number;
  share_high_water: number;
  share_paid: number;
  platform_realized:number;
  platform_high_water:number;
  platform_paid:number;
  execution_mode: "spot" | "perps";
  leverage: number;
  perp_notional: number;
  perp_weight: number;
  maintenance_bps: number;
  perp_markets: string | null;
};
export type TradeInput = {
  id: string;
  action: "buy" | "sell" | "simulate";
  amount: number;
  change?: number;
  acceptProfitShare?: boolean;
  executionMode?: "spot" | "perps";
  leverage?: number;
  acceptRisk?: boolean;
  exitPlanId?:string|null;
  configKey?:string;
};
const inRange = (v: number, min: number, max: number) =>
  Number.isSafeInteger(v) && v >= min && v <= max;
export async function paperTrade(
  db: D1Database,
  userId: string,
  thesis: Thesis,
  input: TradeInput,
  marketProvider: (
    thesis: Thesis,
    fresh?: boolean,
  ) => Promise<PerpCoverage> = loadCreatorCoverage,
) {
  const { id, action } = input;
  if (!inRange(input.amount, 1, 100000000))
    throw new TradeError("Enter a valid paper amount.");
  if (action === "simulate" && !inRange(input.change!, -90, 100))
    throw new TradeError("Choose a valid scenario.");
  const requestKey = JSON.stringify([
    action,
    thesis.id,
    input.amount,
    input.change ?? null,
    !!input.acceptProfitShare,
    input.executionMode ?? "spot",
    input.leverage ?? 1,
    !!input.acceptRisk,
    input.exitPlanId ?? null,
    input.configKey ?? null,
  ]);
  const prior = await db
    .prepare(
      "SELECT user_id,request_key,side,creator_fee,trading_fee,platform_profit_fee,execution_reason FROM orders WHERE id=?",
    )
    .bind(id)
    .first<{
      user_id: string;
      request_key: string | null;
      side: string;
      creator_fee: number;
      trading_fee: number;
      platform_profit_fee:number;
      execution_reason: string | null;
    }>();
  if (prior) {
    if (
      prior.user_id !== userId ||
      (prior.request_key && prior.request_key !== requestKey)
    )
      throw new TradeError(
        "This request ID was already used. Refresh and try again.",
        409,
      );
    return {
      ok: true,
      triggered: prior.side === "rule-exit" || ["creator-exit","creator-stop","partial-liquidation","zero-value-exit"].includes(prior.execution_reason||""),
      creatorFee: prior.creator_fee,
      tradingFee: prior.trading_fee,
      platformProfitFee:prior.platform_profit_fee,
      executionReason: prior.execution_reason,
      duplicate: true,
    };
  }
  if(action==='buy'&&!isTakeLive(thesis))throw new TradeError('This take is closed to new investment. Existing positions can still be sold.',409);
  const snapshot = await db.batch([
    db
      .prepare("SELECT balance,revision FROM accounts WHERE user_id=?")
      .bind(userId),
    db
      .prepare("SELECT * FROM positions WHERE user_id=? AND thesis_id=?")
      .bind(userId, thesis.id),
  ]);
  const account = snapshot[0].results[0] as
    { balance: number; revision: number } | undefined;
  const p = snapshot[1].results[0] as PositionRow | undefined;
  if (!account) throw new TradeError("Your paper portfolio is unavailable.");
  let amount = input.amount,
    nextAmount = p?.amount || 0,
    nextInvested = p?.invested || 0,
    delta = 0,
    side: string = action,
    triggered = false,
    fee = 0,
    platformFee = 0,
    platformProfitFee = 0,
    realizedProfit = 0;
  let eligible = p?.share_eligible || 0,
    creator = p?.share_creator || null,
    shareRealized = p?.share_realized || 0,
    shareHighWater = p?.share_high_water || 0,
    sharePaid = p?.share_paid || 0,
    platformRealized=p?.platform_realized||0,
    platformHighWater=p?.platform_high_water||0,
    platformPaid=p?.platform_paid||0;
  const savedPosition=p?{amount:p.amount,invested:p.invested,feeTerms:p.fee_terms,shareEligible:!!p.share_eligible,shareRealized:p.share_realized,shareHighWater:p.share_high_water,sharePaid:p.share_paid,platformRealized:p.platform_realized,platformHighWater:p.platform_high_water,platformPaid:p.platform_paid}:undefined;
  let feeTerms=p?.fee_terms||null;
  let execution=action==='buy'&&!p?.amount?null:readExecutionState(p?.execution_state);
  const creatorMode=hasPerps(thesis)?'perps':'spot';
  const creatorLeverage=Math.max(1,...thesis.allocations.filter(a=>a.weight>0&&a.execution==='perps').map(a=>a.leverage||1));
  const executionMode=p?.amount?p.execution_mode:creatorMode,leverage=p?.amount?p.leverage:creatorLeverage;
  let notional=p?.amount?p.perp_notional:0,weight=p?.amount?p.perp_weight:0,maintenanceBps=p?.amount?p.maintenance_bps:0,markets=p?.amount?p.perp_markets:null,executionReason:string|null=null;
  let exits=action==='buy'&&!p?.amount?null:readExitState(p?.exit_state),scenarioValue:number|null=null,costBasis:number|null=null;
  let coverage:PerpCoverage|null=null;
  if(action==='buy'){
    if(input.configKey!==creatorConfigKey(thesis))throw new TradeError('The creator’s strategy changed. Refresh and review the current execution, exit and performance fee settings.',409);
    if(input.executionMode!==undefined&&input.executionMode!==creatorMode||input.leverage!==undefined&&input.leverage!==creatorLeverage)throw new TradeError('Execution and leverage are set by the take’s creator.',409);
    if((input.exitPlanId??null)!==(thesis.exitPlan?.id??null))throw new TradeError('Review the creator’s current exit plan before investing.',409);
    if(p?.amount&&(!feeTerms||JSON.stringify(readFeeTerms(feeTerms))!==JSON.stringify(startFeeTerms(thesis,userId,savedPosition))))throw new TradeError('Close this position before investing under different performance fee terms.',409);
    if(p?.amount&&(!execution||execution.configKey!==creatorConfigKey(thesis)||exits))throw new TradeError('Close this existing position before investing in the updated creator strategy or adding capital to a saved exit schedule.',409);
    if(hasPerps(thesis)){
      if(!input.acceptRisk)throw new TradeError('Review the creator’s perp exposure and liquidation estimates before confirming.');
      coverage=await marketProvider(thesis,true);
    }
    try{validateExecution(thesis,coverage);await validateCounterOutcomes(thesis);}catch(e){throw new TradeError((e as Error).message,409);}
    weight=thesis.allocations.filter(a=>a.execution==='perps').reduce((n,a)=>n+a.weight,0);
    maintenanceBps=coverage?.maintenanceBps||0;
    markets=coverage?JSON.stringify(coverage.legs.filter(l=>thesis.allocations.some(a=>a.symbol===l.key&&a.execution==='perps')).map(l=>({key:l.key,symbol:l.symbol,weight:l.weight}))):null;
  }
  if (action === "buy") {
    if (amount > account.balance)
      throw new TradeError("Not enough paper funds.");
    if(!nextAmount){
      const terms=startFeeTerms(thesis,userId,savedPosition);
      feeTerms=JSON.stringify(terms);
      eligible=terms.creatorUnits>0?1:0;creator=terms.creatorId;
    }
    delta = -amount;
    platformFee = tradingFee(amount);
    nextAmount += amount - platformFee;
    nextInvested += amount;
    const addition=startExecution(thesis,amount-platformFee,amount,coverage);
    execution=execution?addExecution(execution,addition):addition;
    notional=executionTotals(execution).notional;
    if(thesis.exitPlan)exits=startExitState(validateExitPlan(thesis.exitPlan,thesis),thesis,nextAmount,nextInvested);
  }
  if (action === "sell") {
    if (!p || amount > p.amount)
      throw new TradeError("You cannot sell more than you own.");
    const settled = settlePositionFees(savedPosition!,amount);
    nextAmount = settled.remainingAmount;
    nextInvested = settled.remainingCost;
    if(exits)exits=scaleExitState(exits,nextAmount,nextInvested);
    if(execution)execution=scaleExecution(execution,nextAmount,nextInvested);
    if(execution)notional=executionTotals(execution).notional;
    else if (executionMode === "perps") notional = Math.round((notional * nextAmount) / p.amount);
    delta=settled.netProceeds;
    ({fee,realizedProfit,shareRealized,shareHighWater,sharePaid,platformProfitFee,platformRealized,platformHighWater,platformPaid}=settled);
  }
  if (action === "simulate") {
    if (!p || !p.amount) throw new TradeError("Buy this take first.");
    let sale=0,released=0;
    if(execution){
      const marked=markExecution(execution,input.change!);execution=marked.state;
      let totals=executionTotals(execution);const markedValue=totals.amount;
      nextAmount=totals.amount;nextInvested=totals.cost;released=marked.releasedCost;
      if(exits){
        const evaluated=evaluateMarkedExits({...exits,legs:execution.legs.map(l=>({symbol:l.symbol,amount:l.amount,cost:l.cost}))},p.invested);
        exits=evaluated.state;execution=alignExecutionExits(execution,exits);
        sale=evaluated.proceeds;released+=evaluated.releasedCost;
        if(evaluated.releasedCost)executionReason=evaluated.stopped?'creator-stop':'creator-exit';
      }
      if(marked.releasedCost)executionReason=executionReason||(marked.liquidated?'partial-liquidation':'zero-value-exit');
      totals=executionTotals(execution);nextAmount=totals.amount;nextInvested=totals.cost;notional=totals.notional;
      triggered=released>0;
      if(triggered){scenarioValue=markedValue;costBasis=released;}
    }else{
    const move =
      executionMode === "perps"
        ? perpScenario(p.amount, notional, input.change!, maintenanceBps)
        : null;
    nextAmount = move
      ? move.amount
      : Math.max(0,Math.round(p.amount * (1 + (externalStrategy(thesis)?stockScenarioPct(thesis,input.change!):input.change!) / 100)));
    if (move) notional = move.notional;
    executionReason = move?.liquidated ? "liquidation" : null;
    if(exits&&!move)nextAmount=markExitState(exits,thesis,input.change!).legs.reduce((n,l)=>n+l.amount,0);
    triggered = nextAmount===0 || !!move?.liquidated ||
      (p.take_profit!==null&&nextAmount*100>=p.invested*(100+p.take_profit)) ||
      (p.stop_loss!==null&&nextAmount*100<=p.invested*(100-p.stop_loss));
    sale=triggered?nextAmount:0;released=triggered?p.invested:0;
    if(exits&&!triggered){
      const evaluated=evaluateExitState(exits,thesis,input.change!,move?nextAmount:undefined);
      exits=evaluated.state;nextAmount=evaluated.amount;nextInvested=evaluated.cost;
      sale=evaluated.proceeds;released=evaluated.releasedCost;
      if(sale){scenarioValue=evaluated.markedValue;executionReason='creator-exit';costBasis=released;triggered=true;}
    }
    }
    side=triggered?(nextAmount===0||scenarioValue===null?'rule-exit':'sell'):'scenario';
    amount=triggered?sale:nextAmount;
    if(triggered){
      const marked=scenarioValue??sale;
      const settled=settlePositionFees({...savedPosition!,amount:marked||p.amount},sale,true,released);
      delta=settled.netProceeds;
      ({fee,realizedProfit,shareRealized,shareHighWater,sharePaid,platformProfitFee,platformRealized,platformHighWater,platformPaid}=settled);
      if(scenarioValue===null){nextAmount=0;nextInvested=0;notional=0;if(exits)exits=scaleExitState(exits,0,0);}
      else if(!execution&&executionMode==='perps')notional=Math.round(notional*nextAmount/scenarioValue);
    }
  }
  if (fee && (!creator || creator === userId))
    throw new TradeError(
      "This creator attribution needs to be checked before selling.",
      409,
    );
  if (
    !Number.isSafeInteger(notional) ||
    notional < 0 ||
    !Number.isSafeInteger(nextAmount) ||
    !Number.isSafeInteger(nextInvested) ||
    !Number.isSafeInteger(shareRealized) ||
    !Number.isSafeInteger(platformRealized) ||
    !Number.isSafeInteger(platformHighWater) ||
    !Number.isSafeInteger(account.balance + delta)
  )
    throw new TradeError("This scenario exceeds the paper account limit.");
  const operation = crypto.randomUUID(),
    now = Date.now();
  const ownOperation =
    "EXISTS(SELECT 1 FROM orders WHERE id=? AND operation_id=?)";
  const statements = [
    db
      .prepare(
        `INSERT INTO orders (id,user_id,thesis_id,side,amount,creator_fee,trading_fee,platform_profit_fee,fee_policy,fee_terms,request_key,operation_id,created_at,execution_mode,leverage,execution_reason,cost_basis) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND revision=?) ${action==='buy'?`AND ${LIVE_TAKE_GUARD}`:''} ${action==='buy'?"AND (NOT EXISTS(SELECT 1 FROM theses WHERE id=?) OR EXISTS(SELECT 1 FROM theses WHERE id=? AND json_extract(payload,'$.version')=? AND json_extract(payload,'$.exitPlan.id') IS ?))":''} ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        id,
        userId,
        thesis.id,
        side,
        amount,
        fee,
        platformFee,
        platformProfitFee,
        feeTerms?'v3':'v2',
        feeTerms,
        requestKey,
        operation,
        now,
        executionMode,
        leverage,
        executionReason,
        costBasis,
        userId,
        account.revision,
        ...(action==='buy'?[thesis.id]:[]),
        ...(action==='buy'?[thesis.id,thesis.id,thesis.storageVersion??thesis.version,thesis.exitPlan?.id??null]:[]),
      ),
    db
      .prepare(
        `INSERT INTO positions (id,user_id,thesis_id,amount,invested,share_eligible,share_creator,share_realized,share_high_water,share_paid,platform_realized,platform_high_water,platform_paid,execution_mode,leverage,perp_notional,perp_weight,maintenance_bps,perp_markets,exit_state,execution_state,fee_terms) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${ownOperation} ON CONFLICT(user_id,thesis_id) DO UPDATE SET amount=excluded.amount,invested=excluded.invested,share_eligible=excluded.share_eligible,share_creator=excluded.share_creator,share_realized=excluded.share_realized,share_high_water=excluded.share_high_water,share_paid=excluded.share_paid,platform_realized=excluded.platform_realized,platform_high_water=excluded.platform_high_water,platform_paid=excluded.platform_paid,execution_mode=excluded.execution_mode,leverage=excluded.leverage,perp_notional=excluded.perp_notional,perp_weight=excluded.perp_weight,maintenance_bps=excluded.maintenance_bps,perp_markets=excluded.perp_markets,exit_state=excluded.exit_state,execution_state=excluded.execution_state,fee_terms=excluded.fee_terms,take_profit=CASE WHEN excluded.execution_state IS NOT NULL OR positions.amount=0 THEN NULL ELSE positions.take_profit END,stop_loss=CASE WHEN excluded.execution_state IS NOT NULL OR positions.amount=0 THEN NULL ELSE positions.stop_loss END`,
      )
      .bind(
        p?.id || crypto.randomUUID(),
        userId,
        thesis.id,
        nextAmount,
        nextInvested,
        eligible,
        creator,
        shareRealized,
        shareHighWater,
        sharePaid,
        platformRealized,
        platformHighWater,
        platformPaid,
        executionMode,
        leverage,
        notional,
        weight,
        maintenanceBps,
        markets,
        exits?JSON.stringify(exits):null,
        execution?JSON.stringify(execution):null,
        feeTerms,
        id,
        operation,
      ),
    db
      .prepare(
        `UPDATE accounts SET balance=balance+?,revision=revision+1 WHERE user_id=? AND ${ownOperation}`,
      )
      .bind(delta, userId, id, operation),
  ];
  if(scenarioValue!==null&&triggered)statements.unshift(db.prepare("INSERT INTO orders (id,user_id,thesis_id,side,amount,operation_id,created_at,execution_mode,leverage) SELECT ?,?,?,'scenario',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM orders WHERE id=?)").bind(crypto.randomUUID(),userId,thesis.id,scenarioValue,operation,now,executionMode,leverage,userId,account.revision,id));
  if (fee > 0 && creator) {
    statements.push(
      db
        .prepare(
          `INSERT INTO creator_earnings (order_id,creator_id,follower_id,thesis_id,amount,realized_profit,created_at) SELECT ?,?,?,?,?,?,? WHERE ${ownOperation}`,
        )
        .bind(
          id,
          creator,
          userId,
          thesis.id,
          fee,
          realizedProfit,
          now,
          id,
          operation,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO accounts (user_id) SELECT ? WHERE ${ownOperation}`,
        )
        .bind(creator, id, operation),
      db
        .prepare(
          `UPDATE accounts SET balance=balance+?,revision=revision+1 WHERE user_id=? AND ${ownOperation}`,
        )
        .bind(fee, creator, id, operation),
      db
        .prepare(
          `INSERT INTO orders (id,user_id,thesis_id,side,amount,operation_id,created_at) SELECT ?,?,?,'creator-income',?,?,? WHERE ${ownOperation}`,
        )
        .bind(
          crypto.randomUUID(),
          creator,
          thesis.id,
          fee,
          operation,
          now,
          id,
          operation,
        ),
    );
  }
  await db.batch(statements);
  const saved = await db
    .prepare(
      "SELECT user_id,request_key,side,creator_fee,trading_fee,platform_profit_fee,execution_reason FROM orders WHERE id=?",
    )
    .bind(id)
    .first<{
      user_id: string;
      request_key: string | null;
      side: string;
      creator_fee: number;
      trading_fee: number;
      platform_profit_fee:number;
      execution_reason: string | null;
    }>();
  if (!saved || saved.user_id !== userId || saved.request_key !== requestKey)
    throw new TradeError("Your portfolio changed. Refresh and try again.", 409);
  return {
    ok: true,
    triggered: saved.side === "rule-exit" || ["creator-exit","creator-stop","partial-liquidation","zero-value-exit"].includes(saved.execution_reason||""),
    creatorFee: saved.creator_fee,
    tradingFee: saved.trading_fee,
    platformProfitFee:saved.platform_profit_fee,
    executionReason: saved.execution_reason,
  };
}

export async function followTake(
  db: D1Database,
  userId: string,
  thesis: Thesis,
  active: boolean,
  _accepted?: boolean,
) {
  if (!hasCreatorShare(thesis, userId))
    throw new TradeError("Follow a community take by another creator.");
  if (active) {
    if(!isTakeLive(thesis))throw new TradeError('This take is closed to new followers.',409);
    await db
      .prepare(
        "INSERT INTO thesis_follows (user_id,thesis_id,creator_id,active,accepted_at) VALUES (?,?,?,1,?) ON CONFLICT(user_id,thesis_id) DO UPDATE SET active=1",
      )
      .bind(userId, thesis.id, thesis.owner, Date.now())
      .run();
  } else {
    await db.prepare("UPDATE thesis_follows SET active=0 WHERE user_id=? AND thesis_id=?").bind(userId,thesis.id).run();
  }
  return { ok: true };
}
