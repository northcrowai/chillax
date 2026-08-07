import { useEffect, useRef } from 'preact/hooks'
import type { Intensity, PresetId, StarfieldSpeedSeconds, ThemeMode } from '../types'

interface AmbientVisualProps {
  intensity: Intensity
  isPlaying: boolean
  preset: PresetId
  starfieldSpeedSeconds: StarfieldSpeedSeconds
  theme: ThemeMode
}

type Rgb = readonly [number, number, number]

interface OrbPalette {
  primary: Rgb
  secondary: Rgb
  glow: Rgb
}

const hex = (value: string): Rgb => {
  const normalized = value.replace('#', '')
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ]
}

const PALETTES: Record<PresetId, { light: OrbPalette; dark: OrbPalette }> = {
  'deep-work': {
    light: { primary: hex('#254f47'), secondary: hex('#87b6a9'), glow: hex('#b8ddce') },
    dark: { primary: hex('#63d9bf'), secondary: hex('#38786d'), glow: hex('#7ff2d7') },
  },
  flow: {
    light: { primary: hex('#6e4fa1'), secondary: hex('#d8a9d8'), glow: hex('#a97bed') },
    dark: { primary: hex('#bc7cff'), secondary: hex('#6557d8'), glow: hex('#db79ff') },
  },
  'calm-focus': {
    light: { primary: hex('#45688a'), secondary: hex('#b0c7d8'), glow: hex('#91c6e4') },
    dark: { primary: hex('#88cbef'), secondary: hex('#5266b7'), glow: hex('#7bd9ff') },
  },
  'rain-light': {
    light: { primary: hex('#4b7896'), secondary: hex('#aeceda'), glow: hex('#82c7e5') },
    dark: { primary: hex('#77c8ed'), secondary: hex('#416e9d'), glow: hex('#56c7ff') },
  },
  'rain-soft': {
    light: { primary: hex('#5f6f94'), secondary: hex('#c1c6da'), glow: hex('#9faee6') },
    dark: { primary: hex('#9eaef2'), secondary: hex('#57649f'), glow: hex('#879cff') },
  },
  'rain-steady': {
    light: { primary: hex('#365e82'), secondary: hex('#91b8d0'), glow: hex('#6aaad2') },
    dark: { primary: hex('#58b8e5'), secondary: hex('#375f9f'), glow: hex('#4cbef5') },
  },
  'rain-full': {
    light: { primary: hex('#3e4d73'), secondary: hex('#8799bd'), glow: hex('#6d84c4') },
    dark: { primary: hex('#758ce0'), secondary: hex('#394878'), glow: hex('#738dff') },
  },
  'rain-gutter': {
    light: { primary: hex('#3f6272'), secondary: hex('#9ab6bd'), glow: hex('#68a7b7') },
    dark: { primary: hex('#66bfd1'), secondary: hex('#3d6976'), glow: hex('#61d6e9') },
  },
  'forest-ambience': {
    light: { primary: hex('#426849'), secondary: hex('#a9c59f'), glow: hex('#79b476') },
    dark: { primary: hex('#7fd38b'), secondary: hex('#3e704d'), glow: hex('#72e58c') },
  },
  'forest-morning': {
    light: { primary: hex('#557347'), secondary: hex('#cad29a'), glow: hex('#a8cc62') },
    dark: { primary: hex('#b9da71'), secondary: hex('#4e793c'), glow: hex('#c5ef6e') },
  },
  fireplace: {
    light: { primary: hex('#a84f35'), secondary: hex('#e3a35f'), glow: hex('#ee7f4c') },
    dark: { primary: hex('#ff9a5d'), secondary: hex('#b84947'), glow: hex('#ff725c') },
  },
  wind: {
    light: { primary: hex('#527e7b'), secondary: hex('#b8d1c7'), glow: hex('#82c5ba') },
    dark: { primary: hex('#8edbd0'), secondary: hex('#497e80'), glow: hex('#80eee0') },
  },
  'lofi-soft-study': {
    light: { primary: hex('#8b5f9d'), secondary: hex('#e0b8d8'), glow: hex('#c886d2') },
    dark: { primary: hex('#dc91e8'), secondary: hex('#734d93'), glow: hex('#f09bdc') },
  },
  'lofi-cafe-focus': {
    light: { primary: hex('#9c6244'), secondary: hex('#e3bd88'), glow: hex('#d9915f') },
    dark: { primary: hex('#eda36b'), secondary: hex('#8c514c'), glow: hex('#ffb176') },
  },
  'lofi-night-notes': {
    light: { primary: hex('#525c8f'), secondary: hex('#b7b5d7'), glow: hex('#8c8fd7') },
    dark: { primary: hex('#9ea2ed'), secondary: hex('#535083'), glow: hex('#ac9fff') },
  },
  'lofi-daybreak': {
    light: { primary: hex('#866742'), secondary: hex('#e3c38b'), glow: hex('#d69d5e') },
    dark: { primary: hex('#f0b76f'), secondary: hex('#835d45'), glow: hex('#ffc273') },
  },
  'lofi-autumn-colors': {
    light: { primary: hex('#a3524b'), secondary: hex('#e4a881'), glow: hex('#db7864') },
    dark: { primary: hex('#f39a7e'), secondary: hex('#8d4a56'), glow: hex('#ffac84') },
  },
  'lofi-under-the-stars': {
    light: { primary: hex('#4d5685'), secondary: hex('#aeb8e0'), glow: hex('#8196db') },
    dark: { primary: hex('#aab6f4'), secondary: hex('#4c548b'), glow: hex('#9aaaff') },
  },
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// An original, intentionally small 2D liquid study: three noise octaves and
// one signed-distance field instead of a battery-heavy 3D raymarch.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform float u_time;
uniform float u_motion;
uniform float u_strength;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_glow;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.04 + 7.31;
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec2 p = (v_uv * 2.0 - 1.0) * 1.16;
  float t = u_time * (0.10 + u_motion * 0.30);
  float angle = atan(p.y, p.x);
  float warpA = fbm(p * 2.25 + vec2(t, -t * 0.64));
  float warpB = fbm(p * 3.1 + vec2(-t * 0.54, t * 0.82) + warpA);
  float deformation = (warpA - 0.48) * 0.13 * u_motion;
  deformation += sin(angle * 3.0 + t * 1.8) * 0.025 * u_motion;

  float radius = length(p);
  float boundary = 0.62 + deformation;
  float distanceToOrb = radius - boundary;
  float body = 1.0 - smoothstep(-0.018, 0.018, distanceToOrb);
  float rim = smoothstep(0.075, 0.0, abs(distanceToOrb));
  float exteriorGlow = exp(-max(distanceToOrb, 0.0) * 9.0) * (1.0 - body);

  float currents = smoothstep(0.48, 0.88, warpB);
  float filament = pow(1.0 - abs(warpB * 2.0 - 1.0), 7.0);
  vec3 liquid = mix(u_primary, u_secondary, clamp(warpA * 0.9 + p.y * 0.18, 0.0, 1.0));
  liquid *= 0.56 + currents * 0.48 + u_strength * 0.08;
  liquid += u_glow * filament * 0.26 * u_strength;

  vec2 highlightPoint = vec2(-0.21, 0.24);
  float highlight = pow(max(0.0, 1.0 - distance(p, highlightPoint) * 2.8), 5.0);
  liquid += vec3(1.0) * highlight * 0.48;
  liquid += u_glow * rim * 0.58;

  vec3 color = liquid * body + u_glow * exteriorGlow * 0.72;
  float alpha = clamp(body * 0.94 + rim * 0.18 + exteriorGlow * 0.34, 0.0, 1.0);
  outColor = vec4(color, alpha);
}`

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create the ambient shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader error.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

const copyPalette = (palette: OrbPalette) => ({
  primary: [...palette.primary] as [number, number, number],
  secondary: [...palette.secondary] as [number, number, number],
  glow: [...palette.glow] as [number, number, number],
})

const easeColor = (current: number[], target: Rgb) => {
  for (let index = 0; index < 3; index += 1) {
    current[index] += (target[index] - current[index]) * 0.075
  }
}

export function AmbientVisual({
  intensity,
  isPlaying,
  preset,
  starfieldSpeedSeconds,
  theme,
}: AmbientVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const configRef = useRef({ intensity, isPlaying, preset, theme })
  const requestDrawRef = useRef<() => void>(() => undefined)
  configRef.current = { intensity, isPlaying, preset, theme }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      premultipliedAlpha: true,
    })
    if (!gl) {
      canvas.parentElement?.classList.add('ambient-visual--fallback')
      return
    }

    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let animationFrame = 0
    let lastFrameAt = -Infinity
    let isVisible = !document.hidden
    let isIntersecting = true
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const initialConfig = configRef.current
    const currentPalette = copyPalette(PALETTES[initialConfig.preset][initialConfig.theme])

    try {
      const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
      program = gl.createProgram()
      if (!program) throw new Error('Could not create the ambient visual.')
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'Could not link the ambient visual.')
      }

      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      )
      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.useProgram(program)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    } catch {
      canvas.parentElement?.classList.add('ambient-visual--fallback')
      if (program) gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
      return
    }

    const uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      motion: gl.getUniformLocation(program, 'u_motion'),
      strength: gl.getUniformLocation(program, 'u_strength'),
      primary: gl.getUniformLocation(program, 'u_primary'),
      secondary: gl.getUniformLocation(program, 'u_secondary'),
      glow: gl.getUniformLocation(program, 'u_glow'),
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = Math.max(1, Math.min(720, Math.round(bounds.width * pixelRatio)))
      const height = Math.max(1, Math.min(720, Math.round(bounds.height * pixelRatio)))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
    }

    const draw = (now: number) => {
      animationFrame = 0
      const config = configRef.current
      const targetPalette = PALETTES[config.preset][config.theme]
      const frameInterval = config.isPlaying ? 1000 / 30 : 1000 / 12
      const strength =
        config.intensity === 'soft' ? 0.76 : config.intensity === 'strong' ? 1.18 : 1
      if (reduceMotion || now - lastFrameAt >= frameInterval) {
        lastFrameAt = now
        resize()
        easeColor(currentPalette.primary, targetPalette.primary)
        easeColor(currentPalette.secondary, targetPalette.secondary)
        easeColor(currentPalette.glow, targetPalette.glow)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.uniform1f(uniforms.time, now * 0.001)
        gl.uniform1f(uniforms.motion, reduceMotion ? 0 : config.isPlaying ? 1 : 0.26)
        gl.uniform1f(uniforms.strength, strength)
        gl.uniform3fv(uniforms.primary, currentPalette.primary)
        gl.uniform3fv(uniforms.secondary, currentPalette.secondary)
        gl.uniform3fv(uniforms.glow, currentPalette.glow)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }

      if (!reduceMotion && isVisible && isIntersecting) animationFrame = requestAnimationFrame(draw)
    }

    requestDrawRef.current = () => {
      if (isVisible && isIntersecting && !animationFrame) {
        animationFrame = requestAnimationFrame(draw)
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? true
      if (isIntersecting && isVisible && !animationFrame) animationFrame = requestAnimationFrame(draw)
    })
    const handleVisibility = () => {
      isVisible = !document.hidden
      if (isVisible && isIntersecting && !animationFrame) animationFrame = requestAnimationFrame(draw)
    }
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      canvas.parentElement?.classList.add('ambient-visual--fallback')
    }

    resizeObserver.observe(canvas)
    intersectionObserver.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibility)
    canvas.addEventListener('webglcontextlost', handleContextLost)
    animationFrame = requestAnimationFrame(draw)

    return () => {
      requestDrawRef.current = () => undefined
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
    }
  }, [])

  useEffect(() => {
    requestDrawRef.current()
  }, [intensity, isPlaying, preset, theme])

  return (
    <div
      aria-hidden="true"
      class={`ambient-visual ambient-visual--${preset}${isPlaying ? ' is-playing' : ''}`}
      style={`--starfield-duration: ${starfieldSpeedSeconds}s; --starfield-near-delay: -${Math.max(2, Math.round(starfieldSpeedSeconds * 0.34))}s; --starfield-far-delay: -${Math.max(3, Math.round(starfieldSpeedSeconds * 0.68))}s;`}
    >
      <span class="ambient-visual__stars" />
      <span class="ambient-visual__aura" />
      <span class="ambient-visual__fallback-orb" />
      <canvas class="ambient-visual__canvas" ref={canvasRef} />
      <span class="ambient-visual__shadow" />
    </div>
  )
}
