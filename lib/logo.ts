// Public URL for a company logo in the "logos" bucket. The bucket is public-read, so this
// renders in a plain <img> without a session. File names carry an upload stamp, so no cache busting is needed.
export function logoUrl(path: string | null | undefined) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/logos/${path}` : null;
}
