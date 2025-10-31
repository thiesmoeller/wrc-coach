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

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize).fill(null);
  }

  /**
   * Add item to buffer (overwrites oldest if full)
   */
  push(item: T): void {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.maxSize;
    
    if (this.size < this.maxSize) {
      this.size++;
    } else {
      // Buffer full, overwrite oldest
      this.readIndex = (this.readIndex + 1) % this.maxSize;
    }
  }

  /**
   * Get all items from readIndex to writeIndex (items ready to flush)
   */
  getReadyItems(): T[] {
    if (this.size === 0) return [];
    
    const items: T[] = [];
    let current = this.readIndex;
    const end = this.writeIndex;
    
    if (end > current) {
      // Normal case: readIndex < writeIndex
      for (let i = current; i < end; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
    } else if (end < current) {
      // Wrapped case: writeIndex wrapped around
      // Get from readIndex to end
      for (let i = current; i < this.maxSize; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
      // Then from 0 to writeIndex
      for (let i = 0; i < end; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
    }
    
    return items;
  }

  /**
   * Clear items from readIndex to writeIndex (after successful flush)
   */
  clearReady(): void {
    if (this.size === 0) return;
    
    // Clear items between readIndex and writeIndex
    let current = this.readIndex;
    const end = this.writeIndex;
    
    if (end > current) {
      for (let i = current; i < end; i++) {
        this.buffer[i] = null;
      }
    } else if (end < current) {
      for (let i = current; i < this.maxSize; i++) {
        this.buffer[i] = null;
      }
      for (let i = 0; i < end; i++) {
        this.buffer[i] = null;
      }
    }
    
    // Reposition pointers
    this.readIndex = this.writeIndex;
    this.size = 0;
  }

  /**
   * Get all items currently in buffer (for UI/metrics)
   */
  getAllItems(): T[] {
    if (this.size === 0) return [];
    
    const items: T[] = [];
    let current = this.readIndex;
    const end = this.writeIndex;
    
    if (end > current) {
      for (let i = current; i < end; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
    } else if (end < current) {
      for (let i = current; i < this.maxSize; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
      for (let i = 0; i < end; i++) {
        if (this.buffer[i] !== null) {
          items.push(this.buffer[i]!);
        }
      }
    }
    
    return items;
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
}

