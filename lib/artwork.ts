import type {Thesis} from '@/lib/data';

// One visual identity follows a thesis through the feed, forks, and share cards.
const ARTWORK: Record<string, string> = {
  'Geopolitics & oil': '/art/hormuz.webp',
  'Cards & repacks': '/art/cards-repacks.webp',
  Robotics: '/art/robotics.webp',
  Gaming: '/gacha.png',
  'Gacha & collectibles': '/gacha.png',
  Privacy: '/art/privacy.webp',
  Majors: '/art/majors.webp',
  Ethereum: '/art/ethereum.webp',
  Launchpads: '/art/launchpads.webp',
  'Stock tokens': '/art/stocks.webp',
  'AI & compute': '/art/compute.webp',
  'Real-world assets': '/art/assets.webp',
  Macro: '/art/macro.webp',
  Stables: '/art/stables.webp',
};

export function thesisArtwork(thesis: Pick<Thesis, 'category'|'artworkId'|'artworkStatus'>&Partial<Pick<Thesis,'id'|'parent'>>): string {
  if(thesis.artworkId && thesis.artworkStatus==='ready')return `/api/take-artwork/${thesis.artworkId}`;
  if(thesis.id==='game-over'||thesis.parent==='game-over')return '/art/game-over.webp';
  if(thesis.id==='in-vitalik-we-trust'||thesis.parent==='in-vitalik-we-trust')return '/art/vitalik.webp';
  return ARTWORK[thesis.category] ?? '/art/macro.webp';
}
