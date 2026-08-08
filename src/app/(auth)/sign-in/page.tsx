import type { Metadata } from 'next'
import { SignInScreen } from './sign-in-screen'

export const metadata: Metadata = {
  title: 'Sign in — KanjiForge',
  description: 'Sign in to your KanjiForge account.',
  alternates: { canonical: '/sign-in' },
}

export default function SignInPage(): React.ReactElement {
  return <SignInScreen />
}
