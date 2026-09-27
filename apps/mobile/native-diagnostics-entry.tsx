import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { runNativeStorageProbe, type NativeProbeResult } from './src/services/native-storage-probe';

function NativeDiagnostics() {
  const [results, setResults] = useState<NativeProbeResult[]>([]);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let mounted = true;
    void runNativeStorageProbe(result => {
      console.info(`RRANKER_NATIVE_PROBE ${JSON.stringify(result)}`);
      if (mounted) setResults(previous => [...previous, result]);
    }).finally(() => { if (mounted) setComplete(true); });
    return () => { mounted = false; };
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 56 }}>
    <Text>rRanker native diagnostics</Text>
    <Text>{Constants.expoConfig?.extra?.buildCommit}</Text>
    <Text>{Constants.expoConfig?.extra?.androidOptimizationMode}</Text>
    {results.map(result => <Text key={result.name} testID={`native-probe-${result.name}`}>
      {result.name}: {result.status}{'\n'}{result.detail}{'\n'}
    </Text>)}
    <Text testID="native-probe-complete">{complete ? 'complete' : 'running'}</Text>
  </ScrollView>;
}

registerRootComponent(NativeDiagnostics);
