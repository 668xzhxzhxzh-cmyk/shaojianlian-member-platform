"use client";

import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function Card({
  children,
  className = "",
  as: Component = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Component className={`card ${className}`}>{children}</Component>;
}

export function SectionTitle({
  title,
  action,
  eyebrow,
}: {
  title: string;
  action?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  note,
  accent = "green",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  suffix?: string;
  note?: string;
  accent?: "green" | "amber" | "red" | "slate";
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="stat-icon"><Icon size={22} strokeWidth={1.7} /></div>
      <div>
        <span className="muted">{label}</span>
        <div className="stat-value">
          {value}
          {suffix ? <small>{suffix}</small> : null}
        </div>
        {note ? <span className="stat-note">{note}</span> : null}
      </div>
    </>
  );
  if (onClick) {
    return <button type="button" className={`card stat-card stat-card-link accent-${accent}`} onClick={onClick}>{content}</button>;
  }
  return <Card className={`stat-card accent-${accent}`}>{content}</Card>;
}

export function ProgressBar({
  value,
  tone = "green",
}: {
  value: number;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <div
      className={`progress progress-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Ring({
  value,
  label,
  sublabel,
  size = "large",
}: {
  value: number;
  label: string;
  sublabel?: string;
  size?: "small" | "large";
}) {
  return (
    <div
      className={`ring ring-${size}`}
      style={{ "--ring-value": `${Math.min(100, Math.max(0, value)) * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`${label} ${Math.round(value)}%`}
    >
      <div>
        <strong>{label}</strong>
        {sublabel ? <span>{sublabel}</span> : null}
      </div>
    </div>
  );
}

export function Avatar({
  name,
  size = "md",
  image,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  image?: string;
}) {
  const resolvedImage = image ?? (name === "邵教练" ? "/coach-portrait.jpg" : undefined);
  return (
    <span className={`avatar avatar-${size}`} aria-label={name}>
      {resolvedImage ? <Image src={resolvedImage} alt="" fill unoptimized sizes={size === "lg" ? "102px" : size === "sm" ? "30px" : "40px"} /> : name.slice(0, 1)}
    </span>
  );
}

export function TrendChart({
  data,
  dataKey,
  height = 220,
  compact = false,
  valueSuffix = "",
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  height?: number;
  compact?: boolean;
  valueSuffix?: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = compact ? 360 : 760;
  const padding = compact ? { top: 10, right: 10, bottom: 10, left: 10 } : { top: 18, right: 24, bottom: 31, left: 42 };
  const values = data.map((item) => Number(item[dataKey])).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = values.map((value, index) => {
    const x = padding.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
    const y = padding.top + ((max - value) / spread) * plotHeight;
    return { x, y, value, label: String(data[index]?.date ?? "") };
  });

  if (!values.length) return <div className="empty-hint">暂无趋势数据</div>;

  const hovered = hoveredIndex === null ? null : points[hoveredIndex];
  return (
    <div className={`trend-chart-interactive ${compact ? "is-compact" : ""}`} onMouseLeave={() => setHoveredIndex(null)}>
      <svg
        className={`trend-chart ${compact ? "trend-chart-compact" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${dataKey} 趋势图，可将鼠标移到数据点查看具体数值`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const localX = ((event.clientX - rect.left) / rect.width) * width;
          const nearest = points.reduce((best, point, index) => Math.abs(point.x - localX) < Math.abs(points[best].x - localX) ? index : best, 0);
          setHoveredIndex((current) => current === nearest ? current : nearest);
        }}
      >
        {!compact ? [0, 1, 2, 3].map((line) => {
          const y = padding.top + (line / 3) * plotHeight;
          const label = max - (line / 3) * spread;
          return (
            <g key={line}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="trend-grid-line" />
              <text x={padding.left - 9} y={y + 4} textAnchor="end" className="trend-axis-label">{label.toFixed(1)}</text>
            </g>
          );
        }) : null}
        <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="trend-line" />
        {points.map((point, index) => (
          <g
            key={`${point.label}-${index}`}
            className={hoveredIndex === index ? "trend-point active" : "trend-point"}
            tabIndex={0}
            role="button"
            aria-label={`${point.label}：${point.value}${valueSuffix}`}
            onMouseEnter={() => setHoveredIndex(index)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            onClick={() => setHoveredIndex(index)}
          >
            <circle cx={point.x} cy={point.y} r={compact ? 12 : 15} className="trend-hit-area" />
            <circle cx={point.x} cy={point.y} r={hoveredIndex === index ? (compact ? 5 : 6.5) : (compact ? 3 : 4.5)} className="trend-dot" />
            {!compact ? <text x={point.x} y={height - 8} textAnchor="middle" className="trend-axis-label">{point.label}</text> : null}
          </g>
        ))}
      </svg>
      {hovered ? (
        <div
          className="trend-tooltip"
          role="status"
          style={{
            left: `${(hovered.x / width) * 100}%`,
            top: `${(hovered.y / height) * 100}%`,
          }}
        >
          <span>{hovered.label || `第 ${hoveredIndex! + 1} 条`}</span>
          <b>{hovered.value}{valueSuffix}</b>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}
