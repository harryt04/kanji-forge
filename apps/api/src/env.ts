const required = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
] as const

export type ApiEnv = {
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  API_HOST: string
  API_PORT: number
  CORS_ORIGIN: string
  ELECTRIC_URL: string | null
  ELECTRIC_SECRET: string | null
  VAPID_PUBLIC_KEY: string | null
  VAPID_PRIVATE_KEY: string | null
  VAPID_SUBJECT: string
  PUSH_CRON_SECRET: string | null
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  for (const key of required) {
    if (!source[key])
      throw new Error(`Missing required environment variable: ${key}`)
  }
  if ((source.BETTER_AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters long')
  }

  const port = Number(source.API_PORT ?? '3001')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be a valid TCP port')
  }

  return {
    DATABASE_URL: source.DATABASE_URL!,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL!,
    API_HOST: source.API_HOST ?? '0.0.0.0',
    API_PORT: port,
    CORS_ORIGIN: source.CORS_ORIGIN ?? source.BETTER_AUTH_URL!,
    ELECTRIC_URL: source.ELECTRIC_URL ?? null,
    ELECTRIC_SECRET: source.ELECTRIC_SECRET ?? null,
    VAPID_PUBLIC_KEY: source.VAPID_PUBLIC_KEY ?? null,
    VAPID_PRIVATE_KEY: source.VAPID_PRIVATE_KEY ?? null,
    VAPID_SUBJECT: source.VAPID_SUBJECT ?? 'mailto:admin@example.invalid',
    PUSH_CRON_SECRET: source.PUSH_CRON_SECRET ?? null,
  }
}
