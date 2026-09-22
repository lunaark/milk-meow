const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const LIMITS = { press: [-0.2, 0.8], pullX: [-1, 1], pullY: [-1, 1] };
const AXES = Object.keys(LIMITS);

/** A bounded damped spring; pullY represents dragging forward/back on the floor. */
export class ToyMotion {
  constructor() { this.reset(); }

  setTarget({ press = 0, pullX = 0, pullY = 0 } = {}) {
    for (const [key, value] of Object.entries({ press, pullX, pullY })) {
      this._target[key] = clamp(finite(value), ...LIMITS[key]);
    }
  }

  release() { this.setTarget(); }

  reset() {
    this._position = { press: 0, pullX: 0, pullY: 0 };
    this._target = { ...this._position };
    this._velocity = { ...this._position };
  }

  step(dt, firmness = 0.5, damping = 0.5) {
    // Ignore invalid clocks and cap background-tab catch-up to avoid a visual jump.
    const elapsed = clamp(finite(dt), 0, 0.25);
    if (!elapsed) return this.state;
    const omega = 9 + 15 * clamp(finite(firmness, 0.5), 0, 1);
    const ratio = 0.22 + 0.72 * clamp(finite(damping, 0.5), 0, 1);
    const decay = ratio * omega;
    const frequency = omega * Math.sqrt(1 - ratio * ratio);
    const steps = Math.ceil(elapsed * 240);
    const h = elapsed / steps;
    const envelope = Math.exp(-decay * h);
    const cosine = Math.cos(frequency * h);
    const sine = Math.sin(frequency * h);
    for (let i = 0; i < steps; i++) {
      for (const key of AXES) {
        // Exact damped oscillator evolution inside small bounded time steps.
        const offset = this._position[key] - this._target[key];
        const velocity = this._velocity[key];
        const next = this._target[key] + envelope *
          (offset * cosine + (velocity + decay * offset) * sine / frequency);
        let nextVelocity = envelope *
          (velocity * cosine - (decay * velocity + omega * omega * offset) * sine / frequency);
        const bounded = clamp(next, ...LIMITS[key]);
        if (bounded !== next) nextVelocity = 0;
        this._position[key] = bounded;
        this._velocity[key] = nextVelocity;
      }
    }
    if (this.state.settled) {
      this._position = { ...this._target };
      this._velocity = { press: 0, pullX: 0, pullY: 0 };
    }
    return this.state;
  }

  get state() {
    const velocity = Math.hypot(...AXES.map(key => this._velocity[key]));
    const error = Math.hypot(...AXES.map(key => this._position[key] - this._target[key]));
    return { ...this._position, velocity, settled: error < 0.0002 && velocity < 0.002 };
  }
}

/** Deform a rest-space point without allocations when a reusable out is supplied. */
export function deformPoint(x, y, z, state = {}, out = {}) {
  x = finite(x); y = Math.max(0, finite(y)); z = finite(z);
  const press = clamp(finite(state.press), ...LIMITS.press);
  const pullX = clamp(finite(state.pullX), ...LIMITS.pullX);
  const pullY = clamp(finite(state.pullY), ...LIMITS.pullY);
  const height = clamp(y / 2.7, 0, 1);
  const vertical = 1 - 0.55 * press;
  // Inverse square-root expansion approximately preserves volume while squashing.
  const lateral = 1 / Math.sqrt(vertical);
  const shear = height * height * (3 - 2 * height);
  out.x = x * lateral + 0.85 * pullX * shear;
  out.y = y * vertical;
  out.z = z * lateral + 0.7 * pullY * shear;
  return out;
}
