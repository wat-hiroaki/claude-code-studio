export function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1B\[[\x20-\x3F]*[\x40-\x7E]/g, '')  // CSI sequences (including ?1;2c DA responses)
    .replace(/\x1B\][^\x07]*\x07/g, '')               // OSC sequences
    .replace(/\x1B[()][0-9A-B]/g, '')                  // Character set selection
    .replace(/\x1B[\x20-\x2F]*[\x30-\x7E]/g, '')      // Other ESC sequences
}
