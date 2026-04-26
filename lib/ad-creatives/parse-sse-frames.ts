/**
 * Stream-friendly SSE frame parser. Pulls complete `data:` JSON payloads off
 * a string buffer and returns whatever's left so the caller can append the
 * next chunk and call again. Handles both `\n\n` and `\r\n\r\n` delimiters
 * — proxies and CDNs sometimes rewrite line endings.
 */
export function parseSseFrames<T = unknown>(
  buffer: string,
): { events: T[]; rest: string } {
  const events: T[] = [];
  let rest = buffer;
  while (true) {
    const lf = rest.indexOf('\n\n');
    const crlf = rest.indexOf('\r\n\r\n');
    const candidates = [lf, crlf].filter((i) => i !== -1);
    if (candidates.length === 0) break;
    const sep = Math.min(...candidates);
    const sepLen = sep === crlf ? 4 : 2;
    const frame = rest.slice(0, sep);
    rest = rest.slice(sep + sepLen);
    const dataLine = frame.split(/\r?\n/).find((l) => l.startsWith('data:'));
    if (!dataLine) continue;
    try {
      events.push(JSON.parse(dataLine.slice(5).trim()) as T);
    } catch {
      // Malformed frame — skip and keep streaming.
    }
  }
  return { events, rest };
}
