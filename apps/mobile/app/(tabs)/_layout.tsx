import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';
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
        <Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          androidSrc={<VectorIcon family={Ionicons} name="home-outline" />}
        />
        <Label>总览</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="b50">
        <Icon
          sf={{ default: 'trophy', selected: 'trophy.fill' }}
          androidSrc={<VectorIcon family={Ionicons} name="trophy-outline" />}
        />
        <Label>最佳</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="records">
        <Icon sf="chart.bar.xaxis" androidSrc={<VectorIcon family={Ionicons} name="stats-chart-outline" />} />
        <Label>成绩</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <Icon sf="music.note.list" androidSrc={<VectorIcon family={Ionicons} name="musical-notes-outline" />} />
        <Label>曲库</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          androidSrc={<VectorIcon family={Ionicons} name="settings-outline" />}
        />
        <Label>设置</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
