import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, craftPuzzleTierForXp, CRAFT_PUZZLE_XP_BY_TIER } from '../lib/xp.js';
import { generateCraftPuzzle } from '../lib/craftPuzzles.js';

export const craftRouter = Router();

craftRouter.get('/', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT * FROM craft_saves WHERE user_id = ?`).get(req.userId!) as any;
  if (!row) {
    res.json({ save: null });
    return;
  }
  const worldDiff = JSON.parse(row.world_diff_json) as Record<string, number>;
  // The quarry moved from a 2D ("x,y") world to a 3D ("x,y,z") one — a save from
  // before that change has keys with only one comma and can't be reinterpreted,
  // so treat it like no save exists and let the client generate a fresh 3D world.
  const firstKey = Object.keys(worldDiff)[0];
  if (firstKey && firstKey.split(',').length < 3) {
    res.json({ save: null });
    return;
  }
  res.json({
    save: {
      version: row.version ?? 1,
      seed: row.seed,
      worldDiff,
      inventory: JSON.parse(row.inventory_json),
      playerX: row.player_x,
      playerY: row.player_y,
      playerZ: row.player_z,
      hp: row.hp ?? 20,
      food: row.food ?? 20,
    },
  });
});

// worldDiff only carries cells that changed from the client's deterministic base
// terrain, so even a heavily-dug world stays far under this — the cap just guards
// against a malformed or abusive payload rather than reflecting a real play limit.
const saveSchema = z.object({
  version: z.number().int().min(1).max(9).optional(),
  seed: z.number().int(),
  worldDiff: z.record(z.string(), z.number().int().min(0).max(63)).refine((d) => Object.keys(d).length <= 40000, {
    message: 'World data too large.',
  }),
  inventory: z.record(z.string(), z.number().int().min(0).max(99999)),
  playerX: z.number(),
  playerY: z.number(),
  playerZ: z.number(),
  hp: z.number().int().min(0).max(20).optional(),
  food: z.number().int().min(0).max(20).optional(),
});

craftRouter.post('/save', requireAuth, requireCsrfHeader, validateBody(saveSchema), (req, res) => {
  const { version, seed, worldDiff, inventory, playerX, playerY, playerZ, hp, food } = req.body as z.infer<typeof saveSchema>;
  db.prepare(
    `INSERT INTO craft_saves (user_id, version, seed, world_diff_json, inventory_json, player_x, player_y, player_z, hp, food, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       version = excluded.version,
       seed = excluded.seed,
       world_diff_json = excluded.world_diff_json,
       inventory_json = excluded.inventory_json,
       player_x = excluded.player_x,
       player_y = excluded.player_y,
       player_z = excluded.player_z,
       hp = excluded.hp,
       food = excluded.food,
       updated_at = datetime('now')`
  ).run(req.userId!, version ?? 1, seed, JSON.stringify(worldDiff), JSON.stringify(inventory), playerX, playerY, playerZ, hp ?? 20, food ?? 20);
  res.json({ ok: true });
});

// Puzzles are generated and graded server-side (answer never sent to the client)
// so the reward can't be forged from devtools, matching how boss fights are graded.
const pendingPuzzles = new Map<string, { userId: number; answer: number; tier: 1 | 2 | 3 | 4; expiresAt: number }>();
const PUZZLE_TTL_MS = 2 * 60 * 1000;

function sweepExpiredPuzzles() {
  const now = Date.now();
  for (const [id, p] of pendingPuzzles) {
    if (p.expiresAt < now) pendingPuzzles.delete(id);
  }
}

craftRouter.post('/puzzle', requireAuth, requireCsrfHeader, (req, res) => {
  sweepExpiredPuzzles();
  const user = db.prepare(`SELECT total_xp FROM users WHERE id = ?`).get(req.userId!) as { total_xp: number };
  const tier = craftPuzzleTierForXp(user.total_xp);
  const puzzle = generateCraftPuzzle(tier);
  const puzzleId = randomUUID();
  pendingPuzzles.set(puzzleId, { userId: req.userId!, answer: puzzle.answer, tier, expiresAt: Date.now() + PUZZLE_TTL_MS });
  res.json({ puzzleId, question: puzzle.question, choices: puzzle.choices, tier, xpReward: CRAFT_PUZZLE_XP_BY_TIER[tier - 1] });
});

const answerSchema = z.object({ choice: z.number() });

craftRouter.post('/puzzle/:puzzleId/answer', requireAuth, requireCsrfHeader, validateBody(answerSchema), (req, res) => {
  const pending = pendingPuzzles.get(req.params.puzzleId);
  if (!pending || pending.userId !== req.userId || pending.expiresAt < Date.now()) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  pendingPuzzles.delete(req.params.puzzleId);

  const { choice } = req.body as { choice: number };
  const correct = choice === pending.answer;
  const xpEarned = correct ? CRAFT_PUZZLE_XP_BY_TIER[pending.tier - 1] : 0;
  if (correct) awardXp(req.userId!, xpEarned, 'craft_puzzle');

  res.json({ correct, correctAnswer: pending.answer, xpEarned });
});
