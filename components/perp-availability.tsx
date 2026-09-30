'use client';

import {createContext, useContext, useEffect, useState, type ReactNode} from 'react';
import {Zap} from 'lucide-react';
import type {Thesis} from '@/lib/data';
import {type PerpMarket} from '@/lib/perps';

type Snapshot = {markets:PerpMarket[]; checkedAt:number};
const AvailabilityContext = createContext<Snapshot|null>(null);
export function usePerpAvailability(){return useContext(AvailabilityContext);}

// Share one market snapshot across all cards rather than querying per card.
export function PerpAvailabilityProvider({children}:{children:ReactNode}) {
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer:ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch('/api/perps/markets',{signal:controller.signal});
        if (!response.ok) throw new Error('Unavailable');
        const data:Snapshot = await response.json();
        if (!controller.signal.aborted) setSnapshot(data);
      } catch {
        if (!controller.signal.aborted) setSnapshot(null);
      } finally {
        if (!controller.signal.aborted) timer=setTimeout(refresh,65000);
      }
    }
    void refresh();
    return () => {controller.abort();clearTimeout(timer);};
  },[]);
  return <AvailabilityContext.Provider value={snapshot}>{children}</AvailabilityContext.Provider>;
}

export function CardPerpsBadge({thesis}:{thesis:Thesis}) {
  const legs=thesis.allocations.filter(a=>a.weight>0&&a.execution==='perps');
  if(!legs.length)return null;
  const min=Math.min(...legs.map(a=>a.leverage||1)),max=Math.max(...legs.map(a=>a.leverage||1)),leverage=min===max?`${max}×`:`${min}–${max}×`;
  const label=`Creator strategy · ${leverage} perps · ${legs.reduce((n,a)=>n+a.weight,0)}% allocated collateral`;
  return <div className="card-perps-badge" title={label} aria-label={label}><Zap size={13} aria-hidden="true"/><span>{leverage} perps</span></div>;
}
