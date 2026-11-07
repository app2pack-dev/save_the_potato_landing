// The game's star sky (shaders/background.frag), ported to WebGL 1.
// Stars drift out from the center; `power` stretches them into warp
// streaks and `tension` sends a few long streaks gliding out.
(function () {
  var FRAG = [
    'precision highp float;',
    '#define MAX_MOVEMENT_SPEED 0.02',
    '#define MIN_RADIUS 0.01',
    '#define MAX_RADIUS 0.04',
    '#define TWOPI 6.283185307',
    '#define STAR_COUNT 50.0',
    'uniform float iTime;',
    'uniform vec2 iResolution;',
    'uniform vec2 center;',
    'uniform vec3 backgroundColor;',
    'uniform vec3 starColor;',
    'uniform float starSize;',
    'uniform float power;',
    'uniform float tension;',
    'uniform float glowSize;',
    'vec3 rand3(float i) {',
    '  vec3 p = fract(vec3(i + 0.5) * vec3(0.1031, 0.1030, 0.0973));',
    '  p += dot(p, p.yzx + 33.33);',
    '  return fract((p.xxy + p.yzz) * p.zyx);',
    '}',
    'float sat(float v) { return clamp(v, 0.0, 1.0); }',
    'float renderStar(vec2 uv, float i, float aspect, vec2 stretch) {',
    '  float maxDistance = aspect;',
    '  vec3 random = rand3(i);',
    '  float rad = MIN_RADIUS + random.x * (MAX_RADIUS - MIN_RADIUS);',
    '  float startr = random.y * maxDistance;',
    '  float speed = random.x * MAX_MOVEMENT_SPEED;',
    '  float r = mod(startr + iTime * speed, max(1.0, maxDistance));',
    '  float theta = (i + random.z) / STAR_COUNT * TWOPI;',
    '  vec2 dir = vec2(cos(theta), sin(theta));',
    '  vec2 pos = r * vec2(dir.x * aspect, dir.y);',
    '  vec2 diff = uv - pos;',
    '  float along = dot(diff, dir);',
    '  along *= along < 0.0 ? stretch.x : stretch.y;',
    '  float across = dir.x * diff.y - dir.y * diff.x;',
    '  float dist = length(vec2(along, across));',
    '  float distTraveled = r / maxDistance;',
    '  float shape = sat(distTraveled * rad / ((100.0 - min(starSize, 100.0)) * dist) - 0.08);',
    '  return step(dist, rad) * shape;',
    '}',
    'void main() {',
    '  float aspect = iResolution.x / iResolution.y;',
    '  vec2 uv = -1.0 + 2.0 * (gl_FragCoord.xy / iResolution.xy);',
    '  uv -= center;',
    '  uv.x *= aspect;',
    '  float angle = mod(atan(uv.y, uv.x / aspect), TWOPI);',
    '  float sector = floor(angle / TWOPI * STAR_COUNT);',
    '  vec2 stretch = vec2(1.0 / (1.0 + power * 5.0), 1.0 / (1.0 + power * 0.75));',
    '  float stars = 0.0;',
    '  for (int k = -1; k <= 1; ++k) {',
    '    stars += renderStar(uv, mod(sector + float(k), STAR_COUNT), aspect, stretch);',
    '  }',
    '  stars *= 1.0 + power * 0.8;',
    '  float dist = length(uv);',
    '  float centerGlow = sat(1.0 / (dist * 5.0 * glowSize + 1.5));',
    '  vec3 color = centerGlow * backgroundColor + starColor * stars;',
    '  float slices = angle / TWOPI * 48.0;',
    '  vec3 streak = rand3(floor(slices) + 777.0);',
    '  float head = fract(streak.y + iTime * (0.18 + 0.12 * streak.z)) * 1.9;',
    '  float tail = sat((dist - head + 0.45) / 0.45);',
    '  float streaks = step(0.78, streak.x) * tail * tail * step(dist, head) *',
    '    (1.0 - smoothstep(0.02, 0.09, abs(fract(slices) - 0.5) * (1.0 + dist))) *',
    '    smoothstep(0.25, 0.6, dist);',
    '  color += mix(vec3(1.0), starColor, 0.5) * streaks * tension * 0.55;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
  var VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

  function hex(c) {
    var n = parseInt(c.replace('#', ''), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // opts: background, stars (hex), starSize, power, tension, center [x, y]
  // in -1..1, glowSize, speed, scale (render resolution, 0.5 = half)
  function mount(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var target = {
      bg: hex(opts.background || '#00004D'),
      star: hex(opts.stars || '#7FBBFF'),
      power: opts.power || 0,
      tension: opts.tension || 0,
      cx: (opts.center || [0, 0])[0],
      cy: (opts.center || [0, 0])[1],
      glow: opts.glowSize || 1
    };
    var cur = JSON.parse(JSON.stringify(target));
    var api = {
      set: function (o) {
        if (o.background) target.bg = hex(o.background);
        if (o.stars) target.star = hex(o.stars);
        if (o.power !== undefined) target.power = o.power;
        if (o.tension !== undefined) target.tension = o.tension;
        if (o.center) { target.cx = o.center[0]; target.cy = o.center[1]; }
        if (o.glowSize !== undefined) target.glow = o.glowSize;
      },
      ok: !!gl
    };
    if (!gl) { canvas.style.background = opts.background || '#00004D'; return api; }

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ['iTime', 'iResolution', 'center', 'backgroundColor', 'starColor', 'starSize', 'power', 'tension', 'glowSize']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var scale = opts.scale || Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize); resize();

    var speed = opts.speed || 1, t = 20, last = performance.now(), visible = true;
    document.addEventListener('visibilitychange', function () { visible = !document.hidden; last = performance.now(); });
    function lerp(a, b, k) { return a + (b - a) * k; }
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce) t += dt * speed * (1 + cur.power * 3);
      var k = 1 - Math.pow(0.02, dt);
      for (var i = 0; i < 3; i++) { cur.bg[i] = lerp(cur.bg[i], target.bg[i], k); cur.star[i] = lerp(cur.star[i], target.star[i], k); }
      cur.power = lerp(cur.power, target.power, k * 1.5);
      cur.tension = lerp(cur.tension, target.tension, k);
      cur.cx = lerp(cur.cx, target.cx, k); cur.cy = lerp(cur.cy, target.cy, k);
      cur.glow = lerp(cur.glow, target.glow, k);
      gl.uniform1f(U.iTime, t);
      gl.uniform2f(U.iResolution, canvas.width, canvas.height);
      gl.uniform2f(U.center, cur.cx, cur.cy);
      gl.uniform3fv(U.backgroundColor, cur.bg);
      gl.uniform3fv(U.starColor, cur.star);
      gl.uniform1f(U.starSize, Math.min(canvas.clientWidth * 0.1, opts.starSize || 80));
      gl.uniform1f(U.power, cur.power);
      gl.uniform1f(U.tension, cur.tension);
      gl.uniform1f(U.glowSize, cur.glow);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible) requestAnimationFrame(frame); else setTimeout(function () { requestAnimationFrame(frame); }, 250);
    }
    requestAnimationFrame(frame);
    return api;
  }
  window.Stars = { mount: mount };
})();
