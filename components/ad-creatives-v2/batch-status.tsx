"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface BatchState {
  status: string;
  total: number;
  completed: number;
  failed: number;
}

export function V2BatchStatus({
  clientId,
  batchId,
  initialStatus,
  initialTotal,
  initialCompleted,
  initialFailed,
}: {
  clientId: string;
  batchId: string;
  initialStatus: string;
  initialTotal: number;
  initialCompleted: number;
  initialFailed: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<BatchState>({
    status: initialStatus,
    total: initialTotal,
    completed: initialCompleted,
    failed: initialFailed,
  });
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (state.status !== "queued" && state.status !== "generating") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ad-creatives-v2/batches/${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        const next: BatchState = {
          status: data.batch.status,
          total: data.batch.total_count ?? 0,
          completed: data.batch.completed_count ?? 0,
          failed: data.batch.failed_count ?? 0,
        };
        setState(next);
        if (
          next.status !== "queued" &&
          next.status !== "generating" &&
          next.status !== state.status
        ) {
          router.refresh();
        } else if (next.completed !== state.completed) {
          router.refresh();
        }
      } catch {
        // swallow — next tick will retry
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [batchId, state.completed, state.status, router]);

  async function cancel() {
    setIsCancelling(true);
    try {
      await fetch(`/api/ad-creatives-v2/batches/${batchId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      router.refresh();
    } finally {
      setIsCancelling(false);
    }
  }

  const pct = state.total > 0 ? Math.round(((state.completed + state.failed) / state.total) * 100) : 0;
  const isActive = state.status === "queued" || state.status === "generating";

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="text-lg font-medium capitalize">{state.status}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Progress</div>
          <div className="font-mono text-lg">
            {state.completed}/{state.total}
            {state.failed > 0 ? (
              <span className="ml-2 text-sm text-red-600">
                ({state.failed} failed)
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 h-2 rounded bg-muted">
        <div
          className="h-2 rounded bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {isActive ? (
        <button
          type="button"
          onClick={cancel}
          disabled={isCancelling}
          className="mt-4 rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          {isCancelling ? "Cancelling…" : "Cancel batch"}
        </button>
      ) : null}
    </section>
  );
}
