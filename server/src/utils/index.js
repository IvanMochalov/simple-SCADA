export function isIterable(obj) {
    if (obj == null) return false;

    // Строки - итерируемые
    if (typeof obj === 'string') return true;

    // Проверяем Symbol.iterator
    return typeof obj[Symbol.iterator] === 'function';
}