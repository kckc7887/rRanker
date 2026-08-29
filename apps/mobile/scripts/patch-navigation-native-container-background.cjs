const fs = require('node:fs');
const path = require('node:path');

const SCREEN_STACK_VERSION = '4.16.0';
const NATIVE_STACK_VERSION = '7.17.10';

function withFileEol(text, eol) {
  return text.replaceAll('\n', eol);
}

function applyExactPatch(filePath, originalText, patchedText) {
  const source = fs.readFileSync(filePath, 'utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const original = withFileEol(originalText, eol);
  const patched = withFileEol(patchedText, eol);

  const patchedOccurrences = source.split(patched).length - 1;
  const sourceWithoutPatchedBlocks = source.split(patched).join('');
  const unpatchedOccurrences = sourceWithoutPatchedBlocks.split(original).length - 1;

  if (patchedOccurrences === 1 && unpatchedOccurrences === 0) {
    return 'already-applied';
  }

  if (patchedOccurrences !== 0 || unpatchedOccurrences !== 1) {
    throw new Error(
      `Navigation background patch expected exactly one unpatched source anchor or one patched block in ${filePath}; found ${unpatchedOccurrences} unpatched source anchors and ${patchedOccurrences} patched blocks.`,
    );
  }

  fs.writeFileSync(filePath, source.replace(original, patched));
  return 'applied';
}

function assertPackageVersion(packageRoot, expectedVersion) {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `Unsupported ${packageJson.name} version ${packageJson.version}; expected ${expectedVersion}. Review the native navigation background patch before upgrading.`,
    );
  }
}

function packageRoot(packageName) {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

function applyNavigationBackgroundPatch() {
  const screensRoot = packageRoot('react-native-screens');
  const nativeStackRoot = packageRoot('@react-navigation/native-stack');

  assertPackageVersion(screensRoot, SCREEN_STACK_VERSION);
  assertPackageVersion(nativeStackRoot, NATIVE_STACK_VERSION);

  const patches = [
    {
      file: path.join(screensRoot, 'src/types.tsx'),
      original: `export interface ScreenStackProps extends ViewProps, GestureProps {
  children?: React.ReactNode;
  /**
   * A callback that gets called when the current screen finishes its transition.
   */
  onFinishTransitioning?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
  ref?: React.MutableRefObject<React.Ref<View>>;
}`,
      patched: `export type ScreenStackNativeContainerStyleProps = {
  backgroundColor?: ColorValue;
};

export interface ScreenStackProps extends ViewProps, GestureProps {
  children?: React.ReactNode;
  /**
   * A callback that gets called when the current screen finishes its transition.
   */
  onFinishTransitioning?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
  ref?: React.MutableRefObject<React.Ref<View>>;
  nativeContainerStyle?: ScreenStackNativeContainerStyleProps;
}`,
    },
    {
      file: path.join(screensRoot, 'src/components/ScreenStack.tsx'),
      original: `    transitionAnimation,
    screenEdgeGesture,
    onFinishTransitioning,`,
      patched: `    transitionAnimation,
    screenEdgeGesture,
    nativeContainerStyle,
    onFinishTransitioning,`,
    },
    {
      file: path.join(screensRoot, 'src/components/ScreenStack.tsx'),
      original: `        <ScreenStackNativeComponent
          {...rest}
          /**`,
      patched: `        <ScreenStackNativeComponent
          {...rest}
          nativeContainerBackgroundColor={nativeContainerStyle?.backgroundColor}
          /**`,
    },
    {
      file: path.join(screensRoot, 'src/fabric/ScreenStackNativeComponent.ts'),
      original: `import type { ViewProps } from 'react-native';`,
      patched: `import type { ColorValue, ViewProps } from 'react-native';`,
    },
    {
      file: path.join(screensRoot, 'src/fabric/ScreenStackNativeComponent.ts'),
      original: `export interface NativeProps extends ViewProps {
  onFinishTransitioning?: DirectEventHandler<FinishTransitioningEvent>;
}`,
      patched: `export interface NativeProps extends ViewProps {
  nativeContainerBackgroundColor?: ColorValue;
  onFinishTransitioning?: DirectEventHandler<FinishTransitioningEvent>;
}`,
    },
    {
      file: path.join(screensRoot, 'ios/RNSScreenStack.h'),
      original: `@property (nonatomic, readonly, nonnull) NSArray<NSString *> *screenIds;

@end`,
      patched: `@property (nonatomic, readonly, nonnull) NSArray<NSString *> *screenIds;
@property (nonatomic, strong, readonly, nullable) UIColor *nativeContainerBackgroundColor;

@end`,
    },
    {
      file: path.join(screensRoot, 'ios/RNSScreenStack.mm'),
      original: `#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTFabricComponentsPlugins.h>`,
      patched: `#ifdef RCT_NEW_ARCH_ENABLED
#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>`,
    },
    {
      file: path.join(screensRoot, 'ios/RNSScreenStack.mm'),
      original: `  _controller = [RNSNavigationController new];
  _controller.delegate = self;
#if !TARGET_OS_TV && !TARGET_OS_VISION`,
      patched: `  _controller = [RNSNavigationController new];
  _controller.delegate = self;
  _nativeContainerBackgroundColor = nil;
#if !TARGET_OS_TV && !TARGET_OS_VISION`,
    },
    {
      file: path.join(screensRoot, 'ios/RNSScreenStack.mm'),
      original: `#ifdef RCT_NEW_ARCH_ENABLED
#pragma mark - Fabric specific

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index`,
      patched: `#ifdef RCT_NEW_ARCH_ENABLED
#pragma mark - Fabric specific

- (void)updateProps:(const facebook::react::Props::Shared &)props
           oldProps:(const facebook::react::Props::Shared &)oldProps
{
  const auto &oldScreenProps = *std::static_pointer_cast<const react::RNSScreenStackProps>(_props);
  const auto &newScreenProps = *std::static_pointer_cast<const react::RNSScreenStackProps>(props);

  if (newScreenProps.nativeContainerBackgroundColor != oldScreenProps.nativeContainerBackgroundColor) {
    _nativeContainerBackgroundColor = RCTUIColorFromSharedColor(newScreenProps.nativeContainerBackgroundColor);
    _controller.view.backgroundColor = _nativeContainerBackgroundColor;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index`,
    },
    {
      file: path.join(
        screensRoot,
        'android/src/main/java/com/swmansion/rnscreens/ScreenStackViewManager.kt',
      ),
      original: `    companion object {
        const val REACT_CLASS = "RNSScreenStack"
    }`,
      patched: `    // Codegen requires this iOS-only property to have an Android setter.
    override fun setNativeContainerBackgroundColor(
        view: ScreenStack,
        value: Int?,
    ) = Unit

    companion object {
        const val REACT_CLASS = "RNSScreenStack"
    }`,
    },
    {
      file: path.join(screensRoot, 'lib/typescript/types.d.ts'),
      original: `export interface ScreenStackProps extends ViewProps, GestureProps {
    children?: React.ReactNode;
    /**
     * A callback that gets called when the current screen finishes its transition.
     */
    onFinishTransitioning?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
    ref?: React.MutableRefObject<React.Ref<View>>;
}`,
      patched: `export type ScreenStackNativeContainerStyleProps = {
    backgroundColor?: ColorValue;
};
export interface ScreenStackProps extends ViewProps, GestureProps {
    children?: React.ReactNode;
    /**
     * A callback that gets called when the current screen finishes its transition.
     */
    onFinishTransitioning?: (e: NativeSyntheticEvent<TargetedEvent>) => void;
    ref?: React.MutableRefObject<React.Ref<View>>;
    nativeContainerStyle?: ScreenStackNativeContainerStyleProps;
}`,
    },
    ...['lib/module/components/ScreenStack.js', 'lib/commonjs/components/ScreenStack.js'].flatMap(
      (relativePath) => [
        {
          file: path.join(screensRoot, relativePath),
          original: `    transitionAnimation,
    screenEdgeGesture,
    onFinishTransitioning,`,
          patched: `    transitionAnimation,
    screenEdgeGesture,
    nativeContainerStyle,
    onFinishTransitioning,`,
        },
        {
          file: path.join(screensRoot, relativePath),
          original: `_extends({}, rest, {
    /**`,
          patched: `_extends({}, rest, {
    nativeContainerBackgroundColor: nativeContainerStyle?.backgroundColor,
    /**`,
        },
      ],
    ),
    {
      file: path.join(nativeStackRoot, 'src/views/NativeStackView.native.tsx'),
      original: `}: Props) {
  const { setNextDismissedKey } = useDismissedRouteError(state);`,
      patched: `}: Props) {
  const { colors } = useTheme();
  const { setNextDismissedKey } = useDismissedRouteError(state);`,
    },
    {
      file: path.join(nativeStackRoot, 'src/views/NativeStackView.native.tsx'),
      original: `      <ScreenStack style={styles.container}>`,
      patched: `      <ScreenStack
        nativeContainerStyle={{ backgroundColor: colors.background }}
        style={styles.container}
      >`,
    },
    {
      file: path.join(nativeStackRoot, 'lib/module/views/NativeStackView.native.js'),
      original: `}) {
  const {
    setNextDismissedKey
  } = useDismissedRouteError(state);`,
      patched: `}) {
  const {
    colors
  } = useTheme();
  const {
    setNextDismissedKey
  } = useDismissedRouteError(state);`,
    },
    {
      file: path.join(nativeStackRoot, 'lib/module/views/NativeStackView.native.js'),
      original: `    children: /*#__PURE__*/_jsx(ScreenStack, {
      style: styles.container,`,
      patched: `    children: /*#__PURE__*/_jsx(ScreenStack, {
      nativeContainerStyle: {
        backgroundColor: colors.background
      },
      style: styles.container,`,
    },
  ];

  const results = patches.map(({ file, original, patched }) => ({
    file,
    status: applyExactPatch(file, original, patched),
  }));

  return {
    screensRoot,
    nativeStackRoot,
    results,
  };
}

if (require.main === module) {
  const result = applyNavigationBackgroundPatch();
  const applied = result.results.filter(({ status }) => status === 'applied').length;
  console.log(
    applied === 0
      ? 'Native navigation container background patch already applied'
      : `Applied native navigation container background patch (${applied} changes)`,
  );
}

module.exports = {
  NATIVE_STACK_VERSION,
  SCREEN_STACK_VERSION,
  applyExactPatch,
  applyNavigationBackgroundPatch,
  assertPackageVersion,
};
