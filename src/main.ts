import './style.scss';

// シェーダーコードを分離
const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform vec2 u_resolution;
  uniform sampler2D u_state;
  uniform float u_time;

  const float R1 = 1.0;
  const float R2 = 5.0;
  const float B1 = 0.22;
  const float B2 = 0.33;
  const float D1 = 0.47;
  const float D2 = 0.49;

  float smoothstepRange(float edge0, float edge1, float x) {
      return smoothstep(edge0, edge1, x);
  }

  void main() {
      vec2 st = gl_FragCoord.xy / u_resolution;
      float currentState = texture2D(u_state, st).r;

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
              if (d <= R1) {
                  float weight = exp(-d * weightFactor);
                  innerState += texture2D(u_state, st + offset).r * weight;
                  innerWeight += weight;
              } else if (d <= R2) {
                  float weight = exp(-d * weightFactor);
                  outerState += texture2D(u_state, st + offset).r * weight;
                  outerWeight += weight;
              }
          }
      }

      if (innerWeight > 0.0) innerState /= innerWeight;
      if (outerWeight > 0.0) outerState /= outerWeight;

      float neighborState = mix(innerState, outerState, 0.5);
      float birth = smoothstepRange(B1, B2, neighborState);
      float death = smoothstepRange(D1, D2, neighborState);
      float nextState = currentState * (1.0 - death) + (1.0 - currentState) * birth;

      gl_FragColor = vec4(vec3(nextState), 1.0);
  }
`;

// WebGL 初期化関数
function initializeWebGL(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const gl = canvas.getContext('webgl')!;
  if (!gl) throw new Error('WebGL not supported');
  if (!gl.getExtension('WEBGL_color_buffer_float')) {
    throw new Error('WEBGL_color_buffer_float is not supported');
  }
  return gl;
}

// シェーダーのコンパイル
function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed');
  }
  return shader;
}

// プログラムの作成
function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program linking failed');
  }
  return program;
}

// テクスチャの作成
function createTexture(gl: WebGLRenderingContext, width: number, height: number, data: Uint8Array | null): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

// 初期状態テクスチャの作成
function createInitialStateTexture(gl: WebGLRenderingContext, width: number, height: number): WebGLTexture {
  const data = new Uint8Array(width * height * 4);
  const centerX1 = (2 * width) / 5;
  const centerY1 = height / 2;
  const centerX2 = (3 * width) / 5;
  const centerY2 = height / 2;
  const radius = Math.min(width, height) / 6;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx1 = x - centerX1;
      const dy1 = y - centerY1;
      const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = x - centerX2;
      const dy2 = y - centerY2;
      const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const value = (distance1 < radius || distance2 < radius) ? 255 : 0;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  return createTexture(gl, width, height, data);
}

// フレームバッファの作成
function createFramebuffer(gl: WebGLRenderingContext, texture: WebGLTexture): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Framebuffer is incomplete');
  }
  return framebuffer;
}

// メイン処理
function main() {
  const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gl = initializeWebGL(canvas);
  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ]), gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const stateTextureA = createInitialStateTexture(gl, canvas.width, canvas.height);
  const stateTextureB = createTexture(gl, canvas.width, canvas.height, null);

  const framebuffer = createFramebuffer(gl, stateTextureB);

  const stateLocation = gl.getUniformLocation(program, 'u_state');
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  const timeLocation = gl.getUniformLocation(program, 'u_time');

  gl.uniform1i(stateLocation, 0);

  let readTexture = stateTextureA;
  let writeTexture = stateTextureB;

  function render(time: number) {
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, time * 0.001);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTexture, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTexture);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    [readTexture, writeTexture] = [writeTexture, readTexture];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();
