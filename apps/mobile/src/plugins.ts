import { tool as chartJsonTools } from '@rranker/tool-chart-json';
import { tool as adofaiTools } from '@rranker/tool-adofai';
import { tool as arcadeFinderTools } from '@rranker/tool-arcade-finder';
import { tool as chunithmTools } from '@rranker/tool-chunithm';
import { tool as exampleTools } from '@rranker/tool-example';
import { tool as maimaiTools } from '@rranker/tool-maimai';
import { tool as musedashTools } from '@rranker/tool-musedash';
import { tool as osuTools } from '@rranker/tool-osu';
import { tool as phigrosTools } from '@rranker/tool-phigros';
import { tool as phiraTools } from '@rranker/tool-phira';
import { tool as rizlineTools } from '@rranker/tool-rizline';
import { tool as simaiTools } from '@rranker/tool-simai';
import type { Plugin } from '@rranker/sdk';
import { adapter as example } from '@rranker/game-example';
import { adapter as maimai } from '@rranker/game-maimai';
import { adapter as chunithm } from '@rranker/game-chunithm';
import { adapter as adofai } from '@rranker/game-adofai';
import { adapter as musedash } from '@rranker/game-musedash';
import { adapter as phira } from '@rranker/game-phira';
import { adapter as phigros } from '@rranker/game-phigros';
import { adapter as osu } from '@rranker/game-osu';
import { adapter as majdataNet } from '@rranker/game-majdata-net';
import { adapter as rizline } from '@rranker/game-rizline';
import { provider as exampleTestProvider } from '@rranker/provider-example-test';
import { provider as divingFishProvider } from '@rranker/provider-diving-fish';
import { provider as lxnsProvider } from '@rranker/provider-lxns';
import { provider as localProvider } from '@rranker/provider-local';
import { provider as maimaiTestProvider } from '@rranker/provider-maimai-test';
import { provider as chunithmTestProvider } from '@rranker/provider-chunithm-test';
import { provider as tufProvider } from '@rranker/provider-tuf';
import { provider as adofaiTestProvider } from '@rranker/provider-adofai-test';
import { provider as musedashMoeProvider } from '@rranker/provider-musedash-moe';
import { provider as musedashTestProvider } from '@rranker/provider-musedash-test';
import { provider as phiraCommunityProvider } from '@rranker/provider-phira-community';
import { provider as phiraTestProvider } from '@rranker/provider-phira-test';
import { provider as phiTaptapProvider } from '@rranker/provider-phi-taptap';
import { provider as phigrosTestProvider } from '@rranker/provider-phigros-test';
import { provider as osuProvider } from '@rranker/provider-osu';
import { provider as osuTestProvider } from '@rranker/provider-osu-test';
import { provider as majdataNetProvider } from '@rranker/provider-majdata-net';
import { provider as majdataNetTestProvider } from '@rranker/provider-majdata-net-test';
import { provider as rizlineOfficialProvider } from '@rranker/provider-rizline-official';
import { provider as rizlineTestProvider } from '@rranker/provider-rizline-test';
import { provider as chunithmTempProvider } from '@rranker/provider-chunithm-temp';

export const plugins = [
  example, maimai, chunithm, adofai, musedash, phira, phigros, osu, majdataNet, rizline,
  exampleTestProvider, divingFishProvider, lxnsProvider, localProvider, maimaiTestProvider, chunithmTestProvider, tufProvider, adofaiTestProvider, musedashMoeProvider, musedashTestProvider, phiraCommunityProvider, phiraTestProvider, phiTaptapProvider, phigrosTestProvider, osuProvider, osuTestProvider, majdataNetProvider, majdataNetTestProvider, rizlineOfficialProvider, rizlineTestProvider, chunithmTempProvider,
  adofaiTools, arcadeFinderTools, chunithmTools, exampleTools, maimaiTools, musedashTools, osuTools, phigrosTools, phiraTools, rizlineTools, simaiTools,
  chartJsonTools,
] satisfies readonly Plugin[];
