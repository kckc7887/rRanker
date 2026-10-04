import { type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { GestureHandlerRootView, Pressable as GesturePressable } from 'react-native-gesture-handler';

/** iOS Fabric 滚动区使用原生手势识别器，并需 GestureHandlerRootView 包裹。 */
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
