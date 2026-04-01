/**
 * In-memory circuit breaker for TrustGraph HTTP calls (per server process).
 */

type State = { failures: number; openUntil: number };

const circuits = new Map<string, State>();

export function isCircuitOpen(key: string): boolean {
  const s = circuits.get(key);
  if (!s || s.openUntil === 0) return false;
  if (Date.now() < s.openUntil) return true;
  circuits.set(key, { failures: 0, openUntil: 0 });
  return false;
}

export function recordSuccess(key: string): void {
  circuits.delete(key);
}

export function recordFailure(key: string, failureThreshold: number, openMs: number): void {
  const prev = circuits.get(key) ?? { failures: 0, openUntil: 0 };
  const failures = prev.failures + 1;
  if (failures >= failureThreshold) {
    circuits.set(key, { failures: 0, openUntil: Date.now() + openMs });
  } else {
    circuits.set(key, { failures, openUntil: 0 });
  }
}
