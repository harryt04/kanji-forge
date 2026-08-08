import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { MarketingHeader } from '@/features/marketing/marketing-header'
import { MarketingThemeSync } from '@/features/marketing/theme-sync'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <>
      <MarketingThemeSync />
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </>
  )
}
