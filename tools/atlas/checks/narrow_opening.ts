import { finding, type Check } from '../check';

/** 横視点で横向きに越える口が 1 マスしかない（L1）。プレイヤーは高さ 20px で 2 マスかかる */
export default {
  id: 'narrow_opening',
  run({ src, borders, name }) {
    const side = (id: string) => src.areas.get(id)?.view === 'side';
    return borders.flatMap((b) =>
      b.openings
        .filter((o) => o.axis === 'x' && o.cells < 2 && (side(o.a) || side(o.b)))
        .map((o) =>
          finding('narrow_opening', 'info', {
            nodes: [`area:${o.a}`, `area:${o.b}`],
            subject: o.id,
            text: `「${name(o.a)}」と「${name(o.b)}」の間の口（世界の [${o.world.join(', ')}]）は 1 マスしかなく、横視点では通れない`,
            fix: ['口を縦に 2 マス以上にする'],
          }),
        ),
    );
  },
} satisfies Check;
