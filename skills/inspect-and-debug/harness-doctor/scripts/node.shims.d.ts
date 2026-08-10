/**
 * Ambient types for the handful of Node builtins this skill uses.
 *
 * The skill ships with no `node_modules` and no install step, so a typecheck
 * has nothing to read `node:fs`, `node:os`, `node:path`, or `process` from.
 * These declarations cover exactly the API surface the 13 files touch, which
 * keeps `tsc --noEmit -p tsconfig.json` runnable straight out of the folder.
 *
 * `tsconfig.json` sets `"types": []` so an unrelated `@types/node` elsewhere on
 * the machine cannot be pulled in beside these and clash. In the dev repo the
 * root `tsconfig.json` excludes this file and uses real types instead.
 */

declare module "node:fs" {
  /** One directory entry from `readdirSync(..., { withFileTypes: true })`. */
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  /** The `statSync` fields this skill reads. */
  export interface Stats {
    size: number;
    mtimeMs: number;
  }
  export const existsSync: (path: string) => boolean;
  export const readFileSync: (path: string, encoding: "utf8") => string;
  export const writeFileSync: (path: string, data: string, encoding: "utf8") => void;
  export const appendFileSync: (path: string, data: string, encoding: "utf8") => void;
  export const mkdirSync: (
    path: string,
    options: { recursive: boolean },
  ) => string | undefined;
  export const statSync: (path: string) => Stats;
  export const readdirSync: (
    path: string,
    options: { withFileTypes: true },
  ) => Dirent[];
}

declare module "node:os" {
  export const homedir: () => string;
  export const tmpdir: () => string;
}

declare module "node:path" {
  export const join: (...parts: string[]) => string;
}

/** The process globals used for argv, exit codes, and the stdout/stderr split. */
declare const process: {
  argv: string[];
  exit: (code?: number) => never;
  stdout: { write: (chunk: string) => boolean };
  stderr: { write: (chunk: string) => boolean };
};
