'use client'

import { useRouter } from 'next/navigation'
import { AuthShell } from '@/auth/auth-shell'
import { bootstrapUserRuntime } from '@/auth/runtime'

export function SignUpScreen(): React.ReactElement {
  const router = useRouter()

  return (
    <AuthShell
      initialMode="register"
      modeHrefs={{ signIn: '/sign-in', register: '/sign-up' }}
      onAuthenticated={(user) => {
        bootstrapUserRuntime(user.id)
        router.push('/home')
      }}
    />
  )
}
