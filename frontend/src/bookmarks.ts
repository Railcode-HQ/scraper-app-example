import type { BookmarkTarget, CollectionItem, Company } from './types'

/** Stable identity for a company across sources — mirrors the worker's. */
export const companyRef = (source: string, slug: string) => `${source}:${slug}`

/** The YC index shape reduced to what a bookmark keeps. */
export function fromCompany(company: Company): BookmarkTarget {
  return {
    source: 'yc',
    slug: company.slug,
    name: company.name,
    website: company.website,
    batch: company.batch,
    sourceData: {
      batch: company.batch,
      industry: company.industry,
      subindustry: company.subindustry,
      tags: company.tags,
      regions: company.regions,
      status: company.status,
      stage: company.stage,
      team_size: company.team_size,
      all_locations: company.all_locations,
      isHiring: company.isHiring,
      top_company: company.top_company,
      nonprofit: company.nonprofit,
    },
  }
}

/** A collection row already carries its source attributes. */
export function fromItem(item: CollectionItem): BookmarkTarget {
  return {
    source: item.source,
    slug: item.slug,
    name: item.name,
    website: item.website,
    batch: item.batch,
    sourceData: item.sourceData ?? {},
  }
}
