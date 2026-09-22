import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftBody } from '../src/soft-body.js';

const run = (body, frames, firmness = 0.5, damping = 0.35) => {
  for (let frame = 0; frame < frames; frame++) body.step(1 / 60, firmness, damping);
  return body.read();
};

test('bindings preserve rest points and a grab produces local volumetric deformation', () => {
  const body = new SoftBody();
  const points = new Float32Array([0, 1.72, 0, -1.45, 1.72, -0.9, 0.2, 0.025, 0.3]);
  const binding = body.bindPoints(points);
  const output = new Float32Array(points.length);
  body.deform(binding, output);
  for (let i = 0; i < points.length; i++) assert.ok(Math.abs(points[i] - output[i]) < 1e-6);
  body.grab({ x: 0, y: 1.72, z: 0 }, { x: 0, y: 1.24, z: 0 });
  run(body, 80);
  body.deform(binding, output);
  assert.ok(output[1] < 1.5, 'pressed point must visibly sink');
  assert.ok(Math.abs(output[4] - points[4]) < Math.abs(output[1] - points[1]), 'distant point moves less than contact');
  assert.ok(body.read().volumeRatio > 0.96 && body.read().volumeRatio < 1.04);
  assert.ok(body.read().minTetRatio > 0, 'tetrahedra retain orientation');
});

test('release recovers volume and floor rest without pinned particles', () => {
  const body = new SoftBody();
  body.grab({ x: 0.4, y: 1.8, z: 0.6 }, { x: 0.65, y: 1.3, z: 0.6 });
  run(body, 60);
  body.release();
  const state = run(body, 900);
  assert.ok(Math.abs(state.volumeRatio - 1) < 0.01);
  assert.ok(state.minY >= 0 && state.minY < 0.01);
  assert.ok(state.speed < 0.02);
  assert.equal(state.grabbed, false);
});

test('repeated extreme grabs remain finite, grounded and non-inverted', () => {
  const body = new SoftBody();
  for (let cycle = 0; cycle < 12; cycle++) {
    body.grab({ x: cycle % 2 ? 1 : -1, y: 1.6, z: 0.7 }, { x: cycle % 2 ? -100 : 100, y: cycle % 3 ? -100 : 100, z: cycle % 2 ? 100 : -100 });
    for (let frame = 0; frame < 24; frame++) {
      const state = body.step(1 / 60, 0, 0);
      assert.ok(state.minTetRatio > 0);
      assert.ok(state.minY >= 0);
      assert.ok(state.volumeRatio > 0.85 && state.volumeRatio < 1.15);
      for (const coordinate of body.positions) assert.ok(Number.isFinite(coordinate) && Math.abs(coordinate) < 10);
    }
    body.release();
    run(body, 12, 0, 0);
  }
});

test('fixed steps are partition-independent, invalid clocks are ignored, and reset is exact', () => {
  const a = new SoftBody(), b = new SoftBody();
  a.nudge(); b.nudge();
  for (let i = 0; i < 30; i++) a.step(1 / 60);
  for (let i = 0; i < 60; i++) b.step(1 / 120);
  assert.deepEqual(a.positions, b.positions);
  const before = a.positions.slice();
  for (const dt of [NaN, Infinity, -1]) a.step(dt);
  assert.deepEqual(a.positions, before);
  a.grab({ x: 0, y: 1, z: 0 }, { x: NaN, y: Infinity, z: 0 });
  a.step(100, NaN, Infinity);
  assert.ok([...a.positions].every(Number.isFinite));
  a.reset();
  assert.deepEqual(a.positions, a.rest);
  assert.equal(a.read().speed, 0);
  assert.equal(a.read().grabbed, false);
  assert.equal(a.read().settled, true);
});

test('default button press retains release inertia and settles within three simulated seconds', () => {
  const body = new SoftBody();
  body.grab({ x: 0, y: 1.72, z: 0 }, { x: 0, y: 1.24, z: 0 });
  run(body, 29, .45, .35);
  body.release();
  assert.ok(body.read().speed > .05);
  const result = run(body, 180, .45, .35);
  assert.ok(result.speed < .03);
  assert.ok(Math.abs(result.volumeRatio - 1) < .01);
});
