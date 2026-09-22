const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const safe = value => Number.isFinite(value) ? value : 0;
const DT = 1 / 180;
const DIMS = [7, 6, 5];
const LOW = [-1.55, 0, -1];
const HIGH = [1.55, 2.35, 1];
const SPACING = HIGH.map((value, axis) => (value - LOW[axis]) / (DIMS[axis] - 1));
const nodeIndex = (x, y, z) => (y * DIMS[2] + z) * DIMS[0] + x;

/** A small, independently implemented XPBD tetrahedral soft-body proxy.
 * The cuboid floor contacts approximate the visual cat's feet and underside.
 * Surface vertices share the same trilinear lattice field, including the face.
 */
export class SoftBody {
  constructor() {
    const count = DIMS[0] * DIMS[1] * DIMS[2];
    this.rest = new Float64Array(count * 3);
    for (let y = 0; y < DIMS[1]; y++) {
      for (let z = 0; z < DIMS[2]; z++) {
        for (let x = 0; x < DIMS[0]; x++) {
          const i = nodeIndex(x, y, z) * 3;
          this.rest.set([LOW[0] + x * SPACING[0], y * SPACING[1], LOW[2] + z * SPACING[2]], i);
        }
      }
    }
    this.positions = this.rest.slice();
    this.velocities = new Float64Array(this.rest.length);
    this.previous = this.rest.slice();
    this.tetrahedra = [];
    const edges = new Map();
    const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (let y = 0; y < DIMS[1] - 1; y++) {
      for (let z = 0; z < DIMS[2] - 1; z++) {
        for (let x = 0; x < DIMS[0] - 1; x++) {
          for (const order of permutations) {
            const p = [x, y, z];
            const ids = [nodeIndex(...p)];
            for (const axis of order) { p[axis]++; ids.push(nodeIndex(...p)); }
            let volume = this._volume(ids, this.rest);
            if (volume < 0) { [ids[1], ids[2]] = [ids[2], ids[1]]; volume = -volume; }
            this.tetrahedra.push({ ids, volume, lambda: 0 });
            for (let a = 0; a < 4; a++) {
              for (let b = a + 1; b < 4; b++) {
                const lo = Math.min(ids[a], ids[b]), hi = Math.max(ids[a], ids[b]);
                const key = `${lo}:${hi}`;
                if (!edges.has(key)) {
                  const i = lo * 3, j = hi * 3;
                  const length = Math.hypot(...[0, 1, 2].map(k => this.rest[i + k] - this.rest[j + k]));
                  edges.set(key, { i, j, length, lambda: 0 });
                }
              }
            }
          }
        }
      }
    }
    this.edges = [...edges.values()];
    this.restVolume = this.tetrahedra.reduce((sum, tet) => sum + tet.volume, 0);
    this._gradient = new Float64Array(12);
    this.reset();
  }

  _volume(ids, positions) {
    const [a, b, c, d] = ids.map(i => i * 3);
    const bx = positions[b] - positions[a], by = positions[b + 1] - positions[a + 1], bz = positions[b + 2] - positions[a + 2];
    const cx = positions[c] - positions[a], cy = positions[c + 1] - positions[a + 1], cz = positions[c + 2] - positions[a + 2];
    const dx = positions[d] - positions[a], dy = positions[d + 1] - positions[a + 1], dz = positions[d + 2] - positions[a + 2];
    return (bx * (cy * dz - cz * dy) + by * (cz * dx - cx * dz) + bz * (cx * dy - cy * dx)) / 6;
  }

  bindPoints(points) {
    const count = Math.floor(points.length / 3);
    const indices = new Uint16Array(count * 8);
    const weights = new Float64Array(count * 8);
    const offsets = new Float64Array(count * 3);
    for (let i = 0; i < count; i++) {
      const cells = [], fraction = [];
      for (let axis = 0; axis < 3; axis++) {
        const coordinate = safe(points[i * 3 + axis]);
        const inside = clamp(coordinate, LOW[axis], HIGH[axis]);
        const t = (inside - LOW[axis]) / SPACING[axis];
        cells[axis] = Math.min(DIMS[axis] - 2, Math.floor(t));
        fraction[axis] = t - cells[axis];
        offsets[i * 3 + axis] = coordinate - inside;
      }
      let corner = 0;
      for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) {
        indices[i * 8 + corner] = nodeIndex(cells[0] + x, cells[1] + y, cells[2] + z);
        weights[i * 8 + corner] = (x ? fraction[0] : 1 - fraction[0]) * (y ? fraction[1] : 1 - fraction[1]) * (z ? fraction[2] : 1 - fraction[2]);
        corner++;
      }
    }
    return { indices, weights, offsets, count };
  }

  deform(binding, output) {
    for (let i = 0; i < binding.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        let value = binding.offsets[i * 3 + axis];
        for (let corner = 0; corner < 8; corner++) {
          const k = i * 8 + corner;
          value += this.positions[binding.indices[k] * 3 + axis] * binding.weights[k];
        }
        output[i * 3 + axis] = axis === 1 ? Math.max(0, value) : value;
      }
    }
    return output;
  }

  grab(restPoint, worldTarget = restPoint) {
    this._grab = {
      rest: [safe(restPoint.x), safe(restPoint.y), safe(restPoint.z)],
      binding: this.bindPoints(new Float64Array([restPoint.x, restPoint.y, restPoint.z])),
      target: [0, 0, 0],
      lambda: [0, 0, 0]
    };
    this._grab.currentTarget = Array.from(this.deform(this._grab.binding, new Float64Array(3)));
    this.moveGrab(worldTarget);
  }

  moveGrab(target) {
    if (!this._grab) return;
    const values = [safe(target.x), safe(target.y), safe(target.z)];
    const delta = values.map((value, axis) => value - this._grab.rest[axis]);
    const length = Math.hypot(...delta);
    const scale = Math.min(1, 0.65 / Math.max(length, 1e-12));
    this._grab.target = delta.map((value, axis) => this._grab.rest[axis] + value * scale);
    this._grab.target[1] = Math.max(0.03, this._grab.target[1]);
  }

  release() { this._grab = null; }

  reset() {
    this.positions.set(this.rest);
    this.previous.set(this.rest);
    this.velocities.fill(0);
    this._accumulator = 0;
    this._grab = null;
  }

  nudge() {
    for (let i = 0; i < this.positions.length; i += 3) {
      const height = this.rest[i + 1] / HIGH[1];
      this.velocities[i] += 0.8 * height;
      this.velocities[i + 1] += 0.22 * height;
    }
  }

  step(dt, firmness = 0.5, damping = 0.35) {
    this._accumulator += clamp(safe(dt), 0, 0.05);
    firmness = clamp(Number.isFinite(firmness) ? firmness : 0.5, 0, 1);
    damping = clamp(Number.isFinite(damping) ? damping : 0.35, 0, 1);
    while (this._accumulator + 1e-12 >= DT) {
      this._substep(firmness, damping);
      this._accumulator -= DT;
    }
    return this.read();
  }

  _substep(firmness, damping) {
    const p = this.positions, v = this.velocities;
    this.previous.set(p);
    this._dampInternal(damping);
    const drag = Math.exp(-0.025 * DT);
    // A soft desk boundary acts on the center of mass, never individual rest poses.
    let centerX = 0, centerZ = 0, velocityX = 0, velocityZ = 0;
    const count = p.length / 3;
    for (let i = 0; i < p.length; i += 3) {
      centerX += p[i] / count; centerZ += p[i + 2] / count;
      velocityX += v[i] / count; velocityZ += v[i + 2] / count;
    }
    const radius = Math.hypot(centerX, centerZ);
    let boundaryX = 0, boundaryZ = 0;
    if (radius > 0.65) {
      const outwardSpeed = Math.max(0, (centerX * velocityX + centerZ * velocityZ) / radius);
      const force = (radius - 0.65) * 12 + outwardSpeed * 3;
      boundaryX = -centerX / radius * force;
      boundaryZ = -centerZ / radius * force;
    }
    for (let i = 0; i < p.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const k = i + axis;
        // No rest-position tether: elastic constraints alone recover the shape.
        const acceleration = axis === 1 ? -4.8 : axis === 0 ? boundaryX : boundaryZ;
        v[k] = clamp((v[k] + acceleration * DT) * drag, -8, 8);
        p[k] += v[k] * DT;
      }
    }
    for (const edge of this.edges) edge.lambda = 0;
    for (const tet of this.tetrahedra) tet.lambda = 0;
    if (this._grab) {
      this._grab.lambda.fill(0);
      for (let axis = 0; axis < 3; axis++) {
        this._grab.currentTarget[axis] += clamp((this._grab.target[axis] - this._grab.currentTarget[axis]) * 0.22, -0.035, 0.035);
      }
    }
    const edgeAlpha = (0.0004 * (1 - firmness) + 0.000001) / (DT * DT);
    const volumeAlpha = 0.00000002 / (DT * DT);
    for (let iteration = 0; iteration < 5; iteration++) {
      this._solveGrab();
      for (const edge of this.edges) {
        const { i, j } = edge;
        const dx = p[i] - p[j], dy = p[i + 1] - p[j + 1], dz = p[i + 2] - p[j + 2];
        const length = Math.hypot(dx, dy, dz);
        if (length < 1e-10) continue;
        const dl = (edge.length - length - edgeAlpha * edge.lambda) / (2 + edgeAlpha);
        edge.lambda += dl;
        const scale = dl / length;
        p[i] += dx * scale; p[j] -= dx * scale;
        p[i + 1] += dy * scale; p[j + 1] -= dy * scale;
        p[i + 2] += dz * scale; p[j + 2] -= dz * scale;
      }
      for (const tet of this.tetrahedra) this._solveVolume(tet, volumeAlpha);
      for (let i = 1; i < p.length; i += 3) p[i] = Math.max(0, p[i]);
    }
    for (let i = 0; i < p.length; i += 3) {
      const onFloor = p[i + 1] < 0.001;
      for (let axis = 0; axis < 3; axis++) {
        const k = i + axis;
        v[k] = clamp((p[k] - this.previous[k]) / DT, -5, 5);
        if (onFloor && axis !== 1) v[k] *= Math.exp(-5 * DT);
        if (onFloor && axis === 1) v[k] = Math.max(0, v[k]);
      }
    }
  }

  // Equal and opposite axial impulses damp strain, not shared translation.
  _dampInternal(damping) {
    const amount = 0.5 * (1 - Math.exp(-(0.04 + 24 * damping * damping) * DT));
    const p = this.positions, v = this.velocities;
    for (const { i, j } of this.edges) {
      const dx = p[i] - p[j], dy = p[i + 1] - p[j + 1], dz = p[i + 2] - p[j + 2];
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      if (lengthSquared < 1e-12) continue;
      const relative = ((v[i] - v[j]) * dx + (v[i + 1] - v[j + 1]) * dy + (v[i + 2] - v[j + 2]) * dz) / lengthSquared;
      const impulse = amount * relative;
      v[i] -= dx * impulse; v[j] += dx * impulse;
      v[i + 1] -= dy * impulse; v[j + 1] += dy * impulse;
      v[i + 2] -= dz * impulse; v[j + 2] += dz * impulse;
    }
  }

  tap(point = { x: 0, y: 2, z: 0 }) {
    const center = this.read().center;
    const contact = [safe(point.x), safe(point.y), safe(point.z)];
    const direction = [center.x - contact[0], center.y - contact[1], center.z - contact[2]];
    const length = Math.hypot(...direction) || 1;
    for (let i = 0; i < this.positions.length; i += 3) {
      const distanceSquared = (this.positions[i] - contact[0]) ** 2 + (this.positions[i + 1] - contact[1]) ** 2 + (this.positions[i + 2] - contact[2]) ** 2;
      const influence = Math.exp(-distanceSquared / 0.5);
      for (let axis = 0; axis < 3; axis++) {
        this.velocities[i + axis] += influence * (direction[axis] / length * 2.2 - (axis === 1 ? 0.35 : 0));
      }
    }
  }

  _solveGrab() {
    if (!this._grab) return;
    const { binding, currentTarget: target, lambda } = this._grab;
    const alpha = 0.00001 / (DT * DT);
    let denominator = alpha;
    for (const weight of binding.weights) denominator += weight * weight;
    for (let axis = 0; axis < 3; axis++) {
      let value = binding.offsets[axis];
      for (let i = 0; i < 8; i++) value += this.positions[binding.indices[i] * 3 + axis] * binding.weights[i];
      const dl = (target[axis] - value - alpha * lambda[axis]) / denominator;
      lambda[axis] += dl;
      for (let i = 0; i < 8; i++) this.positions[binding.indices[i] * 3 + axis] += binding.weights[i] * dl;
    }
  }

  _solveVolume(tet, alpha) {
    const p = this.positions, g = this._gradient;
    const [a, b, c, d] = tet.ids.map(i => i * 3);
    const bx = p[b] - p[a], by = p[b + 1] - p[a + 1], bz = p[b + 2] - p[a + 2];
    const cx = p[c] - p[a], cy = p[c + 1] - p[a + 1], cz = p[c + 2] - p[a + 2];
    const dx = p[d] - p[a], dy = p[d + 1] - p[a + 1], dz = p[d + 2] - p[a + 2];
    g[3] = (cy * dz - cz * dy) / 6; g[4] = (cz * dx - cx * dz) / 6; g[5] = (cx * dy - cy * dx) / 6;
    g[6] = (dy * bz - dz * by) / 6; g[7] = (dz * bx - dx * bz) / 6; g[8] = (dx * by - dy * bx) / 6;
    g[9] = (by * cz - bz * cy) / 6; g[10] = (bz * cx - bx * cz) / 6; g[11] = (bx * cy - by * cx) / 6;
    for (let axis = 0; axis < 3; axis++) g[axis] = -g[3 + axis] - g[6 + axis] - g[9 + axis];
    const volume = (bx * g[3] + by * g[4] + bz * g[5]);
    let denominator = alpha;
    for (const value of g) denominator += value * value;
    if (denominator < 1e-14) return;
    const dl = (tet.volume - volume - alpha * tet.lambda) / denominator;
    tet.lambda += dl;
    for (let node = 0; node < 4; node++) {
      const index = tet.ids[node] * 3;
      for (let axis = 0; axis < 3; axis++) p[index + axis] += g[node * 3 + axis] * dl;
    }
  }

  read() {
    let volume = 0, minTetRatio = Infinity, speedSquared = 0, minY = Infinity;
    const center = { x: 0, y: 0, z: 0 };
    for (const tet of this.tetrahedra) {
      const value = this._volume(tet.ids, this.positions);
      volume += value;
      minTetRatio = Math.min(minTetRatio, value / tet.volume);
    }
    for (let i = 0; i < this.positions.length; i += 3) {
      minY = Math.min(minY, this.positions[i + 1]);
      center.x += this.positions[i]; center.y += this.positions[i + 1]; center.z += this.positions[i + 2];
      speedSquared += this.velocities[i] ** 2 + this.velocities[i + 1] ** 2 + this.velocities[i + 2] ** 2;
    }
    const nodes = this.positions.length / 3;
    const speed = Math.sqrt(speedSquared / nodes);
    center.x /= nodes; center.y /= nodes; center.z /= nodes;
    return { center, volumeRatio: volume / this.restVolume, speed, minY, grabbed: !!this._grab, nodes, settled: !this._grab && speed < 0.006, minTetRatio };
  }
}
