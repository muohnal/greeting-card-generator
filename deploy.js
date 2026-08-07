/* 배포 스크립트 — node deploy.js
 *
 * 예전에는 개발용 폴더와 배포용 폴더를 따로 두고, 배포할 때 개인정보를
 * 걷어내는 변환을 거쳤다. 지금은 index.html 자체에 개인정보가 없으므로
 * 변환이 필요 없다. 이 스크립트가 하는 일은 두 가지뿐이다.
 *
 *   1. 버전(빌드 시각)을 index.html 과 sw.js 에 찍는다
 *   2. 개인정보가 새어나가지 않는지 검사한다 — 하나라도 걸리면 중단
 *
 * 검사를 통과해야만 커밋·푸시가 진행된다.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HERE = __dirname;
const INDEX = path.join(HERE, 'index.html');
const SW = path.join(HERE, 'sw.js');

/* 승인된 회사 로고. 이것 말고 다른 이미지가 박히면 배포를 막는다. */
const APPROVED_LOGO_SHA256 = 'f13bb88b533be249812aed716e632100272f29882e96fd9587900bcc6e5faad9';

const BUILD = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
  .slice(0, 16).replace('T', ' ');

/* ── 1. 버전 찍기 ── */
let html = fs.readFileSync(INDEX, 'utf8');
html = html.replace(/(<div id="verBar">버전 )[^<]*(<\/div>)/, '$1' + BUILD + '$2');
html = html.replace(/window\.__BUILD = '[^']*';/, "window.__BUILD = '" + BUILD + "';");
fs.writeFileSync(INDEX, html, 'utf8');

let sw = fs.readFileSync(SW, 'utf8');
sw = sw.replace(/const BUILD = '[^']*';/, "const BUILD = '" + BUILD + "';");
fs.writeFileSync(SW, sw, 'utf8');

/* ── 2. 검사 ──
   git 이 실제로 올릴 파일만 본다. .gitignore 로 빠진 파일은 검사 대상이 아니다. */
const tracked = execSync('git ls-files', { cwd: HERE, encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);

const out = fs.readFileSync(INDEX, 'utf8');
const imgs = out.match(/data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+/g) || [];
const logoM = out.match(/DEFAULT_LOGO\s*=\s*(['"])data:image\/png;base64,([A-Za-z0-9+/=]+)\1/);
const logoHash = logoM
  ? require('crypto').createHash('sha256').update(Buffer.from(logoM[2], 'base64')).digest('hex')
  : null;

const HOME_USER = path.basename(require('os').homedir());
const PHONE = /\b01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}\b/;

/* 올라갈 텍스트 파일 전체에서 개인정보 흔적을 찾는다 */
const leaks = [];
tracked.forEach(f => {
  if (!/\.(html|js|json|md|csv|txt)$/i.test(f)) return;
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) return;
  const t = fs.readFileSync(p, 'utf8');
  if (PHONE.test(t)) leaks.push(f + ' — 전화번호 형태');
  if (t.includes(HOME_USER)) leaks.push(f + ' — 윈도우 계정명');
});

const checks = [
  ['담당자 기본값이 비어 있음',
    /agentName\s*:\s*(['"])\1/.test(out) && /agentTel\s*:\s*(['"])\1/.test(out) &&
    /agentOrg\s*:\s*(['"])\1/.test(out)],
  ['올라갈 파일에 개인정보 없음', leaks.length === 0],
  ['기본 로고가 승인된 그 파일',  logoHash === APPROVED_LOGO_SHA256],
  ['그 외 박힌 이미지 없음',      imgs.length === 1],
  ['내장 글꼴 유지',        /@font-face\{font-family:'EmbPretendard'/.test(out)],
  ['manifest 연결',         /rel="manifest"/.test(out)],
  ['서비스워커 등록',        /serviceWorker\.register/.test(out)],
  ['버전 표시',             out.includes('버전 ' + BUILD)],
  ['서비스워커 버전 일치',    fs.readFileSync(SW, 'utf8').includes("const BUILD = '" + BUILD + "'")],
  ['원본 파일 제외됨',       !tracked.includes('_reference_v9.html')],
  ['스크린샷 제외됨',        !tracked.some(f => f.startsWith('.test-shots/'))],
];

let bad = 0;
checks.forEach(([n, ok]) => { if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + n); });
leaks.forEach(l => console.log('      ↳ ' + l));
console.log('  버전: ' + BUILD + ' · 올릴 파일 ' + tracked.length + '개 · ' +
  (out.length / 1024 / 1024).toFixed(2) + 'MB');

if (bad) {
  console.error('\n검사 실패 ' + bad + '건 — 배포를 중단했습니다.');
  process.exit(1);
}

/* ── 3. 커밋 · 푸시 ── */
const msg = process.argv.slice(2).join(' ') || ('업데이트 ' + BUILD);
try {
  execSync('git add -A', { cwd: HERE, stdio: 'inherit' });
  const changed = execSync('git status --porcelain', { cwd: HERE, encoding: 'utf8' }).trim();
  if (!changed) { console.log('\n바뀐 내용이 없습니다.'); process.exit(0); }
  /* -m 에 넣으면 줄바꿈이 \n 글자 그대로 들어간다. 파일로 넘긴다. */
  const msgFile = path.join(HERE, '.commitmsg.tmp');
  fs.writeFileSync(msgFile, msg, 'utf8');
  try { execSync('git commit -q -F ' + JSON.stringify(msgFile), { cwd: HERE, stdio: 'inherit' }); }
  finally { fs.unlinkSync(msgFile); }
  execSync('git push -q origin main', { cwd: HERE, stdio: 'inherit' });
  console.log('\n배포 완료 — https://muohnal.github.io/greeting-card-generator/');
  console.log('반영까지 1~2분 걸립니다. 화면 맨 아래 버전이 ' + BUILD + ' 이면 성공입니다.');
} catch (e) {
  console.error('\ngit 작업 실패:', e.message);
  process.exit(1);
}
