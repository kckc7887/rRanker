import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { createLocalMaimaiAccount, createOsuBoundAccount } from '@/domain/bound-account';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/services/hydrate-bound-account-avatars', () => ({ hydrateBoundAccountAvatars: jest.fn(async () => undefined) }));
jest.mock('@/services/account-thumbnail', () => ({ hydrateBoundAccountThumbnails: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-chunithm-account-summaries', () => ({ hydrateChunithmAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/services/hydrate-phigros-account-summaries', () => ({ hydratePhigrosAccountSummaries: jest.fn(async () => undefined) }));
jest.mock('@/components/BoundAccountAvatar', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { BoundAccountAvatar: () => <RN.View /> };
});

const osuStandard = createOsuBoundAccount({ gameId: 'osu-standard', userId: 1, displayName: 'osu玩家', pp: 1234 });
const osuMania = createOsuBoundAccount({ gameId: 'osu-mania', userId: 1, displayName: 'osu玩家', pp: 200 });
const localMaimai = createLocalMaimaiAccount('本地玩家', 15000);

describe('BoundAccountGroupedList osu! 家族三级结构', () => {
  it('osu 板块展开为模式列表，仅显示有绑定账号的模式', async () => {
    const screen = await render(
      <BoundAccountGroupedList
        accounts={[osuStandard, osuMania, localMaimai]}
        expandedGameId={null}
        isGameExpanded={() => true}
        activeAccountId={osuStandard.id}
        onToggleGame={jest.fn()}
        onSelectAccount={jest.fn()}
      />,
    );
    expect(screen.getByText('osu!')).toBeTruthy();
    expect(screen.getByText('选择模式')).toBeTruthy();
    expect(screen.getByText('osu!standard')).toBeTruthy();
    expect(screen.getByText('osu!mania')).toBeTruthy();
    expect(screen.queryByText('osu!catch')).toBeNull();
    expect(screen.queryByText('osu!taiko')).toBeNull();
    expect(screen.getByText('舞萌 DX')).toBeTruthy();
  });

  it('模式子组展开为账号行，行为同普通游戏', async () => {
    const onToggleGame = jest.fn();
    const screen = await render(
      <BoundAccountGroupedList
        accounts={[osuStandard, osuMania]}
        expandedGameId="osu-standard"
        activeAccountId={osuStandard.id}
        onToggleGame={onToggleGame}
        onSelectAccount={jest.fn()}
      />,
    );
    expect(screen.getByText('osu玩家')).toBeTruthy();
    expect(screen.getByText('当前')).toBeTruthy();
    expect(screen.getByText('osu! 官方')).toBeTruthy();
  });

  it('renderRatingTag 槽位注入 osu PP 标签', async () => {
    const screen = await render(
      <BoundAccountGroupedList
        accounts={[osuStandard]}
        expandedGameId="osu-standard"
        activeAccountId={osuStandard.id}
        onToggleGame={jest.fn()}
        onSelectAccount={jest.fn()}
        renderRatingTag={(account) => (account.providerId === 'osu' ? <Text>{account.scoreDisplay}</Text> : null)}
      />,
    );
    expect(screen.getByText('1234')).toBeTruthy();
  });

  it('家族行可收起再展开', async () => {
    const screen = await render(
      <BoundAccountGroupedList
        accounts={[osuStandard, osuMania]}
        expandedGameId="osu-standard"
        activeAccountId={osuStandard.id}
        onToggleGame={jest.fn()}
        onSelectAccount={jest.fn()}
      />,
    );
    const familyRow = screen.getByLabelText('收起游戏 osu!');
    fireEvent.press(familyRow);
    await waitFor(() => expect(screen.queryByText('osu!standard')).toBeNull());
    expect(screen.getByLabelText('展开游戏 osu!')).toBeTruthy();
  });
});
