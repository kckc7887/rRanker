export type BestImageBridgeMeasureOptions = {

  layoutCall: string;
};

export type BestImageBridgeReadyOptions = {

  assetReadyExpression?: string;
  waitForAssets?: boolean;
};

export function bestImageAssetsReadyScript(): string {
  return `(() => {
    const decodeImage = image => typeof image.decode === 'function'
      ? image.decode().catch(() => undefined) : Promise.resolve();
    const waitImage = image => image.complete ? decodeImage(image) : new Promise(resolve => {
      const settle = () => {
        image.removeEventListener('load', settle);
        image.removeEventListener('error', settle);
        decodeImage(image).then(resolve);
      };
      image.addEventListener('load', settle);
      image.addEventListener('error', settle);
    });
    const images = Array.from(document.images);
    const anchor = document.createElement('a');
    const absoluteUrl = path => { anchor.href = path; return anchor.href; };
    const present = new Set(images.map(image => absoluteUrl(image.currentSrc || image.src)));
    const urls = new Set();
    const addUrl = path => {
      if (!path) return;
      const url = absoluteUrl(path);
      if (!present.has(url)) urls.add(url);
    };
    document.querySelectorAll('svg image').forEach(node => addUrl(node.getAttribute('href') || node.getAttribute('xlink:href')));
    document.querySelectorAll('*').forEach(node => {
      const style = getComputedStyle(node);
      for (const value of [style.backgroundImage, style.borderImageSource, style.maskImage, style.webkitMaskImage, style.content]) {
        for (const match of (value || '').matchAll(/url\\(\\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\\s*\\)/giu)) {
          const path = match[1] || match[2] || match[3];
          if (/\\.(?:svg|png|webp)(?:[?#]|$)/iu.test(path)) addUrl(path);
        }
      }
    });
    return Promise.all([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      ...images.map(waitImage),
      ...Array.from(urls, url => { const image = new Image(); image.src = url; return waitImage(image); }),
    ]);
  })()`;
}

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

export function bestImageBridgeMeasureScript(options: BestImageBridgeMeasureOptions): string {
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
        const exportViewport = Math.abs(viewportWidth - OUTPUT_WIDTH) < 2
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

export function bestImageBridgeReadyScript(options: BestImageBridgeReadyOptions = {}): string {
  const assetReadyLine = options.assetReadyExpression
    ? `      const assetReady = ${options.assetReadyExpression};\n`
    : '';
  const raceAssetExpression = options.assetReadyExpression ? 'assetReady' : 'Promise.all(imageReady)';
  return `      const imageReady = ${options.waitForAssets ? `[${bestImageAssetsReadyScript()}];` : `Array.from(document.images).map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            const settle = () => {
              image.removeEventListener('load', settle);
              image.removeEventListener('error', settle);
              resolve();
            };
            image.addEventListener('load', settle);
            image.addEventListener('error', settle);
          }));`}
${assetReadyLine}      ${options.waitForAssets ? '' : 'const assetTimeout = new Promise((resolve) => window.setTimeout(resolve, 5000));'}
      ${options.waitForAssets ? raceAssetExpression : `Promise.race([${raceAssetExpression}, assetTimeout])`}.then(() => {
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
