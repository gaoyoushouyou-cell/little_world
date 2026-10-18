import { finding, type Check } from '../check';

/** 通過試験で片方の向きしか越えられなかった口（L1） */
export default {
  id: 'one_way_opening',
  run({ borders, name }) {
    return borders.flatMap((b) =>
      b.openings
        .filter((o) => (o.pass['a>b'] === 'fail') !== (o.pass['b>a'] === 'fail'))
        .map((o) => {
          const [from, to] = o.pass['a>b'] === 'fail' ? [o.b, o.a] : [o.a, o.b];
          return finding('one_way_opening', 'info', {
            nodes: [`area:${from}`, `area:${to}`],
            subject: o.id,
            text: `「${name(from)}」から「${name(to)}」へは越えられるが、試験では戻れなかった（口は世界の [${o.world.join(', ')}]）`,
            fix: ['意図した一方通行か確かめる'],
          });
        }),
    );
  },
} satisfies Check;
