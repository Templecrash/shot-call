"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { dollars, type Position, type Thesis } from "@/lib/data";
import {feeRates,selectedFeeBps,investmentFeeRates,positionFeeRates,feePercent,settlePositionFees} from "@/lib/performance-fees";

export function PerformanceFeeEditor({thesis,onChange}:{thesis:Thesis;onChange:(bps:number)=>void}) {
  const bps=selectedFeeBps(thesis),rates=feeRates(bps);
  return <section className="performance-fee-editor">
    <div className="performance-fee-heading"><div><h3>Your performance fee</h3><p>Earn a share of the profit your call creates.</p></div><label className="performance-fee-input"><input aria-label="Performance fee percent" type="number" min="0" max="20" step="0.01" value={bps/100} onChange={e=>onChange(Math.min(2000,Math.max(0,Math.round(Number(e.target.value)*100))))}/><span>%</span></label></div>
    <div className="performance-fee-split"><div><span>You receive</span><strong>{feePercent(rates.creatorUnits)}</strong></div><div><span>Shot Call receives</span><strong>{feePercent(rates.platformUnits)}</strong></div><div><span>Investors keep</span><strong>{feePercent(40000-bps*4)}</strong></div></div>
    <p className="small-muted">Of realized profit, across all investor capital. The platform’s share is included in your fee: 25% of it, capped at 2.5% of profit. Maximum total fee: 20%.</p>
    <p className="small-muted">No fee on losses. Earlier losses must be recovered first. Existing investments keep their saved fee terms.</p>
  </section>;
}

export function ProfitShareTerms({thesis,userId,position}:{thesis:Thesis;userId?:string;position?:Position}) {
  const rates=position?positionFeeRates(position):investmentFeeRates(thesis,userId);
  return <div className="profit-share-terms"><h3>Performance fee · {feePercent(rates.creatorUnits+rates.platformUnits)}</h3>
    <p><b>{feePercent(rates.creatorUnits)} to the creator · {feePercent(rates.platformUnits)} to Shot Call</b>. Both are included in the total above.</p>
    <p>Charged only on realized profit when you sell or an automatic exit executes, after entry costs and recovery of earlier losses. Following or unfollowing does not change the fee.</p>
    <p>{thesis.owner===userId&&!thesis.example?'You pay only the platform share on your own investment. ':thesis.example?'Curated examples have no creator share. ':''}These terms are saved with your investment.</p>
  </div>;
}

export function SaleShareDetails({position,amount}:{position:Position;amount:number}) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > position.amount) return null;
  const quote=settlePositionFees(position,amount),rates=positionFeeRates(position);
  return <div className="share-sale-summary">
    <div><span>Realized profit after entry cost</span><b>{dollars(quote.realizedProfit)}</b></div>
    <div><span>Creator share · {feePercent(rates.creatorUnits)} of eligible profit</span><b>{dollars(quote.fee)}</b></div>
    <div><span>Platform share · {feePercent(rates.platformUnits)} of eligible profit</span><b>{dollars(quote.platformProfitFee)}</b></div>
    <div className="share-net"><span>Returned to available USD</span><b>{dollars(quote.netProceeds)}</b></div>
    <small>Recorded losses and profit already shared are accounted for. Each share rounds down to cents; fractional cents carry forward.</small>
  </div>;
}

type Earnings = {
  earned: number;
  payouts: number;
  followers: number;
  investors: number;
  byTake: { thesisId: string; earned: number; payouts: number }[];
  recent: { id: string; thesisId: string; amount: number; createdAt: number }[];
};
export function CreatorEarnings({
  theses,
  onOpen,
  revision,
}: {
  theses: Thesis[];
  onOpen: (id: string) => void;
  revision: number;
}) {
  const [data, setData] = useState<Earnings | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/creator-earnings", {
          signal: controller.signal,
        });
        const result = (await response.json()) as Earnings & { error?: string };
        if (!response.ok)
          throw new Error(result.error || "Could not load creator earnings.");
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, [revision, retry]);
  return (
    <section className="creator-earnings">
      <div className="profile-section-title">
        <div>

          <h2>Creator earnings</h2>
        </div>
        <span className="source-chip">Demo credits</span>
      </div>
      <p className="muted">
        Earn your chosen share when investors realize a profit. Every credit is added to
        your available demo cash.
      </p>
      {error ? (
        <div role="alert">
          <p className="form-error">{error}</p>
          <button className="outline" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status">Loading your earnings…</p>
      ) : (
        <>
          <div className="creator-earnings-stats">
            <div>
              <span>Earned all time</span>
              <strong>{dollars(data.earned)}</strong>
            </div>
            <div>
              <span>Followers</span>
              <strong>{data.followers}</strong>
            </div>
            <div>
              <span>Investors</span>
              <strong>{data.investors}</strong>
            </div>
          </div>
          {data.byTake.length ? (
            <div className="saved-takes">
              {data.byTake.map((t) => (
                <button
                  className="saved-take"
                  key={t.thesisId}
                  onClick={() => onOpen(t.thesisId)}
                >
                  <span>
                    {theses.find((x) => x.id === t.thesisId)?.title ||
                      "Published take"}
                    <small>
                      {t.payouts} profit-sharing{" "}
                      {t.payouts === 1 ? "credit" : "credits"}
                    </small>
                  </span>
                  <b>{dollars(t.earned)}</b>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="earnings-empty">
              <Sparkles size={20} />
              <p>
                Earnings appear when investors sell your take at a profit.
              </p>
            </div>
          )}
          {data.recent.length > 0 && (
            <details className="earnings-history">
              <summary>Recent earnings</summary>
              {data.recent.map((e) => (
                <div key={e.id}>
                  <span>
                    {theses.find((t) => t.id === e.thesisId)?.title ||
                      "Published take"}
                    <small>{new Date(e.createdAt).toLocaleString()}</small>
                  </span>
                  <b>+{dollars(e.amount)}</b>
                </div>
              ))}
            </details>
          )}
          <p className="small-muted">
            Profit is shared only after previous losses are recovered. Your own
            investments and curated examples earn no creator fees. Demo credits
            cannot be withdrawn.
          </p>
        </>
      )}
    </section>
  );
}
