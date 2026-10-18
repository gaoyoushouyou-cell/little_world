import { finding, type Check } from '../check';

/** 出現位置・出入口・ワープの両端で、安全に立てない（赤）／指定から 3 マス以上離れた所に出る（黄） */
export default {
  id: 'unsafe_landing',
  run({ landings, name }) {
    return landings.flatMap((l) => {
      const where = `${l.ref}（「${name(l.area)}」の [${l.tile.join(', ')}]）`;
      if (!l.ok)
        return [
          finding('unsafe_landing', 'red', {
            nodes: [`area:${l.area}`],
            subject: l.ref,
            text: `${where}の近くに安全に立てる所がない`,
            fix: ['位置を床の上（横視点は足場の上）に直す'],
          }),
        ];
      if (l.moved >= 3)
        return [
          finding('unsafe_landing', 'yellow', {
            nodes: [`area:${l.area}`],
            subject: l.ref,
            text: `${where}は、${l.moved} マス離れた所に出る`,
            fix: ['位置を実際に立てる所に直す'],
          }),
        ];
      return [];
    });
  },
} satisfies Check;
