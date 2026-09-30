"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assetKey,
  walletBook,
  walletPerformance,
  type Prices,
} from "@/lib/performance";
import type { LiveAsset } from "@/lib/wallet/networks";
import type { WalletOrder } from "@/lib/wallet/types";

export function useWalletPerformance(
  orders: WalletOrder[],
  address: string | null,
) {
  const book = useMemo(() => walletBook(orders), [orders]);
  const assetsKey = JSON.stringify([
    ...new Map(
      book.rows.flatMap((r) =>
        [...r.lots.values()]
          .filter((l) => l.quantity > 0n)
          .map((l) => [assetKey(l.asset), l.asset] as const),
      ),
    ).values(),
  ]);
  const [prices, setPrices] = useState<Prices>({}),
    [checkedAt, setCheckedAt] = useState(() => Date.now()),
    [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const loadPrices = useCallback(
    async (signal?: AbortSignal) => {
      const request = ++requestId.current;
      setRefreshing(true);
      const assets: LiveAsset[] = JSON.parse(assetsKey),
        next: Prices = {};
      // Keep requests in the browser and bounded; these contain contracts, not wallet addresses.
      for (let i = 0; i < assets.length; i += 3) {
        await Promise.all(
          assets.slice(i, i + 3).map(async (asset) => {
            try {
              const response = await fetch(
                `https://li.quest/v1/token?${new URLSearchParams({ chain: String(asset.chainId), token: asset.address })}`,
                {
                  signal: signal
                    ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
                    : AbortSignal.timeout(12000),
                  credentials: "omit",
                },
              );
              if (!response.ok) throw new Error("Price unavailable");
              const token = (await response.json()) as {
                  chainId?: number;
                  address?: string;
                  decimals?: number;
                  priceUSD?: string | number;
                },
                price = Number(token.priceUSD);
              next[assetKey(asset)] =
                token.chainId === asset.chainId &&
                token.address?.toLowerCase() === asset.address.toLowerCase() &&
                token.decimals === asset.decimals &&
                Number.isFinite(price) &&
                price > 0
                  ? price
                  : null;
            } catch {
              next[assetKey(asset)] = null;
            }
          }),
        );
        if (signal?.aborted) return;
      }
      if (!signal?.aborted && request === requestId.current) {
        setPrices(next);
        setCheckedAt(Date.now());
        setRefreshing(false);
      }
    },
    [assetsKey],
  );
  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setPrices({});
        return loadPrices(controller.signal);
      }
    });
    const update = () => {
      if (!document.hidden) void loadPrices(controller.signal);
    };
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      controller.abort();
      requestId.current++;
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [address, loadPrices]);
  return {
    performance: walletPerformance(orders, prices, checkedAt),
    checkedAt,
    refreshing,
    refreshPrices: loadPrices,
  };
}
