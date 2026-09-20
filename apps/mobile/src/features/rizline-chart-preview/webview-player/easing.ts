/** Official chart `easeType` indices: linear, power in/out, step, circular, sine. */

function clampUnit(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  if (amount <= 0) return 0;
  if (amount >= 1) return 1;
  return amount;
}

function powerIn(amount: number, exponent: number): number {
  return amount ** exponent;
}

function powerOut(amount: number, exponent: number): number {
  const delta = (amount - 1) ** exponent;
  return exponent % 2 === 0 ? 1 - delta : 1 + delta;
}

function powerInOut(amount: number, exponent: number): number {
  const doubled = amount * 2;
  if (doubled < 1) return (doubled ** exponent) / 2;
  if (exponent % 2 === 0) return -((doubled - 2) ** exponent - 2) / 2;
  return ((doubled - 2) ** exponent + 2) / 2;
}

export function applyEase(easeType: number, amount: number): number {
  const t = clampUnit(amount);
  switch (easeType) {
    case 0:
      return t;
    case 1:
      return powerIn(t, 2);
    case 2:
      return powerOut(t, 2);
    case 3:
      return powerInOut(t, 2);
    case 4:
      return powerIn(t, 3);
    case 5:
      return powerOut(t, 3);
    case 6:
      return powerInOut(t, 3);
    case 7:
      return powerIn(t, 4);
    case 8:
      return powerOut(t, 4);
    case 9:
      return powerInOut(t, 4);
    case 10:
      return powerIn(t, 5);
    case 11:
      return powerOut(t, 5);
    case 12:
      return powerInOut(t, 5);
    case 13:
      return 0;
    case 14:
      return 1;
    case 15:
      return 1 - Math.sqrt(1 - t ** 2);
    case 16:
      return Math.sqrt(1 - (t - 1) ** 2);
    case 17:
      return Math.sin((t * Math.PI) / 2);
    case 18:
      return 1 - Math.cos((t * Math.PI) / 2);
    default:
      return t;
  }
}
