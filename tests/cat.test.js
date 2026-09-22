import test from 'node:test';
import assert from 'node:assert/strict';
import { createCat } from '../src/cat.js';

test('model stays finite above the floor at supported deformation extremes and resets exactly', () => {
  const cat = createCat();
  const poses = [
    { press: .8, pullX: 1, pullY: -1 },
    { press: -.2, pullX: -1, pullY: 1 },
    { press: .6, pullX: .3, pullY: .2 },
  ];
  for (const pose of poses) {
    cat.update(pose, { x: 0, y: 1, z: .8, nx: 0, ny: 0, nz: 1 });
    for (const mesh of cat.group.children) {
      const { position, normal } = mesh.geometry.attributes;
      assert.ok(position.array.every(Number.isFinite));
      assert.ok(normal.array.every(Number.isFinite));
      for (let i = 0; i < position.count; i++) assert.ok(position.getY(i) >= 0);
    }
  }
  cat.update({ press: 0, pullX: 0, pullY: 0 }, null);
  for (const mesh of cat.group.children) {
    assert.deepEqual(mesh.geometry.attributes.position.array, mesh.userData.rest);
  }
});

test('flavor changes are reversible and independent of the current deformation', () => {
  const cat = createCat();
  const original = cat.body.geometry.attributes.color.array.slice();
  cat.update({ press: .6, pullX: .5, pullY: 0 }, null);
  cat.setFlavor('berry');
  assert.notDeepEqual(cat.body.geometry.attributes.color.array, original);
  cat.setFlavor('milk');
  assert.deepEqual(cat.body.geometry.attributes.color.array, original);
});
