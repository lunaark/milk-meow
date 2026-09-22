import * as THREE from 'three';

// Original parametric shape. No imported meshes, textures, or simulation code.
export function createCat() {
  const group = new THREE.Group();
  const surfaces = [];
  const milk = new THREE.Color('#fff7e6');
  const caramel = new THREE.Color('#d1a266');
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: .44,
    metalness: 0,
    clearcoat: .12,
    clearcoatRoughness: .5
  });
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(y, x), radial = Math.hypot(x, y);
    const ears = (Math.exp(-(((a - .87) / .25) ** 2)) + Math.exp(-(((a - 2.27) / .25) ** 2))) * .30 * radial ** 8;
    const rounded = v => Math.sign(v) * Math.abs(v) ** .78;
    pos.setXYZ(i, rounded(x) * 1.25, .025 + (rounded(y) + 1) * .84 + ears, rounded(z) * .86);
  }

  function recolor(base = milk, patch = caramel) {
    for (let i = 0; i < pos.count; i++) {
      const p = body.userData.rest;
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const blend = THREE.MathUtils.smoothstep(y, 1.47, 1.87) * THREE.MathUtils.smoothstep(x, .2, .68) * (1 - .12 * Math.abs(z));
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
    eye.position.set(side * .44, .85, .835);
    eye.scale.set(.095, .128, .046);
    add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white);
    glint.position.set(side * .44 - .023, .895, .877);
    glint.scale.set(.025, .035, .012);
    add(glint);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), blush);
    cheek.position.set(side * .68, .68, .779);
    cheek.scale.set(.12, .041, .018);
    add(cheek);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .67, .867),
      new THREE.Vector3(side * .055, .635, .864),
      new THREE.Vector3(side * .11, .64, .86),
      new THREE.Vector3(side * .15, .675, .855)
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .012, 8, false), chocolate));
  }
  const palettes = {
    milk: ['#fff7e6', '#d1a266'],
    berry: ['#f9dce0', '#c58d87'],
    matcha: ['#e3e7c9', '#a1ae76']
  };
  return {
    group,
    body,
    setFlavor(name) {
      const p = palettes[name] || palettes.milk;
      recolor(new THREE.Color(p[0]), new THREE.Color(p[1]));
    },
    update(physics) {
      for (const mesh of surfaces) {
        const arr = mesh.geometry.attributes.position;
        mesh.userData.binding ??= physics.bindPoints(mesh.userData.rest);
        physics.deform(mesh.userData.binding, arr.array);
        arr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
    }
  };
}
