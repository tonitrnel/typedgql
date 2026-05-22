import { WriteStream } from "fs";
import { writeFile } from "fs/promises";

/**
 * A buffered write stream that collects content in memory
 * instead of writing directly to disk.
 * This allows post-processing (like prettier formatting) before writing.
 */
export class BufferedStream {
  private buffer: string[] = [];
  private ended = false;
  public readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /**
   * Write content to the buffer.
   */
  write(chunk: string): boolean {
    if (this.ended) {
      throw new Error("Cannot write to ended stream");
    }
    this.buffer.push(chunk);
    return true;
  }

  /**
   * Mark the stream as ended.
   * Returns a promise that resolves when the stream is closed.
   */
  end(callback?: () => void): Promise<void> {
    this.ended = true;
    if (callback) {
      callback();
    }
    return Promise.resolve();
  }

  /**
   * Get the buffered content as a string.
   */
  getContent(): string {
    return this.buffer.join("");
  }

  /**
   * Write the buffered content to disk.
   */
  async flush(formatter?: (content: string, path: string) => Promise<string>): Promise<void> {
    let content = this.getContent();
    
    if (formatter) {
      content = await formatter(content, this.path);
    }
    
    await writeFile(this.path, content, "utf-8");
  }

  /**
   * Create a WriteStream-compatible interface for this buffered stream.
   * This allows it to be used with existing writer classes.
   */
  toWriteStream(): WriteStreamLike {
    return {
      write: (chunk: string) => this.write(chunk),
      end: (callback?: () => void) => {
        void this.end(callback);
      },
    };
  }
}

/**
 * Minimal WriteStream interface that writers expect.
 */
export interface WriteStreamLike {
  write(chunk: string): boolean;
  end(callback?: () => void): void;
}
