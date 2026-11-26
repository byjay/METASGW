import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSedmsProjectUrl,
  buildSedmsReturnUrl,
  buildTalkDmUrl,
  buildTalkRoomUrl,
  isSafeNavigationUrl,
  isValidProjectId,
  SGW_LOGIN_REDIRECT_URL,
  SGW_PORTAL_LINKS,
} from './deepLink.ts';

describe('deepLink frozen contracts & URL safety', () => {
  it('builds frozen SEDMS SSO URLs with exact return query parameter', () => {
    assert.equal(
      buildSedmsProjectUrl('proj01'),
      '/api/sedms-sso?return=%2Fproject%2Fproj01',
    );
    assert.equal(
      buildSedmsReturnUrl({ kind: 'projects' }),
      '/api/sedms-sso?return=%2Fprojects',
    );
    assert.equal(
      buildSedmsReturnUrl({ kind: 'app' }),
      '/api/sedms-sso?return=%2Fapp',
    );
  });

  it('rejects path traversal and unsafe project IDs', () => {
    assert.equal(isValidProjectId('proj01'), true);
    assert.equal(isValidProjectId('PRJ_2026-01.a'), true);
    assert.equal(isValidProjectId('../admin'), false);
    assert.equal(isValidProjectId('proj/evil'), false);
    assert.equal(isValidProjectId('proj?x=1'), false);
    assert.equal(isValidProjectId(''), false);
    assert.throws(() => buildSedmsProjectUrl('../escape'));
  });

  it('builds SGTALK DM and room deep-links keyed by sub', () => {
    assert.equal(buildTalkDmUrl('user01'), '/talk/?dm=user01');
    assert.equal(buildTalkRoomUrl('room01'), '/talk/?room=room01');
    assert.equal(buildTalkDmUrl('javascript:alert(1)'), SGW_PORTAL_LINKS.talkHome);
  });

  it('allows only same-origin root-relative paths, http(s), and bmail:', () => {
    assert.equal(isSafeNavigationUrl(SGW_LOGIN_REDIRECT_URL), true);
    assert.equal(isSafeNavigationUrl('/talk/?dm=user01'), true);
    assert.equal(isSafeNavigationUrl('/nas/'), true);
    assert.equal(isSafeNavigationUrl('bmail://inbox'), true);
    assert.equal(isSafeNavigationUrl('https://sgw.seastar.work/talk/'), true);

    // XSS / protocol-injection payloads MUST be rejected
    assert.equal(isSafeNavigationUrl('javascript:alert(1)'), false);
    assert.equal(isSafeNavigationUrl('  JaVaScRiPt:alert(1)'), false);
    assert.equal(isSafeNavigationUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeNavigationUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeNavigationUrl('file:///etc/passwd'), false);
    assert.equal(isSafeNavigationUrl('//evil.example/phish'), false);
    assert.equal(isSafeNavigationUrl('/\\evil.example'), false);
    assert.equal(isSafeNavigationUrl(''), false);
  });
});
