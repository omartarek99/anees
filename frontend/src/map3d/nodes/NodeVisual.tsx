import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapNode } from '../schema';
import { Voxel } from '../voxel';
import { PORTAL, PORTAL_POS, arenaModel, farArenaModel } from './arena';
import { BEACON, BEACON_Y, farPadModel, padModel } from './pad';

/**
 * What a level node looks like: an everyday pad, or a boss arena (every 5th level). The origin is the centre of the node's
 * footprint on the ground. The node's `state` is the only thing that changes how it looks: locked (dim, padlocked), unlocked
 * (the level to play: gold rim and a bobbing star, or a burning doorway), completed (green and gold, stars, a trophy).
 * `hovered` is true while the pointer is over it. `still` is true for reduced-motion users: nothing moves by itself and a
 * hover is an instant change. `far` is true for a node far from where the camera looks: only a cheap static stand-in.
 */
export interface NodeVisualProps {
  node: MapNode;
  hovered: boolean;
  still: boolean;
  far: boolean;
}

/** Eases `cur` towards `target`. Reduced motion jumps straight there. */
function follow(cur: number, target: number, dt: number, still: boolean) {
  if (still) return target;
  const v = THREE.MathUtils.damp(cur, target, 9, dt);
  return Math.abs(v - target) < 0.002 ? target : v;
}

function FullNode({ node, hovered, still }: Omit<NodeVisualProps, 'far'>) {
  const { zone, state, id, stars } = node;
  const arena = node.meshType === 'arena';
  const body = useMemo(() => (arena ? arenaModel(zone, state, id) : padModel(zone, state, id, stars)), [arena, zone, state, id, stars]);
  const root = useRef<THREE.Group>(null);
  const live = useRef<THREE.Group>(null);
  const hv = useRef(0);

  useFrame(({ clock }, dt) => {
    const h = (hv.current = follow(hv.current, hovered ? 1 : 0, dt, still));
    const g = root.current;
    if (g) {
      g.position.y = 0.4 * h; // a hovered node lifts a little and swells
      g.scale.setScalar(1 + (arena ? 0.03 : 0.07) * h);
    }
    const l = live.current;
    if (l && !still) {
      const t = clock.elapsedTime;
      if (arena) {
        l.scale.setScalar(1 + 0.05 * Math.sin(t * 2.2)); // the portal breathes
      } else {
        l.position.y = BEACON_Y + 0.25 * Math.sin(t * 2.2);
        l.rotation.y = 0.3 * Math.sin(t * 1.3); // swings, never edge-on
      }
    }
  });

  return (
    <group ref={root}>
      <Voxel model={body} />
      {state === 'unlocked' && (arena ? <Voxel ref={live} model={PORTAL} position={PORTAL_POS} /> : <Voxel ref={live} model={BEACON} position={[0, BEACON_Y, 0]} />)}
    </group>
  );
}

export function NodeVisual({ node, hovered, still, far }: NodeVisualProps) {
  if (far) return <Voxel model={node.meshType === 'arena' ? farArenaModel(node.zone, node.state) : farPadModel(node.zone, node.state)} />;
  return <FullNode node={node} hovered={hovered} still={still} />;
}
