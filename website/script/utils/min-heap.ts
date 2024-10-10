export class MinHeap {
  heap: Uint32Array;
  fScore: Float32Array;
  size: number = 0;

  constructor(capacity: number, fScore: Float32Array) {
    this.heap = new Uint32Array(capacity);
    this.fScore = fScore;
  }

  insert(node: number): void {
    this.heap[this.size] = node;
    this.bubbleUp(this.size++);
  }

  extractMin(): number {
    // @ts-expect-error
    const min: number = this.heap[0];
    // @ts-expect-error
    this.heap[0] = this.heap[--this.size];
    this.bubbleDown(0);
    return min;
  }

  bubbleUp(index: number): void {
    // @ts-expect-error
    const node: number = this.heap[index];
    while (index > 0) {
      const parentIndex: number = (index - 1) >>> 1;
      // @ts-expect-error
      const parent: number = this.heap[parentIndex];
      // @ts-expect-error
      if (this.fScore[node] >= this.fScore[parent]) break;
      this.heap[index] = parent;
      index = parentIndex;
    }
    this.heap[index] = node;
  }

  bubbleDown(index: number): void {
    const length: number = this.size;
    // @ts-expect-error
    const node: number = this.heap[index];
    while (true) {
      const leftChildIndex: number = 2 * index + 1;
      const rightChildIndex: number = 2 * index + 2;
      let smallest: number = index;

      // @ts-expect-error
      if (leftChildIndex < length && this.fScore[this.heap[leftChildIndex]] < this.fScore[this.heap[smallest]]) {
        smallest = leftChildIndex;
      }
      // @ts-expect-error
      if (rightChildIndex < length && this.fScore[this.heap[rightChildIndex]] < this.fScore[this.heap[smallest]]) {
        smallest = rightChildIndex;
      }
      if (smallest === index) break;
      // @ts-expect-error
      this.heap[index] = this.heap[smallest];
      index = smallest;
    }
    this.heap[index] = node;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }
}
