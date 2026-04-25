import Image from 'next/image';
import type { ServiceLine, CustomBlock } from '@/lib/proposals/draft-engine';

/**
 * Server component that renders an in-progress proposal draft. Used by:
 *   - /admin/proposals/draft/[id]/preview (iframe target for the Builder)
 *   - The chat tool `preview_draft` card (rendered via dangerouslyInner …
 *     when the chat needs an inline preview)
 *
 * Visual model mirrors the canonical signed-PDF layout (lib/proposals/pdf/
 * agreement.ts) — navy header, electric accents — so what the admin sees
 * in the preview matches what the signer eventually sees on /proposals/[slug].
 */

type DraftRow = {
  id: string;
  agency: 'anderson' | 'nativz';
  title: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  signer_legal_entity: string | null;
  signer_address: string | null;
  service_lines: ServiceLine[];
  custom_blocks: CustomBlock[];
  payment_model: 'one_off' | 'subscription';
  cadence: 'week' | 'month' | 'quarter' | 'year' | null;
  subtotal_cents: number | null;
  total_cents: number | null;
  deposit_cents: number | null;
  status: string;
  clients: { name: string | null; logo_url: string | null; agency: string | null } | { name: string | null; logo_url: string | null; agency: string | null }[] | null;
};

const BRAND = {
  anderson: {
    name: 'Anderson Collaborative',
    legal: 'Anderson Collaborative LLC',
    address: '4000 Ponce de Leon Blvd Ste 470, Coral Gables FL 33146',
    contact: 'trevor@andersoncollaborative.com',
    accent: '#36D1C2',
    accentDark: '#2BB8AA',
    surface: '#00161F',
  },
  nativz: {
    name: 'Nativz',
    legal: 'Nativz',
    address: '',
    contact: 'cole@nativz.io',
    accent: '#00AEEF',
    accentDark: '#046BD2',
    surface: '#01151D',
  },
};

const fmt = (cents: number | null | undefined): string => {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export function DraftPreview({ draft }: { draft: DraftRow }) {
  const brand = BRAND[draft.agency];
  const client = Array.isArray(draft.clients) ? draft.clients[0] : draft.clients;
  const isSub = draft.payment_model === 'subscription';
  const cadenceWord = draft.cadence === 'year' ? 'year' : draft.cadence === 'week' ? 'week' : 'month';

  return (
    <div
      style={{
        fontFamily: '"Rubik", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#0f1419',
        background: '#f7f9fb',
        minHeight: '100vh',
        padding: '32px 16px',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(10, 22, 40, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: brand.surface,
            padding: '32px 40px 28px',
            borderBottom: `3px solid ${brand.accent}`,
            color: '#fff',
          }}
        >
          {draft.status !== 'committed' && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: brand.accent,
                marginBottom: 8,
              }}
            >
              Draft preview · live as you edit
            </div>
          )}
          <div style={{ fontSize: 28, fontWeight: 300, lineHeight: 1.2, marginBottom: 4 }}>
            {draft.title || 'Untitled proposal'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            For {draft.signer_legal_entity || client?.name || 'a new client'} ·{' '}
            from {brand.legal}
          </div>
        </div>

        {/* Parties */}
        <div style={{ padding: '24px 40px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <PartyCard
              label="Provider"
              name={brand.legal}
              detail={brand.address}
              email={brand.contact}
              accent={brand.accent}
            />
            <PartyCard
              label="Client"
              name={draft.signer_legal_entity || client?.name || '—'}
              detail={draft.signer_address || ''}
              email={draft.signer_email || ''}
              accent={brand.accent}
              signerName={draft.signer_name}
              signerTitle={draft.signer_title}
            />
          </div>
        </div>

        {/* Scope */}
        <div style={{ padding: '24px 40px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#7b8794', margin: '0 0 12px' }}>
            Scope
          </h2>
          {draft.service_lines.length === 0 ? (
            <p style={{ fontSize: 14, color: '#7b8794', fontStyle: 'italic' }}>
              No services added yet. Tell the chat what services you want — &ldquo;add 12 short-form videos&rdquo;,
              &ldquo;add the TikTok organic retainer&rdquo;, etc.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8ecf0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: '#7b8794' }}>Service</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: '#7b8794', width: 100 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: '#7b8794', width: 110 }}>Unit</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: '#7b8794', width: 120 }}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {draft.service_lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: '1px solid #f0f3f6' }}>
                    <td style={{ padding: '12px 0' }}>
                      <div style={{ fontWeight: 600, color: '#0f1419' }}>{line.name_snapshot}</div>
                      {line.note && (
                        <div style={{ fontSize: 12, color: '#7b8794', marginTop: 2 }}>{line.note}</div>
                      )}
                      {line.applied_rule_ids.length > 0 && (
                        <div style={{ fontSize: 11, color: brand.accentDark, marginTop: 4 }}>
                          {line.applied_rule_ids.length} discount{line.applied_rule_ids.length === 1 ? '' : 's'} applied
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 0', fontVariantNumeric: 'tabular-nums' }}>
                      {line.quantity}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 0', fontVariantNumeric: 'tabular-nums', color: '#7b8794' }}>
                      {fmt(line.unit_price_cents)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 0', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {fmt(line.line_total_cents ?? line.unit_price_cents * line.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Custom blocks */}
        {draft.custom_blocks.length > 0 && (
          <div style={{ padding: '8px 40px 24px' }}>
            {draft.custom_blocks
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((b) => (b.kind === 'image' ? <ImageBlock key={b.id} block={b} /> : <MarkdownBlock key={b.id} block={b} />))}
          </div>
        )}

        {/* Totals */}
        <div
          style={{
            background: brand.surface,
            color: '#fff',
            padding: '24px 40px',
          }}
        >
          {draft.subtotal_cents != null && draft.subtotal_cents !== draft.total_cents && (
            <Row label="Subtotal" value={fmt(draft.subtotal_cents)} muted />
          )}
          <Row
            label={isSub ? `Recurring fee` : `Total project fee`}
            value={
              isSub
                ? `${fmt(draft.total_cents)} / ${cadenceWord}`
                : fmt(draft.total_cents)
            }
            big
            accent={brand.accent}
          />
          <Row
            label={isSub ? `First charge on signing` : `Deposit on signing (50%)`}
            value={fmt(draft.deposit_cents)}
            muted
          />
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 40px', background: '#fafbfc', textAlign: 'center', fontSize: 11, color: '#7b8794' }}>
          {brand.legal} · {brand.address || brand.contact}
        </div>
      </div>
    </div>
  );
}

function PartyCard({
  label,
  name,
  detail,
  email,
  accent,
  signerName,
  signerTitle,
}: {
  label: string;
  name: string;
  detail: string;
  email: string;
  accent: string;
  signerName?: string | null;
  signerTitle?: string | null;
}) {
  return (
    <div
      style={{
        border: '1px solid #e8ecf0',
        borderLeft: `3px solid ${accent}`,
        background: '#f7f9fb',
        borderRadius: 6,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: accent, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1419', marginBottom: 4 }}>{name}</div>
      {detail && <div style={{ fontSize: 12, color: '#3d4852', marginBottom: 4 }}>{detail}</div>}
      {(signerName || signerTitle) && (
        <div style={{ fontSize: 12, color: '#3d4852' }}>
          {[signerName, signerTitle].filter(Boolean).join(' · ')}
        </div>
      )}
      {email && <div style={{ fontSize: 12, color: accent, fontWeight: 500, marginTop: 4 }}>{email}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  big,
  muted,
  accent,
}: {
  label: string;
  value: string;
  big?: boolean;
  muted?: boolean;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: big ? 12 : 6 }}>
      <div style={{ fontSize: muted ? 12 : 13, color: muted ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: big ? 22 : 14,
          fontWeight: big ? 700 : 600,
          color: big ? accent ?? '#fff' : '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ImageBlock({ block }: { block: CustomBlock }) {
  return (
    <figure style={{ margin: '16px 0', textAlign: 'center' }}>
      <Image
        src={block.content}
        alt={block.caption ?? ''}
        width={640}
        height={360}
        style={{ maxWidth: '100%', height: 'auto', borderRadius: 6 }}
        unoptimized
      />
      {block.caption && (
        <figcaption style={{ fontSize: 11, color: '#7b8794', marginTop: 6 }}>{block.caption}</figcaption>
      )}
    </figure>
  );
}

function MarkdownBlock({ block }: { block: CustomBlock }) {
  // Plaintext render with paragraph + heading detection. We deliberately
  // keep this simple (no markdown-it dependency) so the preview is fast
  // and there's no parser surface area. The committed proposal renders
  // through the canonical pipeline which can do richer rendering.
  const lines = block.content.split('\n');
  return (
    <div style={{ margin: '12px 0', fontSize: 13, color: '#3d4852', lineHeight: 1.55 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} style={{ fontSize: 14, fontWeight: 600, color: '#0f1419', margin: '12px 0 6px' }}>
              {line.replace(/^##\s+/, '')}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={i} style={{ fontSize: 16, fontWeight: 700, color: '#0f1419', margin: '14px 0 8px' }}>
              {line.replace(/^#\s+/, '')}
            </h2>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} style={{ paddingLeft: 16, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 4 }}>•</span>
              {line.replace(/^-\s+/, '')}
            </div>
          );
        }
        if (line === '') return <div key={i} style={{ height: 8 }} />;
        return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
      })}
    </div>
  );
}
