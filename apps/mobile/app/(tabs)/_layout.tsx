import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useAppTheme } from '@/theme/app-theme';

export default function TabLayout() {
  const theme = useAppTheme();
  return (
    <NativeTabs
      // Opaque solid bar only — any material/blur at the scroll edge blends into
      // page content and reads as an abnormally tall iOS tab bar again.
      backgroundColor={theme.surface}
      blurEffect="none"
      backBehavior="history"
      disableTransparentOnScrollEdge
      labelVisibilityMode="labeled"
      minimizeBehavior="never"
      tintColor={theme.accent}
    >
      <NativeTabs.Trigger name="(overview)">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home-outline" />}
        />
        <NativeTabs.Trigger.Label>总览</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="b50">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'trophy', selected: 'trophy.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="trophy-outline" />}
        />
        <NativeTabs.Trigger.Label>最佳</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="records">
        <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="stats-chart-outline" />} />
        <NativeTabs.Trigger.Label>成绩</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Icon sf="music.note.list" src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="musical-notes-outline" />} />
        <NativeTabs.Trigger.Label>曲库</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="settings-outline" />}
        />
        <NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
