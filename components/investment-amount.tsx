"use client";

import { useId, type CSSProperties } from "react";
import { dollars } from "@/lib/data";
import { parseCents, percentAmount } from "@/lib/trading-fees";

export function InvestmentAmount({
  value,
  onChange,
  available,
  label = "Total investment",
  balanceLabel = "Available balance",
  currency = "USD",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  available: number | null;
  label?: string;
  balanceLabel?: string;
  currency?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const amount = parseCents(value);
  const known = available !== null;
  const percent =
    available && amount !== null
      ? Math.min(100, (amount / available) * 100)
      : 0;
  const exceeded = known && amount !== null && amount > available;
  return (
    <div className="investment-amount">
      <label className="investment-label" htmlFor={id}>
        {label}
      </label>
      <div className="investment-input">
        <span aria-hidden="true">$</span>
        <input
          id={id}
          aria-label={
            currency === "USDC"
              ? "USDC trade amount"
              : "Trade amount in dollars"
          }
          aria-describedby={`${id}-balance ${id}-error`}
          aria-invalid={exceeded || (value !== "" && amount === null)}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          maxLength={15}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span>{currency}</span>
      </div>
      <div className="investment-balance" id={`${id}-balance`}>
        <span>{balanceLabel}</span>
        <b>{known ? dollars(available) : "—"}</b>
      </div>
      <input
        className="investment-slider"
        type="range"
        min="0"
        max="1000"
        step="1"
        aria-label="Percentage of available balance"
        aria-valuetext={
          known
            ? `${percent.toFixed(1)}%, ${dollars(amount ?? 0)} of ${dollars(available)} available`
            : "Connect or refresh to load your balance"
        }
        value={Math.round(percent * 10)}
        disabled={disabled || !available}
        style={{ "--balance-fill": `${percent}%` } as CSSProperties}
        onChange={(e) =>
          onChange(
            (
              percentAmount(available ?? 0, Number(e.target.value) / 10) / 100
            ).toFixed(2),
          )
        }
      />
      <div className="investment-scale">
        <span>0%</span>
        <span>{percent.toFixed(percent % 1 ? 1 : 0)}% selected</span>
        <span>100%</span>
      </div>
      <div className="investment-presets">
        {[25, 50, 75, 100].map((n) => (
          <button
            type="button"
            key={n}
            disabled={disabled || !available}
            aria-pressed={!!available && amount === percentAmount(available, n)}
            onClick={() =>
              onChange((percentAmount(available ?? 0, n) / 100).toFixed(2))
            }
          >
            {n === 100 ? "Max" : `${n}%`}
          </button>
        ))}
      </div>
      <div
        id={`${id}-error`}
        className={
          exceeded || (value !== "" && amount === null)
            ? "investment-error"
            : "investment-remaining"
        }
        aria-live="polite"
      >
        {exceeded
          ? "This amount exceeds your available balance."
          : value !== "" && amount === null
            ? "Enter a dollar amount with up to two decimal places."
            : known
              ? `${dollars(Math.max(0, available - (amount ?? 0)))} remaining${balanceLabel === "Position value" ? " in this take" : " available"}`
              : "Connect your wallet to see your available balance."}
      </div>
    </div>
  );
}
