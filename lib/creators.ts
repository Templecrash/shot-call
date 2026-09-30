export type Creator = {
  id: string;
  name: string;
  handle: string | null;
  twitterUrl: string | null;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  publicInvestments?: boolean;
  bio: string;
  editorial?: boolean;
  leaderboardOptIn?: boolean;
};

export const EDITORIAL_CREATOR: Creator = {
  id: "editorial",
  name: "Shot Call editorial",
  handle: null,
  twitterUrl: null,
  avatarUrl: "/favicon.svg",
  bio: "Curated example theses from Shot Call. A starting point for your own conviction.",
  editorial: true,
};

const RESERVED = new Set([
  "home",
  "explore",
  "search",
  "notifications",
  "messages",
  "settings",
  "intent",
  "share",
  "i",
  "compose",
  "login",
  "signup",
  "tos",
  "privacy",
  "about",
  "download",
  "hashtag",
]);
export function parseTwitterProfile(
  value: string,
): { handle: string; url: string } | null {
  const input = value.trim();
  let handle: string;
  if (/^@?[A-Za-z0-9_]{1,15}$/.test(input)) handle = input.replace(/^@/, "");
  else {
    try {
      const url = new URL(
        /^https?:\/\//i.test(input) ? input : `https://${input}`,
      );
      if (
        !["https:", "http:"].includes(url.protocol) ||
        ![
          "x.com",
          "www.x.com",
          "twitter.com",
          "www.twitter.com",
          "mobile.twitter.com",
        ].includes(url.hostname.toLowerCase()) ||
        url.port ||
        url.username ||
        url.password
      )
        return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (!match) return null;
      handle = match[1];
    } catch {
      return null;
    }
  }
  if (RESERVED.has(handle.toLowerCase())) return null;
  return { handle, url: `https://x.com/${handle}` };
}

export function creatorFor(t: {
  creator?: Creator;
  owner?: string;
  author: string;
  example?: boolean;
}): Creator {
  if (t.creator) return t.creator;
  if (t.example) return EDITORIAL_CREATOR;
  return {
    id: t.owner || "",
    name: t.author || "Creator",
    handle: null,
    twitterUrl: null,
    avatarUrl: null,
    bio: "",
  };
}

export function avatarMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

export type CreatorRow = {
  id: string;
  user_id: string;
  name: string;
  twitter_handle: string;
  bio: string;
  avatar_key: string | null;
  banner_key?: string | null;
  public_investments?: number | null;
  updated_at: number;
  leaderboard_opt_in: number;
};
export function publicCreator(row: CreatorRow): Creator {
  return {
    id: row.id,
    name: row.name,
    handle: row.twitter_handle,
    twitterUrl: `https://x.com/${row.twitter_handle}`,
    bio: row.bio,
    leaderboardOptIn: row.leaderboard_opt_in === 1,
    publicInvestments: row.public_investments == null ? undefined : row.public_investments === 1,
    bannerUrl: row.banner_key
      ? `/api/creators/${row.id}/banner?v=${row.updated_at}`
      : null,
    avatarUrl: row.avatar_key
      ? `/api/creators/${row.id}/avatar?v=${row.updated_at}`
      : null,
  };
}
