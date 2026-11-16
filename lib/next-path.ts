/** Only allow same-site paths as a post-login destination (no //evil.com, no schemes). */
export function safeNext(v: unknown): string | null {
  const s = typeof v === 'string' ? v : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : null
}
