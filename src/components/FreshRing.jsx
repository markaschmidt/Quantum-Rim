import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

import { useSimStore } from '../store/useSimStore';

export function FreshRings() {
  const rings = useRef(new Map());

  useFrame(() => {
    const now = Date.now();
    const bodies = useSimStore.getState().bodies.filter((body) => body.isAlive !== false);
    const live = new Set();
    for (const body of bodies) {
      const mesh = rings.current.get(body.id);
      if (!mesh) continue;
      live.add(body.id);
      const fresh = (body.freshUntil || 0) > now;
      mesh.visible = fresh;
      if (!fresh) continue;
      mesh.position.set(body.position[0], body.position[1], body.position[2]);
      const scale = Math.max(body.radius * 2.4, 0.28);
      mesh.scale.setScalar(scale);
    }
    for (const [id, mesh] of rings.current) {
      if (!live.has(id)) mesh.visible = false;
    }
  });

  const freshKey = useSimStore((state) => state.bodies
    .filter((body) => body.freshUntil)
    .map((body) => body.id)
    .join('|'));
  const ids = freshKey ? freshKey.split('|') : [];
  return ids.map((id) => (
    <mesh
      key={id}
      ref={(node) => {
        if (node) rings.current.set(id, node);
        else rings.current.delete(id);
      }}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onPointerOver={(event) => {
        event.stopPropagation();
        useSimStore.getState().dismissFresh(id);
      }}
    >
      <ringGeometry args={[1.2, 1.48, 48]} />
      <meshBasicMaterial color="#f0c14a" transparent opacity={0.92} side={2} depthWrite={false} />
    </mesh>
  ));
}
