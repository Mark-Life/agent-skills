#!/usr/bin/env -S node --experimental-strip-types
/**
 * media-cdn — upload, list, publish, and download assets on a media-cdn-service
 * deployment, from one zero-dependency CLI.
 *
 * Runtime: no build step. Bun, or Node >= 22.18 (native TS type-stripping).
 * For older Node: `npx tsx cdn.ts ...`.
 *
 * Credentials come from an env file (default `~/.agents/.env.local`, override
 * with `--env <path>`): MEDIA_CDN_API_URL and MEDIA_CDN_API_KEY.
 *
 * Usage:
 *   bun run cdn.ts upload <file...> [--public] [--folder p] [--name f]
 *   bun run cdn.ts list [--folder p] [--match s] [--public|--private] [--limit n]
 *   bun run cdn.ts get|publish|unpublish|delete <id|filename>
 *   bun run cdn.ts download <id|filename> [--out path]
 *   bun run cdn.ts whoami
 *
 * Every command takes --json (full API shape) and --env <path>.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname } from "node:path";

const DEFAULT_ENV = `${homedir()}/.agents/.env.local`;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
};

interface Config {
  url: string;
  key: string;
}

/** One asset as the list endpoint returns it. */
interface Asset {
  id: string;
  filename: string;
  folderPath: string;
  mimeType: string;
  sizeBytes: number;
  cdnEnabled: boolean;
  currentVersionId: string;
  createdAt: string;
  versions?: { id: string; version: number; uploadStatus: string; publicUrl: string | null }[];
}

/** The single-asset shape, shared by GET /assets/:id and PATCH /assets/:id. */
interface AssetView {
  asset: {
    assetId: string;
    filename: string;
    folderPath: string;
    mimeType: string;
    sizeBytes: number;
    cdnEnabled: boolean;
    versionId: string;
    privateDownloadUrl: string;
  };
  publicUrl: string | null;
}

interface UploadTicket {
  assetId: string;
  versionId: string;
  uploadUrl: string;
  completeUrl: string;
  publicUrl: string | null;
  privateDownloadUrl: string;
}

interface CompletedUpload {
  assetId: string;
  versionId: string;
  status: string;
  publicUrl: string | null;
  privateDownloadUrl: string;
}

interface WhoAmI {
  token: { id: string; name: string; scopes: string[] };
  user: { id: string };
  workspaceId: string;
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- config

/** `KEY=value` lines, with optional `export`, quotes, and `#` comments. */
const parseEnvFile = (path: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
};

/**
 * Explicit `--env <path>` wins over the process environment — the caller
 * pointed at that file for a reason. The default file only fills in what the
 * environment does not already set.
 */
const loadConfig = (envPath: string | undefined): Config => {
  const path = envPath ?? DEFAULT_ENV;
  if (envPath && !existsSync(path)) throw new Error(`env file not found: ${path}`);
  const file = existsSync(path) ? parseEnvFile(path) : {};
  const pick = (k: string) => (envPath ? (file[k] ?? process.env[k]) : (process.env[k] ?? file[k]));
  const url = pick("MEDIA_CDN_API_URL");
  const key = pick("MEDIA_CDN_API_KEY");
  if (!url || !key)
    throw new Error(
      `MEDIA_CDN_API_URL and MEDIA_CDN_API_KEY must be set in ${path} or the environment`,
    );
  return { url: url.replace(/\/$/, ""), key };
};

// ---------------------------------------------------------------- api

const api = async <T>(cfg: Config, path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(path.startsWith("http") ? path : `${cfg.url}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.key}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, err.code ?? "http_error", err.error ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
};

/**
 * The list endpoint takes no filters that hold up — an empty `folderPath` is
 * ignored server-side, so every filter here is applied to the full list.
 */
const listAssets = async (cfg: Config): Promise<Asset[]> =>
  (await api<{ assets?: Asset[] }>(cfg, "/api/v1/assets")).assets ?? [];

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** An asset reference is a UUID, or a case-insensitive filename substring that matches exactly one asset. */
const resolveId = async (cfg: Config, ref: string): Promise<string> => {
  if (isUuid(ref)) return ref;
  const hits = (await listAssets(cfg)).filter((a) =>
    a.filename.toLowerCase().includes(ref.toLowerCase()),
  );
  const [only] = hits;
  if (!only) throw new Error(`no asset matches "${ref}"`);
  if (hits.length > 1)
    throw new Error(
      `"${ref}" matches ${hits.length} assets — pass an id:\n` +
        hits.map((a) => `  ${a.id}  ${a.filename}`).join("\n"),
    );
  return only.id;
};

const setPublic = (cfg: Config, id: string, isPublic: boolean) =>
  api<AssetView>(cfg, `/api/v1/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public: isPublic }),
  });

// ---------------------------------------------------------------- upload

interface UploadOptions {
  folder?: string;
  name?: string;
  type?: string;
  publish: boolean;
}

/** Three-step upload: reserve a version, PUT the bytes, mark it ready. */
const uploadFile = async (cfg: Config, file: string, opts: UploadOptions) => {
  if (!existsSync(file)) throw new Error(`file not found: ${file}`);
  const bytes = readFileSync(file);
  const size = statSync(file).size;
  const filename = opts.name ?? basename(file);
  const mimeType = opts.type ?? MIME[extname(filename).toLowerCase()] ?? "application/octet-stream";
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");

  const init = await api<UploadTicket>(cfg, "/api/v1/assets/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      mimeType,
      sizeBytes: size,
      checksumSha256,
      ...(opts.folder === undefined ? {} : { folderPath: opts.folder }),
    }),
  });

  await api<unknown>(cfg, init.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: new Uint8Array(bytes),
  });

  const done = await api<CompletedUpload>(cfg, init.completeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId: init.versionId }),
  });

  const published = opts.publish ? await setPublic(cfg, init.assetId, true) : null;
  return {
    id: init.assetId,
    versionId: init.versionId,
    filename,
    mimeType,
    sizeBytes: size,
    publicUrl: published?.publicUrl ?? done.publicUrl ?? null,
    privateDownloadUrl: done.privateDownloadUrl,
    status: done.status,
  };
};

// ---------------------------------------------------------------- cli

interface Args {
  cmd: string;
  positionals: string[];
  env?: string;
  folder?: string;
  name?: string;
  type?: string;
  match?: string;
  out?: string;
  limit?: number;
  publish: boolean;
  visibility?: "public" | "private";
  json: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const a: Args = { cmd: "", positionals: [], publish: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--env") a.env = argv[++i];
    else if (arg === "--folder") a.folder = argv[++i];
    else if (arg === "--name") a.name = argv[++i];
    else if (arg === "--type") a.type = argv[++i];
    else if (arg === "--match") a.match = argv[++i];
    else if (arg === "--out" || arg === "-o") a.out = argv[++i];
    else if (arg === "--limit") a.limit = Number(argv[++i]);
    else if (arg === "--public") a.visibility = "public";
    else if (arg === "--private") a.visibility = "private";
    else if (arg === "--json") a.json = true;
    else if (arg === "--help" || arg === "-h") a.help = true;
    else if (!a.cmd) a.cmd = arg;
    else a.positionals.push(arg);
  }
  // `--public` publishes on upload and filters on list.
  if (a.cmd === "upload" && a.visibility === "public") a.publish = true;
  return a;
};

const HELP = `media-cdn — assets on a media-cdn-service deployment

  upload <file...>   [--public] [--folder p] [--name f] [--type mime]
  list               [--folder p] [--match s] [--public|--private] [--limit n]
  get <id|name>
  publish <id|name>            make the asset readable at a public CDN URL
  unpublish <id|name>          revoke the public URL, keep the asset
  delete <id|name>             (the service exposes no delete route today)
  download <id|name> [--out p]
  whoami

Global: --json  --env <path>   (default env file: ~/.agents/.env.local)

Default output is one tab-separated line per asset: id, url-or-"-", filename.`;

const row = (id: string, url: string | null, filename: string) =>
  `${id}\t${url ?? "-"}\t${filename}`;

const run = async (a: Args) => {
  const cfg = loadConfig(a.env);

  if (a.cmd === "whoami") {
    const me = await api<WhoAmI>(cfg, "/api/v1/whoami");
    if (a.json) return console.log(JSON.stringify(me, null, 2));
    return console.log(`${me.workspaceId}\t${me.token.name}\t${me.token.scopes.join(",")}`);
  }

  if (a.cmd === "upload") {
    if (a.positionals.length === 0) throw new Error("upload needs at least one file");
    const results = [];
    for (const file of a.positionals)
      results.push(
        await uploadFile(cfg, file, {
          folder: a.folder,
          name: a.name,
          type: a.type,
          publish: a.publish,
        }),
      );
    if (a.json) return console.log(JSON.stringify(results, null, 2));
    for (const r of results) console.log(row(r.id, r.publicUrl, r.filename));
    return;
  }

  if (a.cmd === "list") {
    let assets = await listAssets(cfg);
    if (a.folder !== undefined) assets = assets.filter((x) => x.folderPath === a.folder);
    const match = a.match?.toLowerCase();
    if (match) assets = assets.filter((x) => x.filename.toLowerCase().includes(match));
    if (a.visibility) assets = assets.filter((x) => x.cdnEnabled === (a.visibility === "public"));
    if (a.limit) assets = assets.slice(0, a.limit);
    if (a.json) return console.log(JSON.stringify(assets, null, 2));
    for (const x of assets) {
      const url = x.versions?.find((v) => v.id === x.currentVersionId)?.publicUrl ?? null;
      console.log(`${row(x.id, url, x.filename)}\t${x.sizeBytes}\t${x.folderPath || "-"}`);
    }
    return;
  }

  const ref = a.positionals[0] ?? "";
  if (!ref) throw new Error(`${a.cmd || "command"} needs an asset id or filename`);
  const id = await resolveId(cfg, ref);

  if (a.cmd === "get") {
    const got = await api<AssetView>(cfg, `/api/v1/assets/${id}`);
    if (a.json) return console.log(JSON.stringify(got, null, 2));
    return console.log(row(id, got.publicUrl, got.asset.filename));
  }

  if (a.cmd === "publish" || a.cmd === "unpublish") {
    const res = await setPublic(cfg, id, a.cmd === "publish");
    if (a.json) return console.log(JSON.stringify(res, null, 2));
    return console.log(row(id, res.publicUrl, res.asset.filename));
  }

  if (a.cmd === "delete") {
    try {
      const res = await api<unknown>(cfg, `/api/v1/assets/${id}`, { method: "DELETE" });
      if (a.json) return console.log(JSON.stringify(res, null, 2));
      return console.log(`deleted\t${id}`);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 405 || err.status === 403))
        throw new Error(
          `this deployment cannot delete assets (HTTP ${err.status}). ` +
            `Run \`unpublish ${ref}\` to revoke the public URL instead.`,
        );
      throw err;
    }
  }

  if (a.cmd === "download") {
    const got = await api<AssetView>(cfg, `/api/v1/assets/${id}`);
    const res = await fetch(got.asset.privateDownloadUrl, {
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
    const out = a.out ?? got.asset.filename;
    writeFileSync(out, new Uint8Array(await res.arrayBuffer()));
    return console.log(out);
  }

  throw new Error(`unknown command "${a.cmd}"\n\n${HELP}`);
};

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.cmd) {
  console.log(HELP);
  process.exit(args.cmd ? 0 : 1);
}
try {
  await run(args);
} catch (err) {
  const e = err as Error;
  console.error(`error: ${e.message}${err instanceof ApiError ? ` (${err.code})` : ""}`);
  process.exit(1);
}
