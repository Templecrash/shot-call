"use client";
import Link from "next/link";
import { FollowPersonButton, usePeople } from "@/components/people/people-provider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from "@/components/ui/switch";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Camera,
  ChevronLeft,
  Loader2,
  PenLine,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { type Creator, creatorFor, parseTwitterProfile } from "@/lib/creators";
import type { PublicProfile } from '@/lib/public-profile';
import { thesisArtwork } from '@/lib/artwork';
import type { Thesis } from "@/lib/data";

export function CreatorAvatar({
  creator,
  large = false,
}: {
  creator: Creator;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`creator-avatar${large ? " large" : ""}`}>
      {creator.avatarUrl && failed !== creator.avatarUrl ? (
        <img
          src={creator.avatarUrl}
          alt={`${creator.name}'s profile photo`}
          onError={() => setFailed(creator.avatarUrl)}
        />
      ) : (
        <span aria-label={`${creator.name}'s avatar`}>
          {creator.name.slice(0, 1).toUpperCase() || "✳"}
        </span>
      )}
    </span>
  );
}

export function CreatorByline({
  thesis,
  onOpen,
  inCard = false,
}: {
  thesis: Thesis;
  onOpen?: (id: string) => void;
  inCard?: boolean;
}) {
  const c = creatorFor(thesis);
  const children = (
    <>
      <CreatorAvatar creator={c} />
      <span>
        <b>{c.handle ? `@${c.handle}` : c.name}</b>
        {inCard && (
          <small>
            {c.editorial ? "Curated by Shot Call" : "Thesis creator"}
          </small>
        )}
      </span>
    </>
  );
  return c.id ? (
    <Link
      href={`/creator/${encodeURIComponent(c.id)}`}
      prefetch={false}
      className={`creator-byline${inCard ? " on-art" : ""}`}
      aria-label={`View ${c.handle ? `@${c.handle}` : c.name}'s profile`}
      onClick={
        onOpen
          ? (e) => {
              e.preventDefault();
              onOpen(c.id);
            }
          : undefined
      }
    >
      {children}
    </Link>
  ) : (
    <span className={`creator-byline${inCard ? " on-art" : ""}`}>
      {children}
    </span>
  );
}

export function TwitterLink({ creator }: { creator: Creator }) {
  return creator.twitterUrl && creator.handle ? (
    <a
      className="twitter-profile-link"
      href={creator.twitterUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span aria-hidden="true">𝕏</span>@{creator.handle}
      <ArrowUpRight size={15} />
    </a>
  ) : null;
}

async function preparePhoto(file: File, banner = false): Promise<File> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10_000_000
  )
    throw new Error("Choose a JPEG, PNG, or WebP image under 10 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = banner ? 1600 : 256;
  canvas.height = banner ? 600 : 256;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare this photo.");
  }
  const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const width = canvas.width / scale, height = canvas.height / scale;
  context.drawImage(bitmap, (bitmap.width-width)/2, (bitmap.height-height)/2,
    width, height, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!blob)
    throw new Error("Could not prepare this photo. Try another image.");
  return new File([blob], banner ? "banner.jpg" : "profile.jpg", { type: "image/jpeg" });
}

export function CreatorEditor({
  creator,
  name,
  open,
  onClose,
  onSaved,
}: {
  creator: Creator | null;
  name: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  // Mounted afresh for every edit so cancel never changes the saved identity.
  const [displayName, setDisplayName] = useState(creator?.name || name);
  const [twitter, setTwitter] = useState(creator?.twitterUrl || "");
  const [bio, setBio] = useState(creator?.bio || "");
  const [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [removePhoto, setRemovePhoto] = useState(false);
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [publicInvestments, setPublicInvestments] = useState(creator?.publicInvestments ?? true);
  const [saving, setSaving] = useState(false),
    [preparing, setPreparing] = useState(false),
    [error, setError] = useState("");
  const [enrolled, setEnrolled] = useState(creator?.leaderboardOptIn || false);
  const parsed = parseTwitterProfile(twitter);
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    if (!banner) return;
    const url = URL.createObjectURL(banner);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [banner]);
  async function chooseImage(e: React.ChangeEvent<HTMLInputElement>, isBanner: boolean) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true); setError('');
    try {
      const prepared = await preparePhoto(file,isBanner);
      if (isBanner) {setBanner(prepared);setRemoveBanner(false);}
      else {setPhoto(prepared);setRemovePhoto(false);}
    } catch (error) {setError((error as Error).message);}
    finally {setPreparing(false);}
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = new FormData();
      data.set("name", displayName);
      data.set("twitterUrl", twitter);
      data.set("bio", bio);
      data.set("leaderboardOptIn", String(enrolled));
      data.set("removePhoto", String(removePhoto));
      if (photo) data.set("photo", photo);
      if (banner) data.set("banner", banner);
      data.set("removeBanner", String(removeBanner));
      data.set("publicInvestments", String(publicInvestments));
      const response = await fetch("/api/creator", {
        method: "POST",
        body: data,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || "Could not save your profile.");
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }
  const shown: Creator = {
    id: creator?.id || "",
    name: displayName || name,
    handle: parsed?.handle || null,
    twitterUrl: parsed?.url || null,
    avatarUrl: photo
      ? preview
      : removePhoto
        ? null
        : creator?.avatarUrl || null,
    bio,
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !saving && !preparing) onClose();
      }}
    >
      <DialogContent className="app-dialog creator-editor">
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>
          Your picture, banner, and the calls you share.
        </DialogDescription>
        <form onSubmit={save}>
          <div className="banner-editor">
            <ProfileBanner url={banner ? bannerPreview : removeBanner ? null : creator?.bannerUrl} />
            <div className="banner-editor-actions">
              <label className="outline photo-upload"><Camera size={15}/>{preparing ? 'Preparing image…' : 'Upload banner'}
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload banner"
                  disabled={saving||preparing} onChange={e => void chooseImage(e,true)}/>
              </label>
              {(banner || creator?.bannerUrl) && !removeBanner && <button type="button" className="text-button" disabled={saving||preparing}
                onClick={()=>{setBanner(null);setRemoveBanner(true);}}>Remove banner</button>}
            </div>
            <small>Wide landscape image · JPG, PNG or WebP · up to 10 MB</small>
          </div>
          <div className="creator-photo-editor">
            <CreatorAvatar creator={shown} large />
            <div>
              <label className="outline photo-upload">
                <Camera size={15} />
                {preparing ? "Preparing photo…" : "Upload profile photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Upload profile photo"
                  disabled={saving || preparing}
                  onChange={e => void chooseImage(e,false)}
                />
              </label>
              <small>JPG, PNG or WebP · up to 10 MB</small>
              {(photo || creator?.avatarUrl) && !removePhoto && (
                <button
                  type="button"
                  className="text-button"
                  disabled={saving||preparing}
                  onClick={() => {
                    setPhoto(null);
                    setRemovePhoto(true);
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          <label className="field-label">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              required
              disabled={saving}
              autoComplete="name"
            />
          </label>
          <label className="field-label">
            Twitter / X profile
            <input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              maxLength={200}
              placeholder="https://x.com/yourhandle"
              required
              disabled={saving}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="handle-preview">
            {parsed ? (
              <>
                Your handle on Shot Call <strong>@{parsed.handle}</strong>
              </>
            ) : (
              <>Your Shot Call handle comes from your Twitter/X profile.</>
            )}
          </div>
          <label className="field-label">
            A little about you
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={2}
              disabled={saving}
              placeholder="What do you have conviction in?"
            />
          </label>
          <div className="leaderboard-opt-in public-investments-choice">
            <div><label htmlFor="public-investments">Show my investments on my profile</label>
              <p>Share the public calls you’ve invested in and whether each position is active or closed. Amounts and wallet balances stay private.</p>
            </div>
            <Switch id="public-investments" checked={publicInvestments} disabled={saving} onCheckedChange={setPublicInvestments}/>
          </div>
          <div className="leaderboard-opt-in">
            <div>
              <label htmlFor="leaderboard-enrollment">
                Join the leaderboard
              </label>
              <p>
                Show your handle and weekly P&L on the leaderboard, and your
                profile on takes you invest in.
              </p>
            </div>
            <Switch
              id="leaderboard-enrollment"
              disabled={saving}
              checked={enrolled}
              onCheckedChange={setEnrolled}
            />
          </div>
          <p className="small-muted">
            Your profile link is self-reported. Twitter/X ownership and photos
            aren’t automatically verified or synced.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="dark wide"
            disabled={saving || preparing || !parsed || !displayName.trim()}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" /> Saving profile…
              </>
            ) : (
              "Save profile"
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileBanner({url, onEdit}:{url?:string|null;onEdit?:()=>void}) {
  const [failed,setFailed] = useState<string|null>(null);
  return <div className={`profile-banner${url ? ' has-image' : ''}`}>
    {url && failed !== url && <img src={url} alt="Profile banner" onError={()=>setFailed(url)}/>}
    {onEdit && <button className="profile-banner-edit" onClick={onEdit}><Camera size={15}/> Edit banner</button>}
  </div>;
}

export function CreatorProfile({id,onBack,onOpen,onCreator,renderCard,onEdit,revision=0}:{
  id:string;onBack:()=>void;onOpen:(id:string)=>void;onCreator:(id:string)=>void;
  renderCard:(thesis:Thesis)=>ReactNode;onEdit?:()=>void;revision?:number;
}) {
  const people = usePeople();
  const [data,setData] = useState<PublicProfile|null>(null);
  const [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const [tab,setTab] = useState<'calls'|'investments'>('calls');
  useEffect(()=>{
    const controller = new AbortController();
    fetch(`/api/creators/${encodeURIComponent(id)}`,{signal:controller.signal})
      .then(async r=>{const result=await r.json() as PublicProfile & {error?:string};
        if(!r.ok) throw new Error(result.error || 'Could not load profile.');
        if(!controller.signal.aborted){setData(result);setError('');}})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[id,retry,people.revision,revision]);
  if(error) return <div className="profile-empty"><h2>Profile unavailable.</h2><p role="alert">{error}</p>
    <button className="outline" onClick={()=>setRetry(n=>n+1)}>Retry</button><button className="text-button" onClick={onBack}>Back to calls</button></div>;
  if(!data) return <div className="profile-empty" role="status">Loading profile…</div>;
  const {creator,theses,investments,investmentsVisible}=data;
  const own = people.selfId === creator.id;
  return <section className="public-creator-page">
    <button className="creator-back text-button" onClick={onBack}><ChevronLeft size={15}/> All calls</button>
    <ProfileBanner url={creator.bannerUrl} onEdit={own ? onEdit : undefined}/>
    <div className="public-creator-header profile-with-banner">
      <CreatorAvatar creator={creator} large/>
      <div><h1>{creator.name}</h1><TwitterLink creator={creator}/>{creator.bio && <p>{creator.bio}</p>}
        <div className="profile-social-counts"><span><b>{data.followerCount}</b> {data.followerCount===1?'follower':'followers'}</span><span><b>{data.followingCount}</b> following</span></div>
      </div>
      <div className="creator-follow-actions">{own && onEdit ? <EditCreatorButton onClick={onEdit}/> : <FollowPersonButton creator={creator}/>}
        <a className="text-button" href="/?view=contacts">Find people</a>
      </div>
    </div>
    <Tabs value={tab} onValueChange={value=>setTab(value as 'calls'|'investments')}>
    <TabsList variant="line" className="public-profile-tabs" aria-label="Profile activity">
      <TabsTrigger value="calls">Calls <span>{theses.length}</span></TabsTrigger>
      <TabsTrigger value="investments">Investments {investmentsVisible && <span>{investments.length}</span>}</TabsTrigger>
    </TabsList>
    <TabsContent value="calls">
      {theses.length ? <div className="feed-grid public-calls-grid">{theses.map(t=><article className="feed-item" key={t.id}>{renderCard(t)}</article>)}</div>
        : <div className="empty-state"><h3>No published calls yet</h3><p>Published calls will appear here.</p></div>}
    </TabsContent><TabsContent value="investments">
      {!investmentsVisible ? <div className="empty-state"><h3>Investments are private</h3>{own && onEdit && <button className="outline" onClick={onEdit}>Edit investment visibility</button>}</div>
        : investments.length ? <div className="public-investment-list">{investments.map(({thesis,active,firstInvestedAt})=><article key={thesis.id}>
          <button className="public-investment-call" onClick={()=>onOpen(thesis.id)}><img src={thesisArtwork(thesis)} alt=""/><span><b>{thesis.title}</b><small>{thesis.category} · Invested {new Date(firstInvestedAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</small></span></button>
          <CreatorByline thesis={thesis} onOpen={onCreator}/><span className={`public-position-status ${active?'active':''}`}>{active?'Active':'Closed'}</span>
          <button className="outline" onClick={()=>onOpen(thesis.id)}>Explore call</button>
        </article>)}</div> : <div className="empty-state"><h3>No investments to show yet</h3><p>Investments in public calls appear here.</p></div>}
    </TabsContent></Tabs>
  </section>;
}

export function EditCreatorButton({
  onClick,
}: {
  onClick: () => void;
  hasProfile?: boolean;
}) {
  return (
    <button className="outline edit-creator" onClick={onClick}>
      <PenLine size={14} />
      Edit profile
    </button>
  );
}
