export function debounce<A extends unknown[]>(callback: (...args: A) => void, delay: number): (...args: A) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: A): void => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
}
