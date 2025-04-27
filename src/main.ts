import './style.scss';
import { initializeWebGL, createProgram } from './utils/webglUtils';
import { createTexture, createFramebuffer } from './utils/textureUtils';
import vertexShaderSource from './shaders/vertexShader.glsl';
import fragmentShaderSource from './shaders/fragmentShader.glsl';

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
