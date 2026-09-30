import type {RankedInvestor} from './leaderboard';

// Presentation-only examples. These profiles never enter accounts or the trading ledger.
const investors = [
  ['maya', 'Maya Chen', 384276],
  ['kai', 'Kai Rivers', 261948],
  ['noor', 'Noor Atlas', 190712],
  ['leo', 'Leo Park', 142635],
  ['iris', 'Iris Vale', 92580],
  ['jules', 'Jules Fox', 68842],
  ['sam', 'Sam Wilder', 40267],
  ['remy', 'Remy Stone', 21814],
  ['alex', 'Alex Lane', 7391],
  ['eden', 'Eden Brooks', -12468],
  ['robin', 'Robin West', -38952],
  ['toby', 'Toby Finch', -84230],
] as const;

export const LEADERBOARD_PREVIEW: Pick<RankedInvestor, 'rank'|'creator'|'profitCents'>[] = investors.map(([id, name, profitCents], index) => ({
  rank: index + 1,
  profitCents,
  creator: {
    id: `sample-${id}`,
    name,
    handle: `${id}_demo`,
    twitterUrl: null,
    avatarUrl: `/avatars/sample-${id}.svg`,
    bio: 'A fictional investor for the sample leaderboard.',
  },
}));
