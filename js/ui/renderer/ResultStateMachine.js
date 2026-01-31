export const RESULT_STATE = {
    INIT: 0,
    TITLE: 1,
    WINNER: 2,
    YAKU_ANIM: 3,
    YAKU_STATIC: 4,
    HAND: 5,
    SCORE: 6,
    LEVEL: 7,
    HINT: 8
};

export class ResultStateMachine {
    constructor() {
        this.state = RESULT_STATE.INIT;
        this.stateEnterTime = 0;
    }

    enter(state) {
        if (!Object.values(RESULT_STATE).includes(state)) {
            console.warn("[ResultStateMachine] Unknown state:", state);
            return;
        }
        this.state = state;
        this.stateEnterTime = performance.now();
    }

    timeInState() {
        return performance.now() - this.stateEnterTime;
    }
}
