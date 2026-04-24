import type { Detector } from '../types';
import { kickoffDuplicateDetector } from './kickoff-duplicate';
import { orphanStripeInvoiceDetector } from './orphan-stripe-invoice';
import { mrrDriftDetector } from './mrr-drift';
import { expiredProposalDetector } from './expired-proposal';
import { staleMetaSyncDetector } from './stale-meta-sync';
import { webhookBacklogDetector } from './webhook-backlog';
import { lifecycleInconsistencyDetector } from './lifecycle-inconsistency';

/**
 * Registry of launch detectors. Add new ones here — the runner uses the
 * `id` as the unique-key namespace inside `revenue_anomalies`.
 */
export const ALL_DETECTORS: Detector[] = [
  kickoffDuplicateDetector,
  orphanStripeInvoiceDetector,
  mrrDriftDetector,
  expiredProposalDetector,
  staleMetaSyncDetector,
  webhookBacklogDetector,
  lifecycleInconsistencyDetector,
];
