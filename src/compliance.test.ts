import assert from 'node:assert/strict';
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
          const rel = relative(ROOT, full).replace(/\\/g, '/');
          // Exclude this compliance test file itself so its regex literals do not self-trigger
          if (rel !== 'src/compliance.test.ts') {
            allAuditFiles.push(full);
          }
        }
      }
    };
    walkAll(SRC_DIR);
    allAuditFiles.push(resolve(ROOT, 'index.html'));

    // Hull number pattern: 1-2 uppercase letters + optional separator + 3-4 digits (e.g., H1042, F310, HN-2045)
    // Allowed technical standard tokens only (sample vessels use VESSEL-LNG-01 / DOCK-01 2-digit format)
    const ALLOWED_TECH_TOKENS = new Set(['ES2020', 'ES2021', 'ES2022', 'ES2023', 'ES2024', 'ES2025']);
    const hullPattern = /(?<![A-Za-z0-9#_-])([A-Z]{1,2}[-_]?\d{3,4})(?![A-Za-z0-9])/g;
    const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const phonePattern =
      /(?:\+82[-\s]?|0)(?:10|11|16|17|18|19|2|3[1-3]|4[1-4]|5[1-5]|6[1-4])[-\s]\d{3,4}[-\s]\d{4}\b/g;
    const realNameOrShipyardPattern =
      /김철수|홍길동|박영희|이영수|최민수|정수진|김민준|이서연|박지훈|현대중공업|삼성중공업|한화오션|대우조선|HD현대|HJ중공업|STX조선|Maersk|MSC\b|CMA\s*CGM/;

    for (const file of allAuditFiles) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf8');

      // 1) Hull numbers
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

      // 4) Real personal names / real shipyard or customer identifiers
      const piiMatch = content.match(realNameOrShipyardPattern);
      assert.equal(
        piiMatch,
        null,
        `Disallowed real personal name or shipyard/customer identifier "${piiMatch?.[0] ?? ''}" found in ${rel}`,
      );
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

