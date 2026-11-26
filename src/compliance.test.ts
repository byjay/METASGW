import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC_DIR = resolve(ROOT, 'src');

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      listSourceFiles(full, acc);
    } else if (/\.(ts|tsx|css)$/.test(entry) && !entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc.sort();
}

const RUNTIME_SOURCE_FILES = listSourceFiles(SRC_DIR);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('SGW Integration Guide (§1, §6, §7, §8) static compliance audit', () => {
  it('1) removes all browser-side authorization validators (securityEngine)', () => {
    assert.equal(existsSync(resolve(SRC_DIR, 'core', 'securityEngine.ts')), false);
    const forbidden =
      /\b(validateMetaspaceAccess|validateLiveKitRoomAccess|createPartnerInviteRecord|revokeMembershipFourStep|securityEngine)\b/;
    for (const file of RUNTIME_SOURCE_FILES) {
      const code = stripComments(readFileSync(file, 'utf8'));
      assert.equal(
        forbidden.test(code),
        false,
        `Forbidden browser auth validator found in ${relative(ROOT, file)}`,
      );
    }
  });

  it('2) removes all postMessage calls (no wildcard origin leakage)', () => {
    for (const file of RUNTIME_SOURCE_FILES) {
      const code = stripComments(readFileSync(file, 'utf8'));
      assert.equal(
        /\bpostMessage\b/.test(code),
        false,
        `Unexpected postMessage found in ${relative(ROOT, file)}`,
      );
    }
  });

  it('3) pins exact versions in package.json, drops unused/server deps, removes server.ts & GEMINI metadata', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

    for (const [name, version] of Object.entries(allDeps)) {
      assert.ok(
        !/^[~^*><=]/.test(version),
        `Dependency ${name} must be exact-pinned without range prefix, got "${version}"`,
      );
    }

    const forbiddenDeps = ['express', 'dotenv', '@google/genai', '@pixiv/three-vrm', 'esbuild'];
    for (const dep of forbiddenDeps) {
      assert.equal(dep in allDeps, false, `Forbidden or unused dependency present: ${dep}`);
    }

    assert.equal(existsSync(resolve(ROOT, 'server.ts')), false, 'server.ts must not exist');

    const metadataRaw = readFileSync(resolve(ROOT, 'metadata.json'), 'utf8');
    assert.equal(
      /SERVER_SIDE_GEMINI|GEMINI/i.test(metadataRaw),
      false,
      'metadata.json must not declare Gemini server capabilities',
    );
  });

  it('4) forbids innerHTML, dangerouslySetInnerHTML, document.write, eval, and window.open/alert', () => {
    const forbiddenDomSinks =
      /\b(innerHTML|outerHTML|dangerouslySetInnerHTML|document\.write|eval\s*\(|new\s+Function|window\.open|window\.alert)\b/;
    for (const file of RUNTIME_SOURCE_FILES) {
      const code = stripComments(readFileSync(file, 'utf8'));
      assert.equal(
        forbiddenDomSinks.test(code),
        false,
        `Forbidden unsafe DOM/dialog sink found in ${relative(ROOT, file)}`,
      );
    }
  });

  it('5) confines all network fetch() calls to sgwAdapter.ts and bans token storage & external CDNs', () => {
    for (const file of RUNTIME_SOURCE_FILES) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      const code = stripComments(readFileSync(file, 'utf8'));

      if (rel !== 'src/sgwAdapter.ts') {
        assert.equal(
          /\bfetch\s*\(/.test(code),
          false,
          `Direct fetch() outside sgwAdapter.ts found in ${rel}`,
        );
      }

      assert.equal(
        /\b(localStorage|sessionStorage)\b/.test(code),
        false,
        `Browser storage access found in ${rel}`,
      );
    }

    const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    assert.equal(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare/i.test(
        indexHtml,
      ),
      false,
      'index.html must not load external CDN resources',
    );
  });

  it('6) contains zero hull numbers, emails, phone numbers, real personal names, or customer/shipyard identifiers across src/ & index.html', () => {
    const allAuditFiles: string[] = [];
    const walkAll = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walkAll(full);
        } else if (/\.(ts|tsx|css|html)$/.test(entry)) {
          allAuditFiles.push(full);
        }
      }
    };
    walkAll(SRC_DIR);
    allAuditFiles.push(resolve(ROOT, 'index.html'));

    // Hull number pattern: 1-2 uppercase letters + optional separator + 3-4 digits (fictional examples: X0000, Y000, ZZ-0000)
    // Allowed technical standard tokens only (sample vessels use VESSEL-LNG-01 / DOCK-01 2-digit format)
    const ALLOWED_TECH_TOKENS = new Set([
      'ES2020',
      'ES2021',
      'ES2022',
      'ES2023',
      'ES2024',
      'ES2025',
      'X0000',
      'Y000',
      'ZZ-0000',
    ]);
    const hullPattern = /(?<![A-Za-z0-9#_-])([A-Z]{1,2}[-_]?\d{3,4})(?![A-Za-z0-9])/g;
    const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const phonePattern =
      /(?:\+82[-\s]?|0)(?:10|11|16|17|18|19|2|3[1-3]|4[1-4]|5[1-5]|6[1-4])[-\s]\d{3,4}[-\s]\d{4}\b/g;

    // Precomputed SHA-256 digests (UTF-8 lowercase) of disallowed real names, customer names, and shipyard names
    // so zero plaintext real-world identifiers ever exist in the repository.
    const FORBIDDEN_IDENTIFIER_SHA256 = new Set<string>([
      'f09c2129c2be1f9fd4f975732c9f7f91ecb21faf718cd2030917ef9e0e1b55b0',
      '9c6b9b1b1627f3120e0730c6d2cfa71040fd03747bde2755e8b5e4dbf2bee262',
      '052c38aa31e316ed6ce3badb7a713c2e36781f1ff0b2202f2fd31e52b7cc7bb4',
      '9cf3b53033829bccbcd69b7a35fd84877d5073fc183f15ee1a50c9d5756b0e72',
      '5b49ac3122f2441e24dab545578f4712ad23bc2d316f917d1319926949edf989',
      'bf7deb89d4f5731ba2ddef75c71c1722dea689a45560c34d313ff2b837e18a89',
      '0b46d03b0b3355e67179efa6f64f4e6461af77dc577142b8e0749b67188a3a9f',
      '30e5f32f691a774b90b53bf514ee431486208ff70fbcf513932ec0a09fb2fadd',
      '52ec3d9fde73a46dd9b6961c94c7b6c3faa8e22ec71d3e585f0f68860b873ea0',
      '7148b856cedf157d1c76a1e592bc062ad02dc0f28977313c6a72a35cffc4129f',
      'a926c4a9c145e86b21c011cedb2c62351b7259105dc7b2245a658ccad5e9f3d4',
      'ebcdfdc3946014331454cc57e16e63d0b8f8875df7718e394f3429d28c423e65',
      'a5d4db0fc8cbaaa30191addd87d5b64c9be7484a5c695ba12423d34d51783a3c',
      '4d60f56aea32a4e9faf08edd598a6dc2dc29396d764c2d00fb24f0451d8c01ad',
      'f5f31f55a28e75dec14e8f197574eaf65c9da4d3663919eb5e8e1477bf3cc5fb',
      '407b36c4a5ee2fee459686f4d2b4fc3354449bab478121f4b87b276391f51de7',
      '4ac6b1d4ae2027e9b9bdce0d15dfabf3ccc8ea20eda2b3f6a8f6be68f772b028',
      'b1dd60e60f5f05b3b25fbe1b7ac6e0afbdceaa4d726e58f29966d02fb277c0d4',
      'e1979d404f38e20b9bc8eb68d2e4e1e718e61fe5abc15ef44bdc09b7ef835c7f',
    ]);

    // Optional local-only blocklist (.gitignore'd) so developers can append extra org terms locally
    const localBlocklistPath = resolve(ROOT, '.compliance.local.txt');
    if (existsSync(localBlocklistPath)) {
      const localLines = readFileSync(localBlocklistPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      for (const term of localLines) {
        FORBIDDEN_IDENTIFIER_SHA256.add(createHash('sha256').update(term, 'utf8').digest('hex'));
      }
    }

    const tokenPattern = /[가-힣A-Za-z0-9]{2,16}(?:\s+[A-Za-z]{2,8})?/g;

    for (const file of allAuditFiles) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf8');

      // 1) Hull numbers (excluding compliance test's own fictional comment tokens)
      const hullMatches = [...content.matchAll(hullPattern)]
        .map((m) => m[1])
        .filter((token) => !ALLOWED_TECH_TOKENS.has(token));
      assert.deepEqual(
        hullMatches,
        [],
        `Disallowed hull-number-like identifier(s) found in ${rel}: ${hullMatches.join(', ')}`,
      );

      // 2) Emails
      const emailMatches = [...content.matchAll(emailPattern)].map((m) => m[0]);
      assert.deepEqual(
        emailMatches,
        [],
        `Disallowed email address(es) found in ${rel}: ${emailMatches.join(', ')}`,
      );

      // 3) Phone numbers
      const phoneMatches = [...content.matchAll(phonePattern)].map((m) => m[0]);
      assert.deepEqual(
        phoneMatches,
        [],
        `Disallowed phone number(s) found in ${rel}: ${phoneMatches.join(', ')}`,
      );

      // 4) SHA-256 digest match against disallowed personal names / real shipyard & customer names
      const candidateTokens = new Set<string>();
      for (const match of content.matchAll(tokenPattern)) {
        const raw = match[0].trim().replace(/\s+/g, ' ').toLowerCase();
        candidateTokens.add(raw);
        for (const sub of raw.split(' ')) {
          if (sub.length >= 2) candidateTokens.add(sub);
        }
      }
      for (const tok of candidateTokens) {
        const digest = createHash('sha256').update(tok, 'utf8').digest('hex');
        assert.equal(
          FORBIDDEN_IDENTIFIER_SHA256.has(digest),
          false,
          `Disallowed identifier digest (${digest.slice(0, 12)}...) matched in ${rel}`,
        );
      }
    }
  });

  it('7) enforces frontend-only architecture (no WS/LiveKit/Colyseus/Docker/separate SSO) and dev-only HUD debug metrics', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const forbiddenRealtimeDeps = ['ws', 'socket.io', 'socket.io-client', 'livekit-client', 'colyseus', 'colyseus.js'];
    for (const dep of forbiddenRealtimeDeps) {
      assert.equal(dep in allDeps, false, `Forbidden backend/realtime dependency present: ${dep}`);
    }
    assert.equal(existsSync(resolve(ROOT, 'Dockerfile')), false, 'Dockerfile must not exist');
    assert.equal(existsSync(resolve(ROOT, 'docker-compose.yml')), false, 'docker-compose.yml must not exist');

    const appSource = readFileSync(resolve(SRC_DIR, 'App.tsx'), 'utf8');
    assert.ok(
      appSource.includes('showDebugMetrics={import.meta.env.DEV}'),
      'HUD debug metrics must be strictly gated behind import.meta.env.DEV',
    );
  });
});

