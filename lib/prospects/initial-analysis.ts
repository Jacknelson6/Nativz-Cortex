// SPY-02 stub for SPY-03's runInitialAnalysis(prospectId).
//
// SPY-02 triggers initial analysis asynchronously from the
// confirm-socials route. Until SPY-03 ships the real pipeline, this
// returns `{ ok: true, queued: false }` so the route stays compile-safe
// and the toast copy ("Initial analysis runs once SPY-03 ships.") stays
// honest. When SPY-03 lands, it overwrites this file with the real
// implementation; callers don't need to change.

export interface InitialAnalysisResult {
  ok: boolean;
  queued: boolean;
  message?: string;
}

export async function runInitialAnalysis(prospectId: string): Promise<InitialAnalysisResult> {
  // Touch the param to keep TS + lint quiet without an underscore prefix
  // (the real SPY-03 function uses prospectId immediately).
  if (!prospectId) {
    return { ok: false, queued: false, message: 'Missing prospect id' };
  }
  console.log(`[prospects] runInitialAnalysis stub for ${prospectId} — SPY-03 will replace this.`);
  return { ok: true, queued: false, message: 'Initial analysis stub (SPY-03 pending).' };
}
