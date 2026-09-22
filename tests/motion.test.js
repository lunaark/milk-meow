import test from 'node:test';
import assert from 'node:assert/strict';
import { ToyMotion, deformPoint } from '../src/motion.js';

const advance = (motion, count, dt = 1 / 60, firmness, damping) => {
  for (let i = 0; i < count; i++) motion.step(dt, firmness, damping);
  return motion.state;
};

test('prolonged press reaches target and release recoils then rests', () => {
  const motion = new ToyMotion();
  motion.setTarget({ press: 0.7, pullX: 0.6, pullY: -0.5 });
  assert.equal(advance(motion, 600).press, 0.7);
  motion.release();
  let recoil = false;
  for (let i = 0; i < 180; i++) {
    const state = motion.step(1 / 60, 0.5, 0.1);
    recoil ||= state.press < 0;
    assert.ok(state.press >= -0.2 && state.press <= 0.8);
  }
  assert.ok(recoil);
  assert.deepEqual(advance(motion, 600), { press: 0, pullX: 0, pullY: 0, velocity: 0, settled: true });
});

test('equal elapsed time gives equal spring poses across frame partitions', () => {
  const slow = new ToyMotion();
  const fast = new ToyMotion();
  for (const motion of [slow, fast]) motion.setTarget({ press: 0.4, pullX: 0.3, pullY: -0.2 });
  advance(slow, 12, 1 / 30);
  advance(fast, 48, 1 / 120);
  for (const key of ['press', 'pullX', 'pullY', 'velocity']) {
    assert.ok(Math.abs(slow.state[key] - fast.state[key]) < 1e-10);
  }
});

test('extreme inputs, clocks and reset remain bounded and finite', () => {
  const motion = new ToyMotion();
  motion.setTarget({ press: 1e100, pullX: -1e100, pullY: Infinity });
  for (const dt of [NaN, Infinity, -5, 0, 1e100, 0.01]) {
    const state = motion.step(dt, Infinity, NaN);
    for (const key of ['press', 'pullX', 'pullY', 'velocity']) assert.ok(Number.isFinite(state[key]));
    assert.ok(state.press >= -0.2 && state.press <= 0.8);
    assert.ok(Math.abs(state.pullX) <= 1 && Math.abs(state.pullY) <= 1);
  }
  motion.reset();
  assert.deepEqual(motion.state, { press: 0, pullX: 0, pullY: 0, velocity: 0, settled: true });
});

test('deformation anchors floor and roughly preserves squash volume', () => {
  const out = {};
  assert.equal(deformPoint(0, 0, 0, { press: 0.8, pullX: 1, pullY: 1 }, out), out);
  assert.deepEqual(out, { x: 0, y: 0, z: 0 });
  for (const press of [-0.2, 0, 0.8]) {
    const p = deformPoint(1, 2.7, 1, { press });
    assert.ok(Math.abs(p.x * p.y * p.z - 2.7) < 1e-10);
    for (let y = 0; y <= 2.7; y += 0.1) assert.ok(deformPoint(1, y, -1, { press, pullX: 1 }).y >= 0);
  }
  assert.deepEqual(deformPoint(1, 2, -1), { x: 1, y: 2, z: -1 });
});
