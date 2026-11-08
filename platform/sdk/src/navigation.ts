export type DetailParams = Readonly<Record<string, string>>;

export type DetailTarget<Params extends DetailParams = DetailParams> = {
  gameId: string;
  params: Params;
};

export function detailHref(target: DetailTarget) {
  return {
    pathname: '/detail' as const,
    params: { ...target.params, gameId: target.gameId },
  };
}

export type PluginPageTarget = {
  pluginId: string;
  pageId: string;
  gameId?: string;
  accountId?: string;
  params?: DetailParams;
};

export function pluginHref(target: PluginPageTarget) {
  return {
    pathname: '/plugins/[pluginId]/[pageId]' as const,
    params: {
      ...target.params,
      pluginId: target.pluginId,
      pageId: target.pageId,
      ...(target.gameId === undefined ? {} : { gameId: target.gameId }),
      ...(target.accountId === undefined ? {} : { accountId: target.accountId }),
    },
  };
}
