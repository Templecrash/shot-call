"use client";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { RefreshCw, Zap } from "lucide-react";
import { dollars, type Position, type Thesis } from "@/lib/data";
import { type PerpCoverage } from "@/lib/perps";

import {hasPerps,validateExecution,startExecution,readExecutionState,legLiquidationPrice} from '@/lib/creator-execution';
import {tokenFor} from '@/lib/token-catalog';

const price = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 6 : 2,
}).format(value);
export function usePerpsCoverage(thesisId?: string) {
  const [data, setData] = useState<
      (PerpCoverage & { thesisId: string }) | null
    >(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!thesisId) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setData(null);
      setError("");
      setLoading(true);
    });
    fetch(`/api/perps?thesisId=${encodeURIComponent(thesisId)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = (await r.json()) as PerpCoverage & { error?: string };
        if (!r.ok) throw new Error(d.error);
        if (!controller.signal.aborted) setData({ ...d, thesisId });
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(e.message || "Perp availability could not be verified.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [thesisId, revision]);
  // Keep the mark-price preview current while this take is open. A refresh
  // clears the old coverage, so confirmation waits for a new valid response.
  useEffect(() => {
    if (!data || data.thesisId !== thesisId) return;
    const timer = setTimeout(() => setRevision(n => n + 1), Math.max(1000, data.checkedAt + 65000 - Date.now()));
    return () => clearTimeout(timer);
  }, [data, thesisId]);
  const retry = useCallback(() => setRevision((n) => n + 1), []);
  return {
    data: data?.thesisId === thesisId ? data : null,
    error,
    loading,
    retry,
  };
}
export function PositionRisk({ position }: { position: Position }) {
  if (position.executionMode !== "perps") return null;
  const execution=readExecutionState(position.executionState);
  if(execution)return <span className="position-risk"><Zap size={12}/>{execution.legs.filter(l=>l.mode==='perps').map(l=>`${l.symbol} ${l.side} ${l.leverage}×`).join(' · ')}</span>;
  const effective =
    position.amount > 0 ? (position.perpNotional || 0) / position.amount : 0;
  return (
    <span className="position-risk">
      <Zap size={12} />
      {position.leverage}× perps{" "}
      <small>· {effective.toFixed(1)}× exposure</small>
    </span>
  );
}
export function StrategyRisk({thesis,coverage,loading,error,retry,margin,accepted,onAccept,disabled}:{thesis:Thesis;coverage:PerpCoverage|null;loading:boolean;error:string;retry:()=>void;margin:number;accepted:boolean;onAccept:(v:boolean)=>void;disabled:boolean}) {
 if(!hasPerps(thesis))return <p className="risk-help">Spot execution at 1× · Set by the creator.</p>;
 let validation='';try{validateExecution(thesis,coverage);}catch(e){validation=(e as Error).message;}
 const preview=!validation&&margin>0?startExecution(thesis,margin,margin,coverage):null;
 return <section className="strategy-risk creator-risk" aria-label="Creator’s perp settings"><div className="risk-heading"><span><Zap size={14}/> Creator’s execution</span><b>Isolated perps</b></div><p className="risk-help">Spot, direction and leverage are fixed by this take. Each perp uses only its own allocated collateral.</p><section className="liquidation-preview" aria-label="Estimated liquidation prices"><div className="liquidation-heading"><strong>Estimated liquidation</strong><button type="button" onClick={()=>{onAccept(false);retry();}} disabled={loading||disabled}><RefreshCw size={13}/> Refresh</button></div>{preview?.legs.filter(l=>l.mode==='perps').map(leg=><div className="liquidation-price-row" key={leg.symbol}><div><b>{tokenFor(thesis,leg.symbol).symbol} <small>{leg.side.toUpperCase()} · {leg.leverage}×</small></b><span>{dollars(leg.amount)} collateral · {dollars(leg.notional)} exposure</span><span>Mark {price(leg.markPrice)}</span></div><strong>{price(legLiquidationPrice(leg)!)}</strong></div>)}{(loading||validation)&&<p className="risk-availability-error">{loading?'Checking the selected perp markets…':error||validation}</p>}<p className="risk-liquidation">Each price is an independent demo liquidation estimate. A liquidated leg can lose all of its collateral; other legs remain separate. Funding, slippage and venue fees are excluded. Stops do not guarantee fills.</p></section><label className="risk-accept"><input type="checkbox" checked={accepted} disabled={disabled||!!validation} onChange={e=>onAccept(e.target.checked)}/><span>I’ve reviewed the creator’s leverage and liquidation estimates.</span></label></section>;
}
