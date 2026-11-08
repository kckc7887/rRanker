import { initializePlugins } from '@rranker/sdk';
import { plugins } from '@/plugins';

import { createCatalogTestAccount as fixture0 } from '@rranker/provider-example-test/accounts';
import { createCatalogTestAccount as fixture1 } from '@rranker/provider-rizline-test/accounts';
import { createCatalogTestAccount as fixture2 } from '@rranker/provider-phira-test/accounts';
import { createCatalogTestAccount as fixture3 } from '@rranker/provider-adofai-test/accounts';
import { createCatalogTestAccount as fixture4 } from '@rranker/provider-majdata-net-test/accounts';
import { createCatalogTestAccount as fixture5 } from '@rranker/provider-osu-test/accounts';

initializePlugins(plugins);

const factories = { 'example': fixture0, 'rizline': fixture1, 'phira': fixture2, 'adofai': fixture3, 'majdata-net': fixture4, 'osu-standard': fixture5, 'osu-mania': fixture5, 'osu-catch': fixture5, 'osu-taiko': fixture5 };
export type CatalogTestGameId = keyof typeof factories;
export function createCatalogTestAccount(gameId: CatalogTestGameId, displayName?: string) { return factories[gameId](gameId, displayName); }
