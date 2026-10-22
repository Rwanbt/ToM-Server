import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dump, load } from "js-yaml";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = path.join(repositoryRoot, "ci/tom-e2e/compose.yaml");
const project = `tom-e2e-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
assert.equal(Bun.version, "1.4.3", "run this integration harness with the CI-pinned Bun 1.4.3");
const dockerExecutable = process.platform === "win32"
  ? "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"
  : "docker";
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), `${project}-`));
const composeEnvironment = {
  ...process.env,
  TOM_E2E_DATA: dataDirectory.replaceAll("\\", "/"),
};
const compose = (...args: string[]) => run(dockerExecutable, ["compose", "-p", project, "-f", composeFile, ...args], composeEnvironment);
const password = "tom-e2e-user-password";
const databasePassword = "tom-e2e-disposable-password";

async function runBytes(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  input?: Buffer,
): Promise<Buffer> {
  const child = spawn(command, args, { cwd: repositoryRoot, env, stdio: ["pipe", "pipe", "inherit"] });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(input);
  const [code] = (await once(child, "close")) as [number | null];
  const output = Buffer.concat(chunks);
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited ${code}\n${output.toString("utf8")}`);
  return output;
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const output = (await runBytes(command, args, env)).toString("utf8").trim();
  if (output) console.log(output);
  return output;
}

async function waitFor<T>(label: string, check: () => Promise<T | false>, timeoutMs = 120_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== false) return result;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${label}: ${String(lastError ?? "condition not met")}`);
}

async function json(url: string, init?: RequestInit): Promise<{ response: Response; body: any }> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function port(service: string, containerPort: number): Promise<number> {
  const mapping = await compose("port", service, String(containerPort));
  const value = Number(mapping.slice(mapping.lastIndexOf(":") + 1));
  assert.ok(Number.isInteger(value) && value > 0, `invalid published port for ${service}: ${mapping}`);
  return value;
}

async function configureSynapse(): Promise<void> {
  await compose("run", "--rm", "synapse-config");
  const generateCertificate = `import datetime
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "tom-e2e.test")])
now = datetime.datetime.now(datetime.timezone.utc)
certificate = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=1)).not_valid_after(now + datetime.timedelta(days=1)).add_extension(x509.SubjectAlternativeName([x509.DNSName("tom-e2e.test")]), critical=False).add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True).sign(key, hashes.SHA256())
Path("/data/synapse.crt").write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
Path("/data/synapse.key").write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()))`;
  await compose("run", "--rm", "--entrypoint", "python", "synapse-config", "-c", generateCertificate);
  const configPath = path.join(dataDirectory, "homeserver.yaml");
  const config = load(await readFile(configPath, "utf8")) as Record<string, any>;
  config.registration_shared_secret = "tom-e2e-registration-secret";
  config.database = {
    name: "psycopg2",
    args: {
      user: "tom",
      password: databasePassword,
      database: "synapse",
      host: "postgres",
      port: 5432,
    },
  };
  const listeners = config.listeners as Array<Record<string, any>>;
  const clientListener = listeners.find((listener) => listener.port === 8008);
  assert.ok(clientListener, "Synapse generation must provide the client API listener");
  config.listeners = listeners
    .filter((listener) => listener.port !== 8448)
    .map((listener) => listener.port === 8008 ? { ...listener, bind_addresses: ["0.0.0.0"] } : listener);
  config.listeners.push({ ...clientListener, port: 8448, tls: true, bind_addresses: ["0.0.0.0"] });
  config.tls_certificate_path = "/data/synapse.crt";
  config.tls_private_key_path = "/data/synapse.key";
  await writeFile(configPath, dump(config, { lineWidth: -1 }));

  const tomConfig = {
    server: { name: "tom-e2e.test" },
    synapse: {
      server_url: "https://tom-e2e.test:8448",
      database: { host: "postgres", name: "tom_matrix", user: "tom", password: databasePassword },
    },
    database: { host: "postgres", name: "tom_app", user: "tom", password: databasePassword },
    federation: { is_federated_identity_service: true },
  };
  await writeFile(path.join(dataDirectory, "tomconfig.yaml"), dump(tomConfig, { lineWidth: -1 }));
}

async function waitForSynapse(baseUrl: string): Promise<void> {
  await waitFor("Synapse client API", async () => {
    const { response } = await json(`${baseUrl}/_matrix/client/versions`);
    return response.ok;
  });
}

async function startTom(): Promise<string> {
  await compose("up", "-d", "tom");
  const appUrl = `http://127.0.0.1:${await port("tom", 3000)}`;
  await waitFor("ToM liveness", async () => {
    const { response } = await json(`${appUrl}/health`);
    return response.ok;
  });
  return appUrl;
}

async function loginSynapse(synapseUrl: string): Promise<string> {
  const { response, body } = await json(`${synapseUrl}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: "tom-e2e" },
      password,
    }),
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.user_id, "@tom-e2e:tom-e2e.test");
  return body.access_token as string;
}

async function requestOpenIdToken(
  synapseUrl: string,
  accessToken: string,
): Promise<{ token: string; serverName: string; expiresIn: number; tokenType: string }> {
  const userId = encodeURIComponent("@tom-e2e:tom-e2e.test");
  const { response, body } = await json(`${synapseUrl}/_matrix/client/v3/user/${userId}/openid/request_token`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.matrix_server_name, "tom-e2e.test");
  assert.ok(typeof body.access_token === "string" && body.access_token.length > 0);
  assert.ok(typeof body.expires_in === "number" && body.expires_in > 0);
  assert.equal(body.token_type, "Bearer");
  return {
    token: body.access_token,
    serverName: body.matrix_server_name,
    expiresIn: body.expires_in,
    tokenType: body.token_type,
  };
}

async function main(): Promise<void> {
  let composeStarted = false;
  let servicesStarted = false;
  try {
    composeStarted = true;
    if (process.env.GITHUB_ENV) {
      await appendFile(process.env.GITHUB_ENV, `TOM_E2E_PROJECT=${project}\nTOM_E2E_DATA=${composeEnvironment.TOM_E2E_DATA}\n`);
    }
    await configureSynapse();
    servicesStarted = true;
    await compose("up", "-d", "postgres", "synapse");
    const synapseUrl = `http://127.0.0.1:${await port("synapse", 8008)}`;
    await waitForSynapse(synapseUrl);
    await run(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "synapse", "register_new_matrix_user", "-u", "tom-e2e", "-p", password, "--admin", "-c", "/data/homeserver.yaml", "http://localhost:8008"], composeEnvironment);

    let appUrl = await startTom();
    const migratedTables = await compose(
      "exec", "-T", "postgres", "psql", "-U", "tom", "-d", "tom_app", "-Atqc",
      "SELECT to_regclass('public.accesstokens') || '|' || to_regclass('public.hashbyserver')",
    );
    assert.equal(migratedTables, "accesstokens|hashbyserver", "ToM and federation schema migrations ran on PostgreSQL");
    const federationPepper = await compose(
      "exec", "-T", "postgres", "psql", "-U", "tom", "-d", "tom_app", "-Atqc",
      "UPDATE keys SET data='tom-e2e-federation-pepper' WHERE name='pepper' RETURNING name",
    );
    assert.equal(federationPepper, "pepper", "federation lookup uses a synthetic disposable pepper");
    const matrixToken = await loginSynapse(synapseUrl);
    const openId = await requestOpenIdToken(synapseUrl, matrixToken);
    const { response: registration, body: registrationBody } = await json(`${appUrl}/_matrix/identity/v2/account/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        access_token: openId.token,
        expires_in: String(openId.expiresIn),
        matrix_server_name: openId.serverName,
        token_type: openId.tokenType,
      }),
    });
    assert.equal(registration.status, 200, JSON.stringify(registrationBody));
    const tomToken = registrationBody.token as string;
    assert.ok(tomToken);

    const identityPath = () => `${appUrl}/_matrix/identity/v2/account`;
    const { response: identityValid, body: identityBody } = await json(identityPath(), {
      headers: { authorization: `Bearer ${tomToken}` },
    });
    assert.equal(identityValid.status, 200, "ToM identity endpoint accepts the Synapse-validated session");
    assert.equal(identityBody.user_id, "@tom-e2e:tom-e2e.test");
    const federatedPath = () => `${appUrl}/_matrix/identity/v2/hash_details`;
    const { response: federatedValid } = await json(federatedPath(), { headers: { authorization: `Bearer ${tomToken}` } });
    assert.equal(federatedValid.status, 200, "ToM token authenticates on the real federation route");

    await compose("restart", "tom");
    appUrl = `http://127.0.0.1:${await port("tom", 3000)}`;
    await waitFor("ToM restart", async () => {
      const { response } = await json(`${appUrl}/health`);
      return response.ok;
    });
    const { response: afterRestart } = await json(federatedPath(), { headers: { authorization: `Bearer ${tomToken}` } });
    assert.equal(afterRestart.status, 200, "federated session survives application restart");

    const backupDirectory = path.join(dataDirectory, "backup");
    await mkdir(backupDirectory);
    const configBackup = path.join(backupDirectory, "tomconfig.yaml");
    const databaseBackup = path.join(backupDirectory, "tom_app.dump");
    const configPath = path.join(dataDirectory, "tomconfig.yaml");
    const configHash = createHash("sha256").update(await readFile(configPath)).digest("hex");
    await copyFile(configPath, configBackup);
    const databaseDump = await runBytes(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "postgres", "pg_dump", "-U", "tom", "-Fc", "tom_app"], composeEnvironment);
    await writeFile(databaseBackup, databaseDump);

    await compose("stop", "tom");
    await run(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "postgres", "psql", "-U", "tom", "-d", "tom_app", "-c", "DELETE FROM accesstokens"], composeEnvironment);
    const degradedSessionCount = await compose(
      "exec", "-T", "postgres", "psql", "-U", "tom", "-d", "tom_app", "-Atqc", "SELECT count(*) FROM accesstokens",
    );
    assert.equal(degradedSessionCount, "0", "rollback begins from a verified lost-session state");
    const degradedConfig = load(await readFile(configBackup, "utf8")) as Record<string, any>;
    degradedConfig.database.name = "missing_degraded_database";
    await writeFile(path.join(dataDirectory, "tomconfig.yaml"), dumpYaml(degradedConfig));
    await compose("up", "-d", "tom");
    await waitFor("degraded release exits", async () => {
      const state = await compose("ps", "--status", "exited", "--services", "tom");
      return state === "tom";
    });
    const degradedUnavailable = await fetch(federatedPath(), { headers: { authorization: `Bearer ${tomToken}` } })
      .then((response) => response.status !== 200)
      .catch(() => true);
    assert.equal(degradedUnavailable, true, "degraded application is not serving authenticated federation traffic");

    await compose("stop", "tom");
    await copyFile(configBackup, configPath);
    assert.equal(createHash("sha256").update(await readFile(configPath)).digest("hex"), configHash);
    await run(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "postgres", "dropdb", "-U", "tom", "--if-exists", "tom_app"], composeEnvironment);
    await run(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "postgres", "createdb", "-U", "tom", "-O", "tom", "tom_app"], composeEnvironment);
    await runBytes(dockerExecutable, ["compose", "-p", project, "-f", composeFile, "exec", "-T", "-i", "postgres", "pg_restore", "-U", "tom", "-d", "tom_app", "--no-owner"], composeEnvironment, await readFile(databaseBackup));
    appUrl = await startTom();
    const { response: restoredFederation } = await json(`${appUrl}/_matrix/identity/v2/hash_details`, { headers: { authorization: `Bearer ${tomToken}` } });
    assert.equal(restoredFederation.status, 200, "restored config and PostgreSQL backup recover federation authentication");

    const { response: logout } = await json(`${appUrl}/_matrix/identity/v2/account/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${tomToken}` },
    });
    assert.equal(logout.status, 200, "ToM logout revokes the issued token");
    const { response: revokedTom } = await json(identityPath(), { headers: { authorization: `Bearer ${tomToken}` } });
    assert.equal(revokedTom.status, 401, "revoked ToM credential is rejected by its identity endpoint");
    const { response: revokedFederation } = await json(`${appUrl}/_matrix/identity/v2/hash_details`, { headers: { authorization: `Bearer ${tomToken}` } });
    assert.equal(revokedFederation.status, 401, "revoked ToM credential is rejected by the federation endpoint");
    const revokedQuery = `?access_token=${encodeURIComponent(tomToken)}`;
    assert.equal((await json(`${identityPath()}${revokedQuery}`)).response.status, 401);
    assert.equal((await json(`${federatedPath()}${revokedQuery}`)).response.status, 401);
    console.log("PASS: disposable PostgreSQL + Synapse + ToM startup, migration, Matrix auth, federation, restart, pg_dump/restore, rollback, and revocation");
  } catch (error) {
    if (servicesStarted) await compose("logs", "--tail", "60", "--no-color").catch(console.error);
    throw error;
  } finally {
    try {
      if (composeStarted) await compose("down", "--volumes", "--remove-orphans");
    } finally {
      await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}

function dumpYaml(value: unknown): string {
  return dump(value, { lineWidth: -1 });
}

await main();
