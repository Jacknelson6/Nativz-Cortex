"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function V2GenerateSceneForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ad-creatives-v2/generate-scene", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId,
            slug: slug.trim(),
            displayName: displayName.trim(),
            prompt: prompt.trim(),
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        setSuccess(
          data.regenerated
            ? `Regenerated scene ${slug} (${data.bytes} bytes)`
            : `Created scene ${slug} (${data.bytes} bytes)`,
        );
        setSlug("");
        setDisplayName("");
        setPrompt("");
        setTags("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="scene slug (e.g. modern-home-exterior)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
          required
          pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
        />
        <input
          type="text"
          placeholder="display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
          required
          maxLength={120}
        />
      </div>
      <textarea
        placeholder="Gemini prompt (cinematic editorial photograph: ...)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm font-mono"
        rows={5}
        minLength={20}
        maxLength={4000}
        required
      />
      <input
        type="text"
        placeholder="tags (comma-separated)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full rounded border px-3 py-2 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
      >
        {isPending ? "Generating…" : "Generate scene"}
      </button>
    </form>
  );
}
