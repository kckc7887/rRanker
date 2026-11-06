import { describe, expect, it } from 'vitest';
import { parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine';
import { fixtureOsu } from './fixtures';
import { sampleSlider, sliderPointAt } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/SliderGeometry';

describe('flat slider drawing', () => {
  const slider = (curve: string, length: number) => {
    const beatmap = parseBeatmap(fixtureOsu(0, 'Path').replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n0,0,1000,2,0,${curve},1,${length}`));
    const slider = beatmap.hitObjects[0]!;
    if (slider.type !== 'slider') throw new Error('slider required');
    return sampleSlider(slider);
  };

  const path = (curve: string, length: number) => slider(curve, length).points;

  it('按弧长通过不等长折返和末端延长段', () => {
    const geometry = slider('L|10:0|10:90|10:0', 5000);
    expect(sliderPointAt(geometry, 10 / 5000)).toEqual({ x: 10, y: 0 });
    expect(sliderPointAt(geometry, 100 / 5000)).toEqual({ x: 10, y: 90 });
    expect(sliderPointAt(geometry, 190 / 5000)).toEqual({ x: 10, y: 0 });
    expect(sliderPointAt(geometry, .5)).toEqual({ x: 10, y: -2310 });
  });

  it.each(['L|100:0', 'B|50:0|100:0', 'C|50:0|100:0', 'P|50:0|100:0'])('按声明长度截短或沿末端延伸 %s', curve => {
    expect(path(curve, 50).at(-1)).toEqual({ x: 50, y: 0 });
    expect(path(curve, 150).at(-1)).toEqual({ x: 150, y: 0 });
  });

  it('Catmull 经过控制点而非把它们作为贝塞尔手柄，末端延伸保持切向', () => {
    const points = path('C|100:100|200:0', 350);
    expect(Math.min(...points.map(point => Math.hypot(point.x - 100, point.y - 100)))).toBeLessThan(1);
    expect(points.at(-1)!.x).toBeGreaterThan(200);
    expect(points.at(-1)!.y).toBeLessThan(0);
    const shortened = path('C|100:100|200:0', 50);
    expect(shortened.at(-1)!.x).toBeLessThan(100);
  });

  it('圆弧超过弧长后沿末端切向延伸，重复尾点及退化路径保持有限位置', () => {
    const arc = path('P|100:100|200:0', Math.PI * 100 + 50);
    expect(arc.at(-1)!.x).toBeCloseTo(200, 0);
    expect(arc.at(-1)!.y).toBeCloseTo(-50, 0);
    expect(path('L|100:0|100:0', 150).at(-1)).toEqual({ x: 150, y: 0 });
    expect(path('B|0:0|0:0', 20).every(point => point.x === 0 && point.y === 0)).toBe(true);
  });
});
