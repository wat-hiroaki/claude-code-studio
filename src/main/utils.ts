/* eslint-disable no-control-regex */
export function stripAnsiCodes(str: string): string {
  return str
    .replace(/\x1B\[[\x20-\x3F]*[\x40-\x7E]/g, '')  // CSI sequences (including ?1;2c DA responses)
    .replace(/\x1B\][^\x07]*\x07/g, '')               // OSC sequences
    .replace(/\x1B[()][0-9A-B]/g, '')                  // Character set selection
    .replace(/\x1B[\x20-\x2F]*[\x30-\x7E]/g, '')      // Other ESC sequences
    // Orphaned Device Attributes (DA) response: terminals reply with ESC[?1;2c etc.
    // When output is chunked, the leading ESC may land in a previous chunk, leaving
    // only the tail "O?<digits>c" in the current one. Strip it to avoid UI noise.
    .replace(/O\?[\d;]*c/g, '')
}
/* eslint-enable no-control-regex */
