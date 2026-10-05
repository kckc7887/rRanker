import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  AccountProbeError, accountProbeCommand, accountProbeFailureCode, clearAccountProbe, runAccountRecoveryProbe,
  type AccountProbeStep,
} from './tests/native/account-recovery-probe';

function NativeAccountRecovery() {
  const [status, setStatus] = useState('running');
  useEffect(() => {
    let mounted = true;
    void (async () => {
      let command: ReturnType<typeof accountProbeCommand> | undefined;
      let step: AccountProbeStep = 'command';
      const configuredSha: unknown = Constants.expoConfig?.extra?.buildCommit;
      const sourceSha = typeof configuredSha === 'string' && /^[a-f0-9]{40}$/.test(configuredSha) ? configuredSha : undefined;
      const publishStep = (next: AccountProbeStep) => {
        step = next;
        console.info(`RRANKER_ACCOUNT_PROBE ${JSON.stringify({ ...command, sourceSha, status: 'running', step })}`);
      };
      try {
        command = accountProbeCommand(await Linking.getInitialURL());
        publishStep('source-identity');
        if (!sourceSha) throw new AccountProbeError('source-identity');
        await runAccountRecoveryProbe(command.stage, command.runId, publishStep);
        console.info(`RRANKER_ACCOUNT_PROBE ${JSON.stringify({ ...command, sourceSha, status: 'pass', step })}`);
        if (mounted) setStatus(`${command.stage}: pass`);
      } catch (error) {
        let cleaned = true;
        try { await clearAccountProbe(); } catch { cleaned = false; }
        console.info(`RRANKER_ACCOUNT_PROBE ${JSON.stringify({ ...command, sourceSha, status: 'fail', step,
          failureCode: accountProbeFailureCode(error), cleaned })}`);
        if (mounted) setStatus('fail');
      }
    })();
    return () => { mounted = false; };
  }, []);
  return <View style={{ padding: 32 }}><Text testID="native-account-recovery-status">{status}</Text></View>;
}

registerRootComponent(NativeAccountRecovery);
