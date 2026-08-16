import { SITE_URL } from '@/lib/site'

export interface BreadcrumbItem {
  readonly name: string
  readonly path: string
}

export function breadcrumbListJsonLd(
  items: readonly BreadcrumbItem[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }
}

export function definedTermJsonLd(params: {
  readonly literal: string
  readonly meanings: readonly string[]
  readonly path: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: params.literal,
    description: params.meanings.join(', '),
    url: `${SITE_URL}${params.path}`,
    inDefinedTermSet: `${SITE_URL}/kanji`,
  }
}

export function deckItemListJsonLd(params: {
  readonly deckName: string
  readonly items: readonly { readonly literal: string; readonly path: string }[]
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: params.deckName,
    itemListElement: params.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'DefinedTerm',
        name: item.literal,
        url: `${SITE_URL}${item.path}`,
      },
    })),
  }
}

export function faqPageJsonLd(
  entries: readonly { readonly question: string; readonly answer: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  }
}
