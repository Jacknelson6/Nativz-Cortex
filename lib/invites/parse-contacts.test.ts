import { describe, expect, it } from 'vitest';
import { parseContactList } from './parse-contacts';

/**
 * `parseContactList` is the entry point for the bulk-invite flow:
 * an admin pastes whatever a CRM export, spreadsheet copy, or email
 * thread gave them, and the parser must extract clean { email, name }
 * pairs without crashing. Three contracts to pin:
 *
 *   1. Email is the source of truth. Every successfully parsed row has
 *      a STRICT email match, lowercased. A name on a row without an
 *      email never produces a contact; a row with no recognizable email
 *      lands in `errors` with a 1-based line number. A regression that
 *      let through "Jane Doe" as a contact would create blank-email
 *      invites that never deliver.
 *
 *   2. Deduplication is first-wins. Two rows with the same email
 *      produce one contact (the first); the second's email lands in
 *      `duplicates`. The dedup key is the lowercased email so case
 *      variations collapse. A regression to last-wins would let a
 *      malformed CSV's later row overwrite a clean earlier row.
 *
 *   3. Delimiter and header detection is best-effort but ordered:
 *      tabs (spreadsheet paste) take priority over commas, commas over
 *      semicolons. Headers are detected by the keyword set
 *      (email, name, first, last and aliases); a header row offsets
 *      every error line number by 1. A regression that treated the
 *      header row as data would corrupt the first contact.
 */

describe('parseContactList — empty / blank input', () => {
  it('returns empty arrays for empty string', () => {
    expect(parseContactList('')).toEqual({ contacts: [], errors: [], duplicates: [] });
  });

  it('returns empty arrays for whitespace-only input', () => {
    expect(parseContactList('   \n\n   \r\n')).toEqual({
      contacts: [],
      errors: [],
      duplicates: [],
    });
  });

  it('skips comment lines starting with #', () => {
    const result = parseContactList('# this is a comment\njane@x.com\n# trailing comment');
    expect(result.contacts.map((c) => c.email)).toEqual(['jane@x.com']);
    expect(result.errors).toEqual([]);
  });
});

describe('parseContactList — loose email extraction', () => {
  it('parses a bare email line', () => {
    const result = parseContactList('jane@example.com');
    expect(result.contacts).toEqual([
      { email: 'jane@example.com', name: undefined, source: 'jane@example.com' },
    ]);
  });

  it('parses an angle-bracketed name <email>', () => {
    // Pin: "Jane Doe <jane@x.com>" is the canonical pasted-from-Gmail format.
    const result = parseContactList('Jane Doe <jane@example.com>');
    expect(result.contacts).toEqual([
      { email: 'jane@example.com', name: 'Jane Doe', source: 'Jane Doe <jane@example.com>' },
    ]);
  });

  it('parses an email with name elsewhere on the line', () => {
    const result = parseContactList('Jane Doe jane@example.com');
    expect(result.contacts[0].email).toBe('jane@example.com');
    expect(result.contacts[0].name).toBe('Jane Doe');
  });

  it('lowercases emails on the way in', () => {
    // Pin: dedup keys on lowercased email; a regression that preserved
    // case would let JANE@x.com and jane@x.com land as two contacts.
    const result = parseContactList('JANE@Example.COM');
    expect(result.contacts[0].email).toBe('jane@example.com');
  });

  it('strips surrounding quotes from names', () => {
    const result = parseContactList('"Jane Doe" <jane@example.com>');
    expect(result.contacts[0].name).toBe('Jane Doe');
  });

  it('treats a "name" that equals the email as no name', () => {
    // Defensive: some CSV exports duplicate the email into the name
    // column. We don't want "jane@x.com" rendering as the display name.
    const result = parseContactList('jane@example.com,jane@example.com');
    expect(result.contacts[0].email).toBe('jane@example.com');
    expect(result.contacts[0].name).toBeUndefined();
  });
});

describe('parseContactList — invalid rows go to errors', () => {
  it('records rows with no email as errors', () => {
    const result = parseContactList('Just a name with no email');
    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual([
      { line: 1, source: 'Just a name with no email', reason: 'No valid email address found' },
    ]);
  });

  it('uses 1-based line numbers when there is no header', () => {
    const result = parseContactList('jane@x.com\nbroken row\nbob@x.com');
    expect(result.errors).toEqual([
      { line: 2, source: 'broken row', reason: 'No valid email address found' },
    ]);
  });

  it('offsets error line numbers by +1 when a header was detected', () => {
    // Pin: header row is line 1 in the user's paste; the first DATA
    // row should be reported as line 2 if it errors. A regression that
    // forgot the offset would mislead the admin to the wrong line.
    const result = parseContactList('email,name\njane@x.com,Jane\nbroken,row');
    expect(result.errors).toEqual([
      { line: 3, source: 'broken,row', reason: 'No valid email address found' },
    ]);
  });

  it('does not crash on lines with @ but no valid TLD', () => {
    const result = parseContactList('jane@localhost');
    expect(result.contacts).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});

describe('parseContactList — deduplication', () => {
  it('keeps the first occurrence and reports duplicates', () => {
    const result = parseContactList('jane@x.com,Jane\njane@x.com,Different Name');
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].email).toBe('jane@x.com');
    expect(result.duplicates).toEqual(['jane@x.com']);
  });

  it('dedups across case variations', () => {
    const result = parseContactList('Jane@Example.com\nJANE@example.com\njane@EXAMPLE.com');
    expect(result.contacts).toHaveLength(1);
    expect(result.duplicates).toEqual(['jane@example.com', 'jane@example.com']);
  });

  it('does not classify the FIRST occurrence as a duplicate', () => {
    const result = parseContactList('jane@x.com\nbob@x.com');
    expect(result.contacts.map((c) => c.email)).toEqual(['jane@x.com', 'bob@x.com']);
    expect(result.duplicates).toEqual([]);
  });
});

describe('parseContactList — delimiter detection', () => {
  it('parses tab-delimited (spreadsheet paste) over comma when both appear', () => {
    // Pin: a copy from Google Sheets puts tabs between cells but the
    // name field can contain commas. Tabs must take priority.
    const input = 'name\temail\nDoe, Jane\tjane@x.com';
    const result = parseContactList(input);
    expect(result.contacts).toEqual([
      { email: 'jane@x.com', name: 'Doe, Jane', source: 'Doe, Jane\tjane@x.com' },
    ]);
  });

  it('parses comma-delimited when no tabs are present', () => {
    const result = parseContactList('email,name\njane@x.com,Jane Doe');
    expect(result.contacts[0]).toEqual({
      email: 'jane@x.com',
      name: 'Jane Doe',
      source: 'jane@x.com,Jane Doe',
    });
  });

  it('parses semicolon-delimited when neither tab nor comma is present', () => {
    // Pin: European locales export CSVs with `;` as the separator.
    const result = parseContactList('email;name\njane@x.com;Jane Doe');
    expect(result.contacts[0]).toMatchObject({ email: 'jane@x.com', name: 'Jane Doe' });
  });
});

describe('parseContactList — header + column detection', () => {
  it('respects an "email" header and skips it', () => {
    const result = parseContactList('email,name\njane@x.com,Jane\nbob@x.com,Bob');
    expect(result.contacts.map((c) => ({ email: c.email, name: c.name }))).toEqual([
      { email: 'jane@x.com', name: 'Jane' },
      { email: 'bob@x.com', name: 'Bob' },
    ]);
  });

  it('treats reversed columns (name,email) correctly', () => {
    const result = parseContactList('name,email\nJane,jane@x.com\nBob,bob@x.com');
    expect(result.contacts.map((c) => ({ email: c.email, name: c.name }))).toEqual([
      { email: 'jane@x.com', name: 'Jane' },
      { email: 'bob@x.com', name: 'Bob' },
    ]);
  });

  it('combines first + last name columns', () => {
    // Pin: many CRM exports split "Jane" and "Doe" into two columns.
    // The parser concatenates them.
    const result = parseContactList('first,last,email\nJane,Doe,jane@x.com');
    expect(result.contacts[0].name).toBe('Jane Doe');
  });

  it('recognizes alias header keywords (firstname, lastname, mail)', () => {
    const result = parseContactList('firstname,lastname,mail\nJane,Doe,jane@x.com');
    expect(result.contacts[0]).toMatchObject({ email: 'jane@x.com', name: 'Jane Doe' });
  });

  it('does not treat a single-column row as a header even if cells contain "name"', () => {
    // Defensive: a one-column line that happens to read "name" should
    // be a parse error (no email), not silently consumed as a header.
    const result = parseContactList('name\njane@x.com');
    // 'name' alone has no second cell, so isHeaderRow returns false
    // (firstCells.length must be > 1). It should be treated as a data
    // row that errors out for missing email, then jane@x.com parses.
    expect(result.contacts.map((c) => c.email)).toEqual(['jane@x.com']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('name');
  });

  it('falls back to loose-line parsing when the header has no email column', () => {
    // Edge case: header reads "first,last" only (no email column).
    // The parser should still find an email in the row body.
    const result = parseContactList('first,last\nJane,jane@x.com');
    expect(result.contacts[0].email).toBe('jane@x.com');
  });
});

describe('parseContactList — mixed real-world pastes', () => {
  it('handles a Gmail-style "To" paste with multiple recipients', () => {
    const input = [
      'Jane Doe <jane@example.com>',
      'Bob Smith <bob@example.com>',
      'noname@example.com',
    ].join('\n');
    const result = parseContactList(input);
    expect(result.contacts.map((c) => c.email)).toEqual([
      'jane@example.com',
      'bob@example.com',
      'noname@example.com',
    ]);
    expect(result.contacts[0].name).toBe('Jane Doe');
    expect(result.contacts[1].name).toBe('Bob Smith');
    expect(result.contacts[2].name).toBeUndefined();
  });

  it('handles a CSV with header, data, blank lines, and a duplicate', () => {
    const input = [
      'email,name',
      'jane@x.com,Jane',
      '',
      'bob@x.com,Bob',
      'jane@x.com,DupeJane',
      'broken without email',
    ].join('\n');
    const result = parseContactList(input);
    expect(result.contacts.map((c) => c.email)).toEqual(['jane@x.com', 'bob@x.com']);
    expect(result.duplicates).toEqual(['jane@x.com']);
    // Header is line 1, blank line is dropped pre-numbering, so
    // "broken without email" is the 5th non-blank line which lines up
    // with index 4 in dataLines (header consumed) → reported as line 6.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('broken without email');
  });
});
