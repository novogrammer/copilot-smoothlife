import './style.scss'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="canvas"></canvas>
`

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
canvas.width = window.innerWidth
canvas.height = window.innerHeight

console.log(`Canvas size: ${canvas.width}x${canvas.height}`);
console.log(`Texture size: ${canvas.width}x${canvas.height}`);

const gl = canvas.getContext('webgl')!
if (!gl) {
  console.error('WebGL not supported')
}

if (!gl.getExtension('WEBGL_color_buffer_float')) {
  console.error('WEBGL_color_buffer_float is not supported');
}

// Vertex shader source
const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

// Fragment shader source (Smooth Life logic)
const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform sampler2D u_state; // 現在の状態を保持するテクスチャ
  uniform float u_time;

  // Smooth Life パラメータ
  const float R1 = 1.0;  // 内側の半径
  const float R2 = 4.0;  // 外側の半径
  const float B1 = 0.23; // 誕生の下限
  const float B2 = 0.336; // 誕生の上限
  const float D1 = 0.477;  // 死の下限
  const float D2 = 0.5;  // 死の上限

  float smoothstepRange(float edge0, float edge1, float x) {
      return smoothstep(edge0, edge1, x);
  }

  void main() {
      vec2 st = gl_FragCoord.xy / u_resolution;

      // 現在のセルの状態を取得
      float currentState = texture2D(u_state, st).r;

      // 周囲のセルの状態を計算
      float innerState = 0.0;
      float outerState = 0.0;
      float innerWeight = 0.0;
      float outerWeight = 0.0;
      const float stepSize = 1.0;
      const float weightFactor = 10.0;
      for (float x = -R2; x <= R2; x += stepSize) {
          for (float y = -R2; y <= R2; y += stepSize) {
              vec2 offset = vec2(x, y) / u_resolution;
              float d = length(offset);
              // 内側の寄与
              if(d <= R1) {
                  float weight = exp(-d * weightFactor);
                  innerState += texture2D(u_state, st + offset).r * weight;
                  innerWeight += weight;
              }
              // 外側の寄与（R1 < d <= R2）
              else if(d <= R2) {
                  float weight = exp(-d * weightFactor);
                  outerState += texture2D(u_state, st + offset).r * weight;
                  outerWeight += weight;
              }
          }
      }
      if(innerWeight > 0.0) { innerState /= innerWeight; }
      if(outerWeight > 0.0) { outerState /= outerWeight; }
      // 内側と外側の状態をミックス（ミックス比は調整可能）
      float neighborState = mix(innerState, outerState, 0.5);

      // 生存・誕生ルールの適用
      float birth = smoothstepRange(B1, B2, neighborState);
      float death = smoothstepRange(D1, D2, neighborState);
      float nextState = currentState * (1.0 - death) + (1.0 - currentState) * birth;

      // 次の状態を出力
      gl_FragColor = vec4(vec3(nextState), 1.0);
  }
`

// Compile shader
function compileShader(gl: WebGLRenderingContext, source: string, type: number) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

// Create program
const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER)!
const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER)!
const program = gl.createProgram()!
gl.attachShader(program, vertexShader)
gl.attachShader(program, fragmentShader)
gl.linkProgram(program)
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(program))
}

// Use program
gl.useProgram(program)

// Set up geometry
const positionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]), gl.STATIC_DRAW)

const positionLocation = gl.getAttribLocation(program, 'a_position')
gl.enableVertexAttribArray(positionLocation)
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

// Create initial state texture
function createInitialStateTexture(gl: WebGLRenderingContext, width: number, height: number) {
  const data = new Uint8Array(width * height * 4); // RGBA のため 4 倍のサイズ
  const centerX1 = (2 * width) / 5; // 1つ目の円の中心 (左側)
  const centerY1 = height / 2;
  const centerX2 = (3 * width) / 5; // 2つ目の円の中心 (右側)
  const centerY2 = height / 2;
  const radius = Math.min(width, height) / 6; // 円の半径

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx1 = x - centerX1;
      const dy1 = y - centerY1;
      const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = x - centerX2;
      const dy2 = y - centerY2;
      const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      // 円の中なら 255、外なら 0
      const value = (distance1 < radius || distance2 < radius) ? 255 : 0;
      const index = (y * width + x) * 4;
      data[index] = value;     // R
      data[index + 1] = value; // G
      data[index + 2] = value; // B
      data[index + 3] = 255;   // A
    }
  }

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

// Create two textures for ping-pong rendering
const stateTextureA = createInitialStateTexture(gl, canvas.width, canvas.height);
const stateTextureB = gl.createTexture()!;
gl.bindTexture(gl.TEXTURE_2D, stateTextureB);
gl.texImage2D(
  gl.TEXTURE_2D,
  0,
  gl.RGBA, // フォーマットを RGBA に設定
  canvas.width,
  canvas.height,
  0,
  gl.RGBA,
  gl.UNSIGNED_BYTE,
  null // 初期データは null
);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

// Create framebuffer
const framebuffer = gl.createFramebuffer()!;
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

// Attach writeTexture to framebuffer
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stateTextureB, 0);

// Check framebuffer status
const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
if (status !== gl.FRAMEBUFFER_COMPLETE) {
  console.error(`Framebuffer is incomplete: ${status}`);
}

// Ping-pong rendering variables
let readTexture = stateTextureA;
let writeTexture = stateTextureB;

console.log('Read Texture:', readTexture);
console.log('Write Texture:', writeTexture);

// Get uniform location for u_state
const stateLocation = gl.getUniformLocation(program, 'u_state');

// Bind texture
gl.activeTexture(gl.TEXTURE0);

const timeLocation = gl.getUniformLocation(program, 'u_time');
const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

// Set uniforms
gl.uniform1i(stateLocation, 0); // Texture unit 0

// Render loop with ping-pong rendering
function render(time: number) {
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(timeLocation, time * 0.001);

  // Bind framebuffer and render to writeTexture
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);

  // Bind readTexture as input
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, readTexture);
  gl.uniform1i(stateLocation, 0);

  // Draw to framebuffer
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Swap textures
  [readTexture, writeTexture] = [writeTexture, readTexture];

  // Bind default framebuffer and render to screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
