export function debounce(callback: Function, delay: number): Function {
  let timeout: NodeJS.Timeout;

  // eslint-disable-next-line
  return function (...args: any[]) {
    clearTimeout(timeout);
    // @ts-ignore
    timeout = setTimeout(() => callback.apply(this, args), delay);
  };
}
