import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ProductDisclosure({ id, title, meta, children, className='', defaultOpen=false }: {
  id?: string;
  title: string;
  meta?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return <details id={id} open={defaultOpen} className={`product-disclosure ${className}`}>
    <summary><span>{title}</span>{meta&&<small>{meta}</small>}<ChevronDown size={17}/></summary>
    <div className="disclosure-content">{children}</div>
  </details>;
}

export function revealSection(id: string) {
  const target=document.getElementById(id);
  if(target instanceof HTMLDetailsElement)target.open=true;
  target?.scrollIntoView({behavior:'smooth',block:'start'});
}
