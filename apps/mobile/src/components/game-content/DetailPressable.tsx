import { type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { GestureHandlerRootView, Pressable as GesturePressable } from 'react-native-gesture-handler';

/**
 * 滚动区按压公共路径（AGENTS.md iOS 滚动区按压规范）：
 * Android 使用 RN 原生 Pressable；iOS 使用 gesture-handler Pressable（原生手势识别器，
 * 规避 Fabric 下滚动区内原生 Pressable 收不到完整触摸事件的问题）。
 * DetailGestureRoot 同理：iOS 需位于 GestureHandlerRootView 内（难度轮播自带手势根，
 * 轮播之外的滚动区块使用本组件局部包根），Android 使用普通 View。
 */
export function DetailPressable(props: ComponentProps<typeof Pressable>) {
  return Platform.OS === 'android'
    ? <Pressable {...props} />
    : <GesturePressable {...props as ComponentProps<typeof GesturePressable>} />;
}

export function DetailGestureRoot({ children, style }: {
  children: ReactNode; style?: ComponentProps<typeof View>['style'];
}) {
  return Platform.OS === 'android'
    ? <View style={style}>{children}</View>
    : <GestureHandlerRootView style={style}>{children}</GestureHandlerRootView>;
}
