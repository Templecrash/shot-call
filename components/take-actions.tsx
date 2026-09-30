'use client';
import { GitFork, MoreHorizontal, PenLine, Share2, Settings2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

export function TakeActions({ onFork, onShare, onEdit, onManage }: {
  onFork: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onManage?: () => void;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button className="take-actions-trigger" aria-label="More take actions"><MoreHorizontal size={20}/></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="account-menu">
      <DropdownMenuItem onSelect={onFork}><GitFork size={15}/> Make a copy</DropdownMenuItem>
      {onEdit&&<DropdownMenuItem onSelect={onEdit}><PenLine size={15}/> Adjust take</DropdownMenuItem>}
      {onManage&&<DropdownMenuItem onSelect={onManage}><Settings2 size={15}/> Manage take</DropdownMenuItem>}
      {onShare&&<DropdownMenuItem onSelect={onShare}><Share2 size={15}/> Share take</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
