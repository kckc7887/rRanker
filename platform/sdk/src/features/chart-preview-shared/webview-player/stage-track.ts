import type { StageContext } from './stage';
import { rgba, stageProgram } from './stage-material';

type Point = { x: number; y: number };
type Track = { radius: number; buffer: WebGLBuffer; count: number; bytes: number };
type Pipeline = {
  program: WebGLProgram;
  position: number;
  capsule: number;
  matrix: WebGLUniformLocation | null;
  screen: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  colour: WebGLUniformLocation | null;
  tracks: Map<readonly Point[], Track>;
  bytes: number;
};
const TRACK_BYTES = 8 * 1024 * 1024;
const pipelines = new WeakMap<StageContext, Pipeline>();

function pipeline(ctx: StageContext): Pipeline {
  const cached = pipelines.get(ctx);
  if (cached) return cached;
  const gl = ctx.gl;
  const program = stageProgram(
    gl,
    'attribute vec2 p; attribute vec3 q; uniform mat3 matrix; uniform vec2 screen; varying highp vec3 local; void main(){vec2 pos=(matrix*vec3(p,1.)).xy/screen;gl_Position=vec4(pos.x*2.-1.,1.-pos.y*2.,0.,1.);local=q;}',
    'precision highp float; varying highp vec3 local;uniform float radius;uniform vec4 colour;void main(){vec2 d=vec2(local.x-clamp(local.x,0.,local.z),local.y);if(dot(d,d)>radius*radius)discard;gl_FragColor=colour;}',
  );
  const result: Pipeline = {
    program,
    position: gl.getAttribLocation(program, 'p'),
    capsule: gl.getAttribLocation(program, 'q'),
    matrix: gl.getUniformLocation(program, 'matrix'),
    screen: gl.getUniformLocation(program, 'screen'),
    radius: gl.getUniformLocation(program, 'radius'),
    colour: gl.getUniformLocation(program, 'colour'),
    tracks: new Map(),
    bytes: 0,
  };
  pipelines.set(ctx, result);
  return result;
}

function trackBuffer(gl: WebGLRenderingContext, pipe: Pipeline, path: readonly Point[], r: number): Track {
  let track = pipe.tracks.get(path);
  if (track?.radius === r) {
    pipe.tracks.delete(path);
    pipe.tracks.set(path, track);
    return track;
  }
  if (track) {
    gl.deleteBuffer(track.buffer);
    pipe.bytes -= track.bytes;
    pipe.tracks.delete(path);
  }
  const points = path,
    data: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = len ? (b.x - a.x) / len : 1,
      dy = len ? (b.y - a.y) / len : 0;
    for (const [x, y] of [
      [-r, -r],
      [len + r, -r],
      [-r, r],
      [-r, r],
      [len + r, -r],
      [len + r, r],
    ] as const) {
      data.push(a.x + x * dx - y * dy, a.y + x * dy + y * dx, x, y, len);
    }
  }
  const bytes = data.length * 4;
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  track = { buffer, radius: r, count: data.length / 5, bytes };
  if (bytes <= TRACK_BYTES) {
    while (pipe.tracks.size && pipe.bytes + bytes > TRACK_BYTES) {
      const [key, old] = pipe.tracks.entries().next().value!;
      gl.deleteBuffer(old.buffer);
      pipe.tracks.delete(key);
      pipe.bytes -= old.bytes;
    }
    pipe.tracks.set(path, track);
    pipe.bytes += bytes;
  }
  return track;
}

export function releaseTracks(ctx: StageContext): void {
  const pipe = pipelines.get(ctx);
  if (!pipe) return;
  for (const { buffer } of pipe.tracks.values()) ctx.gl.deleteBuffer(buffer);
  ctx.gl.deleteProgram(pipe.program);
  pipelines.delete(ctx);
}

export function drawTrack(
  ctx: StageContext,
  path: readonly Point[],
  outer: number,
  borderWidth: number,
  border: string,
  fill: string,
): void {
  if (path.length < 2 || outer <= 0 || ctx.globalAlpha <= 0) return;
  ctx.flush();
  const gl = ctx.gl,
    pipe = pipeline(ctx);
  const shape = trackBuffer(gl, pipe, path, outer);
  const m = ctx.getTransform();
  gl.useProgram(pipe.program);
  gl.uniformMatrix3fv(pipe.matrix, false, [m.a, m.b, 0, m.c, m.d, 0, m.e, m.f, 1]);
  gl.uniform2f(
    pipe.screen,
    ctx.currentTarget?.width ?? gl.drawingBufferWidth,
    ctx.currentTarget?.height ?? gl.drawingBufferHeight,
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, shape.buffer);
  gl.enableVertexAttribArray(pipe.position);
  gl.vertexAttribPointer(pipe.position, 2, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(pipe.capsule);
  gl.vertexAttribPointer(pipe.capsule, 3, gl.FLOAT, false, 20, 8);
  const alpha = ctx.globalAlpha;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(128);
  gl.stencilFunc(gl.EQUAL, ctx.clipDepth, ctx.clipDepth ? 255 : 128);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
  /** 由内向外只着色一次，折返或交叉处的透明度与边线一致。 */
  for (const [r, css] of [
    [Math.max(0, outer - borderWidth), fill],
    [outer, border],
  ] as const) {
    const [red, green, blue, opacity] = rgba(css);
    const a = alpha * opacity;
    gl.uniform4f(pipe.colour, red * a, green * a, blue * a, a);
    gl.uniform1f(pipe.radius, r);
    gl.drawArrays(gl.TRIANGLES, 0, shape.count);
  }
  gl.colorMask(false, false, false, false);
  gl.stencilFunc(gl.ALWAYS, 0, 0);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
  gl.drawArrays(gl.TRIANGLES, 0, shape.count);
  gl.colorMask(true, true, true, true);
  gl.disableVertexAttribArray(pipe.position);
  gl.disableVertexAttribArray(pipe.capsule);
  if (shape.bytes > TRACK_BYTES) gl.deleteBuffer(shape.buffer);
  ctx.restoreTarget();
}
