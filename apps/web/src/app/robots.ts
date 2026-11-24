import type { MetadataRoute } from 'next';

/**
 * Pre-launch and private deployments (M4.7): nothing is to be crawled. Pages also send
 * `noindex` (layout metadata, and `X-Robots-Tag` from the private gate). Revisit only with the
 * approved public launch.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
