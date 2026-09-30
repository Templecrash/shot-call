import {
  arbitrum,
  avalanche,
  base,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";
import type { Address } from "viem";

export const NETWORKS = [
  {
    chain: base,
    name: "Base",
    color: "#3562f5",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    chain: mainnet,
    name: "Ethereum",
    color: "#8389c5",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    chain: arbitrum,
    name: "Arbitrum",
    color: "#29a0f0",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    chain: optimism,
    name: "Optimism",
    color: "#ef4349",
    usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  {
    chain: polygon,
    name: "Polygon",
    color: "#9360d7",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  {
    chain: avalanche,
    name: "Avalanche",
    color: "#e84142",
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
] as const;
export const NATIVE = "0x0000000000000000000000000000000000000000" as Address;
export const network = (id: number) => NETWORKS.find((n) => n.chain.id === id);
export const shortAddress = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

export type LiveAsset = {
  symbol: string;
  chainId: number;
  address: Address;
  decimals: number;
};
// Exact contracts checked against the LI.FI catalog on 2026-09-29.
// USDC contracts: https://developers.circle.com/stablecoins/usdc-contract-addresses
// No symbol-based runtime discovery or substitutions for native non-EVM assets.
const ASSETS: Record<string, LiveAsset> = {
  ONDO: {
    symbol: "ONDO",
    chainId: 1,
    address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3",
    decimals: 18,
  },
  LINK: {
    symbol: "LINK",
    chainId: 1,
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    decimals: 18,
  },
  GHST: {
    symbol: "GHST",
    chainId: 137,
    address: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7",
    decimals: 18,
  },
  IMX: {
    symbol: "IMX",
    chainId: 1,
    address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF",
    decimals: 18,
  },
  AXS: {
    symbol: "AXS",
    chainId: 1,
    address: "0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b",
    decimals: 18,
  },
  POLS: {
    symbol: "POLS",
    chainId: 1,
    address: "0x83e6f1E41cdd28eAcEB20Cb649155049Fac3D5Aa",
    decimals: 18,
  },
  DAO: {
    symbol: "DAO",
    chainId: 1,
    address: "0x0f51bb10119727a7e5eA3538074fb341F56B09Ad",
    decimals: 18,
  },
};
export function liveAsset(
  symbol: string,
  fundingChain: number,
): LiveAsset | undefined {
  if (!network(fundingChain)) return;
  if (symbol === "USDC")
    return {
      symbol,
      chainId: fundingChain,
      address: network(fundingChain)!.usdc,
      decimals: 6,
    };
  if (symbol === "ETH")
    return {
      symbol,
      chainId: [1, 8453, 42161, 10].includes(fundingChain)
        ? fundingChain
        : 8453,
      address: NATIVE,
      decimals: 18,
    };
  return ASSETS[symbol];
}

export function parseUsdc(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(value))
    throw new Error("Enter a USDC amount with up to 6 decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  return amount;
}
