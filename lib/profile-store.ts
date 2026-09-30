import { avatarMime, parseTwitterProfile, publicCreator, type CreatorRow } from './creators';

export class ProfileError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function profileImage(file: FormDataEntryValue | null, kind: 'photo' | 'banner') {
  if (!(file instanceof File) || !file.size) return null;
  const limit = kind === 'photo' ? 512000 : 1500000;
  if (file.size > limit) throw new ProfileError(
    kind === 'photo' ? 'Profile photos must be under 500 KB.' : 'Banners must be under 1.5 MB.', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = avatarMime(bytes);
  if (!mime || !['image/jpeg','image/png','image/webp'].includes(file.type))
    throw new ProfileError('Choose a JPEG, PNG, or WebP image.');
  return {bytes, mime};
}

export async function saveCreatorProfile(db: D1Database, bucket: R2Bucket | undefined, userId: string, data: FormData) {
  const twitter = parseTwitterProfile(String(data.get('twitterUrl') || ''));
  const name = String(data.get('name') || '').trim();
  const bio = String(data.get('bio') || '').trim();
  if (!twitter) throw new ProfileError('Enter your Twitter/X profile URL or @handle, not a post link.');
  if (!name || name.length > 60 || bio.length > 280)
    throw new ProfileError('Use a name up to 60 characters and a bio up to 280 characters.');
  const [photo, banner, existing] = await Promise.all([
    profileImage(data.get('photo'), 'photo'),
    profileImage(data.get('banner'), 'banner'),
    db.prepare('SELECT * FROM creator_profiles WHERE user_id=?').bind(userId).first<CreatorRow>(),
  ]);
  if ((photo || banner) && !bucket)
    throw new ProfileError('Image storage is unavailable. Your changes are still here; please retry.', 503);
  const id = existing?.id || crypto.randomUUID();
  const uploaded: string[] = [];
  let committed = false;
  try {
    let avatarKey = data.get('removePhoto') === 'true' ? null : existing?.avatar_key || null;
    let bannerKey = data.get('removeBanner') === 'true' ? null : existing?.banner_key || null;
    for (const [kind, image] of [['avatars', photo], ['banners', banner]] as const) {
      if (!image) continue;
      const key = `creator-${kind}/${id}/${crypto.randomUUID()}`;
      uploaded.push(key);
      await bucket!.put(key, image.bytes, {httpMetadata:{contentType:image.mime}});
      if (kind === 'avatars') avatarKey = key; else bannerKey = key;
    }
    const enrolled = data.has('leaderboardOptIn') ? Number(data.get('leaderboardOptIn') === 'true') : existing?.leaderboard_opt_in || 0;
    const investments = data.has('publicInvestments') ? Number(data.get('publicInvestments') === 'true') : existing?.public_investments ?? null;
    await db.prepare(`INSERT INTO creator_profiles
      (id,user_id,name,twitter_handle,bio,avatar_key,banner_key,public_investments,leaderboard_opt_in,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      name=excluded.name,twitter_handle=excluded.twitter_handle,bio=excluded.bio,
      avatar_key=excluded.avatar_key,banner_key=excluded.banner_key,public_investments=excluded.public_investments,
      leaderboard_opt_in=excluded.leaderboard_opt_in,updated_at=excluded.updated_at`)
      .bind(id,userId,name,twitter.handle,bio,avatarKey,bannerKey,investments,enrolled,Date.now()).run();
    committed = true;
    await Promise.all([
      ...(existing?.avatar_key && existing.avatar_key !== avatarKey ? [existing.avatar_key] : []),
      ...(existing?.banner_key && existing.banner_key !== bannerKey ? [existing.banner_key] : []),
    ].map(key => bucket?.delete(key).catch(() => {})));
    const row = await db.prepare('SELECT * FROM creator_profiles WHERE user_id=?').bind(userId).first<CreatorRow>();
    return publicCreator(row!);
  } catch (error) {
    if (!committed) await Promise.all(uploaded.map(key => bucket?.delete(key).catch(() => {})));
    throw error;
  }
}
