/**
 * Hosts the manifest's `egress:` lets this worker reach, and the one gate that
 * enforces it in code. `railcode dev` does NOT enforce egress, so without this
 * a host would work locally and 403 in production.
 *
 * Keep this list and `egress:` in manifest.yaml in step.
 */
const DIRECT_HOSTS = [
  /\.algolia\.net$/,
  /\.algolianet\.com$/,
  /(^|\.)ycombinator\.com$/,
  /^bookface-images\.s3\.amazonaws\.com$/,
]

export const LOGO_HOST = 'bookface-images.s3.amazonaws.com'

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function egressAllowed(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && DIRECT_HOSTS.some((re) => re.test(hostname))
  } catch {
    return false
  }
}
