"use client";

import { dollars, type Position, type Thesis } from "@/lib/data";
import {investmentFeeRates,positionFeeRates,feePercent,settlePositionFees} from "@/lib/performance-fees";

export function ProfitShareTerms({thesis,userId,position}:{thesis:Thesis;userId?:string;position?:Position}) {
  const rates=position?positionFeeRates(position):investmentFeeRates(thesis,userId);
  return <div className="profit-share-terms"><h3>Platform performance fee · {feePercent(rates.platformUnits)}</h3>
    <p>Paid to Shot Call only on realized profit when you sell or an automatic exit executes, after entry costs and recovery of earlier losses.</p>
    <p>The call creator receives no fee from your investment.</p>
  </div>;
}

export function SaleShareDetails({position,amount}:{position:Position;amount:number}) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > position.amount) return null;
  const quote=settlePositionFees(position,amount),rates=positionFeeRates(position);
  return <div className="share-sale-summary">
    <div><span>Realized profit after entry cost</span><b>{dollars(quote.realizedProfit)}</b></div>
    <div><span>Platform fee · {feePercent(rates.platformUnits)} of eligible profit</span><b>{dollars(quote.platformProfitFee)}</b></div>
    <div className="share-net"><span>Returned to available USD</span><b>{dollars(quote.netProceeds)}</b></div>
    <small>Recorded losses and platform fees already paid are accounted for. Fees round down to cents; fractional cents carry forward.</small>
  </div>;
}
