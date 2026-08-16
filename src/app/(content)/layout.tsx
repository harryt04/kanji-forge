import { MarketingFooter } from '@/features/marketing/marketing-footer'
import { MarketingHeader } from '@/features/marketing/marketing-header'

export default function ContentLayout({
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
