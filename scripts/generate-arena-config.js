const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const args = process.argv.slice(2);
const allowMissing = args.includes("--allow-missing");
const outputArgument = args.find((argument) => !argument.startsWith("--"));
const outputPath = path.resolve(
  root,
  outputArgument || "media/arenawar-runtime-config.js",
);
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
let config;

if (!url && !anonKey && allowMissing) {
  config = {};
  console.warn(
    "::warning::Supabase Actions secrets are not configured; Arena War registration will be disabled until SUPABASE_URL and SUPABASE_ANON_KEY are added.",
  );
} else {
  if (!url || !anonKey) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_ANON_KEY in .env or the environment.");
  }

  const parsedUrl = new URL(url);
  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    throw new Error("SUPABASE_URL must use HTTP or HTTPS.");
  }

  const keyParts = anonKey.split(".");
  if (keyParts.length === 3) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(keyParts[1], "base64url").toString("utf8"));
    } catch (error) {
      throw new Error("SUPABASE_ANON_KEY is not a valid Supabase JWT.", { cause: error });
    }
    if (payload.role === "service_role") {
      throw new Error("SUPABASE_ANON_KEY must not be a service_role key.");
    }
  }

  config = { url, anonKey };
}

const output = `window.ARENA_SUPABASE_RUNTIME_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output, "utf8");
console.log(`Generated ${path.relative(root, outputPath)} runtime configuration.`);
