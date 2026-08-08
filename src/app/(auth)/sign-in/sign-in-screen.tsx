'use client'

import { useRouter } from 'next/navigation'
import { AuthShell } from '@/auth/auth-shell'
import { bootstrapUserRuntime } from '@/auth/runtime'

export function SignInScreen(): React.ReactElement {
  const router = useRouter()

  return (
    <AuthShell
      initialMode="sign-in"
      modeHrefs={{ signIn: '/sign-in', register: '/sign-up' }}
      onAuthenticated={(user) => {
        bootstrapUserRuntime(user.id)
        router.push('/home')
      }}
    />
  )
}
