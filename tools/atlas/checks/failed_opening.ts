import { finding, type Check } from '../check';

/** 通過試験でどちらの向きにも越えられなかった口（L1）。越えられない証明ではないので情報だけ */
export default {
  id: 'failed_opening',
  run({ borders, name }) {
    return borders.flatMap((b) =>
      b.openings
        .filter((o) => o.pass['a>b'] === 'fail' && o.pass['b>a'] === 'fail')
        .map((o) =>
          finding('failed_opening', 'info', {
            nodes: [`area:${o.a}`, `area:${o.b}`],
            subject: o.id,
            text: `「${name(o.a)}」と「${name(o.b)}」の間の口（世界の [${o.world.join(', ')}]、${o.cells} マス）は、試験ではどちらの向きにも越えられなかった`,
            fix: ['口の近くに足場を置く', '意図した壁なら口をふさぐ'],
          }),
        ),
    );
  },
} satisfies Check;
