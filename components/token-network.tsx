import { Layers, ExternalLink } from "lucide-react";
import type { Token } from "@/lib/data";
import { networkIcon, networkLabel, tokenNetworks } from "@/lib/token-networks";

export function TokenNetwork({ token }: { token: Token }) {
  const { names } = tokenNetworks(token);
  const icon = names.length === 1 ? networkIcon(names[0]) : undefined;
  return <span className="token-network" title={names.length ? `Networks: ${names.join(", ")}` : "Network information is not verified"} aria-label={`Network: ${names.length ? names.join(", ") : "not verified"}`}>
    {icon ? <img src={icon} width={14} height={14} alt="" aria-hidden="true" /> : <Layers size={12} aria-hidden="true" />}{networkLabel(token)}
  </span>;
}

export function TokenNetworkDetails({ token }: { token: Token }) {
  const { names, source } = tokenNetworks(token);
  const icon = names.length === 1 ? networkIcon(names[0]) : undefined;
  return <div className="token-network-details">
    <div><span>{names.length > 1 ? "Networks" : "Network"}</span><strong>{icon && <img src={icon} width={18} height={18} alt="" aria-hidden="true" />}{names.length ? names.join(" · ") : "Not verified"}</strong></div>
    {source && <a href={source} target="_blank" rel="noopener noreferrer" aria-label={`${token.name} network source`}>Source <ExternalLink size={12} aria-hidden="true" /></a>}
  </div>;
}
