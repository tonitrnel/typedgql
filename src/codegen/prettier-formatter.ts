import { resolve } from "node:path";

/**
 * Prettier instance type (dynamically imported)
 */
interface PrettierAPI {
  format(source: string, options?: PrettierOptions): Promise<string>;
  resolveConfig(filePath: string): Promise<PrettierOptions | null>;
}

interface PrettierOptions {
  parser?: string;
  [key: string]: unknown;
}

let prettierInstance: PrettierAPI | null | undefined = undefined;
let prettierDetected = false;

/**
 * Detect and dynamically import prettier if available.
 * Returns null if prettier is not installed.
 */
async function detectPrettier(): Promise<PrettierAPI | null> {
  if (prettierDetected) {
    return prettierInstance ?? null;
  }

  prettierDetected = true;

  try {
    // Try to dynamically import prettier
    const prettier = await import("prettier");
    prettierInstance = prettier as unknown as PrettierAPI;
    return prettierInstance;
  } catch {
    // Prettier not installed
    prettierInstance = null;
    return null;
  }
}

/**
 * Format TypeScript code using prettier if available.
 * Returns the original code if prettier is not installed or formatting fails.
 *
 * @param code - TypeScript code to format
 * @param filePath - File path for prettier config resolution
 * @returns Formatted code or original code if formatting fails
 */
export async function formatWithPrettier(
  code: string,
  filePath: string,
): Promise<string> {
  const prettier = await detectPrettier();

  if (!prettier) {
    return code;
  }

  try {
    // Resolve prettier config for the file
    const config = await prettier.resolveConfig(filePath);

    // Format the code
    const formatted = await prettier.format(code, {
      ...config,
      parser: "typescript",
      filepath: filePath,
    });

    return formatted;
  } catch (error) {
    // If formatting fails, return original code
    console.warn(
      `[typedgql] Failed to format ${filePath} with prettier: ${(error as Error).message}`,
    );
    return code;
  }
}

/**
 * Check if prettier is available.
 * This is a lightweight check that doesn't actually import prettier.
 */
export async function isPrettierAvailable(): Promise<boolean> {
  const prettier = await detectPrettier();
  return prettier !== null;
}

/**
 * Reset prettier detection state (useful for testing).
 */
export function resetPrettierDetection(): void {
  prettierInstance = undefined;
  prettierDetected = false;
}
