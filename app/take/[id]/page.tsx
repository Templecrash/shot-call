import {publicThesis} from "@/lib/thesis-store";
import type {Metadata} from 'next';
import Supertake from '@/app/supertake';
import {EXAMPLES,type Thesis} from '@/lib/data';
import {database} from '@/db/raw';
import {thesisArtwork} from '@/lib/artwork';
export const dynamic='force-dynamic';
async function lookup(id:string):Promise<Thesis|undefined>{try{return await publicThesis(database(),id);}catch{return undefined;}}
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{const {id}=await params;const t=await lookup(id);const image=t?`https://supertake-crypto-sascha.saschadarius.chatgpt.site${thesisArtwork(t)}`:undefined;return {title:t?`${t.title} · Shot Call`:'Take not found · Shot Call',description:t?.body,openGraph:{title:t?.title,description:t?.body,images:image?[image]:[]},twitter:{card:image?'summary_large_image':'summary',title:t?.title,description:t?.body,images:image?[image]:[]}};}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Supertake initialId={id}/>;}
