import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-base text-ink outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/25";

export const primaryButton =
  "cursor-pointer rounded-full bg-leaf px-5 py-2.5 text-sm font-semibold text-white hover:bg-leaf-dark disabled:cursor-default disabled:opacity-60";

export const secondaryButton =
  "cursor-pointer rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:border-leaf disabled:cursor-default disabled:opacity-60";

/** A centred card on the paper background, for the screens outside the tree. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10 text-ink">
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">
      {children}
    </p>
  );
}

export function TreeMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static SVG
    <img src="/icon.svg" alt="" width={48} height={48} className="h-12 w-12 rounded-xl" />
  );
}
