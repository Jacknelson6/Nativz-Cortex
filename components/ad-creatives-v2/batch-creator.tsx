"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_BATCH_JSON = `[
  {
    "layoutSlug": "weston-navy-editorial",
    "aspect": "1:1",
    "eyebrow": "For investors, by investors",
    "headline": [
      { "text": "Funded" },
      { "text": "by real estate", "newline": true },
      { "text": "investors.", "newline": true, "color": "accent" }
    ],
    "subhead": "We fund deals because we do deals.",
    "photoSource": "none",
    "logoColorway": "white-full",
    "background": "navy"
  }
]`;

export function V2BatchCreator({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [conceptsJson, setConceptsJson] = useState(DEFAULT_BATCH_JSON);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let concepts: Array<Record<string, unknown>>;
      try {
        const parsed = JSON.parse(conceptsJson);
        if (!Array.isArray(parsed)) {
          throw new Error("Expected a JSON array of concepts");
        }
        concepts = parsed as Array<Record<string, unknown>>;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      // Stamp clientId on every concept for safety
      const stamped = concepts.map((c) => ({ ...c, clientId }));
      try {
        const res = await fetch("/api/ad-creatives-v2/batches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            label: label.trim() || undefined,
            concepts: stamped,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
          );
        }
        const data = await res.json();
        router.push(`/admin/ad-creatives/batches/${data.batchId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        placeholder="batch label (optional — for your own records)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
        maxLength={200}
      />
      <textarea
        value={conceptsJson}
        onChange={(e) => setConceptsJson(e.target.value)}
        className="w-full rounded border px-3 py-2 text-xs font-mono"
        rows={16}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
      >
        {isPending ? "Creating batch…" : "Create batch"}
      </button>
    </form>
  );
}
