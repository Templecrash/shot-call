import { isAddress, type Address } from "viem";
import { NETWORKS } from "@/lib/wallet/networks";
import { assetBalance, publicClient } from "@/lib/wallet/server";
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address))
    return Response.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  const balances = await Promise.all(
    NETWORKS.map(async (n) => {
      try {
        const [amount, nativeAmount] = await Promise.all([
          assetBalance(address as Address, {
            symbol: "USDC",
            chainId: n.chain.id,
            address: n.usdc,
            decimals: 6,
          }),
          publicClient(n.chain.id).getBalance({ address: address as Address }),
        ]);
        return {
          chainId: n.chain.id,
          amount: amount.toString(),
          nativeAmount: nativeAmount.toString(),
        };
      } catch {
        return {
          chainId: n.chain.id,
          amount: null,
          nativeAmount: null,
          error: "Network balance unavailable. Retry.",
        };
      }
    }),
  );
  return Response.json(
    { address, balances, checkedAt: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
