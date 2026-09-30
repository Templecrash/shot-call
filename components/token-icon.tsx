"use client";
import { useEffect, useRef, useState } from "react";
import type { Token } from "@/lib/data";
import { tokenIconSources } from "@/lib/token-icons";

type Props = { token: Token; symbol: string; className?: string; width?: number; height?: number; alt?: string };
function IconImage({ token, sources, className, width, height, alt }: Omit<Props, "symbol"> & { sources: string[] }) {
  const [index, setIndex] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React attaches its error handler.
  useEffect(() => {
    if (imageRef.current?.complete && !imageRef.current.naturalWidth) setIndex(i => i === index ? i + 1 : i);
  }, [index]);
  return sources[index] ? <img ref={imageRef} src={sources[index]} alt={alt ?? `${token.name} icon`} className={className} width={width} height={height} decoding="async" referrerPolicy="no-referrer" onError={() => setIndex(i => i === index ? i + 1 : i)} /> :
    <span className={`token-icon-fallback ${className || ""}`} style={{background: token.color, width, height}} role="img" aria-label={`${token.name} icon unavailable`} title={`${token.name} icon unavailable`}>{token.symbol.slice(0, 1)}</span>;
}

export function TokenIconImage({ symbol, ...props }: Props) {
  const sources = tokenIconSources(props.token, symbol);
  return <IconImage key={sources.join("|")} {...props} sources={sources} />;
}
