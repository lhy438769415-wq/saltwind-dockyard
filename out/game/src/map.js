// The map: Saltwind Dockyard, a 48 x 40 m container yard at dusk. Two bomb sites —
// A, the crane yard on the west, and B, the warehouse on the east — joined by three
// lanes: A lane, mid, and B lane. Every box is a collider for players and bots and a
// surface a bullet stops on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Sites: where the beacon can be planted. A site is a flat zone on the ground.
export const SITES = {
  A: { name: 'A — Crane Yard', center: new THREE.Vector3(-13, 0, -11), radius: 4.2 },
  B: { name: 'B — Warehouse', center: new THREE.Vector3(13, 0, -11), radius: 4.2 },
};

export const SPAWNS = {
  // Night Tide (attackers, the player's team) come up from the south quay.
  ally: [
    [-3, 15], [0, 16], [3, 15], [-6, 13.5], [6, 13.5],
  ],
  // Harbor Watch (defenders) start north, between the two sites.
  enemy: [
    [-9, -14], [-3, -14.5], [3, -14.5], [9, -14], [0, -12.5],
  ],
};

// Waypoint graph the bots walk. Nodes are ground positions; edges join neighbours
// the bots may walk between. Lanes run south (attacker spawn) to north (sites).
export const WAYPOINTS = [
  // id: [x, z]
  [0, 15], // 0 attacker spawn
  [-8, 10], // 1 A approach low
  [0, 9], // 2 mid low
  [8, 10], // 3 B approach low
  [-11, 4], // 4 A lane
  [-2, 3], // 5 mid connector
  [11, 4], // 6 B lane
  [-13, -4], // 7 A lane high
  [0, -2], // 8 mid high
  [13, -4], // 9 B lane high
  [-13, -11], // 10 site A
  [13, -11], // 11 site B
  [0, -14], // 12 defender spawn
  [-6, -8], // 13 A hold
  [6, -8], // 14 B hold
  [-6, 0], // 15 west connector
  [6, 0], // 16 east connector
];
export const WAYPOINT_EDGES = [
  [0, 1], [0, 2], [0, 3],
  [1, 4], [2, 5], [3, 6],
  [4, 7], [5, 8], [6, 9],
  [4, 15], [6, 16], [5, 15], [5, 16],
  [7, 10], [8, 12], [9, 11],
  [7, 13], [9, 14], [10, 13], [11, 14],
  [12, 13], [12, 14], [13, 10], [14, 11],
  [15, 7], [16, 9], [15, 5], [16, 5],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // Containers get a slightly worn look: same hues, rougher.
  const containerMats = {
    rust: new THREE.MeshStandardMaterial({ color: 0xa34a32, roughness: 0.85, metalness: 0.15 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2f6f6a, roughness: 0.85, metalness: 0.15 }),
    ochre: new THREE.MeshStandardMaterial({ color: 0xc08a2e, roughness: 0.85, metalness: 0.15 }),
    slate: new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.85, metalness: 0.15 }),
  };

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function container(length, x, z, colorName, rotationY = 0, stacked = false) {
    // A standard 6.1 x 2.6 x 2.6 m shipping container, laid along x or z.
    const alongX = Math.abs(rotationY) < 0.01;
    const w = alongX ? length : 2.6;
    const d = alongX ? 2.6 : length;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), containerMats[colorName]);
    mesh.position.set(x, (stacked ? 2.6 : 0) + 1.3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    // Corrugation ribs, thin strips on the long faces, for silhouette.
    const ribMat = materials.slate;
    const ribs = Math.floor(length / 0.9);
    for (let i = 0; i < ribs; i += 1) {
      const t = -length / 2 + 0.45 + i * 0.9;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.06), ribMat);
      rib.position.set(alongX ? x + t : x, (stacked ? 2.6 : 0) + 1.3, alongX ? z + 1.32 : z + t);
      if (!alongX) rib.rotation.y = Math.PI / 2;
      group.add(rib);
    }
    return mesh;
  }

  // Ground: concrete apron, then a water strip along the south quay edge.
  box(48.4, 0.4, 40.4, 0, -0.2, 0, 'concrete');
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#16283e'), roughness: 0.25, metalness: 0.4 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.03, 23);
  group.add(water);

  // Perimeter: low harbour walls, open to the dusk sky.
  box(0.4, 5.0, 40.4, -24.2, 2.5, 0, 'slate');
  box(0.4, 5.0, 40.4, 24.2, 2.5, 0, 'slate');
  box(48.4, 5.0, 0.4, 0, 2.5, -20.2, 'slate');
  box(48.4, 1.1, 0.4, 0, 0.55, 20.2, 'slate'); // south quay rail, low so the water shows

  // Painted lane markings on the apron: thin flat boxes, barely above the ground.
  function marking(width, depth, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, depth), materials[material]);
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  marking(0.5, 30, -8, 0, 'ochre');
  marking(0.5, 30, 8, 0, 'ochre');
  // Site rings: flat octagon outlines drawn as short segments.
  for (const site of Object.values(SITES)) {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.35), materials.accent);
      seg.position.set(site.center.x + Math.cos(a) * site.radius, 0.02, site.center.z + Math.sin(a) * site.radius);
      seg.rotation.y = -a;
      group.add(seg);
    }
  }

  // ---- Site A: the crane yard (west). A gantry crane straddles the site. ----
  // Crane legs: four tall posts; top beam; a hook block hanging over the site.
  box(0.8, 9.5, 0.8, -17, 4.75, -14, 'slate');
  box(0.8, 9.5, 0.8, -9, 4.75, -14, 'slate');
  box(0.8, 9.5, 0.8, -17, 4.75, -8, 'slate');
  box(0.8, 9.5, 0.8, -9, 4.75, -8, 'slate');
  box(9.6, 1.0, 1.4, -13, 9.6, -11, 'ochre');
  box(1.2, 1.2, 1.2, -13, 8.2, -11, 'rust'); // hook block
  box(0.15, 2.2, 0.15, -13, 6.6, -11, 'slate'); // hook cable
  // Containers framing A.
  container(6.1, -18.5, -6, 'rust', Math.PI / 2);
  container(6.1, -7.5, -15.5, 'teal');
  container(6.1, -19, -12, 'ochre', 0, true);
  container(6.1, -19, -12, 'slate', 0, false);
  container(6.1, -4, -8, 'rust', Math.PI / 2);

  // ---- Site B: the warehouse (east). A big shed with a door gap on its south face. ----
  box(10, 6, 0.4, 13, 3, -15.5, 'slate'); // north wall
  box(0.4, 6, 8, 8.2, 3, -11.5, 'slate'); // west wall
  box(0.4, 6, 8, 17.8, 3, -11.5, 'slate'); // east wall
  box(10, 1.2, 0.4, 13, 5.4, -7.6, 'slate'); // south lintel above the door
  box(3.4, 4.8, 0.4, 9.8, 2.4, -7.6, 'slate'); // south wall, west of door
  box(3.4, 4.8, 0.4, 16.2, 2.4, -7.6, 'slate'); // south wall, east of door
  box(10.4, 0.5, 8.4, 13, 6.2, -11.5, 'concrete'); // roof slab
  // Crates inside B.
  box(1.8, 1.2, 1.8, 10.5, 0.6, -13.5, 'ochre');
  box(1.8, 1.2, 1.8, 15.5, 0.6, -13.5, 'teal');
  box(1.2, 1.2, 1.2, 15.5, 1.8, -13.5, 'rust');
  // Containers framing B.
  container(6.1, 19, -6, 'teal', Math.PI / 2);
  container(6.1, 7.5, -15.5, 'rust');

  // ---- Mid: container lanes between the sites. ----
  container(6.1, -11, 2, 'teal');
  container(6.1, 11, 2, 'rust');
  container(6.1, -3, -3, 'slate', Math.PI / 2);
  container(6.1, 3, -3, 'ochre', Math.PI / 2);
  container(6.1, -11, 2, 'ochre', 0, true);
  container(6.1, 11, 2, 'teal', 0, true);
  // Low crates for crouch cover on the lanes.
  box(1.6, 0.9, 1.6, -7.5, 0.45, 7.5, 'rust');
  box(1.6, 0.9, 1.6, 7.5, 0.45, 7.5, 'teal');
  box(2.2, 1.1, 1.2, 0, 0.55, 6.5, 'slate');
  box(1.6, 0.9, 1.6, -16, 0.45, 8, 'ochre');
  box(1.6, 0.9, 1.6, 16, 0.45, 8, 'rust');
  // Floodlight poles: tall posts with a head that glows at dusk.
  for (const [x, z] of [[-20, 0], [20, 0], [-13, -16], [13, 16]]) {
    box(0.35, 7.5, 0.35, x, 3.75, z, 'slate');
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    head.position.set(x, 7.7, z);
    group.add(head);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 16, 1.8);
    lamp.position.set(x, 7.4, z);
    scene.add(lamp);
  }

  // Light: low amber sun from the west, cool dusk fill, and a sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4a6b'), new THREE.Color('#1c2436'), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.8);
  sun.position.set(-18, 9, 12);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6d94'), 0.85);
  fill.position.set(14, 10, 14);
  scene.add(fill);

  // Navigation helpers over the waypoint graph.
  const adjacency = WAYPOINTS.map(() => []);
  for (const [a, b] of WAYPOINT_EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  function nearestWaypoint(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const dx = WAYPOINTS[i][0] - x;
      const dz = WAYPOINTS[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }
  function findPath(from, to) {
    // Breadth-first search over the waypoint graph; returns node ids.
    if (from === to) return [to];
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length > 0) {
      const node = queue.shift();
      for (const next of adjacency[node]) {
        if (prev[next] !== -1) continue;
        prev[next] = node;
        if (next === to) {
          const path = [to];
          let walk = to;
          while (walk !== from) {
            walk = prev[walk];
            path.unshift(walk);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  return {
    colliders,
    shootables,
    group,
    sites: SITES,
    spawns: SPAWNS,
    waypoints: WAYPOINTS,
    nearestWaypoint,
    findPath,
    inSite(point, site) {
      const dx = point.x - site.center.x;
      const dz = point.z - site.center.z;
      return dx * dx + dz * dz <= site.radius * site.radius;
    },
  };
}
