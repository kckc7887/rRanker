export type ImageCrop = { x: number; y: number; width: number; height: number };
export type CropTransform = { zoom: number; x: number; y: number };
export type ImageSize = { width: number; height: number };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function constrainCrop(size: ImageSize, frame: number, transform: CropTransform): CropTransform {
  const zoom = clamp(transform.zoom, 1, 4);
  const scale = Math.max(frame / size.width, frame / size.height) * zoom;
  const maxX = (size.width * scale - frame) / 2;
  const maxY = (size.height * scale - frame) / 2;
  return { zoom, x: clamp(transform.x, -maxX, maxX), y: clamp(transform.y, -maxY, maxY) };
}
export function cropFromTransform(size: ImageSize, frame: number, value: CropTransform): ImageCrop {
  const transform = constrainCrop(size, frame, value);
  const scale = Math.max(frame / size.width, frame / size.height) * transform.zoom;
  const width = frame / scale;
  return { x: clamp((size.width / 2 - (frame / 2 + transform.x) / scale) / size.width, 0, 1 - width / size.width),
    y: clamp((size.height / 2 - (frame / 2 + transform.y) / scale) / size.height, 0, 1 - width / size.height),
    width: width / size.width, height: width / size.height };
}
export function transformFromCrop(size: ImageSize, frame: number, crop?: ImageCrop | null): CropTransform {
  if (!crop) return { zoom: 1, x: 0, y: 0 };
  const scale = frame / (crop.width * size.width);
  return constrainCrop(size, frame, { zoom: scale / Math.max(frame / size.width, frame / size.height),
    x: (0.5 - crop.x - crop.width / 2) * size.width * scale,
    y: (0.5 - crop.y - crop.height / 2) * size.height * scale });
}
export function cropPixels(size: ImageSize, crop: ImageCrop) {
  const side = Math.max(1, Math.min(size.width, size.height, Math.round(crop.width * size.width)));
  return { originX: clamp(Math.round(crop.x * size.width), 0, size.width - side),
    originY: clamp(Math.round(crop.y * size.height), 0, size.height - side), width: side, height: side };
}
