import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type SmokeArgs = {
  allowOpenAccess: boolean;
  baseUrl?: string;
  help: boolean;
  json: boolean;
  rmId: string;
  timeoutMs: number;
  workspacePath: string;
};

type StepResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const repoRoot = process.cwd();
const defaultBaseUrl = "https://dyna-beacon.vercel.app";
const envFileOrder = [".env", ".env.production", ".env.local", ".env.production.local"];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const loadedEnv = loadEnv();
  const baseUrl = normalizeBaseUrl(args.baseUrl ?? loadedEnv.BEACON_SMOKE_BASE_URL ?? defaultBaseUrl);
  const accessCode = loadedEnv.BEACON_ACCESS_CODE?.trim();
  const steps: StepResult[] = [];
  const jar = new CookieJar();

  if (!accessCode) {
    failWithSummary({
      steps,
      message: [
        "BEACON_ACCESS_CODE is not available to this script.",
        "Standalone tsx scripts do not auto-load Next.js env files unless the script does it explicitly.",
        "Add BEACON_ACCESS_CODE to .env.production.local, export it in the shell, or run:",
        "vercel env pull .env.production.local --environment=production --yes"
      ].join("\n")
    });
  }

  log(args, `Beacon production smoke target: ${baseUrl}`);
  log(args, `Loaded env files: ${loadedEnv.__loadedFiles || "none"}; secrets are not printed.`);

  const loginProbe = await request({
    args,
    baseUrl,
    jar,
    method: "GET",
    path: "/login",
    redirect: "manual"
  });
  const loginLocation = loginProbe.response.headers.get("location") ?? "";
  const accessGateActive = isAccessRedirect(loginProbe.response.status, loginLocation);

  if (accessGateActive) {
    steps.push({
      name: "access gate preflight",
      ok: true,
      detail: `/login redirects to ${loginLocation}`
    });
  } else if (loginProbe.response.status === 200) {
    const detail = "/login is reachable without beacon_access cookie";
    steps.push({
      name: "access gate preflight",
      ok: args.allowOpenAccess,
      detail: args.allowOpenAccess
        ? `${detail}; continuing because --allow-open-access was set`
        : `${detail}; BEACON_ACCESS_CODE is not active on the target deployment`
    });
    if (!args.allowOpenAccess) {
      failWithSummary({
        steps,
        message: [
          "Access gate is not active on the target deployment.",
          "Likely causes: BEACON_ACCESS_CODE is missing from the Production env, scoped to the wrong environment, or the deployment was not redeployed after the env change.",
          "After changing Vercel env vars, trigger a fresh Production redeploy and run this smoke again."
        ].join("\n")
      });
    }
  } else {
    steps.push({
      name: "access gate preflight",
      ok: false,
      detail: `unexpected /login status ${loginProbe.response.status}`
    });
    failWithSummary({
      steps,
      message: "Could not determine access-gate state from /login."
    });
  }

  if (accessGateActive) {
    const accessResponse = await request({
      args,
      baseUrl,
      body: JSON.stringify({ code: accessCode, next: "/login" }),
      headers: { "content-type": "application/json" },
      jar,
      method: "POST",
      path: "/api/access",
      redirect: "manual"
    });
    jar.capture(accessResponse.response.headers);

    if (accessResponse.response.status === 401) {
      steps.push({
        name: "access code exchange",
        ok: false,
        detail: "/api/access rejected BEACON_ACCESS_CODE with 401"
      });
      failWithSummary({
        steps,
        message: [
          "The target deployment rejected your local BEACON_ACCESS_CODE.",
          "Likely causes: local .env.production.local differs from Vercel Production, the variable was scoped to Preview only, or the latest deployment has not been redeployed."
        ].join("\n")
      });
    }

    if (!isRedirectStatus(accessResponse.response.status) && accessResponse.response.status !== 200) {
      steps.push({
        name: "access code exchange",
        ok: false,
        detail: `/api/access returned ${accessResponse.response.status}`
      });
      failWithSummary({
        steps,
        message: "Access code exchange returned an unexpected status."
      });
    }

    if (!jar.has("beacon_access")) {
      steps.push({
        name: "access code exchange",
        ok: false,
        detail: "/api/access did not set beacon_access cookie"
      });
      failWithSummary({
        steps,
        message: [
          "Access code exchange did not produce a beacon_access cookie.",
          "Check whether the target deployment is running the expected access-gate code and has BEACON_ACCESS_CODE configured."
        ].join("\n")
      });
    }

    steps.push({
      name: "access code exchange",
      ok: true,
      detail: "beacon_access cookie issued"
    });
  }

  const sessionResponse = await request({
    args,
    baseUrl,
    body: JSON.stringify({ rmId: args.rmId }),
    headers: { "content-type": "application/json" },
    jar,
    method: "POST",
    path: "/api/session",
    redirect: "manual"
  });
  jar.capture(sessionResponse.response.headers);
  const sessionBody = await readBody(sessionResponse.response);

  if (sessionResponse.response.status === 401) {
    steps.push({
      name: "session start",
      ok: false,
      detail: "/api/session returned 401 access required"
    });
    failWithSummary({
      steps,
      message: [
        "The access cookie was not accepted by /api/session.",
        "Likely causes: BEACON_ACCESS_CODE mismatch, cookie not issued, or target deployment changed between access and session calls."
      ].join("\n")
    });
  }

  if (sessionResponse.response.status >= 500) {
    steps.push({
      name: "session start",
      ok: false,
      detail: `/api/session returned ${sessionResponse.response.status}${sessionBody ? `: ${trimForLog(sessionBody)}` : ""}`
    });
    failWithSummary({
      steps,
      message: [
        "Session API failed after access passed.",
        "Most likely causes: SESSION_SECRET is missing from Vercel Production or the Production deployment was not redeployed after adding it.",
        "This guard is intentional; fix the env/deployment instead of weakening session-cookie protection."
      ].join("\n")
    });
  }

  if (sessionResponse.response.status !== 200) {
    steps.push({
      name: "session start",
      ok: false,
      detail: `/api/session returned ${sessionResponse.response.status}${sessionBody ? `: ${trimForLog(sessionBody)}` : ""}`
    });
    failWithSummary({
      steps,
      message: "Session API returned an unexpected status."
    });
  }

  if (!jar.has("beacon_rm_id")) {
    steps.push({
      name: "session start",
      ok: false,
      detail: "/api/session did not set beacon_rm_id cookie"
    });
    failWithSummary({
      steps,
      message: "Session API returned 200 but did not issue the Beacon RM session cookie."
    });
  }

  steps.push({
    name: "session start",
    ok: true,
    detail: `/api/session started ${args.rmId}`
  });

  const workspaceResponse = await request({
    args,
    baseUrl,
    jar,
    method: "GET",
    path: args.workspacePath,
    redirect: "manual"
  });
  const workspaceBody = await readBody(workspaceResponse.response);
  const workspaceLocation = workspaceResponse.response.headers.get("location") ?? "";

  if (isRedirectStatus(workspaceResponse.response.status)) {
    steps.push({
      name: "workspace load",
      ok: false,
      detail: `${args.workspacePath} redirected to ${workspaceLocation || "unknown"}`
    });
    failWithSummary({
      steps,
      message: [
        "Workspace did not accept the session cookie.",
        "Likely causes: session cookie was not issued, SESSION_SECRET changed between requests, or the target deployment did not receive the expected cookie."
      ].join("\n")
    });
  }

  if (workspaceResponse.response.status !== 200) {
    steps.push({
      name: "workspace load",
      ok: false,
      detail: `${args.workspacePath} returned ${workspaceResponse.response.status}`
    });
    failWithSummary({
      steps,
      message: "Workspace returned an unexpected status."
    });
  }

  if (!/Beacon|Daily Brief|Workspace|Jensen Parker|Adrian Lim|Sofia Tan/.test(workspaceBody)) {
    steps.push({
      name: "workspace load",
      ok: false,
      detail: "workspace HTML did not include expected Beacon markers"
    });
    failWithSummary({
      steps,
      message: "Workspace returned 200 but did not look like the Beacon app shell."
    });
  }

  steps.push({
    name: "workspace load",
    ok: true,
    detail: `${args.workspacePath} returned 200 with Beacon content`
  });

  printSummary(args, steps);
}

function parseArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = {
    allowOpenAccess: false,
    help: false,
    json: false,
    rmId: "rm_junior_01",
    timeoutMs: 15_000,
    workspacePath: "/workspace"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--allow-open-access") {
      args.allowOpenAccess = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--base-url") {
      args.baseUrl = nextValue();
    } else if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length);
    } else if (arg === "--rm-id") {
      args.rmId = nextValue();
    } else if (arg.startsWith("--rm-id=")) {
      args.rmId = arg.slice("--rm-id=".length);
    } else if (arg === "--workspace") {
      args.workspacePath = normalizePath(nextValue(), "--workspace");
    } else if (arg.startsWith("--workspace=")) {
      args.workspacePath = normalizePath(arg.slice("--workspace=".length), "--workspace");
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = parseTimeout(nextValue());
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = parseTimeout(arg.slice("--timeout-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseTimeout(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${value}`);
  }
  return parsed;
}

function normalizePath(value: string, label: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`${label} must be a relative app path such as /workspace`);
  }
  return value;
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function loadEnv(): NodeJS.ProcessEnv & { __loadedFiles?: string } {
  const loadedFiles: string[] = [];
  const fileEnv: Record<string, string> = {};

  for (const filename of envFileOrder) {
    const filePath = path.join(repoRoot, filename);
    if (!existsSync(filePath)) continue;
    loadedFiles.push(filename);
    Object.assign(fileEnv, parseEnvFile(readFileSync(filePath, "utf8")));
  }

  return {
    ...fileEnv,
    ...process.env,
    __loadedFiles: loadedFiles.join(", ")
  };
}

function parseEnvFile(source: string) {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const exportless = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = exportless.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = exportless.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    const rawValue = exportless.slice(separatorIndex + 1).trim();
    parsed[key] = unquoteEnvValue(rawValue);
  }
  return parsed;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, "\"");
  }
  return value.replace(/\s+#.*$/, "");
}

async function request({
  args,
  baseUrl,
  body,
  headers,
  jar,
  method,
  path: requestPath,
  redirect
}: {
  args: SmokeArgs;
  baseUrl: string;
  body?: string;
  headers?: Record<string, string>;
  jar: CookieJar;
  method: string;
  path: string;
  redirect: RequestRedirect;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const cookieHeader = jar.header();
  const response = await fetch(new URL(requestPath, `${baseUrl}/`), {
    body,
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "beacon-production-smoke/1.0",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...headers
    },
    method,
    redirect,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));

  return { response };
}

async function readBody(response: Response) {
  return response.clone().text().catch(() => "");
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  capture(headers: Headers) {
    for (const cookie of getSetCookie(headers)) {
      const pair = cookie.split(";", 1)[0];
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name) {
        this.cookies.set(name, value);
      }
    }
  }

  has(name: string) {
    return this.cookies.has(name);
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function getSetCookie(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withGetSetCookie.getSetCookie?.();
  if (cookies && cookies.length > 0) {
    return cookies;
  }

  const fallback = headers.get("set-cookie");
  if (!fallback) return [];
  return fallback.split(/,(?=\s*[^;,]+=)/).map((item) => item.trim());
}

function isAccessRedirect(status: number, location: string) {
  return isRedirectStatus(status) && location.startsWith("/access");
}

function isRedirectStatus(status: number) {
  return status === 303 || status === 307 || status === 308 || status === 302 || status === 301;
}

function trimForLog(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function printSummary(args: SmokeArgs, steps: StepResult[]) {
  if (args.json) {
    console.log(JSON.stringify({ ok: true, steps }, null, 2));
    return;
  }

  console.log("\nBeacon production smoke passed.");
  for (const step of steps) {
    console.log(`[OK] ${step.name}: ${step.detail}`);
  }
}

function failWithSummary({ steps, message }: { steps: StepResult[]; message: string }): never {
  console.error("\nBeacon production smoke failed.");
  for (const step of steps) {
    console.error(`[${step.ok ? "OK" : "FAIL"}] ${step.name}: ${step.detail}`);
  }
  console.error(`\n${message}`);
  process.exit(1);
}

function log(args: SmokeArgs, message: string) {
  if (!args.json) {
    console.log(message);
  }
}

function printHelp() {
  console.log(`Beacon production smoke

Usage:
  npm run smoke:production
  npm run smoke:production -- --base-url https://your-preview.vercel.app
  npm run smoke:production -- --base-url http://localhost:3000 --allow-open-access

Environment:
  BEACON_ACCESS_CODE is required unless the script is only printing help.
  The script loads .env, .env.production, .env.local, then .env.production.local.
  Shell environment variables override file values.

Options:
  --base-url <url>          Target deployment. Default: ${defaultBaseUrl}
  --rm-id <rmId>            Demo RM to start. Default: rm_junior_01
  --workspace <path>        Workspace path to load. Default: /workspace
  --timeout-ms <ms>         Per-request timeout. Default: 15000
  --allow-open-access       Allow /login to be public, useful for local dev only
  --json                    Print machine-readable success output
  --help                    Show this help
`);
}

main().catch((error) => {
  console.error("\nBeacon production smoke failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
