import type { Metadata } from 'next'
import { SignUpScreen } from './sign-up-screen'

export const metadata: Metadata = {
  title: 'Create your free account — KanjiForge',
  description:
    'Create a free KanjiForge account. No payment, no tracking — your reviews stay on your device.',
  alternates: { canonical: '/sign-up' },
}

export default function SignUpPage(): React.ReactElement {
  return <SignUpScreen />
}
