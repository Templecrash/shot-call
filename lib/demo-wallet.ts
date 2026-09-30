export const DEMO_NETWORKS = [
  { name: "Ethereum", color: "#6977c8", icon: "/networks/ethereum.png" },
  { name: "Base", color: "#2865ef", icon: "/networks/base.png" },
  { name: "Solana", color: "#8362dc", icon: "/networks/solana.png" },
  { name: "Arbitrum", color: "#398fc3", icon: "/networks/arbitrum.png" },
  { name: "Optimism", color: "#e34b53", icon: "/networks/optimism.png" },
  { name: "Polygon", color: "#8a50cf", icon: "/networks/polygon.png" },
  { name: "Avalanche", color: "#dc494e", icon: "/networks/avalanchec.png" },
  { name: "BNB Chain", color: "#c9a136", icon: "/networks/smartchain.png" },
] as const;
export const DEMO_BALANCE_LIMIT = 100_000_000_000;
export function fundingNetwork(order: { executionReason?: string | null }) {
  return order.executionReason?.startsWith("network:") ? order.executionReason.slice(8) : "Demo deposit";
}

export async function fundDemoWallet(db: D1Database, userId: string, id: string, amount: number, network: string) {
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000_000) throw new Error("Add between $1 and $1,000,000 in demo USD.");
  if (!/^[\p{L}\p{N} ._-]{2,40}$/u.test(network)) throw new Error("Enter a network name using 2–40 characters.");
  const requestKey = JSON.stringify({ userId, amount, network });
  const existing = await db.prepare("SELECT user_id,request_key FROM orders WHERE id=?").bind(id).first<{user_id:string;request_key:string}>();
  if (existing) {
    if (existing.user_id !== userId || existing.request_key !== requestKey) throw new Error("This deposit request has already been used. Please retry.");
    return { ok: true, repeated: true };
  }
  const operation = crypto.randomUUID();
  const results = await db.batch([
    db.prepare("INSERT INTO orders (id,user_id,thesis_id,side,amount,request_key,operation_id,execution_reason,created_at) SELECT ?,?,'','demo-fund',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE user_id=? AND demo_wallet_connected=1 AND balance<=?) ON CONFLICT(id) DO NOTHING")
      .bind(id,userId,amount,requestKey,operation,`network:${network}`,Date.now(),userId,DEMO_BALANCE_LIMIT-amount),
    db.prepare("UPDATE accounts SET balance=balance+?,revision=revision+1 WHERE user_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND operation_id=?)")
      .bind(amount,userId,id,operation),
  ]);
  if (!results[0].meta.changes) {
    const saved = await db.prepare("SELECT user_id,request_key FROM orders WHERE id=?").bind(id).first<{user_id:string;request_key:string}>();
    if (saved?.user_id === userId && saved.request_key === requestKey) return { ok: true, repeated: true };
    throw new Error("Connect your demo wallet first, or reduce the deposit to stay within the demo balance limit.");
  }
  return { ok: true, repeated: false };
}
