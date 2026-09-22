import {
  createFriendLoginJob,
  pollLoginUntilToken,
  ScoreHubError,
  type ScoreHubAbortSignal,
} from '@/services/score-hub-client';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import type { UploadPhase } from '@/services/upload-maimai-from-friend-code';

export async function loginScoreHubWithFriendCode(input: {
  friendCode: string;
  signal: ScoreHubAbortSignal;
  onPhase: (phase: UploadPhase) => void;
  onNeedFriendAccept: (botFriendCode: string | null) => void;
}): Promise<{ token: string; friendshipJobId: string | null }> {
  const friendCode = input.friendCode.trim();
  if (!/^\d{15}$/.test(friendCode)) {
    throw new ScoreHubError('请输入 15 位好友码');
  }

  input.onPhase({
    kind: 'logging_in',
    message: '正在创建好友申请任务…',
    authMode: 'friend_code',
  });
  const login = await createFriendLoginJob(friendCode, input.signal);

  let token: string;
  let friendshipJobId: string | null = null;

  if (typeof login.body.__skipAuthToken === 'string') {
    token = login.body.__skipAuthToken;
  } else {
    friendshipJobId = login.jobId;
    input.onPhase({
      kind: 'sending_friend',
      message: '正在发送好友申请…',
      botFriendCode: login.botFriendCode,
    });
    let alerted = false;
    token = await pollLoginUntilToken({
      jobId: login.jobId,
      signal: input.signal,
      onSendingFriend: ({ botFriendCode }) => {
        input.onPhase({
          kind: 'sending_friend',
          message: '正在发送好友申请…',
          botFriendCode: botFriendCode ?? login.botFriendCode,
        });
      },
      onWaitingFriend: ({ botFriendCode }) => {
        input.onPhase({
          kind: 'awaiting_friend',
          message: '等待同意好友中…请到“舞萌-中二公众号-我的记录-舞萌DX”接受 Bot 好友申请',
          botFriendCode,
        });
        if (!alerted) {
          alerted = true;
          input.onNeedFriendAccept(botFriendCode ?? login.botFriendCode);
        }
      },
    });
  }

  await scoreHubAccountStore.upsert({
    friendCode,
    token,
  });

  return { token, friendshipJobId };
}
