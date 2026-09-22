import * as THREE from 'three';
import { deformPoint } from './motion.js';

// Original parametric shape. No imported meshes, textures, or simulation code.
export function createCat() {
  const group = new THREE.Group();
  const surfaces = [];
  const milk = new THREE.Color('#fff7e6');
  const caramel = new THREE.Color('#d1a266');
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: .35,
    metalness: 0,
    clearcoat: .22,
    clearcoatRoughness: .5
  });
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(y, x), radial = Math.hypot(x, y);
    const ears = (Math.exp(-(((a - .87) / .24) ** 2)) + Math.exp(-(((a - 2.27) / .24) ** 2))) * .44 * radial ** 8;
    pos.setXYZ(i, x * 1.32 * (1 + .07 * (1 - y)), .045 + (y + 1) * .94 + ears, z * .86);
  }

  function recolor(base = milk, patch = caramel) {
    for (let i = 0; i < pos.count; i++) {
      const p = body.userData.rest;
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const blend = THREE.MathUtils.smoothstep(y, 1.73, 2.18) * THREE.MathUtils.smoothstep(x, .2, .68) * (1 - .12 * Math.abs(z));
      const c = base.clone().lerp(patch, blend);
      c.toArray(colors, i * 3);
    }
    geometry.attributes.color.needsUpdate = true;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const body = new THREE.Mesh(geometry, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;

  function add(mesh) {
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.userData.rest = mesh.geometry.attributes.position.array.slice();
    surfaces.push(mesh);
    group.add(mesh);
    return mesh;
  }
  add(body);
  recolor();
  const chocolate = new THREE.MeshStandardMaterial({
    color: '#593e30',
    roughness: .27
  });
  const white = new THREE.MeshBasicMaterial({
    color: '#fff9e9'
  });
  const blush = new THREE.MeshStandardMaterial({
    color: '#e7b6a6',
    roughness: .75
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 20), chocolate);
    eye.position.set(side * .44, 1.03, .79);
    eye.scale.set(.095, .128, .046);
    add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white);
    glint.position.set(side * .44 - .023, 1.075, .832);
    glint.scale.set(.025, .035, .012);
    add(glint);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), blush);
    cheek.position.set(side * .68, .83, .725);
    cheek.scale.set(.12, .041, .018);
    add(cheek);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .82, .87),
      new THREE.Vector3(side * .065, .77, .868),
      new THREE.Vector3(side * .135, .78, .86),
      new THREE.Vector3(side * .18, .825, .849)
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .012, 8, false), chocolate));
  }
  const palettes = {
    milk: ['#fff7e6', '#d1a266'],
    berry: ['#f9dce0', '#c58d87'],
    matcha: ['#e3e7c9', '#a1ae76']
  };
  const scratch = {};
  return {
    group,
    body,
    setFlavor(name) {
      const p = palettes[name] || palettes.milk;
      recolor(new THREE.Color(p[0]), new THREE.Color(p[1]));
    },
    update(state, contact) {
      for (const mesh of surfaces) {
        const arr = mesh.geometry.attributes.position;
        const rest = mesh.userData.rest;
        for (let i = 0; i < arr.count; i++) {
          let x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
          if (contact && state.press > 0) {
            const d = (x - contact.x) ** 2 + (y - contact.y) ** 2 + (z - contact.z) ** 2;
            const dent = Math.exp(-d / .32) * state.press * .48;
            x -= contact.nx * dent;
            y = Math.max(.015, y - contact.ny * dent);
            z -= contact.nz * dent;
          }
          deformPoint(x, y, z, state, scratch);
          arr.setXYZ(i, scratch.x, scratch.y, scratch.z);
        }
        arr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
    }
  };
}
