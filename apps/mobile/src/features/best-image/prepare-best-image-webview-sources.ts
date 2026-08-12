import { Directory, File, Paths } from 'expo-file-system';

export type BestImageWebViewSource = { html: string; baseUrl: string } | { uri: string };

export type PreparedBestImageWebViewSources = {
  sources: BestImageWebViewSource[];
  dispose: () => void;
};

let sourceBatch = 0;

/** Documents/rranker/best-image-pages —— 固定成绩图本地 HTML 舞台（对齐 Phigros 字体舞台）。 */
export function bestImagePagesDirectory(): Directory {
  const directory = new Directory(Paths.document, 'rranker', 'best-image-pages');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function inlineBestImageWebViewSources(htmlPages: readonly string[]): BestImageWebViewSource[] {
  return htmlPages.map((html) => ({ html, baseUrl: 'https://assets2.lxns.net/' }));
}

export function prepareBestImageWebViewSources(
  htmlPages: readonly string[],
  directory: Directory = Paths.cache,
): PreparedBestImageWebViewSources {
  sourceBatch += 1;
  const files: File[] = [];
  try {
    const sources = htmlPages.map((html, index) => {
      const file = new File(directory, `rranker-best-image-${sourceBatch}-${index}.html`);
      file.create({ overwrite: true });
      file.write(html);
      files.push(file);
      return { uri: file.uri };
    });
    return {
      sources,
      dispose: () => files.forEach((file) => { if (file.exists) file.delete(); }),
    };
  } catch (error) {
    files.forEach((file) => { if (file.exists) file.delete(); });
    throw error;
  }
}

export const prepareAndroidBestImageWebViewSources = prepareBestImageWebViewSources;
