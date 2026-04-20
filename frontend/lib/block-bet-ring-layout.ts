/** Hollow frame grid — must match `block-bet-panel.tsx` perimeter ring. */
export const BLOCK_BET_GRID_COLS = 12;
export const BLOCK_BET_TILE_REM = 1.5;

/** Outer width in rem: cols×tile + (cols−1)×gap-1 + horizontal p-1 on the ring. */
export const BLOCK_BET_RING_OUTER_WIDTH_REM =
  BLOCK_BET_GRID_COLS * BLOCK_BET_TILE_REM + (BLOCK_BET_GRID_COLS - 1) * 0.25 + 0.5;
