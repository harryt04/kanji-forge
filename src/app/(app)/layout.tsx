import type { Metadata } from 'next'
import { AuthGate } from '@/auth/auth-gate'

// Authenticated app surfaces render a sign-in form to anyone without a session,
// so they add nothing to search results and would confuse anyone who followed
// a link here from an engine — keep this group out of the index entirely.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return <AuthGate>{children}</AuthGate>
}
