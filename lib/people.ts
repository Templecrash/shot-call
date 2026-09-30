import { parseTwitterProfile, type Creator } from "./creators";

export type PeopleState = {
  signedIn: boolean;
  selfId: string | null;
  followingIds: string[];
};
export type Person = {
  creator: Creator;
  takeCount: number;
  followerCount: number;
};
export type PeoplePage = {
  people: Person[];
  nextOffset: number | null;
  total: number;
};
export type ContactMatch = { handle: string; people: Person[] };

export function parseContactHandles(value: string) {
  const handles: string[] = [],
    invalid: string[] = [],
    seen = new Set<string>();
  for (const entry of value.split(/[\s,;]+/).filter(Boolean)) {
    const parsed = parseTwitterProfile(entry);
    if (!parsed) {
      invalid.push(entry);
      continue;
    }
    const key = parsed.handle.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      handles.push(parsed.handle);
    }
  }
  return { handles, invalid, tooMany: handles.length > 100 };
}
