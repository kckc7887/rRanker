export type BestImageBridgeMeasureOptions = {

  layoutCall: string;
};

export type BestImageBridgeReadyOptions = {

  assetReadyExpression?: string;
};

export function bestImageAssetsReadyScript(): string {
  return `(() => {
    const decodeImage = async image => {
      if (!image.naturalWidth) throw new Error('图片资源加载失败');
      if (typeof image.decode === 'function') await image.decode();
    };
    const waitImage = async image => {
      if (!image.complete) await new Promise((resolve, reject) => {
        const cleanup = () => {
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
        };
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('图片资源加载失败')); };
        image.addEventListener('load', loaded);
        image.addEventListener('error', failed);
      });
      await decodeImage(image);
    };
    const images = Array.from(document.images).filter(image => image.currentSrc || image.getAttribute('src'));
    const anchor = document.createElement('a');
    const absoluteUrl = path => { anchor.href = path; return anchor.href; };
    const present = new Set(images.map(image => absoluteUrl(image.currentSrc || image.src)));
    const urls = new Set();
    const addUrl = path => {
      if (!path) return;
      const url = absoluteUrl(path);
      if (url.includes('#') && url.split('#')[0] === absoluteUrl(document.baseURI).split('#')[0]) return;
      if (!present.has(url)) urls.add(url);
    };
    document.querySelectorAll('svg image, svg use').forEach(node => addUrl(node.getAttribute('href') || node.getAttribute('xlink:href')));
    const addStyle = style => {
      for (const value of [style.backgroundImage, style.borderImageSource, style.maskImage, style.webkitMaskImage, style.content]) {
        for (const match of (value || '').matchAll(/url\\(\\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\\s*\\)/giu)) {
          const path = match[1] || match[2] || match[3];
          addUrl(path);
        }
      }
    };
    document.querySelectorAll('*').forEach(node => {
      addStyle(getComputedStyle(node));
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(node, pseudo);
        if (style.content && style.content !== 'none' && style.content !== 'normal') addStyle(style);
      }
    });
    const tasks = [
      document.fonts ? document.fonts.ready : Promise.resolve(),
      ...images.map(waitImage),
      ...Array.from(urls, url => { const image = new Image(); image.src = url; return waitImage(image); }),
    ];
    let completed = 0;
    return Promise.all(tasks.map(task => task.then(() => {
      completed += 1;
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'best-image-progress', width: OUTPUT_WIDTH, value: completed / tasks.length }));
    })));
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
        if (assetsReady) window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          if (!pending) postToNative({ type: 'best-image-ready', width: OUTPUT_WIDTH, height: lastHeight || MINIMUM_HEIGHT });
        }));
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
  const readyExpression = options.assetReadyExpression ? 'assetReady' : 'Promise.all(imageReady)';
  return `      const imageReady = [${bestImageAssetsReadyScript()}];
${assetReadyLine}      ${readyExpression}.then(() => {
        assetsReady = true;
        schedule();
      }).catch(() => postToNative({ type: 'best-image-error', width: OUTPUT_WIDTH, message: '图片资源加载失败，请重试。' }));`;
}
