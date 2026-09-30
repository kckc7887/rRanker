import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { accountProbeCommand, clearAccountProbe, runAccountRecoveryProbe } from './tests/native/account-recovery-probe';

function NativeAccountRecovery() {
  const [status, setStatus] = useState('running');
  useEffect(() => {
    let mounted = true;
    void (async () => {
      let command: ReturnType<typeof accountProbeCommand> | undefined;
      const sourceSha: unknown = Constants.expoConfig?.extra?.buildCommit;
      try {
        command = accountProbeCommand(await Linking.getInitialURL());
        if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Invalid account probe source');
        await runAccountRecoveryProbe(command.stage, command.runId);
        console.info(`RRANKER_ACCOUNT_PROBE ${JSON.stringify({ ...command, sourceSha, status: 'pass' })}`);
        if (mounted) setStatus(`${command.stage}: pass`);
      } catch {
        let cleaned = true;
        try { await clearAccountProbe(); } catch { cleaned = false; }
        console.info(`RRANKER_ACCOUNT_PROBE ${JSON.stringify({ ...command, status: 'fail', cleaned })}`);
        if (mounted) setStatus('fail');
      }
    })();
    return () => { mounted = false; };
  }, []);
  return <View style={{ padding: 32 }}><Text testID="native-account-recovery-status">{status}</Text></View>;
}

registerRootComponent(NativeAccountRecovery);
