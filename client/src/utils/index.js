export function isNumeric(str) {
  if (typeof str === 'number') return true;

  if (typeof str !== 'string') return false;

  return /^-?\d+(\.\d+)?$/.test(str.trim());
}