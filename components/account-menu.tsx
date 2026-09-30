"use client";
import { BookOpen, CircleUserRound, Users, Wallet } from "lucide-react";
import { CreatorAvatar } from "@/components/creator";
import type { Creator } from "@/lib/creators";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AccountMenu({ user, view, onNavigate }: {user:{id:string;name:string;creator?:Creator|null}|null;view:string;onNavigate:(view:string)=>void}) {
  const creator=user?.creator || {id:user?.id||"guest",name:user?.name||"You",handle:null,twitterUrl:null,avatarUrl:null,bio:""};
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="avatar account-menu-trigger" aria-label="Open account menu"><CreatorAvatar creator={creator}/></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={12} className="account-menu">
      <DropdownMenuLabel className="account-menu-identity"><b>{creator.name}</b><span>{creator.handle?`@${creator.handle}`:"Your Shot Call"}</span></DropdownMenuLabel>
      <DropdownMenuSeparator/>
      {[{id:"takes",label:"My Takes",Icon:BookOpen},{id:"portfolio",label:"Portfolio",Icon:Wallet},{id:"contacts",label:"Contacts",Icon:Users},{id:"profile",label:"Profile",Icon:CircleUserRound}].map(({id,label,Icon})=><DropdownMenuItem key={id} className={view===id?"current":""} onSelect={()=>onNavigate(id)}><Icon size={16}/>{label}</DropdownMenuItem>)}
      {!user&&<><DropdownMenuSeparator/><DropdownMenuItem asChild><a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in</a></DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
