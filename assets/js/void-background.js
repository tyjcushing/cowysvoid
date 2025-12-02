// /assets/js/void-background.js
(function () {
  const STORAGE_KEY = 'voidClickerState_v1';

  // Same thresholds as the clicker levels
  const LEVEL_THRESHOLDS = [
    0,        // Stage I
    200,      // Stage II
    1500,     // Stage III
    10000,    // Stage IV
    50000,    // Stage V
    250000,   // Stage VI
    1000000   // Stage VII
  ];

  function getTotalFragments() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const total = typeof parsed.totalFragments === 'number'
        ? parsed.totalFragments
        : 0;
      return Math.max(0, total);
    } catch (e) {
      console.warn('[VoidBG] Failed to read state:', e);
      return 0;
    }
  }

  function getNormalizedStage(totalFragments) {
    let idx = 0;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (totalFragments >= LEVEL_THRESHOLDS[i]) {
        idx = i;
      } else {
        break;
      }
    }
    if (LEVEL_THRESHOLDS.length <= 1) return 0;
    return idx / (LEVEL_THRESHOLDS.length - 1); // 0..1
  }

  function initVoidBackground() {
    const canvas = document.getElementById('voidBgCanvas');
    if (!canvas) {
      // Page doesn’t use the background partial
      return;
    }

    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) {
      console.warn('[VoidBG] WebGL not supported.');
      return;
    }

    // -----------------------------
    // Shader setup (same core look as the clicker, tuned for BG)
    // -----------------------------
    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
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

        // Background structure (soft cosmic filaments)
        {
          vec2 p_img = (gl_FragCoord.xy * 2.0 - r) / r.y * mat2(1.0, -1.0, 1.0, 1.0);
          vec2 l_val = myTanh(p_img * 5.0 + 2.0);
          l_val = min(l_val, l_val * 0.0);
          vec2 clamped = clamp(l_val, -2.0, 0.0);
          float diff_y = clamped.y - l_val.y;
          float safe_px = abs(p_img.x) < 0.001 ? 0.001 : p_img.x;
          float term = (0.08 - max(0.01 - dot(p_img, p_img) / 220.0, 0.0) * (diff_y / safe_px))
                       / (0.18 + abs(length(p_img) - 0.7));
          o_bg += vec4(term);
          o_bg = max(o_bg, vec4(0.0));
        }

        // Animated layer (the active accretion)
        {
          float scale = 0.75 - u_level * 0.12;
          vec2 p_anim = (gl_FragCoord.xy * 2.0 - r) / r.y / scale;
          vec2 d = vec2(-1.0, 1.0);
          float denom = 0.1 + 5.0 / dot(5.0 * p_anim - d, 5.0 * p_anim - d);
          vec2 c = p_anim * mat2(1.0, 1.0, d.x / denom, d.y / denom);
          vec2 v = c;
          v *= mat2(
            cos(log(length(v)) + t * (0.18 + u_level * 0.4) + 0.0),
            -sin(log(length(v)) + t * (0.18 + u_level * 0.4) + 0.0),
            sin(log(length(v)) + t * (0.18 + u_level * 0.4) + 11.0),
            cos(log(length(v)) + t * (0.18 + u_level * 0.4) + 11.0)
          ) * (4.5 + u_level * 1.6);

          vec4 animAccum = vec4(0.0);
          for (int i = 1; i <= 9; i++) {
            float fi = float(i);
            animAccum += sin(vec4(v.x, v.y, v.y, v.x)) + vec4(1.0);
            v += 0.7 * sin(vec2(v.y, v.x) * fi + t) / fi + 0.5;
          }

          vec4 animTerm = 1.0 - exp(
            -exp(c.x * vec4(0.6, -0.4, -1.0, 0.0))
            / animAccum
            / (0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0))
            / (1.0 + 7.0 * exp(0.3 * c.y - dot(c, c)))
            / (0.05 + abs(length(p_anim) - 0.7))
            * (0.12 + u_level * 0.12)
          );
          o_anim += animTerm;
        }

        vec4 col = mix(o_bg, o_anim, 0.65);
        col = max(col, vec4(0.0));

        // Blue/purple cosmic tint, more energy with level
        vec3 tintA = vec3(0.20, 0.30, 0.70);
        vec3 tintB = vec3(0.75, 0.45, 0.95);
        float m = clamp((col.r + col.g + col.b) / 3.0, 0.0, 1.0);
        vec3 tinted = mix(tintA, tintB, m);
        float energy = 0.6 + u_level * 0.9;
        col.rgb *= tinted * energy;

        // Central event horizon (bigger & darker as the void grows)
        vec2 uv = (gl_FragCoord.xy / r) * 2.0 - 1.0;
        float rad = length(uv);
        float horizonRadius = 0.26 + u_level * 0.05;
        float hole = smoothstep(0.0, horizonRadius, rad);
        col.rgb *= hole;

        // Slight vignette so edges stay subdued
        float vignette = smoothstep(1.2, 0.4, rad);
        col.rgb *= mix(0.6, 1.0, vignette);

        col = clamp(col, 0.0, 1.0);
        gl_FragColor = col;
      }
    `;

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[VoidBG] Shader error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(gl, vsSrc, fsSrc) {
      const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('[VoidBG] Program link error:', gl.getProgramInfoLog(prog));
        gl.deleteProgram(prog);
        return null;
      }
      return prog;
    }

    const program = createProgram(gl, vsSource, fsSource);
    if (!program) return;

    gl.useProgram(program);

    const positionLocation   = gl.getAttribLocation(program, 'a_position');
    const timeLocation       = gl.getUniformLocation(program, 't');
    const resolutionLocation = gl.getUniformLocation(program, 'r');
    const levelLocation      = gl.getUniformLocation(program, 'u_level');

    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }

    window.addEventListener('resize', resize);
    resize();

    let startTime = performance.now();
    let levelIntensity = getNormalizedStage(getTotalFragments());

    function refreshLevelFromStorage() {
      const total = getTotalFragments();
      levelIntensity = getNormalizedStage(total);
    }

    // If another tab updates the save, react to it.
    window.addEventListener('storage', function (evt) {
      if (evt.key === STORAGE_KEY) {
        refreshLevelFromStorage();
      }
    });

    function render() {
      resize();

      const now = performance.now();
      const delta = (now - startTime) / 1000.0;

      gl.uniform1f(timeLocation, delta);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(levelLocation, levelIntensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(render);
    }

    // Small periodic check in case the clicker page updated state in the same tab
    setInterval(refreshLevelFromStorage, 4000);

    requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVoidBackground);
  } else {
    initVoidBackground();
  }
})();
