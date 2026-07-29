"use client";

import type { LucideIcon } from "lucide-react";

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
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  suffix?: string;
  note?: string;
  accent?: "green" | "amber" | "red" | "slate";
}) {
  return (
    <Card className={`stat-card accent-${accent}`}>
      <div className="stat-icon"><Icon size={22} strokeWidth={1.7} /></div>
      <div>
        <span className="muted">{label}</span>
        <div className="stat-value">
          {value}
          {suffix ? <small>{suffix}</small> : null}
        </div>
        {note ? <span className="stat-note">{note}</span> : null}
      </div>
    </Card>
  );
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

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`avatar avatar-${size}`} aria-label={name}>
      {name.slice(0, 1)}
    </span>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}
