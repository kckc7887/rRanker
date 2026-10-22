const fs = require('node:fs');
const path = require('node:path');

const root = path.dirname(require.resolve('react-native-view-shot/package.json'));

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('react-native-view-shot 源码锚点已变化');
  return source.replace(before, after);
}

function patchIos(source) {
  if (source.includes('static WKWebView *RNViewShotFindWebView(')) return source;
  source = replaceOnce(source, '#import <AVFoundation/AVFoundation.h>', '#import <AVFoundation/AVFoundation.h>\n#import <WebKit/WebKit.h>');
  source = replaceOnce(source, '@implementation RNViewShot', `static WKWebView *RNViewShotFindWebView(UIView *view)
{
  if ([view isKindOfClass:[WKWebView class]]) return (WKWebView *)view;
  for (UIView *child in view.subviews) {
    WKWebView *webView = RNViewShotFindWebView(child);
    if (webView) return webView;
  }
  return nil;
}

@implementation RNViewShot`);
  const outputStart = source.indexOf('    if (!image) {');
  const outputEnd = source.indexOf('  }];', outputStart);
  if (outputStart < 0 || outputEnd < outputStart) throw new Error('找不到 react-native-view-shot 图片输出入口');
  const output = source.slice(outputStart, outputEnd).trimEnd();
  source = source.slice(0, outputStart) + '    saveImage(image);\n' + source.slice(outputEnd);
  return replaceOnce(source, '    CGPoint savedContentOffset;', `    void (^saveImage)(UIImage *) = ^(UIImage *image) {
${output.split('\n').map(line => '  ' + line).join('\n')}
    };

    WKWebView *webView = RNViewShotFindWebView(view);
    if (webView && !snapshotContentContainer) {
      WKSnapshotConfiguration *configuration = [WKSnapshotConfiguration new];
      configuration.afterScreenUpdates = YES;
      configuration.rect = webView.bounds;
      configuration.snapshotWidth = @(size.width);
      [webView takeSnapshotWithConfiguration:configuration completionHandler:^(UIImage *image, NSError *error) {
        if (error) reject(RCTErrorUnspecified, error.localizedDescription, error);
        else saveImage(image);
      }];
      return;
    }

    CGPoint savedContentOffset;`);
}

function patchAndroid(source) {
  if (source.includes('private static void waitForWebView(')) return source;
  source = replaceOnce(source, 'import android.widget.ScrollView;', 'import android.widget.ScrollView;\nimport android.webkit.WebView;');
  source = replaceOnce(source, '                    final ReusableByteArrayOutputStream stream = new ReusableByteArrayOutputStream(outputBuffer);',
    '                    waitForWebView(view);\n                    final ReusableByteArrayOutputStream stream = new ReusableByteArrayOutputStream(outputBuffer);');
  return replaceOnce(source, '    private void saveToTempFileOnDevice(@NonNull final View view) throws IOException {', `    private static WebView findWebView(@NonNull final View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            final ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                final WebView webView = findWebView(group.getChildAt(index));
                if (webView != null) return webView;
            }
        }
        return null;
    }

    private static void waitForWebView(@NonNull final View view) {
        final CountDownLatch ready = new CountDownLatch(1);
        runOnUiThreadBlocking(new CancellableUiTask() {
            @Override
            public void run(@NonNull AtomicBoolean cancelled) {
                if (cancelled.get()) return;
                final WebView webView = findWebView(view);
                if (webView == null) {
                    ready.countDown();
                    return;
                }
                webView.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        ready.countDown();
                    }
                });
            }
        }, new AtomicBoolean(false));
        try {
            if (!ready.await(UI_THREAD_BLOCK_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new UiThreadBlockTimeoutException("Timed out waiting for WebView visual state");
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while waiting for WebView visual state", error);
        }
    }

    private void saveToTempFileOnDevice(@NonNull final View view) throws IOException {`);
}

const iosPath = path.join(root, 'ios/RNViewShot.mm');
const androidPath = path.join(root, 'android/src/main/java/fr/greweb/reactnativeviewshot/ViewShot.java');
const ios = fs.readFileSync(iosPath, 'utf8').replace(/\r\n/gu, '\n');
const android = fs.readFileSync(androidPath, 'utf8').replace(/\r\n/gu, '\n');
const nextIos = patchIos(ios);
const nextAndroid = patchAndroid(android);
if (nextIos !== ios) fs.writeFileSync(iosPath, nextIos);
if (nextAndroid !== android) fs.writeFileSync(androidPath, nextAndroid);
console.log(nextIos === ios && nextAndroid === android
  ? 'react-native-view-shot WebView patch already applied'
  : 'Applied react-native-view-shot WebView patch');
