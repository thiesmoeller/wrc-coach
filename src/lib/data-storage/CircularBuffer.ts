/**
 * Circular Buffer for Samples
 *
 * Simple circular queue that holds ~2-3 minutes of samples.
 * When >= 32KB of data is ready, it can be flushed to storage.
 */

export class CircularBuffer<T> {
  private buffer: (T | null)[];
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private size: number = 0;
  private maxSize: number;
  /** How many times `push` has been called. A flush records this with the items it copies. */
  private pushes: number = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize).fill(null);
  }

  /**
   * Add item to buffer (overwrites oldest if full)
   */
  push(item: T): void {
    this.pushes++;
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;

    if (this.size < this.maxSize) {
      this.size++;
    } else {
      // Buffer full, overwrite oldest
      this.readIndex = (this.writeIndex) % this.maxSize;
    }
  }

  /**
   * Get all items currently queued, including when the buffer is full
   * (writeIndex === readIndex and size === maxSize).
   */
  getReadyItems(): T[] {
    return this.collect();
  }

  /** Monotonic count of `push` calls, including ones that overwrote an old item. */
  getPushCount(): number {
    return this.pushes;
  }

  /**
   * Remove items that were already queued when `pushCount` was read, and keep
   * anything pushed afterwards. `pushCount` is the value of `getPushCount()`
   * taken in the same turn as `getReadyItems()`. Items the buffer has already
   * overwritten are gone; this never drops something pushed after the snapshot.
   */
  dropThrough(pushCount: number): void {
    const arrivedSince = this.pushes - pushCount;
    if (arrivedSince < 0) return;
    const drop = this.size - arrivedSince;
    if (drop <= 0) return;
    for (let i = 0; i < drop; i++) {
      this.buffer[this.readIndex] = null;
      this.readIndex = (this.readIndex + 1) % this.maxSize;
    }
    this.size -= drop;
  }

  /**
   * Clear items after a successful flush
   */
  clearReady(): void {
    if (this.size === 0) return;
    this.buffer.fill(null);
    this.readIndex = this.writeIndex;
    this.size = 0;
  }

  /**
   * Get all items currently in buffer (for UI/metrics)
   */
  getAllItems(): T[] {
    return this.collect();
  }

  /**
   * Get current size
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Clear entire buffer
   */
  clear(): void {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.size = 0;
  }

  private collect(): T[] {
    if (this.size === 0) return [];

    const items: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const idx = (this.readIndex + i) % this.maxSize;
      const item = this.buffer[idx];
      if (item !== null) items.push(item);
    }
    return items;
  }
}
