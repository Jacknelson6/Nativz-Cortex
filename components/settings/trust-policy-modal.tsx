'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Lock,
  Eye,
  Database,
  Key,
  Clock,
  FileCheck,
  Activity,
  ShieldCheck,
  Globe,
  Trash2,
  CheckCircle2,
  X as XIcon,
  Minus,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Trust Policy Data
// ---------------------------------------------------------------------------

const TRUST_SECTIONS = [
  {
    title: 'Encryption',
    icon: Lock,
    items: [
      'AES-256-GCM encryption for all OAuth tokens at rest',
      'HMAC-SHA256 signed state tokens with 10-minute expiry',
      'HTTPS enforced via HSTS (1-year max-age, includeSubDomains)',
      'All webhook payloads verified with constant-time signature comparison',
    ],
  },
  {
    title: 'Authentication & access control',
    icon: Key,
    items: [
      'Server-side JWT verification on every request (not client-side sessions)',
      'Role-based access control — admin and viewer roles enforced at middleware level',
      'Tenant isolation — portal users scoped to their organization only',
      'Impersonation requires owner-level admin access with 1-hour automatic expiry',
      'Minimum 8-character passwords (NIST SP 800-63B aligned)',
    ],
  },
  {
    title: 'Audit logging',
    icon: Eye,
    items: [
      'All user actions logged with actor, action, entity, and metadata',
      'Impersonation sessions fully audited (start and end events)',
      'Activity logs retained for 1 year',
    ],
  },
  {
    title: 'Data retention',
    icon: Clock,
    items: [
      'Activity logs: automatically purged after 1 year',
      'Completed topic searches: purged after 2 years',
      'Read notifications: purged after 90 days',
      'Expired invite tokens: purged immediately',
      'Automated daily enforcement via scheduled jobs',
    ],
  },
  {
    title: 'API security',
    icon: ShieldCheck,
    items: [
      'API keys hashed before storage — plaintext never persisted',
      'Rate limiting: 30 requests/minute per key with sliding window',
      'Fine-grained scope validation per endpoint',
      'Automatic key expiration enforcement',
      'All cron endpoints require bearer token authentication',
    ],
  },
  {
    title: 'Application hardening',
    icon: Globe,
    items: [
      'Content Security Policy with default-deny directives',
      'Clickjacking protection (X-Frame-Options: DENY)',
      'MIME-type sniffing prevention',
      'Strict referrer policy',
      'Camera, microphone, and geolocation disabled by default',
      'HTML sanitization with allowlist approach for user-generated content',
      'Input validation via Zod schemas on all API routes',
    ],
  },
  {
    title: 'Webhook verification',
    icon: FileCheck,
    items: [
      'GitHub webhooks: HMAC-SHA256 signature verification',
      'Scheduling webhooks: HMAC-SHA256 signature verification',
      'Monday.com webhooks: secret-based authentication + input sanitization',
      'Constant-time comparison on all signature checks to prevent timing attacks',
    ],
  },
  {
    title: 'Data management',
    icon: Database,
    items: [
      'Full account deletion endpoint with confirmation safeguard',
      'User data erasure removes both profile and authentication records',
      'Deletion events logged for compliance trail',
    ],
  },
  {
    title: 'Monitoring',
    icon: Activity,
    items: [
      'Public health check endpoint for uptime monitoring',
      'Structured error responses across all API routes',
      'Automated data retention enforcement on schedule',
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Comparison Data
// ---------------------------------------------------------------------------

type ComparisonStatus = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  measure: string;
  cortex: ComparisonStatus;
  typical: ComparisonStatus;
  budget: ComparisonStatus;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { measure: 'Encryption at rest (AES-256)',       cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Server-side JWT verification',        cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Role-based access control',           cortex: 'yes',     typical: 'yes',     budget: 'partial' },
  { measure: 'Tenant data isolation',               cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Full audit logging',                  cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Automated data retention policies',   cortex: 'yes',     typical: 'no',      budget: 'no' },
  { measure: 'Webhook signature verification',      cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Content Security Policy',             cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'API key hashing (never stored raw)',  cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Rate limiting per API key',           cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'User data deletion on request',       cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Constant-time signature checks',      cortex: 'yes',     typical: 'no',      budget: 'no' },
  { measure: 'HSTS + strict security headers',      cortex: 'yes',     typical: 'partial', budget: 'no' },
  { measure: 'Input validation on all endpoints',   cortex: 'yes',     typical: 'partial', budget: 'partial' },
];

function StatusIcon({ status }: { status: ComparisonStatus }) {
  if (status === 'yes') return <CheckCircle2 size={14} className="text-emerald-400" />;
  if (status === 'partial') return <Minus size={14} className="text-amber-400" />;
  return <XIcon size={14} className="text-red-400/70" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrustPolicyModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-text-muted hover:text-accent-text"
      >
        <Shield size={14} />
        View our trust policy
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Trust & security" maxWidth="2xl">
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1 -mr-1">
          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-nativz-border">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-surface">
              <Shield size={20} className="text-accent-text" />
            </div>
            <div>
              <p className="text-sm text-text-secondary leading-relaxed">
                Cortex implements security controls aligned with industry standards
                including SOC 2 Trust Service Criteria and NIST guidelines. Below is a summary
                of the measures protecting your data.
              </p>
            </div>
          </div>

          {/* Compliance badges */}
          <div className="flex flex-wrap gap-2">
            {[
              'AES-256 encryption',
              'RBAC enforced',
              'HSTS enabled',
              'CSP active',
              'NIST 800-63B passwords',
              'Audit logging',
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
              >
                <CheckCircle2 size={12} />
                {badge}
              </span>
            ))}
          </div>

          {/* Comparison table */}
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">
              How we compare
            </h3>
            <div className="rounded-lg border border-nativz-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-hover/50">
                    <th className="text-left py-2.5 px-3 text-text-muted font-medium">Security measure</th>
                    <th className="text-center py-2.5 px-2 text-accent-text font-semibold w-20">Cortex</th>
                    <th className="text-center py-2.5 px-2 text-text-muted font-medium w-20">
                      <span className="hidden sm:inline">Typical SaaS</span>
                      <span className="sm:hidden">Typical</span>
                    </th>
                    <th className="text-center py-2.5 px-2 text-text-muted font-medium w-20">
                      <span className="hidden sm:inline">Budget tools</span>
                      <span className="sm:hidden">Budget</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr
                      key={row.measure}
                      className={i % 2 === 0 ? 'bg-background' : 'bg-surface-hover/20'}
                    >
                      <td className="py-2 px-3 text-text-secondary">{row.measure}</td>
                      <td className="py-2 px-2 text-center">
                        <span className="inline-flex justify-center"><StatusIcon status={row.cortex} /></span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="inline-flex justify-center"><StatusIcon status={row.typical} /></span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span className="inline-flex justify-center"><StatusIcon status={row.budget} /></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-2.5 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} className="text-emerald-400" /> Implemented</span>
              <span className="inline-flex items-center gap-1"><Minus size={10} className="text-amber-400" /> Partial / varies</span>
              <span className="inline-flex items-center gap-1"><XIcon size={10} className="text-red-400/70" /> Not available</span>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {TRUST_SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <div
                  key={section.title}
                  className="rounded-lg border border-nativz-border bg-background p-4"
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <Icon size={16} className="text-accent-text shrink-0" />
                    <h3 className="text-sm font-medium text-text-primary">{section.title}</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-start gap-2.5 rounded-lg border border-nativz-border bg-background p-3">
            <Trash2 size={14} className="text-text-muted shrink-0 mt-0.5" />
            <p className="text-xs text-text-muted leading-relaxed">
              You can request full account and data deletion at any time from the settings page.
              All associated records are permanently removed upon confirmation.
            </p>
          </div>

          <p className="text-[11px] text-text-muted text-center pb-1">
            Last updated March 2026
          </p>
        </div>
      </Dialog>
    </>
  );
}
