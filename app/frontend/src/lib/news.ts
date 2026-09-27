export function instagramPost(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password) return null;
    if (!/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
    return `https://www.instagram.com${url.pathname.replace(/\/?$/, '/')}`;
  } catch { return null; }
}
export function splitNewsContent(value = '') {
  let instagram = '';
  const content = value.split('\n').filter(line => {
    const link = instagramPost(line);
    if (!instagram && link) { instagram = link; return false; }
    return true;
  }).join('\n').trim();
  return { content, instagram };
}
export function youtubeVideo(value = ''): string | null {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.replace(/^www\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'm.youtube.com'].includes(host)
      ? url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}
