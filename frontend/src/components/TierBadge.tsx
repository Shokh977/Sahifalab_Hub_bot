/**
 * TierBadge — React + Tailwind (web)
 *
 * The holographic effect (animated conic gradient, sheen sweep, glow drop-shadows)
 * is intentionally NOT in Tailwind classes — Tailwind doesn't have a clean way to
 * animate `@property` custom properties or compose conic-gradient stops. Those live
 * in tier-badge.css. Tailwind handles everything else (layout, label typography,
 * locked state, etc).
 *
 * Usage:
 *   import { TierBadge } from "@/components/TierBadge";
 *   import "../styles/tier-badge.css"; // once, app-level
 *   <TierBadge level={16} size={180} featured />
 */

import { type CSSProperties } from "react";
import { levelOf, MOTIF_PATHS, type Level } from "../lib/tier-data";

interface TierBadgeProps {
  /** Absolute level 1..29 — or pass a Level object */
  level: number | Level;
  size?: number;
  /** Adds extra glow + idle bob */
  featured?: boolean;
  /** Greyscale + lock icon */
  locked?: boolean;
  /** Show "Yog'och" + "Boshlanish" caption beneath */
  showLabel?: boolean;
  /** 1 = normal, 2 = double speed, 0.5 = half */
  speed?: number;
  /** Set false to freeze all animations (use in grids to avoid GPU overdraw) */
  animated?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TierBadge({
  level,
  size = 180,
  featured = false,
  locked = false,
  showLabel = true,
  speed = 1,
  animated = true,
  className = "",
  onClick,
}: TierBadgeProps) {
  const lvl = typeof level === "number" ? levelOf(level) : level;
  const t = lvl.tier;
  // Build conic gradient stops
  const stops = t.palette
    .map((c, i) => `${c} ${(i / t.palette.length) * 360}deg`)
    .join(", ");
  const conic = `conic-gradient(from var(--badge-angle, 0deg), ${stops}, ${t.palette[0]} 360deg)`;

  const ringDur = `${(12 / speed).toFixed(2)}s`;
  const sheenDur = `${(4 / speed).toFixed(2)}s`;
  const isLegend = t.id === "legendary";

  const cssVars: CSSProperties = {
    ["--size" as any]: `${size}px`,
    ["--badge-glow" as any]: t.glow,
    ["--badge-ink" as any]: t.ink,
    ["--ring-dur" as any]: ringDur,
    ["--sheen-dur" as any]: sheenDur,
  };

  return (
    <div
      className={[
        animated ? "tb-root" : "tb-static",
        "relative flex flex-col items-center gap-2.5 select-none",
        featured && "tb-featured",
        locked && "tb-locked",
        isLegend && "tb-legend",
        className,
      ].filter(Boolean).join(" ")}
      style={cssVars}
      role={onClick ? "button" : undefined}
      onClick={onClick}
    >
      <div
        className="tb-art relative"
        style={{ width: size, height: size }}
      >
        {/* Outer rotating holographic ring */}
        <div className="tb-ring absolute inset-0" style={{ background: conic }} />

        {/* Inner face */}
        <div
          className="tb-face absolute inset-[6px] grid place-items-center overflow-hidden"
          style={{ background: conic }}
        >
          {/* Dark vignette for legibility */}
          <div className="tb-inner absolute inset-0" />

          {/* Sheen sweep */}
          <div className="tb-sheen absolute inset-0" />

          {/* Motif silhouette */}
          <svg
            className="tb-motif absolute opacity-[0.32]"
            style={{ width: "70%", height: "70%", color: t.ink }}
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden
          >
            <path d={MOTIF_PATHS[t.motif]} />
          </svg>

          {/* Roman numeral */}
          <div
            className="tb-roman relative font-serif italic font-bold text-white leading-none"
            style={{
              fontSize: size * 0.36,
              textShadow: `0 1px 0 rgba(0,0,0,0.4), 0 0 ${size * 0.08}px ${t.glow}`,
              letterSpacing: "-0.02em",
            }}
          >
            {lvl.roman}
          </div>

          {/* Tiny "Lvl N" */}
          <div
            className="tb-num absolute font-semibold tracking-widest uppercase text-white/70"
            style={{
              bottom: size * 0.2,
              fontSize: size * 0.065,
              textShadow: "0 1px 0 rgba(0,0,0,0.4)",
            }}
          >
            Lvl {lvl.n}
          </div>

          {/* Pip ring */}
          <div
            className="tb-pips absolute flex"
            style={{ bottom: size * 0.1, gap: size * 0.02 }}
          >
            {Array.from({ length: t.levels }).map((_, i) => (
              <span
                key={i}
                className={`rounded-full border ${
                  i < lvl.sub
                    ? "bg-white border-white"
                    : "bg-white/20 border-white/30"
                }`}
                style={{
                  width: size * 0.04,
                  height: size * 0.04,
                  boxShadow: i < lvl.sub ? `0 0 ${size * 0.04}px #fff` : undefined,
                }}
              />
            ))}
          </div>

          {/* Legendary twinkles */}
          {isLegend && (
            <div className="tb-stars absolute inset-0 pointer-events-none">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute w-[3px] h-[3px] bg-white rounded-full"
                  style={{
                    left: `${(i * 73) % 100}%`,
                    top: `${(i * 41) % 100}%`,
                    boxShadow: "0 0 6px #fff",
                    animation: "tbTwinkle 2.5s ease-in-out infinite",
                    animationDelay: `${(i * 0.3) % 3}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {locked && (
          <div
            className="absolute inset-0 grid place-items-center pointer-events-none"
            style={{ fontSize: size * 0.22, filter: "drop-shadow(0 2px 6px rgba(0,0,0,.5))" }}
          >
            🔒
          </div>
        )}
      </div>

      {showLabel && (
        <div className="text-center">
          <div
            className="font-display font-bold tracking-tight"
            style={{ fontSize: size * 0.095 }}
          >
            {t.name}
          </div>
          <div
            className="text-neutral-500 dark:text-neutral-400 mt-0.5"
            style={{ fontSize: size * 0.062 }}
          >
            {t.subtitle}
          </div>
        </div>
      )}
    </div>
  );
}
