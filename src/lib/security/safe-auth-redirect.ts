/** Keep post-auth navigation on the application origin, including URL normalization. */
export function safeAuthRedirect(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  const base = 'https://orion.invalid';
  try {
    const target = new URL(value, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : '/';
  } catch { return '/'; }
}
