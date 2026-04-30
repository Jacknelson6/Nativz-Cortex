/**
 * Render a sample email through `layout()` and write the HTML to /tmp so we
 * can eyeball the new Trevor-branded shell without sending a live email.
 *
 *   npx tsx scripts/preview-email-shell.ts
 */
import { writeFileSync } from 'node:fs';
import { layout } from '@/lib/email/resend';

const sample = `
  <h1 class="heading">Hi Trevor</h1>
  <p class="subtext">Your edits for the JAMNOLA project are ready to review. We delivered 6 new cuts and need your sign-off before we schedule them.</p>
  <div class="stats"><table>
    <tr><td class="k">Project</td><td class="v">JAMNOLA April Wave 1</td></tr>
    <tr><td class="k">Cuts delivered</td><td class="v">6</td></tr>
    <tr><td class="k">Due date</td><td class="v">May 6, 2026</td></tr>
  </table></div>
  <div class="button-wrap">
    <a class="button" href="https://cortex.nativz.io/c/edit/abc">Review the cuts</a>
  </div>
  <p class="small">Reply here if anything looks off.</p>
`;

for (const agency of ['nativz', 'anderson'] as const) {
  const html = layout(sample, agency);
  const path = `/tmp/email-previews/${agency}.html`;
  writeFileSync(path, html, 'utf-8');
  console.log(`Wrote ${path} (${html.length} bytes)`);
}
