// Tolerant contact-list parser for the bulk-invite flow. Accepts pasted text
// or CSV content and pulls out { email, name? } pairs. Designed to handle
// whatever an admin copies out of a spreadsheet, CRM, or email thread —
// headers optional, column order flexible, commas or tabs or semicolons.

export interface ParsedContact {
  email: string;
  name?: string;
  /** Original source line (for debugging / error surfacing). */
  source: string;
}

export interface ParseResult {
  contacts: ParsedContact[];
  /** Per-line issues we couldn't parse. */
  errors: { line: number; source: string; reason: string }[];
  /** Duplicate emails we collapsed (first occurrence wins). */
  duplicates: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const STRICT_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const ANGLE_RE = /^\s*(.*?)\s*<\s*([^<>]+@[^<>]+)\s*>\s*$/;

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.join('|').toLowerCase();
  return !EMAIL_RE.test(joined) && /(email|e-mail|name|first|last)/.test(joined);
}

function splitRow(line: string): string[] {
  // Tabs first (spreadsheet paste), then comma, then semicolon.
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  if (line.includes(',')) return line.split(',').map((c) => c.trim());
  if (line.includes(';')) return line.split(';').map((c) => c.trim());
  return [line.trim()];
}

function detectColumns(headers: string[]): { emailIdx: number; nameIdx: number; firstIdx: number; lastIdx: number } {
  let emailIdx = -1;
  let nameIdx = -1;
  let firstIdx = -1;
  let lastIdx = -1;
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/[^a-z]/g, '');
    if (emailIdx === -1 && (key === 'email' || key === 'emailaddress' || key === 'mail')) emailIdx = i;
    else if (nameIdx === -1 && (key === 'name' || key === 'fullname' || key === 'contact' || key === 'contactname')) nameIdx = i;
    else if (firstIdx === -1 && (key === 'first' || key === 'firstname' || key === 'givenname')) firstIdx = i;
    else if (lastIdx === -1 && (key === 'last' || key === 'lastname' || key === 'surname' || key === 'familyname')) lastIdx = i;
  });
  return { emailIdx, nameIdx, firstIdx, lastIdx };
}

function cleanName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return undefined;
  // Reject a "name" that's just the email itself.
  if (STRICT_EMAIL_RE.test(trimmed)) return undefined;
  return trimmed;
}

function extractFromLooseLine(line: string): { email: string; name?: string } | null {
  // "Jane Doe <jane@x.com>" style
  const angle = line.match(ANGLE_RE);
  if (angle) {
    const name = cleanName(angle[1]);
    const email = angle[2].trim().toLowerCase();
    if (STRICT_EMAIL_RE.test(email)) return { email, name };
  }

  // Find the first email anywhere on the line; treat everything else as name.
  const match = line.match(EMAIL_RE);
  if (!match) return null;
  const email = match[0].toLowerCase();
  const rest = (line.slice(0, match.index ?? 0) + line.slice((match.index ?? 0) + match[0].length))
    .replace(/[<>,;\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { email, name: cleanName(rest) };
}

export function parseContactList(input: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: ParseResult['errors'] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];

  const rawLines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (rawLines.length === 0) return { contacts, errors, duplicates };

  const firstCells = splitRow(rawLines[0]);
  let dataLines = rawLines;
  let headerCols: ReturnType<typeof detectColumns> | null = null;

  if (firstCells.length > 1 && isHeaderRow(firstCells)) {
    headerCols = detectColumns(firstCells);
    dataLines = rawLines.slice(1);
  }

  dataLines.forEach((line, i) => {
    const cells = splitRow(line);

    let email: string | undefined;
    let name: string | undefined;

    if (headerCols && cells.length > 1) {
      const { emailIdx, nameIdx, firstIdx, lastIdx } = headerCols;
      if (emailIdx >= 0 && cells[emailIdx]) {
        const maybe = cells[emailIdx].toLowerCase();
        if (STRICT_EMAIL_RE.test(maybe)) email = maybe;
      }
      if (!email) {
        const found = line.match(EMAIL_RE);
        if (found) email = found[0].toLowerCase();
      }
      if (nameIdx >= 0) name = cleanName(cells[nameIdx]);
      else if (firstIdx >= 0 || lastIdx >= 0) {
        const first = firstIdx >= 0 ? cells[firstIdx] : '';
        const last = lastIdx >= 0 ? cells[lastIdx] : '';
        name = cleanName(`${first ?? ''} ${last ?? ''}`);
      }
    }

    if (!email) {
      const loose = extractFromLooseLine(line);
      if (loose) {
        email = loose.email;
        name = name ?? loose.name;
      }
    }

    if (!email || !STRICT_EMAIL_RE.test(email)) {
      errors.push({
        line: (headerCols ? i + 2 : i + 1),
        source: line,
        reason: 'No valid email address found',
      });
      return;
    }

    if (seen.has(email)) {
      duplicates.push(email);
      return;
    }
    seen.add(email);

    contacts.push({ email, name, source: line });
  });

  return { contacts, errors, duplicates };
}
