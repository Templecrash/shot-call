"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { assertWalletTradeReady } from "@/lib/wallet/trading-policy";
import { isAddress, type Address } from "viem";
import { readJournal, unsettled } from "@/lib/wallet/safety";
import {
  executeBasket,
  checkLeg,
  type BrowserProvider,
  type DiscoveredWallet,
} from "@/lib/wallet/browser";
import type {
  BasketQuote,
  WalletBalances,
  WalletOrder,
} from "@/lib/wallet/types";

type WalletContextValue = {
  wallets: DiscoveredWallet[];
  address: Address | null;
  providerName: string;
  mode: "paper" | "wallet";
  setMode: (mode: "paper" | "wallet") => void;
  chainId: number;
  setChainId: (id: number) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  connecting: boolean;
  connect: (wallet: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  balances: WalletBalances | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string;
  orders: WalletOrder[];
  busy: boolean;
  blocked: boolean;
  journalAvailable: boolean;
  execute: (quote: BasketQuote) => Promise<void>;
  check: (id: string) => Promise<void>;
  dismiss: (id: string) => void;
};
const Context = createContext<WalletContextValue | null>(null);
export const useWallet = () => {
  const value = useContext(Context);
  if (!value) throw new Error("WalletProvider is missing.");
  return value;
};
let fallbackMode: "paper" | "wallet" = "paper";
const readMode = (): "paper" | "wallet" => {
  try {
    return localStorage.getItem("supertake:mode") === "wallet"
      ? "wallet"
      : "paper";
  } catch {
    return fallbackMode;
  }
};
function subscribeMode(change: () => void) {
  window.addEventListener("storage", change);
  window.addEventListener("supertake:mode", change);
  return () => {
    window.removeEventListener("storage", change);
    window.removeEventListener("supertake:mode", change);
  };
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "The wallet request could not be completed.";
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]),
    [selected, setSelected] = useState<DiscoveredWallet | null>(null),
    [address, setAddress] = useState<Address | null>(null);
  const mode = useSyncExternalStore(
      subscribeMode,
      readMode,
      (): "paper" | "wallet" => "paper",
    ),
    [chainId, setChainId] = useState(8453),
    [open, setOpen] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [balances, setBalances] = useState<WalletBalances | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [orders, setOrders] = useState<WalletOrder[]>([]),
    [busy, setBusy] = useState(false),
    [storageError, setStorageError] = useState(false);
  const current = useRef({
      address: null as Address | null,
      provider: null as BrowserProvider | null,
    }),
    running = useRef(false),
    requestId = useRef(0),
    connectionId = useRef(0);
  const setMode = (v: "paper" | "wallet") => {
    fallbackMode = v;
    try {
      localStorage.setItem("supertake:mode", v);
    } catch {}
    window.dispatchEvent(new Event("supertake:mode"));
  };
  useEffect(() => {
    const receive = (event: Event) => {
      const d = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: BrowserProvider;
        }>
      ).detail;
      if (!d?.info?.uuid || !d.provider?.request) return;
      setWallets((prev) =>
        prev.some((w) => w.provider === d.provider)
          ? prev
          : [
              ...prev,
              {
                id: d.info.uuid,
                name: d.info.name.slice(0, 50),
                provider: d.provider,
              },
            ],
      );
    };
    window.addEventListener("eip6963:announceProvider", receive);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = setTimeout(() => {
      const p = (window as unknown as { ethereum?: BrowserProvider }).ethereum;
      if (p)
        setWallets((prev) =>
          prev.length
            ? prev
            : [{ id: "injected", name: "Browser wallet", provider: p }],
        );
    }, 250);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", receive);
    };
  }, []);
  const changeAddress = useCallback(
    (next: Address | null, provider: BrowserProvider | null) => {
      current.current = { address: next, provider };
      requestId.current++;
      setAddress(next);
      setBalances(null);
      setLoading(false);
      setError("");
      try {
        setOrders(next ? readJournal(next) : []);
        setStorageError(false);
      } catch (e) {
        setOrders([]);
        setStorageError(true);
        setError(message(e));
      }
    },
    [],
  );
  async function connect(wallet: DiscoveredWallet) {
    const seq = ++connectionId.current;
    setConnecting(true);
    setError("");
    try {
      const accounts = (await wallet.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (seq !== connectionId.current) return;
      if (!accounts[0] || !isAddress(accounts[0]))
        throw new Error("No wallet account was selected.");
      setSelected(wallet);
      changeAddress(accounts[0], wallet.provider);
      setMode("wallet");
    } catch (e) {
      if (seq === connectionId.current) setError(message(e));
    } finally {
      if (seq === connectionId.current) setConnecting(false);
    }
  }
  function disconnect() {
    connectionId.current++;
    setConnecting(false);
    setSelected(null);
    changeAddress(null, null);
  }
  useEffect(() => {
    if (!selected) return;
    const accounts = (value: unknown) => {
      const next =
        Array.isArray(value) &&
        typeof value[0] === "string" &&
        isAddress(value[0])
          ? (value[0] as Address)
          : null;
      changeAddress(next, selected.provider);
    };
    const disconnected = () => {
      setSelected(null);
      changeAddress(null, null);
    };
    selected.provider.on?.("accountsChanged", accounts);
    selected.provider.on?.("disconnect", disconnected);
    return () => {
      selected.provider.removeListener?.("accountsChanged", accounts);
      selected.provider.removeListener?.("disconnect", disconnected);
    };
  }, [selected, changeAddress]);
  const refresh = useCallback(async () => {
    const addr = current.current.address;
    if (!addr) return;
    const seq = ++requestId.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/wallet/balances?address=${addr}`, {
        signal: AbortSignal.timeout(35000),
        cache: "no-store",
      });
      const data = (await r.json()) as WalletBalances & { error?: string };
      if (!r.ok) throw new Error(data.error || "Balances unavailable.");
      if (seq === requestId.current && current.current.address === addr) {
        setBalances(data);
        setError("");
      }
    } catch (e) {
      if (seq === requestId.current) {
        setBalances(null);
        setError(message(e));
      }
    } finally {
      if (seq === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!address) return;
    void refresh();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [address, refresh]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (address && e.key === `supertake:wallet:v1:${address.toLowerCase()}`) {
        try {
          setOrders(readJournal(address));
          setStorageError(false);
        } catch (err) {
          setStorageError(true);
          setError(message(err));
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [address]);
  function persist(order: WalletOrder) {
    const existing = readJournal(order.wallet),
      next = [order, ...existing.filter((o) => o.id !== order.id)];
    localStorage.setItem(
      `supertake:wallet:v1:${order.wallet.toLowerCase()}`,
      JSON.stringify(next),
    );
    if (current.current.address?.toLowerCase() === order.wallet.toLowerCase())
      setOrders(next);
  }
  async function execute(quote: BasketQuote) {
    assertWalletTradeReady(quote.kind);
    const wallet = current.current;
    if (
      !wallet.address ||
      !wallet.provider ||
      wallet.address.toLowerCase() !== quote.wallet.toLowerCase()
    )
      throw new Error("Connect the wallet used for this quote.");
    if (running.current || storageError)
      throw new Error("Resolve the current wallet activity before trading.");
    if (!navigator.locks)
      throw new Error(
        "Use a browser with Web Locks support to coordinate wallet trades safely.",
      );
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await navigator.locks.request(
        `supertake-trade:${wallet.address.toLowerCase()}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw new Error("A wallet trade is already open in another tab.");
          const saved = readJournal(wallet.address!);
          if (unsettled(saved) || saved.some((o) => o.id === quote.id))
            throw new Error(
              "Check your existing transaction before starting another trade.",
            );
          await executeBasket(
            quote,
            wallet.provider!,
            persist,
            () =>
              current.current.address === wallet.address &&
              current.current.provider === wallet.provider,
          );
        },
      );
    } finally {
      running.current = false;
      setBusy(false);
      void refresh();
    }
  }
  async function check(id: string) {
    if (running.current)
      throw new Error("Wait for the current wallet request.");
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    setBusy(true);
    running.current = true;
    try {
      const updated = { ...order, legs: [...order.legs] };
      for (let i = 0; i < updated.legs.length; i++)
        if (
          ["pending", "attention", "signing"].includes(updated.legs[i].status)
        ) {
          updated.legs[i] = await checkLeg(updated.legs[i]);
          persist(updated);
        }
    } finally {
      running.current = false;
      setBusy(false);
      void refresh();
    }
  }
  function dismiss(id: string) {
    if (running.current || !address) return;
    const order = readJournal(address).find((o) => o.id === id);
    if (order)
      persist({
        ...order,
        legs: order.legs.map((l) =>
          ["pending", "attention", "signing", "ready"].includes(l.status)
            ? {
                ...l,
                status: "failed",
                message:
                  "Tracking dismissed after manual wallet review. No transaction was cancelled.",
              }
            : l,
        ),
      });
  }
  const value: WalletContextValue = {
    wallets,
    address,
    providerName: selected?.name || "",
    mode,
    setMode,
    chainId,
    setChainId,
    open,
    setOpen,
    connecting,
    connect,
    disconnect,
    balances,
    refresh,
    loading,
    error,
    orders,
    busy,
    blocked: storageError || unsettled(orders),
    journalAvailable: !storageError,
    execute,
    check,
    dismiss,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
