import { usd } from "@/lib/wallet/networks";

// Values are dollars. Compare the open position with its remaining cost basis,
// not cumulative purchases, so partial exits do not distort the return.
export function PositionPnl({
  value,
  cost,
  loading = false,
}: {
  value: number | null;
  cost: number;
  loading?: boolean;
}) {
  const known =
    value !== null &&
    Number.isFinite(value) &&
    Number.isFinite(cost) &&
    cost >= 0;
  const profit = known ? value - cost : null;
  const percent = profit !== null && cost > 0 ? (profit / cost) * 100 : null;
  const sign = (n: number) => (n >= 0.005 ? "+" : n <= -0.005 ? "−" : "");
  const tone =
    profit === null || Math.abs(profit) < 0.005
      ? "neutral"
      : profit > 0
        ? "gain"
        : "loss";
  return (
    <div className="position-card-value">
      <span className="position-value-label">Position value</span>
      <strong>{known ? usd(value) : "—"}</strong>
      <span className="position-pnl-label">Unrealized P&amp;L</span>
      <span className={`position-pnl-return ${tone}`}>
        {profit === null ? (
          loading ? (
            "Loading prices…"
          ) : (
            "P&L unavailable"
          )
        ) : (
          <>
            <b>
              {sign(profit)}
              {usd(Math.abs(profit))}
            </b>
            <span>
              (
              {percent === null
                ? "—"
                : `${sign(percent)}${Math.abs(percent).toFixed(2)}%`}
              )
            </span>
          </>
        )}
      </span>
    </div>
  );
}
