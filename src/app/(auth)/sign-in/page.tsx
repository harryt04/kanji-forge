import type { Metadata } from 'next'
import { SignInScreen } from './sign-in-screen'

export const metadata: Metadata = {
  title: 'Sign in — KanjiForge',
  description: 'Sign in to your KanjiForge account.',
  alternates: { canonical: '/sign-in' },
  // Thin page competing with /sign-up for the same intent; keep it crawlable
  // for direct navigation but out of the index.
  robots: { index: false, follow: true },
}

export default function SignInPage(): React.ReactElement {
  return <SignInScreen />
}
