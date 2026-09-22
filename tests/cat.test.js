import test from 'node:test';
import assert from 'node:assert/strict';
import { createCat } from '../src/cat.js';
import { SoftBody } from '../src/soft-body.js';

test('model stays finite above the floor at supported deformation extremes and resets exactly', () => {
  const cat = createCat();
  const physics = new SoftBody();
  for (const target of [{x:1,y:1,z:.8},{x:-1,y:2,z:.8},{x:0,y:.4,z:.2}]) {
    physics.grab({x:0,y:1,z:.8},target);
    for(let frame=0;frame<30;frame++) physics.step(1/60);
    cat.update(physics);
    for (const mesh of cat.group.children) {
      const { position, normal } = mesh.geometry.attributes;
      assert.ok(position.array.every(Number.isFinite));
      assert.ok(normal.array.every(Number.isFinite));
      for (let i = 0; i < position.count; i++) assert.ok(position.getY(i) >= 0);
    }
  }
  physics.reset();
  cat.update(physics);
  for (const mesh of cat.group.children) {
    const actual=mesh.geometry.attributes.position.array;
    for(let i=0;i<actual.length;i++) assert.ok(Math.abs(actual[i]-mesh.userData.rest[i])<1e-5);
  }
});

test('flavor changes are reversible and independent of the current deformation', () => {
  const cat = createCat();
  const physics = new SoftBody();
  const original = cat.body.geometry.attributes.color.array.slice();
  physics.grab({x:0,y:1.7,z:0},{x:.4,y:1.2,z:0});
  for(let frame=0;frame<30;frame++) physics.step(1/60);
  cat.update(physics);
  cat.setFlavor('berry');
  assert.notDeepEqual(cat.body.geometry.attributes.color.array, original);
  cat.setFlavor('milk');
  assert.deepEqual(cat.body.geometry.attributes.color.array, original);
});
