import { useState, type ReactElement } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useFlowingProgress } from './use-flowing-progress';

/** 渐变色组（expo-linear-gradient colors 原样形态） */
type GradientColors = readonly [string, string, ...string[]];
type GradientLocations = readonly [number, number, ...number[]];

/** 五处挂法的渐变方向一致（左→右），作为骨架固定值 */
const HORIZONTAL_START: { x: number; y: number } = { x: 0, y: 0.5 };
const HORIZONTAL_END: { x: number; y: number } = { x: 1, y: 0.5 };

/** 宽度相关渲染状态：依赖内容/轨道宽度的样式经函数形态取值 */
export interface FlowingGradientState {
  /** 内容宽度（实测值或初始值，下限 1） */
  width: number;
  /** 流光轨道宽度 = width × trackMultiplier */
  trackWidth: number;
}

type StateStyle = StyleProp<ViewStyle> | ((state: FlowingGradientState) => StyleProp<ViewStyle>);

function resolveStateStyle(
  style: StateStyle | undefined,
  state: FlowingGradientState,
): StyleProp<ViewStyle> | undefined {
  if (style == null || typeof style !== 'function') return style;
  return style(state);
}

/**
 * 流光轨道：useFlowingProgress 驱动 translateX 扫过 MaskedView。
 * 独立成子组件，静态挂法（flowing=false）不触碰流光 Hook 与页签活跃订阅。
 */
function FlowingGradientTrack({
  duration,
  state,
  alignTrackToContent,
  trackStyle,
  trackHeight,
  trackWrapStyle,
  colors,
  locations,
  gradientStyle,
  gradientTestID,
}: {
  duration: number;
  state: FlowingGradientState;
  /** 轨道右缘贴内容右缘起步（Phigros 的 -trackWidth+width 挂法） */
  alignTrackToContent: boolean;
  /** 轨道定位样式（flowTrack） */
  trackStyle?: StyleProp<ViewStyle>;
  /** 轨道显式高度（Phigros 传 lineHeight；其余靠 top/bottom 拉伸） */
  trackHeight?: number;
  /** 轨道外包裹层样式（Phigros 的内容盒尺寸 View） */
  trackWrapStyle?: StateStyle;
  colors: GradientColors;
  locations?: GradientLocations;
  gradientStyle?: StateStyle;
  gradientTestID?: string;
}) {
  const progress = useFlowingProgress(true, duration);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [alignTrackToContent ? -state.trackWidth + state.width : -state.width, 0],
  });
  const track = (
    <Animated.View
      style={[
        trackStyle,
        {
          width: state.trackWidth,
          ...(trackHeight != null && { height: trackHeight }),
          transform: [{ translateX }],
        },
      ]}
    >
      <LinearGradient
        colors={colors}
        end={HORIZONTAL_END}
        {...(locations ? { locations } : {})}
        start={HORIZONTAL_START}
        style={resolveStateStyle(gradientStyle, state)}
        testID={gradientTestID}
      />
    </Animated.View>
  );
  const wrapStyle = resolveStateStyle(trackWrapStyle, state);
  return wrapStyle == null ? track : <View style={wrapStyle}>{track}</View>;
}

/**
 * MaskedView 流光渐变文本公共骨架（ChunithmGradientScore / GradientAchievement /
 * PhigrosScoreValue→FlowingGradientText / MuseDashAccValue / DxRatingCard→RatingValue）。
 * 各游戏渐变色组、轨道倍数、字号字重、周期与挂法差异经 props 原值传入，不做统一。
 */
export function FlowingGradientValue({
  maskElement,
  maskStyle,
  testID,
  accessibilityLabel,
  accessible,
  androidRenderingMode,
  pointerEvents,
  measure = 'none',
  initialWidth = 0,
  measureWrapStyle,
  measureTextStyle,
  text,
  flowing = false,
  duration,
  trackMultiplier = 2,
  alignTrackToContent = false,
  trackStyle,
  trackHeight,
  trackWrapStyle,
  staticColors,
  staticLocations,
  staticStyle,
  staticTestID,
  flowingColors,
  flowingLocations,
  flowingStyle,
  flowingTestID,
}: {
  /** 遮罩元素：调用方构造，保持各游戏原有遮罩树形 */
  maskElement: ReactElement;
  /** MaskedView 样式；依赖内容宽度的挂法（Phigros）传函数 */
  maskStyle: StateStyle;
  testID?: string;
  accessibilityLabel?: string;
  /** 作为可聚焦节点暴露（maimai/Phigros 挂法） */
  accessible?: boolean;
  /** DxRatingCard 描边遮罩的软件渲染需求，原值透传 */
  androidRenderingMode?: 'software' | 'hardware';
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  /** 宽度测量挂法：mask-layout=MaskedView onLayout（中二/maimai）；hidden-text=隐形测量文本（Phigros）；none=静态不测 */
  measure?: 'mask-layout' | 'hidden-text' | 'none';
  /** 内容宽度初值（各游戏原值：中二 180、maimai 170/260、Phigros 120） */
  initialWidth?: number;
  /** hidden-text 挂法的外层容器样式（Phigros scoreMeasureWrap） */
  measureWrapStyle?: StyleProp<ViewStyle>;
  /** hidden-text 挂法的测量文本样式（含各游戏字号字重） */
  measureTextStyle?: StyleProp<TextStyle>;
  /** hidden-text 挂法的测量文本内容 */
  text?: string;
  /** 流光开关：false 时只渲染静态渐变 */
  flowing?: boolean;
  /** 流光周期（ms） */
  duration?: number;
  /** 流光轨道宽度 = 内容宽度 × 倍数（中二/maimai ×2、Phigros ×3） */
  trackMultiplier?: number;
  /** 轨道右缘贴内容右缘起步（Phigros 挂法） */
  alignTrackToContent?: boolean;
  /** 轨道定位样式（flowTrack） */
  trackStyle?: StyleProp<ViewStyle>;
  /** 轨道显式高度（Phigros 传 lineHeight；其余靠 top/bottom 拉伸） */
  trackHeight?: number;
  /** 轨道外包裹层样式（Phigros 的内容盒尺寸 View） */
  trackWrapStyle?: StateStyle;
  /** 静态渐变色组（flowing=false 时渲染） */
  staticColors?: GradientColors;
  staticLocations?: GradientLocations;
  staticStyle?: StyleProp<ViewStyle>;
  staticTestID?: string;
  /** 流光渐变色组（flowing=true 时渲染于轨道内） */
  flowingColors?: GradientColors;
  flowingLocations?: GradientLocations;
  flowingStyle?: StateStyle;
  flowingTestID?: string;
}) {
  const [width, setWidth] = useState(initialWidth);
  const measured = Math.max(width, 1);
  const state: FlowingGradientState = { width: measured, trackWidth: measured * trackMultiplier };

  const handleMaskLayout = measure === 'mask-layout'
    ? (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)
    : undefined;
  const handleTextLayout = (event: LayoutChangeEvent) => {
    // Phigros 挂法：向上取整去重，忽略 0 宽抖动
    const next = Math.ceil(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };

  const masked = (
    <MaskedView
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      androidRenderingMode={androidRenderingMode}
      maskElement={maskElement}
      onLayout={handleMaskLayout}
      pointerEvents={pointerEvents}
      style={resolveStateStyle(maskStyle, state)}
      testID={testID}
    >
      {flowing && flowingColors ? (
        <FlowingGradientTrack
          alignTrackToContent={alignTrackToContent}
          colors={flowingColors}
          duration={duration ?? 0}
          gradientStyle={flowingStyle}
          gradientTestID={flowingTestID}
          locations={flowingLocations}
          state={state}
          trackHeight={trackHeight}
          trackStyle={trackStyle}
          trackWrapStyle={trackWrapStyle}
        />
      ) : staticColors ? (
        <LinearGradient
          colors={staticColors}
          end={HORIZONTAL_END}
          {...(staticLocations ? { locations: staticLocations } : {})}
          start={HORIZONTAL_START}
          style={staticStyle}
          testID={staticTestID}
        />
      ) : null}
    </MaskedView>
  );

  if (measure === 'hidden-text') {
    return (
      <View style={measureWrapStyle}>
        <Text onLayout={handleTextLayout} pointerEvents="none" style={measureTextStyle}>{text}</Text>
        {masked}
      </View>
    );
  }
  return masked;
}
