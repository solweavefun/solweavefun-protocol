// Animated wave field behind the hero (WebGL, ~30fps, low-power, DPR capped).
// Colours are read from the CSS token variables at runtime, so no colour literal lives here.
import { RM } from './register.js';

function cssRgb(varExpr) {
  const probe = document.createElement('i');
  probe.style.color = varExpr; probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 1, 1); g.fillStyle = resolved; g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

export function initWaves() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const surface = document.createElement('div');
  surface.className = 'hero-surface'; surface.setAttribute('aria-hidden', 'true');
  hero.prepend(surface);
  const canvas = document.createElement('canvas');
  surface.append(canvas);
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) { canvas.remove(); return; }

  const vertex = 'attribute vec2 a; void main(){gl_Position=vec4(a,0.,1.);}';
  const fragment = `precision mediump float;
    uniform vec2 resolution; uniform float clock; uniform vec3 color1; uniform vec3 color2; uniform vec3 deep;
    uniform float speed; uniform float frequency; uniform float amplitude; uniform float distortion; uniform float flatness; uniform float chroma;
    float field(vec2 p,float t){
      vec2 q=p;
      q.x+=sin(p.y*2.45+t*.23)*amplitude*.85;
      q.y+=sin(p.x*2.1-t*.19)*amplitude*.9;
      float ripple=sin(q.x*3.2+sin(q.y*3.8+t*.36)*distortion*.7+sin(q.x*1.5-q.y*2.3-t*.25)*.78);
      float ribbon=pow(max(0.,.5+.5*ripple),3.2*flatness);
      float longwave=pow(max(0.,.5+.5*sin(q.y*3.2-q.x*1.6+sin(q.x*2.2+t*.15)*distortion*.5+t*.12)),5.);
      return ribbon*.83+longwave*.42;
    }
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution; vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.)*(1.+frequency*.5);
      float t=clock*speed;
      float a=field(p,t); float b=field(p+vec2(chroma*.035,-chroma*.025),t);
      vec3 tint=color2*.55;
      vec3 col=deep+mix(tint,color1,clamp(a*.8,0.,1.))*smoothstep(.05,.6,a);
      col+=color2*max(0.,a-b)*chroma*.4;
      gl_FragColor=vec4(max(col,0.),1.);
    }`;
  const compile = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) { canvas.remove(); return; }
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  gl.uniform3fv(U('color1'), cssRgb('color-mix(in srgb, var(--c-ink) 38%, var(--c-purple))'));
  gl.uniform3fv(U('color2'), cssRgb('var(--c-purple)'));
  gl.uniform3fv(U('deep'), cssRgb('var(--c-bg)'));
  const params = { speed: 0.4, frequency: 0.2, amplitude: 0.3, distortion: 2, flatness: 1, chroma: 0.25 };
  for (const [k, v] of Object.entries(params)) gl.uniform1f(U(k), v);
  const res = U('resolution'), clock = U('clock');

  let raf = 0, last = 0;
  const draw = (ms) => { gl.uniform1f(clock, ms / 1000); gl.drawArrays(gl.TRIANGLES, 0, 6); };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25), w = surface.clientWidth, h = surface.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(res, canvas.width, canvas.height); draw(0);
  };
  const tick = (ms) => { if (!last || ms - last >= 33) { draw(ms); last = ms; } raf = requestAnimationFrame(tick); };
  const start = () => { cancelAnimationFrame(raf); raf = 0; if (!document.hidden && !RM()) raf = requestAnimationFrame(tick); else draw(0); };
  new ResizeObserver(resize).observe(surface);
  document.addEventListener('visibilitychange', start);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', start);
  resize(); start();
}
