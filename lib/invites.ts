export const INVITES_PER_MEMBER=5;
const COHORT_KEY='invite_only_existing_accounts_v1';
const CODE_PATTERN=/^[a-f0-9]{48}$/;
export type InviteSlot={slot:number;code:string|null;claimed:boolean;claimedAt:number|null;recipient:string|null};
export type InviteState={remaining:number;total:number;slots:InviteSlot[]};
export class InviteError extends Error{constructor(message:string,public status=400){super(message);}}

export function inviteCode(input:string):string|null{
  let code=input.trim();
  if(code.includes('://')){try{const url=new URL(code);code=url.pathname.match(/^\/invite\/([^/]+)\/?$/)?.[1]||'';}catch{return null;}}
  code=code.toLowerCase();return CODE_PATTERN.test(code)?code:null;
}
export function inviteReturnTo(input:string|null):string{
  if(!input||input.length>1000||!input.startsWith('/')||input.startsWith('//'))return '/';
  try{const url=new URL(input,'https://calledit.local');if(url.origin!=='https://calledit.local'||/^\/(invite|signin-with-chatgpt|signout-with-chatgpt|callback)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/api/'))return '/';return url.pathname+url.search+url.hash;}catch{return '/';}
}
function newCode(){return [...crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join('');}

// Freeze the existing-account cohort once, before any newly invited account can
// be created. The batch is a transaction, including when requests race.
export async function initializeInviteCohort(db:D1Database,now=Date.now()){
  if(await db.prepare('SELECT 1 FROM membership_settings WHERE key=?').bind(COHORT_KEY).first())return;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO app_members(user_id,invited_by,source,joined_at) SELECT user_id,NULL,'existing',? FROM accounts WHERE NOT EXISTS(SELECT 1 FROM membership_settings WHERE key=?)").bind(now,COHORT_KEY),
    db.prepare('INSERT OR IGNORE INTO membership_settings(key,value) VALUES(?,?)').bind(COHORT_KEY,String(now)),
  ]);
}
export async function isMember(db:D1Database,userId:string){
  await initializeInviteCohort(db);
  return !!await db.prepare('SELECT 1 FROM app_members WHERE user_id=?').bind(userId).first();
}
export async function memberInvitesState(db:D1Database,userId:string):Promise<InviteState>{
  if(!await isMember(db,userId))throw new InviteError('An invite is required to join Shot Call.',403);
  const result=await db.prepare('SELECT i.slot,i.code,i.claimed_at AS claimedAt,i.claimed_by AS claimedBy,c.name AS recipient FROM member_invites i LEFT JOIN creator_profiles c ON c.user_id=i.claimed_by WHERE i.inviter_id=? ORDER BY i.slot').bind(userId).all<{slot:number;code:string;claimedAt:number|null;claimedBy:string|null;recipient:string|null}>();
  const slots=Array.from({length:INVITES_PER_MEMBER},(_,i)=>{
    const row=result.results.find(r=>r.slot===i+1);
    return {slot:i+1,code:row&&!row.claimedBy?row.code:null,claimed:!!row?.claimedBy,claimedAt:row?.claimedAt??null,recipient:row?.claimedBy?(row.recipient||'A new member'):null};
  });
  return {remaining:slots.filter(s=>!s.claimed).length,total:INVITES_PER_MEMBER,slots};
}
export async function createMemberInvite(db:D1Database,userId:string,slot:number){
  if(!Number.isInteger(slot)||slot<1||slot>INVITES_PER_MEMBER)throw new InviteError('Choose one of your five invites.');
  if(!await isMember(db,userId))throw new InviteError('An invite is required to join Shot Call.',403);
  await db.prepare('INSERT INTO member_invites(code,inviter_id,slot,created_at) VALUES(?,?,?,?) ON CONFLICT(inviter_id,slot) DO NOTHING').bind(newCode(),userId,slot,Date.now()).run();
  const row=await db.prepare('SELECT code,claimed_by FROM member_invites WHERE inviter_id=? AND slot=?').bind(userId,slot).first<{code:string;claimed_by:string|null}>();
  if(!row||row.claimed_by)throw new InviteError('This invite has already been used.',409);
  return {code:row.code,path:`/invite/${row.code}`};
}
export async function previewInvite(db:D1Database,input:string){
  const code=inviteCode(input);if(!code)return null;
  const row=await db.prepare('SELECT i.claimed_by,c.name,c.twitter_handle FROM member_invites i INNER JOIN app_members m ON m.user_id=i.inviter_id LEFT JOIN creator_profiles c ON c.user_id=i.inviter_id WHERE i.code=?').bind(code).first<{claimed_by:string|null;name:string|null;twitter_handle:string|null}>();
  return row?{available:!row.claimed_by,inviter:row.name||'A Shot Call member',handle:row.twitter_handle||null}:null;
}
export async function redeemInvite(db:D1Database,userId:string,input:string,now=Date.now()){
  const code=inviteCode(input);if(!code)throw new InviteError('Enter a valid invite link or code.');
  if(await isMember(db,userId))return {joined:true,alreadyMember:true};
  const row=await db.prepare('SELECT inviter_id,claimed_by FROM member_invites WHERE code=?').bind(code).first<{inviter_id:string;claimed_by:string|null}>();
  if(!row||row.claimed_by)throw new InviteError('This invite is invalid or has already been used.',409);
  await db.batch([
    db.prepare('UPDATE member_invites SET claimed_by=?,claimed_at=? WHERE code=? AND claimed_by IS NULL AND EXISTS(SELECT 1 FROM app_members WHERE user_id=member_invites.inviter_id) AND NOT EXISTS(SELECT 1 FROM app_members WHERE user_id=?)').bind(userId,now,code,userId),
    db.prepare("INSERT INTO app_members(user_id,invited_by,source,joined_at) SELECT ?,inviter_id,'invite',? FROM member_invites WHERE code=? AND claimed_by=? ON CONFLICT(user_id) DO NOTHING").bind(userId,now,code,userId),
  ]);
  if(!await isMember(db,userId))throw new InviteError('This invite has just been claimed. Ask for another invite.',409);
  return {joined:true,alreadyMember:false};
}
