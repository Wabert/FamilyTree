"use client";

import { useMemo, useState } from "react";
import { create } from "qrcode";
import { primaryButton, secondaryButton } from "./ui";

/** Draw the QR code as one SVG path: a 1x1 square for every dark cell. */
function qrPath(text: string) {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  let d = "";
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) d += `M${x},${y}h1v1h-1z`;
    }
  }
  return { d, size: modules.size };
}

export function InviteDialog({
  familyName,
  link,
  code,
  localOnly,
  onClose,
}: {
  familyName: string;
  link: string;
  code: string;
  /** True while the app only runs on this computer, so the link won't work elsewhere. */
  localOnly: boolean;
  onClose(): void;
}) {
  const qr = useMemo(() => qrPath(link), [link]);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: familyName, text: `Join ${familyName} — add yourself to our family tree.`, url: link });
    } catch {
      // The share sheet was dismissed.
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite family"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold text-ink">Invite your family</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:bg-paper hover:text-ink"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          Anyone with this link or QR code can join {familyName} and add themselves. Share it only with family.
        </p>

        {localOnly && (
          <p className="mt-4 rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">
            The app is only running on this computer right now, so this link won’t open on other people’s devices
            until the app is put online.
          </p>
        )}

        <div className="mt-5 flex justify-center">
          <svg
            viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
            role="img"
            aria-label="QR code for the invite link"
            className="h-52 w-52 rounded-2xl border border-line bg-white"
            shapeRendering="crispEdges"
          >
            <path d={qr.d} fill="#26221c" />
          </svg>
        </div>

        <p className="mt-4 rounded-xl border border-line bg-white px-3 py-2 text-sm break-all text-ink select-all">{link}</p>
        <p className="mt-2 text-center text-sm text-muted">
          Invite code: <span className="font-mono font-semibold text-ink select-all">{code}</span>
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          {canShare && (
            <button type="button" onClick={() => void share()} className={secondaryButton}>
              Share…
            </button>
          )}
          <button type="button" onClick={() => void copy()} className={primaryButton}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}
