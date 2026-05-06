import {
  isAccountLevelLegError,
  isZernioGlobalAuthError,
} from '@/lib/posting/zernio-account-errors';
import { ZernioApiError } from '@/lib/posting/zernio';

const accountLevelExamples = [
  'Token expired',
  'invalid_token',
  'Refresh token missing',
  'unauthorized: please reconnect',
  'permission denied to publish',
  'Account suspended',
  'session expired',
  'Please re-authenticate your Instagram account',
  'OAuth error: token revoked',
  'no refresh token available',
];

const contentLevelExamples = [
  'Rate limit exceeded',
  'Media exceeds maximum file size',
  'Video aspect ratio not supported',
  'Server error 500',
  'Network timeout',
  'Caption exceeds 2200 characters',
  'Duplicate post detected',
];

let pass = 0;
let fail = 0;
for (const reason of accountLevelExamples) {
  const ok = isAccountLevelLegError(reason);
  console.log(`${ok ? 'PASS' : 'FAIL'} (account-level): "${reason}"`);
  ok ? pass++ : fail++;
}
for (const reason of contentLevelExamples) {
  const ok = !isAccountLevelLegError(reason);
  console.log(`${ok ? 'PASS' : 'FAIL'} (content-level): "${reason}"`);
  ok ? pass++ : fail++;
}

const auth401 = new ZernioApiError(
  401,
  JSON.stringify({ error: { type: 'authentication_error', message: 'Unauthorized' } }),
);
const auth403 = new ZernioApiError(
  403,
  JSON.stringify({ error: { type: 'permission_error', message: 'Forbidden' } }),
);
const server500 = new ZernioApiError(
  500,
  JSON.stringify({ error: { type: 'server_error', message: 'Internal Server Error' } }),
);
const random = new Error('socket hang up');

const globalChecks = [
  ['401 ZernioApiError matches global', isZernioGlobalAuthError(auth401), true],
  ['403 ZernioApiError matches global', isZernioGlobalAuthError(auth403), true],
  ['500 ZernioApiError does NOT match global', isZernioGlobalAuthError(server500), false],
  ['plain Error does NOT match global', isZernioGlobalAuthError(random), false],
] as const;

for (const [label, got, want] of globalChecks) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
