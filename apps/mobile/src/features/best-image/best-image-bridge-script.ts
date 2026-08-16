/*
 * 最佳成绩图 WebView 桥接脚本共享模块。
 *
 * 舞萌（build-best-image-html.ts）与中二（build-chunithm-best-image-html.ts）
 * 的导出 HTML 内联了同构的桥接脚本：postToNative、runtime 消息广播、
 * measureAndFit（layoutChildren/contentHeight/logicalHeight/exportViewport/scale）、
 * schedule+pending、Resize/MutationObserver 注册、图片就绪 5000ms 竞速与
 * best-image-ready 防重发送。本模块以参数化模板产出这些脚本段，由各家
 * build-html 拼进自己的 HTML 模板。
 *
 * 硬约束：产出字符串与抽取前逐字节一致（金样测试 + 临时 dump 逐字节对比钉死）。
 * 各家差异一律走参数（layoutCall / exportViewportComment / assetReadyExpression），
 * 禁止在共享段里「顺手统一」任何行为或格式差异。
 *
 * Phigros 导出脚本为压缩风格且控制流结构性不同（无 schedule/pending、无
 * Resize/MutationObserver、无 readySent 防重、runtime 只发一次、height 每次
 * fit 无条件上报、就绪竞速 12000ms），不接入本模块，保留在
 * build-phigros-best-image-html.ts 内联。
 */

export type BestImageBridgeMeasureOptions = {
  /** measureAndFit 开头的页面布局调用（各家页面特有布局函数，带分号）。 */
  layoutCall: string;
  /** exportViewport 判定前的注释（舞萌两行导出注释，结尾带换行；中二没有）。 */
  exportViewportComment?: string;
};

export type BestImageBridgeReadyOptions = {
  /** 参与就绪竞速的资源 Promise 表达式（舞萌把 fontReady 一并计入）；缺省时内联 Promise.all(imageReady)。 */
  assetReadyExpression?: string;
};

/** postToNative 定义与 runtime 消息广播（含 250ms 重发）。 */
export function bestImageBridgeRuntimeScript(): string {
  return `      const postToNative = (message) => {
        const bridge = window.ReactNativeWebView;
        if (!bridge || typeof bridge.postMessage !== 'function') return false;
        bridge.postMessage(JSON.stringify(message));
        return true;
      };

      const runtimeMessage = {
        type: 'best-image-runtime',
        width: OUTPUT_WIDTH,
        userAgent: window.navigator && typeof window.navigator.userAgent === 'string'
          ? window.navigator.userAgent
          : '',
      };
      postToNative(runtimeMessage);
      window.setTimeout(() => postToNative(runtimeMessage), 250);`;
}

/** measureAndFit、schedule、Resize/MutationObserver 注册与 resize/load 监听。 */
export function bestImageBridgeMeasureScript(options: BestImageBridgeMeasureOptions): string {
  const comment = options.exportViewportComment ?? '';
  return `      const measureAndFit = () => {
        pending = false;
        ${options.layoutCall}
        const layoutChildren = Array.from(canvas.children).filter((child) => child.hasAttribute('data-layout-content'));
        const contentHeight = layoutChildren.reduce((maximum, child) => Math.max(maximum, child.offsetTop + child.scrollHeight), 0);
        const logicalHeight = Math.max(MINIMUM_HEIGHT, Math.ceil(contentHeight));
        const nextHeight = logicalHeight + 'px';
        if (canvas.style.height !== nextHeight) canvas.style.height = nextHeight;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || OUTPUT_WIDTH;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || MINIMUM_HEIGHT;
${comment}        const exportViewport = Math.abs(viewportWidth - OUTPUT_WIDTH) < 2
          && viewportHeight + 2 >= Math.min(logicalHeight, MINIMUM_HEIGHT);
        if (exportViewport) {
          canvas.style.left = '0px';
          canvas.style.top = '0px';
          canvas.style.transform = 'scale(1)';
        } else {
          const scale = Math.min(viewportWidth / OUTPUT_WIDTH, viewportHeight / logicalHeight);
          canvas.style.left = Math.max(0, (viewportWidth - OUTPUT_WIDTH * scale) / 2) + 'px';
          canvas.style.top = Math.max(0, (viewportHeight - logicalHeight * scale) / 2) + 'px';
          canvas.style.transform = 'scale(' + scale + ')';
        }

        if (logicalHeight !== lastHeight) {
          lastHeight = logicalHeight;
          postToNative({ type: 'best-image-height', width: OUTPUT_WIDTH, height: logicalHeight });
        }
      };
      const schedule = () => {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(measureAndFit);
      };
      let resizeObserver = null;
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(schedule);
        resizeObserver.observe(canvas);
        Array.from(canvas.children)
          .filter((child) => child.hasAttribute('data-layout-content'))
          .forEach((child) => resizeObserver.observe(child));
      }
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach((node) => {
          if (resizeObserver && node instanceof Element && node.hasAttribute('data-layout-content')) resizeObserver.observe(node);
        }));
        schedule();
      }).observe(canvas, { childList: true, subtree: true });
      window.addEventListener('resize', schedule);
      window.addEventListener('load', schedule);`;
}

/** 图片就绪收集、5000ms 超时竞速与 best-image-ready 消息（防重 + 250ms 重发）。 */
export function bestImageBridgeReadyScript(options: BestImageBridgeReadyOptions = {}): string {
  const assetReadyLine = options.assetReadyExpression
    ? `      const assetReady = ${options.assetReadyExpression};\n`
    : '';
  const raceAssetExpression = options.assetReadyExpression ? 'assetReady' : 'Promise.all(imageReady)';
  return `      const imageReady = Array.from(document.images).map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            const settle = () => {
              image.removeEventListener('load', settle);
              image.removeEventListener('error', settle);
              resolve();
            };
            image.addEventListener('load', settle);
            image.addEventListener('error', settle);
          }));
${assetReadyLine}      const assetTimeout = new Promise((resolve) => window.setTimeout(resolve, 5000));
      Promise.race([${raceAssetExpression}, assetTimeout]).then(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          measureAndFit();
          if (!readySent) {
            readySent = true;
            const readyMessage = { type: 'best-image-ready', width: OUTPUT_WIDTH, height: lastHeight || MINIMUM_HEIGHT };
            postToNative(readyMessage);
            window.setTimeout(() => postToNative(readyMessage), 250);
          }
        }));
      });`;
}
