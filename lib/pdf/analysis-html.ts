import type { MoodboardItem, TranscriptSegment, RescriptData } from '@/lib/types/moodboard';

// ─── Cortex theme colors ────────────────────────────────────────────────────────

const theme = {
  bg: '#0f1117',
  surface: '#1a1d2e',
  surfaceHover: '#222640',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#046bd2',
  accentText: '#5ba3e6',
  accentSurface: 'rgba(4, 107, 210, 0.12)',
  border: '#2a2f45',
  green: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatTag(str: string): string {
  return str.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
}

function platformBadge(platform: string): string {
  const colors: Record<string, string> = {
    tiktok: 'background:#000;color:#fff',
    youtube: 'background:#dc2626;color:#fff',
    instagram: 'background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);color:#fff',
    twitter: 'background:#0ea5e9;color:#fff',
    facebook: 'background:#1877f2;color:#fff',
  };
  const style = colors[platform] ?? `background:${theme.surfaceHover};color:${theme.textPrimary}`;
  return `<span style="${style};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">${esc(platform)}</span>`;
}

// ─── Score bar SVG ──────────────────────────────────────────────────────────────

function scoreBar(score: number): string {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? theme.green : score >= 4 ? theme.amber : theme.red;
  return `
    <div style="height:8px;border-radius:4px;background:${theme.surfaceHover};overflow:hidden;margin-top:6px">
      <div style="height:100%;width:${pct}%;border-radius:4px;background:${color}"></div>
    </div>`;
}

// ─── Main HTML builder ──────────────────────────────────────────────────────────

export interface AnalysisHtmlOptions {
  item: MoodboardItem;
  clientName: string | null;
  generatedTitle: string;
  logoBase64: string;
}

export function buildAnalysisHtml({ item, clientName, generatedTitle, logoBase64 }: AnalysisHtmlOptions): string {
  const platform = item.platform ?? 'unknown';
  const segments: TranscriptSegment[] = item.transcript_segments ?? [];
  const rescript: RescriptData | null = item.rescript;
  const themes = item.content_themes ?? [];
  const wins = item.winning_elements ?? [];
  const improvements = item.improvement_areas ?? [];
  const frames = item.frames ?? [];
  const hasDistinctFrames = new Set(frames.map(f => f.url)).size > 1;

  const sections: string[] = [];

  // ── Stats ──
  if (item.stats) {
    const stats = [
      { label: 'Views', value: formatNumber(item.stats.views) },
      { label: 'Likes', value: formatNumber(item.stats.likes) },
      { label: 'Comments', value: formatNumber(item.stats.comments) },
      { label: 'Shares', value: formatNumber(item.stats.shares) },
    ];
    sections.push(`
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        ${stats.map(s => `
          <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:${theme.textPrimary}">${s.value}</div>
            <div style="font-size:11px;color:${theme.textMuted};margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">${s.label}</div>
          </div>
        `).join('')}
      </div>
    `);
  }

  // ── Hook Analysis ──
  if (item.hook_score != null) {
    let hookHtml = `<div style="margin-bottom:24px">`;
    hookHtml += sectionHeader('Hook analysis');

    if (item.hook) {
      hookHtml += `
        <div style="background:${theme.accentSurface};border-left:3px solid ${theme.accent};border-radius:8px;padding:16px;margin-bottom:16px">
          <div style="font-size:14px;font-style:italic;color:${theme.textPrimary};line-height:1.6">&ldquo;${esc(item.hook)}&rdquo;</div>
        </div>`;
    }

    hookHtml += `
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px;text-align:center;min-width:90px">
          <div style="font-size:32px;font-weight:700;color:${theme.accentText}">${item.hook_score}<span style="font-size:14px;color:${theme.textMuted}">/10</span></div>
          <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-top:4px">Hook score</div>
          ${scoreBar(item.hook_score)}
        </div>
        <div style="flex:1;background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px">
          ${item.hook_type ? `<div style="margin-bottom:8px"><span style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px">Type</span><div style="font-size:13px;color:${theme.textPrimary};margin-top:2px">${esc(formatTag(item.hook_type))}</div></div>` : ''}
          ${item.hook_analysis ? `<div><span style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px">Why it works</span><div style="font-size:12px;color:${theme.textSecondary};line-height:1.5;margin-top:2px">${esc(item.hook_analysis)}</div></div>` : ''}
        </div>
      </div>`;

    if (item.concept_summary) {
      hookHtml += `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Summary</div>
          <div style="font-size:12px;color:${theme.textSecondary};line-height:1.5">${esc(item.concept_summary)}</div>
        </div>`;
    }

    hookHtml += `</div>`;
    sections.push(hookHtml);
  }

  // ── Themes ──
  if (themes.length > 0) {
    sections.push(`
      <div style="margin-bottom:24px">
        ${sectionHeader('Content themes')}
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${themes.map(t => `<span style="background:${theme.surfaceHover};color:${theme.textSecondary};padding:4px 12px;border-radius:20px;font-size:11px;border:1px solid ${theme.border}">${esc(formatTag(t))}</span>`).join('')}
        </div>
      </div>
    `);
  }

  // ── Strengths & Improvements ──
  if (wins.length > 0 || improvements.length > 0) {
    sections.push(`
      <div style="margin-bottom:24px">
        ${sectionHeader('Strengths & improvements')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${wins.length > 0 ? `
            <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px">
              <div style="font-size:10px;color:${theme.green};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600">What works</div>
              ${wins.map(w => `<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:${theme.green};font-weight:700;flex-shrink:0">+</span><span style="font-size:11px;color:${theme.textSecondary};line-height:1.4">${esc(w)}</span></div>`).join('')}
            </div>
          ` : ''}
          ${improvements.length > 0 ? `
            <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px">
              <div style="font-size:10px;color:${theme.amber};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600">Could improve</div>
              ${improvements.map(im => `<div style="display:flex;gap:8px;margin-bottom:6px"><span style="color:${theme.amber};font-weight:700;flex-shrink:0">-</span><span style="font-size:11px;color:${theme.textSecondary};line-height:1.4">${esc(im)}</span></div>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `);
  }

  // ── CTA ──
  if (item.cta) {
    sections.push(`
      <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:16px;margin-bottom:24px">
        <div style="font-size:10px;color:${theme.amber};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600">Call to action</div>
        <div style="font-size:13px;color:${theme.textPrimary}">${esc(item.cta)}</div>
      </div>
    `);
  }

  // ── Frames ──
  if (hasDistinctFrames && frames.length > 0) {
    let framesHtml = `<div style="margin-bottom:24px;page-break-before:always">`;
    framesHtml += sectionHeader('Key frames');
    framesHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">`;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const transcriptText = segments.length > 0
        ? getTranscriptAtTimestamp(segments, frame.timestamp, 3)
        : '';

      framesHtml += `
        <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;overflow:hidden;display:flex;gap:0">
          <div style="width:80px;flex-shrink:0;position:relative">
            <img src="${esc(frame.url)}" style="width:100%;aspect-ratio:9/16;object-fit:cover;display:block" />
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;font-size:9px;text-align:center;padding:2px;font-family:monospace">${esc(frame.label)}</div>
          </div>
          <div style="padding:10px;flex:1;min-width:0">
            <div style="font-size:10px;color:${theme.textMuted};margin-bottom:4px">${esc(frame.label)}${i < frames.length - 1 ? ` - ${frames[i + 1].label}` : '+'}</div>
            ${transcriptText
              ? `<div style="font-size:11px;color:${theme.textSecondary};line-height:1.4">${esc(transcriptText)}</div>`
              : `<div style="font-size:10px;color:${theme.textMuted};font-style:italic">No transcript at this point</div>`
            }
          </div>
        </div>`;
    }

    framesHtml += `</div></div>`;
    sections.push(framesHtml);
  }

  // ── Transcript ──
  if (item.transcript || segments.length > 0) {
    let transcriptHtml = `<div style="margin-bottom:24px;page-break-before:always">`;
    transcriptHtml += sectionHeader('Transcript');

    if (segments.length > 0) {
      transcriptHtml += `<div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px">`;
      for (const seg of segments) {
        transcriptHtml += `
          <div style="display:flex;gap:12px;padding:4px 0;border-bottom:1px solid ${theme.border}22">
            <span style="font-size:10px;color:${theme.accentText};font-family:monospace;flex-shrink:0;width:36px;text-align:right;padding-top:2px">${formatTimestamp(seg.start)}</span>
            <span style="font-size:12px;color:${theme.textSecondary};line-height:1.5">${esc(seg.text)}</span>
          </div>`;
      }
      transcriptHtml += `</div>`;
    } else if (item.transcript) {
      transcriptHtml += `
        <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px;font-size:12px;color:${theme.textSecondary};line-height:1.6;white-space:pre-wrap">${esc(item.transcript)}</div>`;
    }

    transcriptHtml += `</div>`;
    sections.push(transcriptHtml);
  }

  // ── Rescript ──
  if (rescript || item.replication_brief) {
    let rescriptHtml = `<div style="margin-bottom:24px;page-break-before:always">`;
    rescriptHtml += sectionHeader('Rescript');

    if (rescript) {
      if (rescript.adapted_script) {
        rescriptHtml += `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:600">Adapted script</div>
            <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px;font-size:12px;color:${theme.textSecondary};line-height:1.6;white-space:pre-wrap">${esc(rescript.adapted_script)}</div>
          </div>`;
      }

      if (rescript.shot_list?.length > 0) {
        rescriptHtml += `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600">Shot list</div>
            <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;overflow:hidden">
              ${rescript.shot_list.map(shot => `
                <div style="display:flex;gap:12px;padding:10px 16px;border-bottom:1px solid ${theme.border}">
                  <span style="font-size:11px;font-weight:700;color:${theme.accentText};flex-shrink:0;width:24px">#${shot.number}</span>
                  <span style="font-size:11px;color:${theme.textSecondary};flex:1;line-height:1.4">${esc(shot.description)}${shot.notes ? ` <span style="color:${theme.textMuted}">— ${esc(shot.notes)}</span>` : ''}</span>
                  <span style="font-size:10px;color:${theme.textMuted};flex-shrink:0">${esc(shot.timing)}</span>
                </div>
              `).join('')}
            </div>
          </div>`;
      }

      if (rescript.hook_alternatives?.length > 0) {
        rescriptHtml += `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600">Hook alternatives</div>
            ${rescript.hook_alternatives.map((alt, i) => `
              <div style="display:flex;gap:8px;margin-bottom:6px">
                <span style="font-size:11px;color:${theme.accentText};font-weight:600;flex-shrink:0">${i + 1}.</span>
                <span style="font-size:11px;color:${theme.textSecondary};line-height:1.4">${esc(alt)}</span>
              </div>
            `).join('')}
          </div>`;
      }

      if (rescript.hashtags?.length > 0) {
        rescriptHtml += `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:600">Hashtags</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${rescript.hashtags.map(h => `<span style="background:${theme.accentSurface};color:${theme.accentText};padding:3px 10px;border-radius:12px;font-size:11px">${esc(h)}</span>`).join('')}
            </div>
          </div>`;
      }

      if (rescript.posting_strategy) {
        rescriptHtml += `
          <div style="margin-bottom:16px">
            <div style="font-size:10px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:600">Posting strategy</div>
            <div style="font-size:12px;color:${theme.textSecondary};line-height:1.5">${esc(rescript.posting_strategy)}</div>
          </div>`;
      }
    } else if (item.replication_brief) {
      rescriptHtml += `
        <div style="background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;padding:16px;font-size:12px;color:${theme.textSecondary};line-height:1.6;white-space:pre-wrap">${esc(item.replication_brief)}</div>`;
    }

    rescriptHtml += `</div>`;
    sections.push(rescriptHtml);
  }

  // ── Assemble full page ──
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${theme.bg};
      color: ${theme.textPrimary};
      padding: 40px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4; margin: 0; }
    a { color: ${theme.accentText}; text-decoration: none; }
  </style>
</head>
<body>
  <!-- Brand bar -->
  <div style="height:3px;background:${theme.accent};border-radius:2px;margin-bottom:24px"></div>

  <!-- Header -->
  <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid ${theme.border}">
    <!-- Logo row -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:11px;color:${theme.textMuted};text-transform:uppercase;letter-spacing:1px">Video analysis</div>
      <img src="${logoBase64}" style="display:block;width:120px" />
    </div>
    <!-- Title -->
    <h1 style="font-size:22px;font-weight:700;color:${theme.textPrimary};margin-bottom:6px;line-height:1.3">${esc(generatedTitle)}</h1>
    ${clientName ? `<div style="font-size:13px;color:${theme.textSecondary};margin-bottom:8px">${esc(clientName)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${platformBadge(platform)}
      ${item.duration ? `<span style="font-size:11px;color:${theme.textMuted}">${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}</span>` : ''}
      <span style="font-size:11px;color:${theme.textMuted}">${dateStr}</span>
    </div>
    <div style="margin-top:8px">
      <a href="${esc(item.url)}" style="font-size:11px;color:${theme.accentText}">${esc(item.url.length > 80 ? item.url.slice(0, 80) + '...' : item.url)}</a>
    </div>
  </div>

  ${sections.join('\n')}

  <!-- Footer -->
  <div style="margin-top:32px;padding-top:12px;border-top:1px solid ${theme.border};display:flex;justify-content:space-between">
    <span style="font-size:9px;color:${theme.textMuted}">Prepared by Nativz</span>
    <span style="font-size:9px;color:${theme.textMuted}">Nativz Cortex &mdash; Confidential</span>
  </div>
</body>
</html>`;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function sectionHeader(title: string): string {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid ${theme.border}">
      <div style="width:6px;height:6px;border-radius:3px;background:${theme.accent};flex-shrink:0"></div>
      <div style="font-size:14px;font-weight:700;color:${theme.textPrimary}">${title}</div>
    </div>`;
}

function getTranscriptAtTimestamp(segments: TranscriptSegment[], timestamp: number, intervalSec: number): string {
  const endTs = timestamp + intervalSec;
  const matching = segments.filter(s => s.start < endTs && s.end > timestamp);
  if (matching.length > 0) return matching.map(s => s.text).join(' ');
  if (segments.length === 0) return '';
  const nearest = segments.reduce((prev, curr) =>
    Math.abs(curr.start - timestamp) < Math.abs(prev.start - timestamp) ? curr : prev
  );
  return nearest.text;
}
