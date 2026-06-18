import { useLocalStorage } from "@vueuse/core";
import { computed, readonly, ref, watch } from "vue";

export enum Playstate {
    NotStarted,
    Playing,
    Dead,
    Won,
}
const state = ref<Playstate>(Playstate.Playing);
// For vue reasons, these are actually 1 indexed
const rows = 12;
const columns = 20;

export enum Direction {
    Right,
    Down,
    Left,
    Up,
}
export interface Position {
    y: number
    x: number
}

function startPosition(): Position[] {
    return [
        { y: Math.floor(rows / 2), x: Math.floor(columns / 2) },
        { y: Math.floor(rows / 2), x: Math.floor(columns / 2) + 1 },
    ]
}


function move(thing: Position, to: Direction): Position {
    switch(to) {
    case Direction.Up:
        return { y: thing.y - 1, x: thing.x }
    case Direction.Down:
        return { y: thing.y + 1, x: thing.x }
    case Direction.Right:
        return { y: thing.y, x: thing.x + 1 }
    case Direction.Left:
        return { y: thing.y, x: thing.x - 1 }
    }
}
export function opposite(dir: Direction): Direction {
    switch(dir) {
    case Direction.Right:
        return Direction.Left
    case Direction.Up:
        return Direction.Down
    case Direction.Left:
        return Direction.Right
    case Direction.Down:
        return Direction.Up
    }
}
export function eq(a: Position, b: Position) {
    return a.y === b.y && a.x === b.x
}
export function offscreen(pos: Position) {
    return pos.y <= 0 || pos.y > rows || pos.x <= 0 || pos.x > columns
}
export function toNum(pos: Position): number {
    return (pos.y - 1) * columns + (pos.x - 1)
}
export function fromNum(i: number): Position {
    return {
        y: Math.floor(i / columns) + 1,
        x: (i % columns) + 1
    }
}
function generateFood() {
    const holes = positions.value.map(p => toNum(p)).sort((a, b) => a - b)
    let random = Math.floor(Math.random() * (rows * columns - holes.length))
    for (const hole of holes) {
        if (random < hole) break
        random++
    }
    return fromNum(random)
}

const positions = ref<Position[]>(startPosition())
const head = computed(() => positions.value[positions.value.length - 1])
const eaten = computed(() => positions.value.length - 2)

const food = ref<Position>(generateFood())
const directionOfMovement = ref<Direction>(Direction.Right)
const defaultTickrate = useLocalStorage('tickrate', 250)
const fastTickrate = computed(() => defaultTickrate.value / 4)
const usingFastTickrate = ref(false)
const tickrateMS = computed(() => usingFastTickrate.value ? fastTickrate.value : defaultTickrate.value)
const numGames = ref(0)



function tick() {
    if (state.value !== Playstate.Playing) {
        console.warn("Attempted to perform a tick while not playing - ignoring")
        return
    }
    const direction = directionOfMovement.value

    const attemptedMove = move(positions.value[positions.value.length - 1]!, direction)
    if (offscreen(attemptedMove)) {
        die()
        return
    }
    // Hit ourselves check
    for (const pos of positions.value) {
        if (eq(attemptedMove, pos)) {
            die()
            return
        }
    }
    // Successfully moved - we want this prior to food generation to make sure we don't generate it on our head
    positions.value.push(attemptedMove)
    if (eq(attemptedMove, food.value)) {
        // If we ate food, check win to prevent trying to generate food again
        if (positions.value.length == rows * columns) {
            win()
            return
        }
        food.value = generateFood()
        console.log("Ate food at ", attemptedMove, " New food at ", food.value)
    } else {
        // Otherwise, remove our tail
        positions.value.shift()
    }
}
function die() {
    console.log("Dead snake position list ", positions.value)
    state.value = Playstate.Dead
}
function win() {
    console.log("Won snake position list ", positions.value)
    state.value = Playstate.Won
}
function start() {
    directionOfMovement.value = Direction.Right
    positions.value = startPosition()
    food.value = generateFood()
    state.value = Playstate.Playing
}
async function loop(gameNumber: number) {
    while (state.value === Playstate.Playing && numGames.value === gameNumber) {
        await new Promise(r => setTimeout(r, tickrateMS.value))
        tick()
    }
}

/**
 * Assumes the positions are exactly orthoganally adjacent (which is common in snake)
 * Gives the direction to get from A to B
 * @param from from
 * @param to to
 */
export function compare(from: Position, to: Position): Direction {
    if (from.y < to.y) return Direction.Down
    if (from.y > to.y) return Direction.Up
    if (from.x < to.x) return Direction.Right
    if (from.x > to.x) return Direction.Left
    else {
        console.error("Compare used on non-adjacent positions", from, to)
        return Direction.Right
    }
}

watch(state, (newState) => {
    if (newState === Playstate.Playing) {
        numGames.value++
        loop(numGames.value)
    }
}, { immediate: true })

const pointedDirection = computed(() => {
    const length = positions.value.length
    if (length < 2) {
        console.error('Snake somehow too short')
        return Direction.Down
    }
    return compare(positions.value[length - 2]!, positions.value[length - 1]!)
})

function pointTo(dir: Direction) {
    if (opposite(dir) === pointedDirection.value) return
    directionOfMovement.value = dir
}

export function useGamestate() {
    return {
        eaten: readonly(eaten),
        die,
        start,
        rows,
        columns,
        positions: readonly(positions),
        head,
        tick,
        food: readonly(food),
        pointedDirection,
        pointTo,
        state: readonly(state),
        usingFastTickrate
    }
}