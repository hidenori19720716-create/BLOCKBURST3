import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRandomShape, ShapeDefinition } from '../lib/shapes';
import { submitScore } from '../lib/firebase';

export type Point3D = { x: number; y: number; z: number };

export const GRID_SIZE = 5;

export interface DestructionEffect {
  id: string;
  x: number;
  y: number;
  z: number;
  color: string;
}

interface GameState {
  appState: 'menu' | 'playing';
  grid: Record<string, string>; // "x,y,z" -> color
  score: number;
  highScore: number;
  cumulativeScore: number;
  combo: number;
  hasClearedThisRound: boolean;
  hand: (ShapeDefinition | null)[];
  selectedHandIndex: number | null;
  status: 'playing' | 'gameover';
  recentDestructions: DestructionEffect[];
  floatingTexts: { id: string; text: string; color: string }[];
  recentShapesForClouds: {x: number, y: number, z: number, color: string}[][];
  showPerfectClear: boolean;
  
  dragState: { index: number; shape: ShapeDefinition } | null;
  dragPos: { x: number; y: number } | null;
  hoveredCell: Point3D | null;
  cameraPos: [number, number, number];

  setAppState: (state: 'menu' | 'playing') => void;
  setDragState: (state: any) => void;
  setDragPos: (pos: any) => void;
  setHoveredCell: (cell: Point3D | null) => void;
  setCameraPos: (pos: [number, number, number]) => void;

  selectHand: (index: number) => void;
  canPlace: (shape: ShapeDefinition, origin: Point3D) => boolean;
  placeBlock: (origin: Point3D) => void;
  resetGame: () => void;
}

function canPlaceOnGrid(shape: ShapeDefinition, origin: Point3D, grid: Record<string, string>): boolean {
  for (const pt of shape.points) {
    const tx = origin.x + pt.x;
    const ty = origin.y + pt.y;
    const tz = origin.z + pt.z;
    
    if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE || tz < 0 || tz >= GRID_SIZE) {
      return false;
    }
    if (grid[`${tx},${ty},${tz}`]) {
      return false;
    }
  }
  return true;
}

function generatePlayableHand(initialGrid: Record<string, string>): ShapeDefinition[] {
  const dummyGrid = { ...initialGrid };
  const newHand: ShapeDefinition[] = [];
  
  for (let i = 0; i < 3; i++) {
    let shapeToGive: ShapeDefinition | null = null;
    let attempts = 0;
    
    const cells: Point3D[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          cells.push({ x, y, z });
        }
      }
    }
    cells.sort(() => Math.random() - 0.5);

    while (attempts < 50) {
      const candidate = getRandomShape();
      let placementFound = false;
      let lastValidOrigin: Point3D | null = null;
      
      for (const cell of cells) {
        if (canPlaceOnGrid(candidate, cell, dummyGrid)) {
          placementFound = true;
          lastValidOrigin = cell;
          break;
        }
      }
      
      if (placementFound && lastValidOrigin) {
        shapeToGive = candidate;
        for (const pt of shapeToGive.points) {
            dummyGrid[`${lastValidOrigin.x + pt.x},${lastValidOrigin.y + pt.y},${lastValidOrigin.z + pt.z}`] = shapeToGive.color;
        }
        break;
      }
      attempts++;
    }
    
    if (!shapeToGive) {
      shapeToGive = getRandomShape();
    }
    
    newHand.push(shapeToGive);
  }
  
  return newHand;
}

function checkGameOver(state: GameState, set: any): boolean {
  if (state.hand.every(h => h === null)) return false; // Hand empty means we will refill

  let canPlaceAny = false;
  for (const shape of state.hand) {
    if (shape === null) continue;
    
    // Test all positions
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          if (state.canPlace(shape, {x, y, z})) {
             canPlaceAny = true;
             break;
          }
        }
        if (canPlaceAny) break;
      }
      if (canPlaceAny) break;
    }
    if (canPlaceAny) break;
  }

  if (!canPlaceAny) {
    set({ status: 'gameover' });
    const name = localStorage.getItem('playername');
    if (name) {
       submitScore(name, state.score);
    }
    return true;
  }
  return false;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      appState: 'menu',
  grid: {},
  score: 0,
  highScore: 0,
  cumulativeScore: 0,
  combo: 0,
  hasClearedThisRound: false,
  hand: generatePlayableHand({}),
  selectedHandIndex: null,
  status: 'playing',
  recentDestructions: [],
  floatingTexts: [],
  recentShapesForClouds: [],
  showPerfectClear: false,
  dragState: null,
  dragPos: null,
  hoveredCell: null,
  cameraPos: [8, 6, 8],

  setAppState: (appState) => set({ appState }),
  setDragState: (dragState) => set({ dragState }),
  setDragPos: (dragPos) => set({ dragPos }),
  setHoveredCell: (hoveredCell) => set({ hoveredCell }),
  setCameraPos: (cameraPos) => set({ cameraPos }),

  selectHand: (index) => {
    if (get().hand[index] && get().status === 'playing') {
      set({ selectedHandIndex: index === get().selectedHandIndex ? null : index });
    }
  },

  canPlace: (shape, origin) => {
    const { grid } = get();
    for (const pt of shape.points) {
      const tx = origin.x + pt.x;
      const ty = origin.y + pt.y;
      const tz = origin.z + pt.z;
      
      // out of bounds
      if (tx < 0 || tx >= GRID_SIZE || ty < 0 || ty >= GRID_SIZE || tz < 0 || tz >= GRID_SIZE) {
        return false;
      }
      // overlap
      if (grid[`${tx},${ty},${tz}`]) {
        return false;
      }
    }
    
    return true;
  },

  placeBlock: (origin) => {
    const state = get();
    const { dragState, hand, grid, score, combo, highScore } = state;
    
    if (!dragState) return;
    const shape = hand[dragState.index];
    if (!shape) return;

    if (!state.canPlace(shape, origin)) return;

    // Place it
    const newGrid = { ...grid };

    for (const pt of shape.points) {
      const tx = origin.x + pt.x;
      const ty = origin.y + pt.y;
      const tz = origin.z + pt.z;
      newGrid[`${tx},${ty},${tz}`] = shape.color;
    }

    // Determine place score (blocks count * 10)
    const placeScore = shape.points.length * 10;

    // Check lines
    const linesToRemove: string[] = [];
    
    // X lines
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          let full = true;
          for (let x = 0; x < GRID_SIZE; x++) {
            if (!newGrid[`${x},${y},${z}`]) full = false;
          }
          if (full) {
            for (let x = 0; x < GRID_SIZE; x++) linesToRemove.push(`${x},${y},${z}`);
          }
        }
      }
      // Y lines
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          let full = true;
          for (let y = 0; y < GRID_SIZE; y++) {
            if (!newGrid[`${x},${y},${z}`]) full = false;
          }
          if (full) {
            for (let y = 0; y < GRID_SIZE; y++) linesToRemove.push(`${x},${y},${z}`);
          }
        }
      }
      // Z lines
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          let full = true;
          for (let z = 0; z < GRID_SIZE; z++) {
            if (!newGrid[`${x},${y},${z}`]) full = false;
          }
          if (full) {
            for (let z = 0; z < GRID_SIZE; z++) linesToRemove.push(`${x},${y},${z}`);
          }
        }
      }

    // Process removals and score calculation
    let totalScoreToAdd = placeScore;
    let nextCombo = combo;
    let nextFloatingTexts = [...state.floatingTexts];

    const uniqueToRemove = Array.from(new Set(linesToRemove));
    const clearedDestructions: DestructionEffect[] = [];

    // Refill hand if empty
    const newHand = [...hand];
    newHand[dragState.index] = null;
    const isHandEmpty = newHand.every(h => h === null);

    let nextHasClearedThisRound = state.hasClearedThisRound;

    const currentSnapshot = Object.entries(newGrid).map(([key, color]) => {
      const [x,y,z] = key.split(',').map(Number);
      return {x, y, z, color: color as string};
    });
    const nextRecentShapesForClouds = currentSnapshot.length > 0 ? [...state.recentShapesForClouds, currentSnapshot].slice(-100) : state.recentShapesForClouds;

    if (uniqueToRemove.length > 0) {
      uniqueToRemove.forEach(k => {
        const [x,y,z] = k.split(',').map(Number);
        const color = newGrid[k];
        clearedDestructions.push({ id: `${k}-${Date.now()}-${Math.random()}`, x, y, z, color });
        delete newGrid[k];
      });
      nextCombo += 1;
      nextHasClearedThisRound = true;
      const numLines = Math.floor(linesToRemove.length / GRID_SIZE);
      const lineScore = uniqueToRemove.length * 20; // estimate 100 per 5-length line
      const comboBonus = nextCombo * 50;
      totalScoreToAdd += lineScore + comboBonus;

      let lineText = '';
      let lineColor = '#ffffff';
      if (numLines >= 4) { lineText = 'UNBELIEVABLE!'; lineColor = '#ec4899'; }
      else if (numLines === 3) { lineText = 'AMAZING!'; lineColor = '#8b5cf6'; }
      else if (numLines === 2) { lineText = 'EXCELLENT!'; lineColor = '#3b82f6'; }
      else if (numLines === 1) { lineText = 'GREAT!'; lineColor = '#22c55e'; }
      
      if (lineText) {
          nextFloatingTexts.push({ id: `lines-${Date.now()}`, text: lineText, color: lineColor });
      }
      
      if (nextCombo > 1) {
          nextFloatingTexts.push({ id: `combo-${Date.now()}`, text: `COMBO x${nextCombo}!`, color: '#eab308' });
      }

    } else {
      // In Block Blast, combo is maintained as long as you clear at least one line per round (set of 3 blocks)!
      // If we place a block and it doesn't clear, we DO NOT break the combo yet.
      // The combo is only broken if the round ends and we haven't cleared anything.
    }

    if (isHandEmpty) {
      const generated = generatePlayableHand(newGrid);
      newHand[0] = generated[0];
      newHand[1] = generated[1];
      newHand[2] = generated[2];
      if (!nextHasClearedThisRound) {
         nextCombo = 0; // Combo breaks if a full round of 3 passes with NO clears
      }
      nextHasClearedThisRound = false; // reset for next round
    }

    let isPerfect = false;
    if (uniqueToRemove.length > 0 && Object.keys(newGrid).length === 0) {
       totalScoreToAdd *= 3;
       isPerfect = true;
    }

    if (isPerfect) {
       nextFloatingTexts.push({ id: `perfect-${Date.now()}`, text: 'PERFECT CLEAR!', color: '#fbbf24' });
    }

    set((s) => ({
      ...s,
      grid: newGrid,
      hand: newHand,
      selectedHandIndex: null,
      score: score + totalScoreToAdd,
      cumulativeScore: s.cumulativeScore + totalScoreToAdd,
      combo: nextCombo,
      hasClearedThisRound: nextHasClearedThisRound,
      recentShapesForClouds: nextRecentShapesForClouds,
      highScore: Math.max(highScore, score + totalScoreToAdd),
      recentDestructions: clearedDestructions.length > 0 ? [...s.recentDestructions, ...clearedDestructions] : s.recentDestructions,
      floatingTexts: nextFloatingTexts,
      showPerfectClear: isPerfect || s.showPerfectClear
    }));

    if (isPerfect) {
       setTimeout(() => {
          set((s) => ({ ...s, showPerfectClear: false }));
       }, 2500);
    }

    if (nextFloatingTexts.length > state.floatingTexts.length) {
       const newItems = nextFloatingTexts.filter(t => !state.floatingTexts.find(old => old.id === t.id));
       setTimeout(() => {
          set((s) => ({
             ...s,
             floatingTexts: s.floatingTexts.filter(t => !newItems.find(n => n.id === t.id))
          }));
       }, 2000);
    }

    if (clearedDestructions.length > 0) {
       setTimeout(() => {
          set((s) => ({
             ...s,
             recentDestructions: s.recentDestructions.filter(d => !clearedDestructions.includes(d))
          }));
       }, 1500);
    }

    // Check game over in next cycle with the updated state
    setTimeout(() => {
      checkGameOver(get(), set);
    }, 10);
  },

  resetGame: () => {
    set((s) => ({
      grid: {},
      score: 0,
      combo: 0,
      hasClearedThisRound: false,
      hand: generatePlayableHand({}),
      selectedHandIndex: null,
      status: 'playing',
    }));
  }
}), {
  name: 'blockburst3-save',
  partialize: (state) => ({
    grid: state.grid,
    score: state.score,
    highScore: state.highScore,
    cumulativeScore: state.cumulativeScore,
    combo: state.combo,
    hasClearedThisRound: state.hasClearedThisRound,
    hand: state.hand,
    status: state.status,
  }),
}));
