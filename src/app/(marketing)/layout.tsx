import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { MarketingHeader } from '@/features/marketing/marketing-header'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <>
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </>
  )
}
