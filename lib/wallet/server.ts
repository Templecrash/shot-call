import {
  createPublicClient,
  erc20Abi,
  http,
  fallback,
  type Address,
} from "viem";
import { network, NATIVE, type LiveAsset } from "./networks";

export const publicClient = (chainId: number) => {
  const n = network(chainId);
  if (!n) throw new Error("Unsupported network.");
  // PublicNode and dRPC are listed by the LI.FI Base chain registry.
  // The default Base endpoint throttles shared hosting egress.
  const urls =
    chainId === 8453
      ? [
          "https://base-rpc.publicnode.com",
          "https://base.drpc.org",
          ...n.chain.rpcUrls.default.http,
        ]
      : [...n.chain.rpcUrls.default.http];
  return createPublicClient({
    chain: n.chain,
    transport: fallback(
      urls.map((url) => http(url, { timeout: 6000, retryCount: 0 })),
      { retryCount: 0 },
    ),
  });
};
export async function assetBalance(address: Address, asset: LiveAsset) {
  const client = publicClient(asset.chainId);
  return asset.address === NATIVE
    ? client.getBalance({ address })
    : client.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
}
