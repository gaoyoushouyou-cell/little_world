/** タイル1枚の大きさ（px） */
export const TILE = 16;

/** 内部解像度。画面にはこの整数倍で拡大して表示する */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** 物理は 60Hz の固定ステップで進める */
export const STEP_MS = 1000 / 60;

/** プレイヤーの当たり判定（px）。見下ろしでは足元だけ */
export const PLAYER_SIDE_BOX = { w: 10, h: 20 } as const;
export const PLAYER_TOP_BOX = { w: 10, h: 8 } as const;
