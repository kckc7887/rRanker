import { fetch as expoFetch } from 'expo/fetch';
import {
  LxnsCatalogProvider as CoreLxnsCatalogProvider,
  type FetchLike,
} from '@rranker/core';

export type { LxnsCollectionQuery } from '@rranker/core';

export class LxnsCatalogProvider extends CoreLxnsCatalogProvider {
  constructor() {
    super(expoFetch as unknown as FetchLike);
  }
}
