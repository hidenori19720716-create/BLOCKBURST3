import { Point3D } from '../store/gameStore';

export type ShapeDefinition = {
  id: string;
  points: Point3D[];
  color: string;
};

// Colors
const colors = [
  '#ef4444', // Red
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
];

function c(index: number) {
  return colors[index % colors.length];
}

const BASE_SHAPES: ShapeDefinition[] = [
  // 1 unit (Dot)
  { id: 'single', color: c(0), points: [{x:0, y:0, z:0}] },
  
  // 2 units (Line 2)
  { id: 'line2', color: c(1), points: [{x:0, y:0, z:0}, {x:1, y:0, z:0}] },
  
  // 3 units (Line 3, Corner)
  { id: 'line3', color: c(2), points: [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:2, y:0, z:0}] },
  { id: 'corner2D', color: c(3), points: [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:0, y:1, z:0}] },
  
  // 4 units (Square, Line 4, T-shape, 3D Corner, 3D Stairs)
  { id: 'square2x2', color: c(4), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:1,y:1,z:0}] },
  { id: 'line4', color: c(5), points: [{x:0, y:0, z:0}, {x:1, y:0, z:0}, {x:2, y:0, z:0}, {x:3, y:0, z:0}] },
  { id: 't_shape2D', color: c(6), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:2,y:0,z:0}, {x:1,y:1,z:0}] },
  { id: 'corner3D', color: c(7), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1}] },
  { id: 'stairs3D', color: c(8), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:1,y:1,z:0}, {x:1,y:1,z:1}] },
  { id: 'z_shape2D', color: c(1), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:1,y:1,z:0}, {x:2,y:1,z:0}] },

  // 5 units (3D L-shape, Cross, Line 5)
  { id: 'L_shape3D', color: c(9), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:2,z:0}, {x:0,y:0,z:1}] },
  { id: 'cross2D', color: c(10), points: [{x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:1,y:1,z:0}, {x:2,y:1,z:0}, {x:1,y:2,z:0}] },
  { id: 'big_L2D', color: c(3), points: [{x:0,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:2,z:0}, {x:1,y:0,z:0}, {x:2,y:0,z:0}] },
  { id: 'line5', color: c(6), points: [{x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0},{x:3,y:0,z:0},{x:4,y:0,z:0}] },

  // 6 units (U shape, 3x2 rectangle)
  { id: 'u_shape', color: c(7), points: [{x:0,y:0,z:0}, {x:0,y:1,z:0}, {x:1,y:0,z:0}, {x:2,y:0,z:0}, {x:2,y:1,z:0}] },
  { id: 'rect3x2', color: c(8), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:2,y:0,z:0}, {x:0,y:1,z:0}, {x:1,y:1,z:0}, {x:2,y:1,z:0}] },

  // 7 units (3D Cross, Big T)
  { id: 'cross3D', color: c(5), points: [
      {x:1,y:1,z:0}, {x:1,y:1,z:2}, {x:1,y:0,z:1}, {x:1,y:2,z:1}, {x:0,y:1,z:1}, {x:2,y:1,z:1}, {x:1,y:1,z:1}
  ]},
  { id: 'big_t', color: c(4), points: [{x:0,y:0,z:0}, {x:1,y:0,z:0}, {x:2,y:0,z:0}, {x:1,y:1,z:0}, {x:1,y:2,z:0}, {x:1,y:3,z:0}] },

  // 8 units (Cube)
  { id: 'cube2x2x2', color: c(0), points: [
      {x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:1,y:1,z:0},
      {x:0,y:0,z:1},{x:1,y:0,z:1},{x:0,y:1,z:1},{x:1,y:1,z:1}
  ]},
  
  // 9 units (3x3 plane)
  { id: 'plane3x3', color: c(1), points: [
      {x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0},
      {x:0,y:1,z:0},{x:1,y:1,z:0},{x:2,y:1,z:0},
      {x:0,y:2,z:0},{x:1,y:2,z:0},{x:2,y:2,z:0}
  ]}
];

function rotatePoints(points: Point3D[], axis: 'x'|'y'|'z', turns: number): Point3D[] {
  let p = [...points];
  for(let i=0; i<turns; i++) {
    p = p.map(pt => {
      if (axis === 'x') return { x: pt.x, y: -pt.z, z: pt.y };
      if (axis === 'y') return { x: pt.z, y: pt.y, z: -pt.x };
      if (axis === 'z') return { x: -pt.y, y: pt.x, z: pt.z };
      return pt;
    });
  }
  
  // Normalize so the bounding box starts at 0,0,0
  const minX = Math.min(...p.map(pt => pt.x));
  const minY = Math.min(...p.map(pt => pt.y));
  const minZ = Math.min(...p.map(pt => pt.z));
  
  return p.map(pt => ({
    x: pt.x - minX,
    y: pt.y - minY,
    z: pt.z - minZ,
  }));
}

const SHAPE_WEIGHTS: Record<string, number> = {
  'single': 1,
  'line2': 2,
  'line3': 4,
  'corner2D': 4,
  
  'square2x2': 10,
  'line4': 10,
  't_shape2D': 10,
  'corner3D': 10,
  'stairs3D': 10,
  'z_shape2D': 10,

  'L_shape3D': 12,
  'cross2D': 12,
  'big_L2D': 12,
  'line5': 12,

  'u_shape': 12,
  'rect3x2': 12,

  'cross3D': 10,
  'big_t': 10,

  'cube2x2x2': 8,
  
  'plane3x3': 8,
};

export function getRandomShape(): ShapeDefinition {
  // Weighted random selection
  const totalWeight = BASE_SHAPES.reduce((sum, shape) => sum + (SHAPE_WEIGHTS[shape.id] || 5), 0);
  let randomVal = Math.random() * totalWeight;
  let selectedBase = BASE_SHAPES[0];

  for (const shape of BASE_SHAPES) {
    const weight = SHAPE_WEIGHTS[shape.id] || 5;
    randomVal -= weight;
    if (randomVal <= 0) {
      selectedBase = shape;
      break;
    }
  }

  let points = selectedBase.points;
  
  const turnsX = Math.floor(Math.random() * 4);
  const turnsY = Math.floor(Math.random() * 4);
  const turnsZ = Math.floor(Math.random() * 4);
  
  points = rotatePoints(points, 'x', turnsX);
  points = rotatePoints(points, 'y', turnsY);
  points = rotatePoints(points, 'z', turnsZ);
  
  return {
    ...selectedBase,
    id: `${selectedBase.id}-${Math.random().toString(36).substr(2,9)}`, // ensure unique id for animations/keys
    points,
  };
}
