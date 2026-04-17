"use client";

import { useState, useTransition } from "react";

interface TemplateOption {
  id: string;
  layoutSlug: string;
  displayName: string;
}

const DEFAULT_CONCEPT_JSON = `{
  "layoutSlug": "weston-navy-editorial",
  "aspect": "1:1",
  "eyebrow": "For investors, by investors",
  "headline": [
    { "text": "Funded" },
    { "text": "by real estate", "newline": true },
    { "text": "investors.", "newline": true, "color": "accent" }
  ],
  "subhead": "We fund deals because we do deals. A direct private lender run by people who've been at your closing table.",
  "photoSource": "none",
  "logoColorway": "white-full",
  "background": "navy"
}`;

export function V2RenderPreview({
  clientId,
  templates,
}: {
  clientId: string;
  templates: TemplateOption[];
}) {
  const [conceptJson, setConceptJson] = useState(DEFAULT_CONCEPT_JSON);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function renderConcept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(conceptJson) as Record<string, unknown>;
      } catch (err) {
        setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      try {
        const res = await fetch("/api/ad-creatives-v2/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...parsed, clientId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
          );
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (pngUrl) URL.revokeObjectURL(pngUrl);
        setPngUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <form onSubmit={renderConcept} className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Available layout slugs for this client:
          <div className="mt-1 flex flex-wrap gap-1">
            {templates.map((t) => (
              <code
                key={t.id}
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
                title={t.displayName}
              >
                {t.layoutSlug}
              </code>
            ))}
          </div>
        </div>
        <textarea
          value={conceptJson}
          onChange={(e) => setConceptJson(e.target.value)}
          className="w-full rounded border px-3 py-2 text-xs font-mono"
          rows={18}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
        >
          {isPending ? "Rendering…" : "Render preview"}
        </button>
      </form>
      <div className="flex min-h-[400px] items-center justify-center rounded border bg-muted/30">
        {pngUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pngUrl}
            alt="v2 preview"
            className="max-h-[600px] w-full object-contain"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            Rendered preview appears here
          </span>
        )}
      </div>
    </div>
  );
}
