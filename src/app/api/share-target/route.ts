import {
  readSharedFormDataPayload,
  shareTargetLocation,
} from '@/features/share/share-target'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Adapts native POST share-target submissions to the client-side analyzer route. */
export async function POST(request: Request): Promise<Response> {
  let payload
  try {
    payload = readSharedFormDataPayload(await request.formData())
  } catch {
    payload = { text: '', title: null, url: null }
  }
  return Response.redirect(shareTargetLocation(request.url, payload), 303)
}
