export interface FeedExtra {
  id: string;
  title: string;
  iconUri: string;
  manifestUrl: string;
}

export interface FeedPackage {
  id: string;
  title: string;
  iconUri: string;
  manifest?: Record<string, unknown>;
  manifestUrl?: string;
}

export interface Feed {
  paging: { page: number; count: number; maxPage: number; itemsTotal: number };
  packages: FeedPackage[];
}

export function validateExtras(extras: unknown, ownId: string): FeedExtra[];
export function buildFeed(ownPackage: FeedPackage, extras: unknown): Feed;
