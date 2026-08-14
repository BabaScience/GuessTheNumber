"use client";

type Props = {
  lo: number;
  hi: number;
  max: number;
  tone: "you" | "foe";
  /** Optional label in place of the count, e.g. once the round is over. */
  caption?: string;
};

/**
 * How far the field has been narrowed. A single hairline bar rather than the
 * old ticked track — with this palette the restraint is the point, and on a
 * phone the numbers underneath carry the detail better than the graphic does.
 */
export function RangeMeter({ lo, hi, max, tone, caption }: Props) {
  const pct = (v: number) => ((v - 1) / Math.max(1, max - 1)) * 100;
  const left = pct(lo);
  const right = 100 - pct(hi);
  const remaining = Math.max(0, hi - lo + 1);

  return (
    <div className={`meter meter--${tone}`}>
      <div className="meter-track">
        <div className="meter-fill" style={{ left: `${left}%`, right: `${right}%` }} />
      </div>
      <div className="meter-legend">
        <span className="meter-edge">{lo}</span>
        <span>{caption ?? `${remaining.toLocaleString()} left`}</span>
        <span className="meter-edge">{hi}</span>
      </div>
    </div>
  );
}
