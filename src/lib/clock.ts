type Clock = () => Date;

let currentClock: Clock = () => new Date();

export function now(): Date {
  return currentClock();
}

export function setClockForTests(clock?: Clock): void {
  currentClock = clock ?? (() => new Date());
}
