export function d8(): number {
  return Math.floor(Math.random() * 8) + 1;
}

export function dN(n: number): number {
  return Math.floor(Math.random() * n) + 1;
}

export function rollAbove(target: number, bonus: number = 0): { roll: number; total: number; success: boolean } {
  const roll = d8();
  const total = roll + bonus;
  return { roll, total, success: total > target };
}
