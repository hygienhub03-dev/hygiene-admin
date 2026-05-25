"use client";

/**
 * Dependency-free UI primitives for the admin dashboard.
 * No Radix, no CVA — pure React + Tailwind.
 */

import React, { useState, useEffect, useRef } from "react";

// ─── cn helper ───────────────────────────────────────────────────────────────
function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        "shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.5)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-5", className)}>{children}</div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold leading-none tracking-tight text-muted-foreground",
        className
      )}
    >
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-5 pt-0", className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center p-5 pt-0", className)}>
      {children}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "outline";
type ButtonSize    = "sm" | "md" | "lg" | "icon";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 glow-primary",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-accent",
  ghost:
    "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
  destructive:
    "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30",
  outline:
    "border border-border-strong bg-transparent text-foreground hover:bg-accent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm:   "h-7 px-3 text-xs gap-1.5",
  md:   "h-9 px-4 text-sm gap-2",
  lg:   "h-10 px-5 text-sm gap-2",
  icon: "h-8 w-8 p-0",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-all duration-150 cursor-pointer select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
    >
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline" | "muted";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default:     "bg-primary/15 text-primary border-primary/25",
  success:     "bg-success/15 text-success border-success/25",
  warning:     "bg-warning/15 text-warning-foreground border-warning/25",
  destructive: "bg-destructive/15 text-destructive border-destructive/25",
  outline:     "bg-transparent text-foreground border-border-strong",
  muted:       "bg-muted text-muted-foreground border-transparent",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide",
        BADGE_VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────
export function Dialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in-up"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg animate-in-up",
          "rounded-xl border border-border bg-popover shadow-2xl"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>;
}

export function DialogBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

export function DialogFooter({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
      {children}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({
  label,
  id,
  className,
  ...props
}: {
  label?: string;
  id?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "transition-colors duration-150",
          className
        )}
        {...props}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({
  label,
  id,
  options,
  className,
  ...props
}: {
  label?: string;
  id?: string;
  options: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "transition-colors duration-150 cursor-pointer",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}
export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TableRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border/50 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/40",
        className
      )}
    >
      {children}
    </tr>
  );
}
export function TableHeadCell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}
export function TableCell({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3.5 text-sm text-foreground", className)}>
      {children}
    </td>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1"
    >
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        const showEllipsis = prev && p - prev > 1;
        return (
          <React.Fragment key={p}>
            {showEllipsis && (
              <span className="px-1 text-muted-foreground text-sm">…</span>
            )}
            <button
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex h-8 min-w-8 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors",
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {p}
            </button>
          </React.Fragment>
        );
      })}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"
        aria-label="Next page"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </nav>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover border border-border px-2.5 py-1 text-xs text-foreground shadow-lg z-50 animate-in-up">
          {content}
        </span>
      )}
    </span>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function icon(path: React.ReactNode) {
  return function Icon({ className }: { className?: string }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const XIcon             = icon(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>);
export const ChevronLeftIcon   = icon(<path d="m15 18-6-6 6-6"/>);
export const ChevronRightIcon  = icon(<path d="m9 18 6-6-6-6"/>);
export const ChevronDownIcon   = icon(<path d="m6 9 6 6 6-6"/>);
export const HomeIcon          = icon(<><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>);
export const PackageIcon       = icon(<><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></>);
export const ShoppingCartIcon  = icon(<><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></>);
export const UsersIcon         = icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>);
export const BarChartIcon      = icon(<><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6"  x2="6"  y1="20" y2="16"/></>);
export const SettingsIcon      = icon(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>);
export const BellIcon          = icon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>);
export const SearchIcon        = icon(<><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>);
export const PlusIcon          = icon(<><path d="M5 12h14"/><path d="M12 5v14"/></>);
export const EditIcon          = icon(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>);
export const TrashIcon         = icon(<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>);
export const TrendUpIcon       = icon(<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>);
export const TrendDownIcon     = icon(<><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></>);
export const ShieldIcon        = icon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>);
export const ClockIcon         = icon(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>);
export const FilterIcon        = icon(<><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>);
export const DotsVerticalIcon  = icon(<><circle cx="12" cy="5"  r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></>);
export const ArrowUpRightIcon  = icon(<><path d="M7 7h10v10"/><path d="M7 17 17 7"/></>);
export const TagIcon           = icon(<><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.3-7.3a1 1 0 0 0 0-1.41L12 2Z"/><path d="M7 7h.01"/></>);
export const LayersIcon        = icon(<><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>);
export const LogOutIcon        = icon(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></>);
export const Check2FAIcon      = icon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>);
