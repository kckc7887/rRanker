import type { ReactNode } from 'react';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { type StyleProp, type TextStyle, type ViewStyle, Text, View } from 'react-native';

/**
 * 歌曲详情页 Hero 骨架：方形封面（或 ♪ 占位符）+ 底部渐变 + 左下角文案区。
 * 组件只负责结构；封面降级链、占位符底色与字号、渐变颜色/范围、文案行的滚屏与截断策略
 * 都是游戏视觉差异，全部通过 props 原样传入，不在公共层统一任何主题值。
 */
export function SongDetailHero({
  size,
  style,
  cover,
  placeholderStyle,
  placeholderNoteStyle,
  shadeColors,
  shadeStyle,
  copyStyle,
  children,
}: {
  /** 方形封面边长（宽 = 高） */
  size: number;
  /** hero 容器样式（底色、overflow 等），组件内部按原顺序追加 { width, height } */
  style: StyleProp<ViewStyle>;
  /** 封面节点（通常是 expo-image 的 Image，含各自的 a11y 标签与降级 state）；不传时渲染 ♪ 占位符 */
  cover?: ReactNode;
  /** 占位符容器样式（含各家底色来源） */
  placeholderStyle: StyleProp<ViewStyle>;
  /** 占位符音符文字样式。 */
  placeholderNoteStyle: StyleProp<TextStyle>;
  /** 底部渐变颜色（各家遮罩浓度不同） */
  shadeColors: LinearGradientProps['colors'];
  /** 渐变样式（整幅 absoluteFill 或仅底部 48% 等布局差异） */
  shadeStyle: StyleProp<ViewStyle>;
  /** 左下角文案容器样式。 */
  copyStyle: StyleProp<ViewStyle>;
  /** 文案内容插槽（编号/标题/艺术家等行，滚屏与 numberOfLines 策略由调用方决定） */
  children?: ReactNode;
}) {
  return (
    <View style={[style, { width: size, height: size }]}>
      {cover ?? (
        <View style={placeholderStyle}>
          <Text style={placeholderNoteStyle}>♪</Text>
        </View>
      )}
      <LinearGradient
        colors={shadeColors}
        locations={[0, 1]}
        pointerEvents="none"
        style={shadeStyle}
      />
      <View style={copyStyle}>{children}</View>
    </View>
  );
}
