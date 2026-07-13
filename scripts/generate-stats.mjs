#!/usr/bin/env node
// Renders assets/stats.svg from live GitHub + Packagist data.
// No third-party service, no rate-limited shared instance: the card lives in this repo.

import { writeFileSync } from 'node:fs';

const USER = 'wallacemartinss';
const TOKEN = process.env.GITHUB_TOKEN;

const gh = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
  return res.json();
};

const LANG_COLORS = {
  PHP: '#4F5D95', Blade: '#f7523f', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  Python: '#3572A5', CSS: '#663399', HTML: '#e34c26', Shell: '#89e051',
  Dockerfile: '#384d54', Vue: '#41b883', Go: '#00ADD8', Makefile: '#427819',
};
const colorFor = (lang, i) =>
  LANG_COLORS[lang] ?? ['#F59E0B', '#EF4444', '#22C55E', '#38BDF8', '#A78BFA', '#F472B6'][i % 6];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

// ── gather ────────────────────────────────────────────────────────────────────
const user = await gh(`/users/${USER}`);

const repos = [];
for (let page = 1; ; page++) {
  const batch = await gh(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const owned = repos.filter((r) => !r.fork && !r.private);

const stars = owned.reduce((sum, r) => sum + r.stargazers_count, 0);

const bytes = {};
for (const repo of owned) {
  const langs = await gh(`/repos/${USER}/${repo.name}/languages`);
  for (const [lang, n] of Object.entries(langs)) bytes[lang] = (bytes[lang] ?? 0) + n;
}
const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const topLangs = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([lang, n], i) => ({ lang, pct: (n / totalBytes) * 100, color: colorFor(lang, i) }));

// Packagist downloads across every published package.
let downloads = 0;
let packages = 0;
try {
  const list = await fetch(`https://packagist.org/packages/list.json?vendor=${USER}`).then((r) => r.json());
  for (const name of list.packageNames ?? []) {
    const pkg = await fetch(`https://packagist.org/packages/${name}.json`).then((r) => r.json());
    downloads += pkg.package?.downloads?.total ?? 0;
    packages++;
  }
} catch {
  // Packagist hiccup: keep the card renderable, just without the downloads figure.
}

// ── render ────────────────────────────────────────────────────────────────────
const W = 900, H = 232, MID = 452;
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif";

const statRows = [
  ['Total stars', fmt(stars)],
  ['Packagist downloads', downloads ? fmt(downloads) : '—'],
  ['Published packages', String(packages)],
  ['Public repositories', String(owned.length)],
  ['Followers', String(user.followers)],
];

const stats = statRows
  .map(([label, value], i) => {
    const y = 74 + i * 28;
    return `    <text x="32" y="${y}" font-family="${SANS}" font-size="14" fill="#94A3B8">${esc(label)}</text>
    <text x="${MID - 32}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="700" fill="#F8FAFC">${esc(value)}</text>`;
  })
  .join('\n');

// Stacked language bar + legend in two columns.
let cursor = MID + 32;
const BAR_W = W - MID - 64;
const bar = topLangs
  .map(({ pct, color }) => {
    const w = Math.max((pct / 100) * BAR_W, 2);
    const rect = `    <rect x="${cursor.toFixed(1)}" y="66" width="${w.toFixed(1)}" height="10" fill="${color}"/>`;
    cursor += w;
    return rect;
  })
  .join('\n');

const legend = topLangs
  .map(({ lang, pct, color }, i) => {
    const x = MID + 32 + (i % 2) * ((BAR_W + 8) / 2);
    const y = 108 + Math.floor(i / 2) * 26;
    return `    <circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${color}"/>
    <text x="${x + 18}" y="${y}" font-family="${SANS}" font-size="13" fill="#E2E8F0">${esc(lang)}</text>
    <text x="${x + 18 + lang.length * 7.4 + 8}" y="${y}" font-family="${MONO}" font-size="12" fill="#64748B">${pct.toFixed(1)}%</text>`;
  })
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="GitHub stats for ${USER}">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1120"/>
      <stop offset="100%" stop-color="#0A0E17"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" rx="14" fill="url(#cardBg)" stroke="#1E293B"/>
  <line x1="${MID}" y1="24" x2="${MID}" y2="${H - 24}" stroke="#1E293B"/>

  <text x="32" y="36" font-family="${MONO}" font-size="12" letter-spacing="2" font-weight="600" fill="#F59E0B">OVERVIEW</text>
  <rect x="32" y="46" width="60" height="2" rx="1" fill="url(#rule)"/>
${stats}

  <text x="${MID + 32}" y="36" font-family="${MONO}" font-size="12" letter-spacing="2" font-weight="600" fill="#F59E0B">TOP LANGUAGES</text>
  <rect x="${MID + 32}" y="46" width="60" height="2" rx="1" fill="url(#rule)"/>
  <clipPath id="barClip"><rect x="${MID + 32}" y="66" width="${BAR_W}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#barClip)">
    <rect x="${MID + 32}" y="66" width="${BAR_W}" height="10" fill="#1E293B"/>
${bar}
  </g>
${legend}

  <text x="${W - 32}" y="${H - 18}" text-anchor="end" font-family="${MONO}" font-size="10" fill="#334155">auto-updated daily</text>
</svg>
`;

writeFileSync(new URL('../assets/stats.svg', import.meta.url), svg);
console.log(
  `stats.svg written — ${stars}★, ${fmt(downloads)} downloads, ${packages} packages, ${owned.length} repos, ${topLangs.length} langs`,
);
