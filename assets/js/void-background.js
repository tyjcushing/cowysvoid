// /assets/js/void-background.js
(() => {
  const STORAGE_KEY = 'voidClickerState_v1';
  const MAX_STAGE_INDEX = 6; // 0..6 = 7 stages total (I–VII)

  let gl = null;
  let program = null;
  let timeLocation = null;
  let resolutionLocation = null;
  let levelLocation = null;
  let canvas = null;
  let levelIntensity = 0.0;
  let startTime = performance.now();
  let rafId = null;

  // -------- Helpers --------

  function clamped01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function readStageIndexFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const idx = typeof parsed.currentLevelIndex === 'number' ? parsed.currentLevelIndex : 0;
      return Math.max(0, Math.min(MAX_STAGE_INDEX, idx));
    } catch (e) {
      console.warn('[void-bg] Failed to read void state from storage:', e);
      return 0;
    }
  }

  function vertexShaderSource() {
    return `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
  }

  function fragmentShaderSource() {
    // Same look as the game’s black hole, slightly tuned for background use
    return `
      precision mediump float;
      uniform float t;
      uniform vec2 r;
      uniform float u_level;

      vec2 myTanh(vec2 x) {
        vec2 ex = exp(x);
        vec2 emx = exp(-x);
        return (ex - emx) / (ex + emx);
      }

      void main() {
        vec4 o_bg = vec4(0.0);
        vec4 o_anim = vec4(0.0);

        // Background scaffolding
        {
          vec2 p_img = (gl_FragCoord.xy * 2.0 - r) / r.y * mat2(1.0, -1.0, 1.0, 1.0);
          vec2 l_val = myTanh(p_img * 5.0 + 2.0);
          l_val = min(l_val, l_val * 0.0);
          vec2 clamped = clamp(l_val, -2.0, 0.0);
          float diff_y = clamped.y - l_val.y;
          float safe_px = abs(p_img.x) < 0.001 ? 0.001 : p_img.x;
          float term = (0.1 - max(0.01 - dot(p_img, p_img) / 200.0, 0.0) * (diff_y / safe_px))
                       / (0.15 + abs(length(p_img) - 0.7));
          o_bg += vec4(term);
          o_bg = max(o_bg, vec4(0.0));
        }

        // Animated layer
        {
          vec2 p_anim = (gl_FragCoord.xy * 2.0 - r) / r.y / (0.7 - u_level * 0.12);
          vec2 d = vec2(-1.0, 1.0);
          float denom = 0.1 + 5.0 / dot(5.0 * p_anim - d, 5.0 * p_anim - d);
          vec2 c = p_anim * mat2(1.0, 1.0, d.x / denom, d.y / denom);
          vec2 v = c;
          v *= mat2(cos(log(length(v)) + t * (0.2 + u_level * 0.3) + vec4(0.0, 33.0, 11.0, 0.0))) * (5.0 + u_level * 1.5);
          vec4 animAccum = vec4(0.0);
          for (int i = 1; i <= 9; i++) {
            float fi = float(i);
            animAccum += sin(vec4(v.x, v.y, v.y, v.x)) + vec4(1.0);
            v += 0.7 * sin(vec2(v.y, v.x) * fi + t) / fi + 0.5;
          }
          vec4 animTerm = 1.0 - exp(-exp(c.x * vec4(0.6, -0.4, -1.0, 0.0))
                            / animAccum
                            / (0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0))
                            / (1.0 + 7.0 * exp(0.3 * c.y - dot(c, c)))
                            / (0.05 + abs(length(p_anim) - 0.7)) * (0.15 + u_level * 0.1));
          o_anim += animTerm;
        }

        vec4 col = mix(o_bg, o_anim, 0.6);
        col = max(col, vec4(0.0));

        // Cosmic tint / brightness based on level
        vec3 tintA = vec3(0.30, 0.40, 0.85);
        vec3 tintB = vec3(0.70, 0.40, 0.95);
        float m = clamp((col.r + col.g + col.b) / 3.0, 0.0, 1.0);
        vec3 tinted = mix(tintA, tintB, m);
        float energy = 0.7 + u_level * 0.9;
        col.rgb *= tinted * energy;

        // Event horizon in center
        vec2 uv = (gl_FragCoord.xy / r) * 2.0 - 1.0;
        float rad = length(uv);
        float horizonRadius = 0.28 + u_level * 0.03;
        float hole = smoothstep(0.0, horizonRadius, rad);
        col.rgb *= hole;

        col = clamp(col, 0.0, 1.0);
        gl_FragColor = col;
      }
    `;
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[void-bg] Shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSource, fsSource) {
    const v = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!v || !f) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[void-bg] Program link failed:', gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function resizeCanvas() {
    if (!canvas || !gl) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  function renderFrame(now) {
    if (!gl || !canvas) return;
    resizeCanvas();

    const delta = (now - startTime) / 1000;
    gl.uniform1f(timeLocation, delta);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(levelLocation, levelIntensity);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(renderFrame);
  }

  function initWebGLBackground() {
    canvas = document.getElementById('voidBgCanvas');
    if (!canvas) return false;

    const ctx = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!ctx) {
      console.warn('[void-bg] WebGL not supported, keeping static background.');
      return true; // Don't retry
    }

    gl = ctx;

    const vs = vertexShaderSource();
    const fs = fragmentShaderSource();
    program = createProgram(gl, vs, fs);
    if (!program) return true;

    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    timeLocation = gl.getUniformLocation(program, 't');
    resolutionLocation = gl.getUniformLocation(program, 'r');
    levelLocation = gl.getUniformLocation(program, 'u_level');

    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.clearColor(0, 0, 0, 1);

    // Initial level from localStorage
    const initialIndex = readStageIndexFromStorage();
    levelIntensity = clamped01(initialIndex / MAX_STAGE_INDEX);

    startTime = performance.now();
    resizeCanvas();
    rafId = requestAnimationFrame(renderFrame);

    // Public API for other scripts (like the clicker)
    window.voidBackground = {
      /**
       * Set normalized intensity directly (0–1).
       */
      setLevel(norm) {
        levelIntensity = clamped01(norm);
      },
      /**
       * Set by stage index (0..MAX_STAGE_INDEX), optionally with custom max.
       */
      setStageIndex(idx, maxIdx) {
        const max = typeof maxIdx === 'number' && maxIdx > 0 ? maxIdx : MAX_STAGE_INDEX;
        const n = clamped01(idx / max);
        levelIntensity = n;
      }
    };

    window.addEventListener('resize', resizeCanvas);
    return true;
  }

  function tryInitBackground(retries = 12) {
    // If canvas not yet in DOM, wait for partial injection
    const bgRoot = document.getElementById('void-bg');
    const bgCanvas = document.getElementById('voidBgCanvas');

    if (!bgRoot || !bgCanvas) {
      if (retries <= 0) return;
      setTimeout(() => tryInitBackground(retries - 1), 150);
      return;
    }

    initWebGLBackground();
  }

  function startWhenReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      tryInitBackground();
    } else {
      document.addEventListener('DOMContentLoaded', () => tryInitBackground(), { once: true });
    }
  }

  startWhenReady();
})();
