"use client";

/** A Print button usable from server-rendered pages (event handlers must live in a client component). */
export function PrintButton({ className, style, children = "Print" }: { className?: string; style?: React.CSSProperties; children?: React.ReactNode }) {
  return <button type="button" onClick={() => window.print()} className={className} style={style}>{children}</button>;
}
