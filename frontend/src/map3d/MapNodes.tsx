import { memo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { NodeVisual } from './nodes/NodeVisual';
import type { MapNode } from './schema';

// The interaction layer for the level nodes. Each node is a real 3D object; an invisible, generously sized hit volume
// around it takes the pointer (R3F raycasts it): hover feeds the highlight and the tooltip, a click opens the level.
// What a node looks like belongs to NodeVisual; this file only decides when it is hovered or clicked.

// A low, wide volume around the model plus a thin spire up through whatever floats above it (the beacon, the stars). Not one
// tall wide cylinder: seen from the camera's angle a nearer node's tall volume would cover the node behind it.
const HIT = { pad: { r: 2.9, h: 3.2, spireR: 1.3, spireH: 6.5 }, arena: { r: 4.6, h: 5, spireR: 2.2, spireH: 8 } } as const;

/** A click that moved this many pixels between press and release was a pan, not a click. */
const CLICK_SLOP = 6;

/** Nodes farther than this (blocks, on the ground) from where the camera looks draw as a cheap stand-in. */
const NEAR = 62;

interface SlotProps {
  node: MapNode;
  hovered: boolean;
  still: boolean;
  far: boolean;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
}

const NodeSlot = memo(function NodeSlot({ node, hovered, still, far, onHover, onSelect }: SlotProps) {
  const hit = HIT[node.meshType];
  return (
    <group position={[node.position[0], node.position[1], node.position[2]]}>
      <NodeVisual node={node} hovered={hovered} still={still} far={far && !hovered} />
      {[
        { r: hit.r, h: hit.h },
        { r: hit.spireR, h: hit.spireH },
      ].map(({ r, h }, i) => (
        <mesh
          key={i}
          position={[0, h / 2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(node.id);
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            if (e.delta > CLICK_SLOP) return;
            e.stopPropagation();
            onSelect(node.id);
          }}
        >
          <cylinderGeometry args={[r, r, h, 14]} />
          {/* draws nothing, but is still hit by the raycaster */}
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
});

export function MapNodes({ nodes, hoveredId, still, onHover, onSelect }: { nodes: readonly MapNode[]; hoveredId: number | null; still: boolean; onHover: (id: number | null) => void; onSelect: (id: number) => void }) {
  // which nodes are near the camera's target; every one starts "far" so the first frame is cheap, and the near ones fill in
  const [near, setNear] = useState('');
  useFrame(({ controls }) => {
    const t = (controls as { target?: THREE.Vector3 } | null)?.target;
    if (!t) return;
    const key = nodes.filter((n) => Math.hypot(n.position[0] - t.x, n.position[2] - t.z) < NEAR).map((n) => n.id).join(',');
    if (key !== near) setNear(key);
  });
  const nearIds = new Set(near ? near.split(',').map(Number) : []);
  return (
    <group name="nodes">
      {nodes.map((n) => (
        <NodeSlot key={n.id} node={n} hovered={hoveredId === n.id} still={still} far={!nearIds.has(n.id)} onHover={onHover} onSelect={onSelect} />
      ))}
    </group>
  );
}
