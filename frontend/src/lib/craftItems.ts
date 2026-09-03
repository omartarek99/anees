// -------------------------------------------------------------------------------------------
// Item + recipe registry for the Builder's Quarry. Ids 1..27 are blocks (see craftWorld.ts);
// 40+ are non-block items (materials, food, potions, tools). Everything the player can hold,
// craft, mine or consume is described here so the systems stay in sync.
// -------------------------------------------------------------------------------------------
import {
  GRASS,
  DIRT,
  STONE,
  WOOD,
  LEAVES,
  RUNEBLOCK,
  BEDROCK,
  COBBLE,
  PLANKS,
  SAND,
  GRAVEL,
  GLASS,
  DEEPSLATE,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  REDSTONE_ORE,
  LAPIS_ORE,
  DIAMOND_ORE,
  EMERALD_ORE,
  GLOWSTONE,
  CRAFTING_TABLE,
  FURNACE,
  TORCH,
  SNOW,
  WHEAT_CROP,
  RUNE,
} from './craftWorld';

// ---- non-block item ids -----------------------------------------------------------------
export const STICK = 40;
export const COAL = 41;
export const IRON = 42;
export const GOLD = 43;
export const REDSTONE = 44;
export const LAPIS = 45;
export const DIAMOND = 46;
export const EMERALD = 47;
export const GLOWDUST = 48;
export const WHEAT = 49;
export const APPLE = 50;
export const RAW_PORK = 51;
export const COOKED_PORK = 52;
export const BREAD = 53;
export const APPLE_PIE = 54;
export const COOKIE = 55;
export const STEW = 56;
export const BOTTLE = 57;
export const POT_HEAL = 60;
export const POT_SPEED = 61;
export const POT_JUMP = 62;
export const POT_NIGHT = 63;
export const AXE = 70;
export const PICK_WOOD = 71;
export const PICK_STONE = 72;
export const PICK_DIAMOND = 73;
export const SWORD = 74;

export type ItemKind = 'block' | 'material' | 'food' | 'potion' | 'tool';
export type PotionKind = 'heal' | 'speed' | 'jump' | 'night';
export type ToolKind = 'axe' | 'pick' | 'sword';

export type ItemDef = {
  nameKey: string;
  kind: ItemKind;
  emoji?: string; // shown in menu / hotbar for non-block items
  label?: string; // short text badge (minerals)
  swatch?: string; // block face colour for the hotbar swatch + dig particles
  place?: boolean; // placeable as a block
  mineMs?: number; // base break time (blocks)
  food?: number; // hunger points restored
  potion?: PotionKind;
  tool?: ToolKind;
  tier?: number; // 1..3 for picks
};

const B = (nameKey: string, swatch: string, mineMs: number, place = true): ItemDef => ({
  nameKey,
  kind: 'block',
  swatch,
  mineMs,
  place,
});

export const ITEM: Record<number, ItemDef> = {
  [GRASS]: B('craft.tileGrass', '#5fa83d', 180),
  [DIRT]: B('craft.tileDirt', '#7a5433', 170),
  [STONE]: B('craft.tileStone', '#8f8f97', 520),
  [WOOD]: B('craft.tileWood', '#8a5a30', 240),
  [LEAVES]: B('craft.tileLeaves', '#4c9a3c', 90),
  [RUNE]: { nameKey: 'craft.tileRune', kind: 'block', swatch: '#6a5acd', place: false, mineMs: 700 },
  [RUNEBLOCK]: B('craft.tileRuneBrick', '#f0a83a', 220),
  [BEDROCK]: { nameKey: 'craft.tileBedrock', kind: 'block', swatch: '#2c2a30', place: false, mineMs: Infinity },
  [COBBLE]: B('craft.tileCobble', '#83838b', 540),
  [PLANKS]: B('craft.tilePlanks', '#b1834e', 220),
  [SAND]: B('craft.tileSand', '#ddd0a3', 150),
  [GRAVEL]: B('craft.tileGravel', '#8b8683', 180),
  [GLASS]: B('craft.tileGlass', '#cfe8f2', 120),
  [DEEPSLATE]: B('craft.tileDeepslate', '#55555c', 720),
  [COAL_ORE]: B('craft.tileCoalOre', '#4a4a52', 560),
  [IRON_ORE]: B('craft.tileIronOre', '#b8a99a', 640),
  [GOLD_ORE]: B('craft.tileGoldOre', '#d9b25a', 640),
  [REDSTONE_ORE]: B('craft.tileRedstoneOre', '#b23b3b', 640),
  [LAPIS_ORE]: B('craft.tileLapisOre', '#2f5fbf', 640),
  [DIAMOND_ORE]: B('craft.tileDiamondOre', '#4fe0d0', 740),
  [EMERALD_ORE]: B('craft.tileEmeraldOre', '#2ecc71', 740),
  [GLOWSTONE]: B('craft.tileGlowstone', '#e7c15b', 240),
  [CRAFTING_TABLE]: B('craft.tileCraftingTable', '#9a6b3e', 280),
  [FURNACE]: B('craft.tileFurnace', '#6e6e76', 520),
  [TORCH]: B('craft.tileTorch', '#f2b03a', 40),
  [SNOW]: B('craft.tileSnow', '#eef3f7', 120),
  [WHEAT_CROP]: { nameKey: 'craft.tileWheatCrop', kind: 'block', swatch: '#cdae4f', place: false, mineMs: 40 },

  [STICK]: { nameKey: 'craft.itemStick', kind: 'material', label: '|', swatch: '#8a5a30' },
  [COAL]: { nameKey: 'craft.itemCoal', kind: 'material', label: 'C', swatch: '#3a3a3f' },
  [IRON]: { nameKey: 'craft.itemIron', kind: 'material', label: 'Fe', swatch: '#c9bcae' },
  [GOLD]: { nameKey: 'craft.itemGold', kind: 'material', label: 'Au', swatch: '#d9b25a' },
  [REDSTONE]: { nameKey: 'craft.itemRedstone', kind: 'material', label: 'R', swatch: '#b23b3b' },
  [LAPIS]: { nameKey: 'craft.itemLapis', kind: 'material', label: 'L', swatch: '#2f5fbf' },
  [DIAMOND]: { nameKey: 'craft.itemDiamond', kind: 'material', label: 'D', swatch: '#4fe0d0' },
  [EMERALD]: { nameKey: 'craft.itemEmerald', kind: 'material', label: 'E', swatch: '#2ecc71' },
  [GLOWDUST]: { nameKey: 'craft.itemGlowdust', kind: 'material', emoji: '✨', swatch: '#e7c15b' },
  [WHEAT]: { nameKey: 'craft.itemWheat', kind: 'material', emoji: '🌾', swatch: '#cdae4f' },
  [APPLE]: { nameKey: 'craft.itemApple', kind: 'food', emoji: '🍎', food: 4 },
  [RAW_PORK]: { nameKey: 'craft.itemRawPork', kind: 'food', emoji: '🥩', food: 3 },
  [COOKED_PORK]: { nameKey: 'craft.itemCookedPork', kind: 'food', emoji: '🍖', food: 8 },
  [BREAD]: { nameKey: 'craft.itemBread', kind: 'food', emoji: '🍞', food: 5 },
  [APPLE_PIE]: { nameKey: 'craft.itemApplePie', kind: 'food', emoji: '🥧', food: 8 },
  [COOKIE]: { nameKey: 'craft.itemCookie', kind: 'food', emoji: '🍪', food: 2 },
  [STEW]: { nameKey: 'craft.itemStew', kind: 'food', emoji: '🍲', food: 9 },
  [BOTTLE]: { nameKey: 'craft.itemBottle', kind: 'material', emoji: '⚗️' },
  [POT_HEAL]: { nameKey: 'craft.potHeal', kind: 'potion', emoji: '❤️', potion: 'heal' },
  [POT_SPEED]: { nameKey: 'craft.potSpeed', kind: 'potion', emoji: '💨', potion: 'speed' },
  [POT_JUMP]: { nameKey: 'craft.potJump', kind: 'potion', emoji: '🦘', potion: 'jump' },
  [POT_NIGHT]: { nameKey: 'craft.potNight', kind: 'potion', emoji: '🌙', potion: 'night' },
  [AXE]: { nameKey: 'craft.toolAxe', kind: 'tool', emoji: '🪓', tool: 'axe' },
  [PICK_WOOD]: { nameKey: 'craft.toolPickWood', kind: 'tool', emoji: '⛏️', tool: 'pick', tier: 1 },
  [PICK_STONE]: { nameKey: 'craft.toolPickStone', kind: 'tool', emoji: '⛏️', tool: 'pick', tier: 2 },
  [PICK_DIAMOND]: { nameKey: 'craft.toolPickDiamond', kind: 'tool', emoji: '⛏️', tool: 'pick', tier: 3 },
  [SWORD]: { nameKey: 'craft.toolSword', kind: 'tool', emoji: '⚔️', tool: 'sword' },
};

export const POTION_SECONDS: Record<PotionKind, number> = { heal: 0, speed: 30, jump: 30, night: 45 };

// ---- recipes ----------------------------------------------------------------------------
export type RecipeCategory = 'blocks' | 'tools' | 'food' | 'potions';
export type Recipe = {
  id: string;
  category: RecipeCategory;
  out: number;
  qty: number;
  cost: [number, number][];
  needs?: number; // requires owning >=1 of this block (station)
};

export const RECIPES: Recipe[] = [
  { id: 'planks', category: 'blocks', out: PLANKS, qty: 4, cost: [[WOOD, 1]] },
  { id: 'stick', category: 'blocks', out: STICK, qty: 4, cost: [[PLANKS, 2]] },
  { id: 'craftingTable', category: 'blocks', out: CRAFTING_TABLE, qty: 1, cost: [[PLANKS, 4]] },
  { id: 'furnace', category: 'blocks', out: FURNACE, qty: 1, cost: [[COBBLE, 8]] },
  { id: 'glass', category: 'blocks', out: GLASS, qty: 1, cost: [[SAND, 1]] },
  { id: 'torch', category: 'blocks', out: TORCH, qty: 4, cost: [[STICK, 1], [COAL, 1]] },
  { id: 'glowstone', category: 'blocks', out: GLOWSTONE, qty: 1, cost: [[GLOWDUST, 4]] },

  { id: 'axe', category: 'tools', out: AXE, qty: 1, cost: [[PLANKS, 3], [STICK, 2]] },
  { id: 'pickWood', category: 'tools', out: PICK_WOOD, qty: 1, cost: [[PLANKS, 3], [STICK, 2]] },
  { id: 'pickStone', category: 'tools', out: PICK_STONE, qty: 1, cost: [[COBBLE, 3], [STICK, 2]] },
  { id: 'pickDiamond', category: 'tools', out: PICK_DIAMOND, qty: 1, cost: [[DIAMOND, 3], [STICK, 2]] },
  { id: 'sword', category: 'tools', out: SWORD, qty: 1, cost: [[PLANKS, 2], [STICK, 1]] },

  { id: 'bread', category: 'food', out: BREAD, qty: 1, cost: [[WHEAT, 3]] },
  { id: 'cookPork', category: 'food', out: COOKED_PORK, qty: 1, cost: [[RAW_PORK, 1], [COAL, 1]], needs: FURNACE },
  { id: 'applePie', category: 'food', out: APPLE_PIE, qty: 1, cost: [[APPLE, 2], [WHEAT, 1]] },
  { id: 'cookie', category: 'food', out: COOKIE, qty: 4, cost: [[WHEAT, 2]] },
  { id: 'stew', category: 'food', out: STEW, qty: 1, cost: [[APPLE, 1], [BREAD, 1], [WHEAT, 1]] },

  { id: 'bottle', category: 'potions', out: BOTTLE, qty: 3, cost: [[GLASS, 3]] },
  { id: 'potHeal', category: 'potions', out: POT_HEAL, qty: 1, cost: [[BOTTLE, 1], [APPLE, 1], [GLOWDUST, 1]] },
  { id: 'potSpeed', category: 'potions', out: POT_SPEED, qty: 1, cost: [[BOTTLE, 1], [WHEAT, 1], [GLOWDUST, 1]] },
  { id: 'potJump', category: 'potions', out: POT_JUMP, qty: 1, cost: [[BOTTLE, 1], [REDSTONE, 1], [GLOWDUST, 1]] },
  { id: 'potNight', category: 'potions', out: POT_NIGHT, qty: 1, cost: [[BOTTLE, 1], [GLOWDUST, 2]] },
];

export type Inv = Record<string, number>;

export function invCount(inv: Inv, id: number): number {
  return inv[String(id)] ?? 0;
}
export function canCraft(inv: Inv, r: Recipe): boolean {
  if (r.needs !== undefined && invCount(inv, r.needs) < 1) return false;
  return r.cost.every(([id, n]) => invCount(inv, id) >= n);
}
/** Mutates `inv` in place; returns true if the craft happened. */
export function applyCraft(inv: Inv, r: Recipe): boolean {
  if (!canCraft(inv, r)) return false;
  for (const [id, n] of r.cost) inv[String(id)] = invCount(inv, id) - n;
  inv[String(r.out)] = invCount(inv, r.out) + r.qty;
  return true;
}

const WOODY = new Set<number>([WOOD, LEAVES, PLANKS, CRAFTING_TABLE]);
const STONEY = new Set<number>([
  STONE,
  COBBLE,
  DEEPSLATE,
  FURNACE,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  REDSTONE_ORE,
  LAPIS_ORE,
  DIAMOND_ORE,
  EMERALD_ORE,
  GLOWSTONE,
]);
export const ORES = new Set<number>([COAL_ORE, IRON_ORE, GOLD_ORE, REDSTONE_ORE, LAPIS_ORE, DIAMOND_ORE, EMERALD_ORE]);

/** Break-time multiplier for the held tool vs the target block (lower = faster). */
export function toolMineFactor(toolId: number | undefined, blockId: number): number {
  const def = toolId !== undefined ? ITEM[toolId] : undefined;
  if (!def?.tool) return 1;
  if (def.tool === 'axe' && WOODY.has(blockId)) return 0.35;
  if (def.tool === 'pick' && STONEY.has(blockId)) return [0.55, 0.38, 0.14][(def.tier ?? 1) - 1];
  if (def.tool === 'sword' && blockId === LEAVES) return 0.3;
  return 1;
}

/** What mining `blockId` puts in the inventory: [itemId, count]. [0,0] = nothing. */
export function blockDrop(blockId: number, rand: () => number): [number, number] {
  switch (blockId) {
    case STONE:
    case DEEPSLATE:
      return [COBBLE, 1];
    case COAL_ORE:
      return [COAL, 1];
    case IRON_ORE:
      return [IRON, 1];
    case GOLD_ORE:
      return [GOLD, 1];
    case REDSTONE_ORE:
      return [REDSTONE, 4];
    case LAPIS_ORE:
      return [LAPIS, 5];
    case DIAMOND_ORE:
      return [DIAMOND, 1];
    case EMERALD_ORE:
      return [EMERALD, 1];
    case GLOWSTONE:
      return [GLOWDUST, 3];
    case LEAVES: {
      const r = rand();
      if (r < 0.08) return [APPLE, 1];
      if (r < 0.14) return [STICK, 1];
      return [0, 0];
    }
    case WHEAT_CROP:
      return [WHEAT, rand() < 0.5 ? 2 : 1];
    case GRASS:
      return [DIRT, 1];
    default:
      return [blockId, 1];
  }
}

/** Whether mining `blockId` needs a pickaxe to drop anything (kept lenient for kids: only the
 * hardest ores). Returns true if the drop should be suppressed for `toolId`. */
export function dropBlockedByTool(_toolId: number | undefined, _blockId: number): boolean {
  return false;
}

export const CONSUMABLE_HOTBAR: number[] = [
  BREAD,
  COOKED_PORK,
  APPLE_PIE,
  STEW,
  COOKIE,
  APPLE,
  RAW_PORK,
  POT_HEAL,
  POT_SPEED,
  POT_JUMP,
  POT_NIGHT,
];
export const TOOL_HOTBAR: number[] = [AXE, PICK_WOOD, PICK_STONE, PICK_DIAMOND, SWORD];
export const CORE_HOTBAR: number[] = [GRASS, DIRT, STONE, COBBLE, PLANKS, GLASS];
export const EXTRA_BLOCK_HOTBAR: number[] = [
  WOOD,
  LEAVES,
  SAND,
  GRAVEL,
  DEEPSLATE,
  TORCH,
  CRAFTING_TABLE,
  FURNACE,
  GLOWSTONE,
  RUNEBLOCK,
  SNOW,
];

/** The ordered list of item ids shown in the hotbar for a given inventory. */
export function computeHotbar(inv: Inv): number[] {
  const extra = EXTRA_BLOCK_HOTBAR.filter((id) => invCount(inv, id) > 0);
  const tools = TOOL_HOTBAR.filter((id) => invCount(inv, id) > 0);
  const cons = CONSUMABLE_HOTBAR.filter((id) => invCount(inv, id) > 0);
  return [...CORE_HOTBAR, ...extra, ...tools, ...cons];
}
