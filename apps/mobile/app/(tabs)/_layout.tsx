import Ionicons from '@expo/vector-icons/Ionicons';
import { Icon, Label, NativeTabs, VectorIcon } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  return (
    <NativeTabs
      backgroundColor="#FFFFFF"
      backBehavior="history"
      blurEffect="systemMaterial"
      disableTransparentOnScrollEdge
      labelVisibilityMode="labeled"
      minimizeBehavior="never"
      tintColor="#246BFD"
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
        <Icon sf="list.bullet" androidSrc={<VectorIcon family={Ionicons} name="list-outline" />} />
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
