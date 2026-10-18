import type { Content, LoadedArea } from '../../src/engine/content';
import { TILE } from '../../src/engine/constants';
import { stepBody, type Body, type StepInput, type StepParams } from '../../src/engine/physics';
import { checkEdge, placeArrival, stepParamsFor, type Arrival } from '../../src/engine/travel';
import { makeSolidQuery } from '../../src/engine/world';

/**
 * プレイヤー1人分の移動を、エリアの切り替えも含めて進める（Phaser なし）。
 * テストと地図帳の通過試験で共有する。使うエリアは content.loadArea 済みであること。
 */
export class Walker {
  area!: LoadedArea;
  params!: StepParams;
  body!: Body;
  private solid!: ReturnType<typeof makeSolidQuery>;
  readonly visited: string[] = [];

  constructor(
    private readonly content: Pick<Content, 'getLoaded' | 'world'>,
    areaId: string,
    arrival: Arrival,
  ) {
    this.enter(areaId, arrival);
  }

  /** 1 ステップ進める（入力はその都度決める）。隣のエリアへ出たらそちらに入る */
  step(input: Partial<StepInput>) {
    stepBody(this.body, { x: 0, y: 0, jumpHeld: false, jumpPressed: false, ...input }, this.params, this.solid);
    const r = checkEdge(this.body, this.area, this.params, this.content.world);
    if (r.kind === 'cross') this.enter(r.to.id, r.arrival);
    return this;
  }

  private enter(areaId: string, arrival: Arrival) {
    this.area = this.content.getLoaded(areaId)!;
    this.params = stepParamsFor(this.area.def);
    this.solid = makeSolidQuery(
      { id: areaId, solid: this.area.solid, wrap: this.area.def.physics.wrap },
      this.content.world,
      (id) => this.content.getLoaded(id)?.solid,
    );
    this.body = placeArrival(arrival, this.params, this.solid);
    this.visited.push(areaId);
  }

  run(input: Partial<StepInput>, steps: number, untilCross = false) {
    for (let i = 0; i < steps; i++) {
      stepBody(this.body, { x: 0, y: 0, jumpHeld: false, jumpPressed: false, ...input, ...(i > 0 ? { jumpPressed: false } : {}) }, this.params, this.solid);
      const r = checkEdge(this.body, this.area, this.params, this.content.world);
      if (r.kind === 'cross') {
        this.enter(r.to.id, r.arrival);
        if (untilCross) break;
      }
    }
    return this;
  }

  get tile() {
    return [Math.floor((this.body.x + this.body.w / 2) / TILE), Math.floor((this.body.y + this.body.h / 2) / TILE)];
  }
}
