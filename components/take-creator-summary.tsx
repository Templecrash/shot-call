'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CreatorAvatar, TwitterLink } from './creator';
import { creatorFor } from '@/lib/creators';
import type { PublicProfile } from '@/lib/public-profile';
import { dollars, type Thesis } from '@/lib/data';

export function TakeCreatorSummary({ thesis, onOpen, revision = 0 }: {
  thesis: Thesis; onOpen: (id: string) => void; revision?: number;
}) {
  const initialCreator = creatorFor(thesis);
  const [data, setData] = useState<PublicProfile | null>(null);
  const [error, setError] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!initialCreator.id) { setError(true); return () => controller.abort(); }
    setData(null);
    setError(false);
    fetch(`/api/creators/${encodeURIComponent(initialCreator.id)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Creator summary unavailable.');
        const result = await response.json() as PublicProfile;
        if (!controller.signal.aborted) setData(result);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [initialCreator.id, revision, retry]);
  const creator = data?.creator ?? initialCreator, stats = data?.stats;
  const pending = !stats && !error;
  const unavailable = pending ? '…' : 'Unavailable';
  const pnl = stats?.weeklyPnlCents;
  const pnlLabel = !stats ? unavailable : stats.pnlVisibility === 'private' ? 'Private'
    : stats.pnlVisibility === 'not-applicable' ? '—' : pnl == null ? 'Unavailable'
    : `${pnl > 0 ? '+' : pnl < 0 ? '−' : ''}${dollars(Math.abs(pnl))}`;
  const identity = <><CreatorAvatar creator={creator}/><span><small>Creator</small><b>{creator.name}</b></span></>;
  return <section className="take-creator-summary" aria-label="Thesis creator">
    <div className="take-creator-identity">
      {creator.id ? <Link href={`/creator/${encodeURIComponent(creator.id)}`} prefetch={false}
        className="take-creator-profile" aria-label={`View ${creator.name}'s profile`}
        onClick={event => { event.preventDefault(); onOpen(creator.id); }}>{identity}</Link>
        : <div className="take-creator-profile">{identity}</div>}
      <div className="take-creator-social">{creator.twitterUrl && creator.handle
        ? <TwitterLink creator={creator}/> : <span>No X profile linked</span>}</div>
    </div>
    <dl className="take-creator-stats" aria-busy={pending}>
      <div><dt>Takes</dt><dd title="Published takes, including closed takes">{stats?.takeCount ?? unavailable}</dd></div>
      <div><dt>Investments</dt><dd title="Distinct public takes invested in, including closed positions">{stats ? stats.investmentCount ?? 'Private' : unavailable}</dd></div>
      <div><dt>Weekly P&amp;L</dt><dd className={pnl != null ? pnl > 0 ? 'up' : pnl < 0 ? 'down' : undefined : undefined}
        title={stats?.pnlVisibility === 'public' ? 'Investment gains and losses since Monday, after fees. Matches the leaderboard.'
          : stats?.pnlVisibility === 'private' ? 'This creator has not shared their P&L.'
          : stats?.pnlVisibility === 'not-applicable' ? 'Curated editorial profiles do not have an investment account.' : undefined}>{pnlLabel}</dd></div>
    </dl>
    {error && <button className="text-button take-creator-retry" onClick={() => setRetry(value => value + 1)}>Retry stats</button>}
  </section>;
}
