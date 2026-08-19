import { CLASS_COLOR } from '@content/charColors';
import type { CharId } from '@engine/index';

// The v0.4.0 roster (Chronos/Kage/Morvane) doesn't have painted portraits like the original four —
// there was no way to source matching artwork. Rather than a broken <img> or a placeholder that
// would read as an unfinished attempt at matching the painted style, they get a hand-drawn SVG
// "sigil card": a gradient panel in the class color with a simple geometric emblem, at the exact
// same 480x720 aspect ratio as the real cards (public/assets/cards/*.webp) so they sit correctly in
// every layout that expects a portrait — HeroFigures' full-height battle stage art included. Encoded
// as a data: URI so every existing `<img src={charImageUrl(charId)}>` call site works unchanged.

const W = 480;
const H = 720;
const CX = W / 2;
const CY = 300;

function frame(color: string, glyph: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="70%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
        <stop offset="55%" stop-color="${color}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#0b0e14" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0b0e14"/>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${CX}" cy="${CY}" r="160" fill="none" stroke="#d4a94a" stroke-width="4" opacity="0.5"/>
    <circle cx="${CX}" cy="${CY}" r="128" fill="none" stroke="#d4a94a" stroke-width="2" opacity="0.3"/>
    ${glyph}
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#8a6f2f" stroke-width="5" opacity="0.55"/>
  </svg>`;
}

/** Crossed blades — Kage the Ninja. */
function daggersGlyph(color: string): string {
  const blade = (rotate: number) => `
    <g transform="rotate(${rotate} ${CX} ${CY})">
      <polygon points="${CX},${CY - 120} ${CX + 16},${CY - 20} ${CX},${CY + 30} ${CX - 16},${CY - 20}" fill="#e8e4d8" stroke="${color}" stroke-width="3"/>
      <rect x="${CX - 30}" y="${CY + 18}" width="60" height="16" rx="4" fill="${color}"/>
      <rect x="${CX - 7}" y="${CY + 32}" width="14" height="70" rx="4" fill="#3a2f1a"/>
    </g>`;
  return blade(-42) + blade(42);
}

/** An hourglass — Chronos the Time Mage. */
function hourglassGlyph(color: string): string {
  return `
    <g>
      <polygon points="${CX - 78},${CY - 110} ${CX + 78},${CY - 110} ${CX + 8},${CY} ${CX + 78},${CY + 110} ${CX - 78},${CY + 110} ${CX - 8},${CY}" fill="none" stroke="${color}" stroke-width="9" stroke-linejoin="round"/>
      <polygon points="${CX - 58},${CY - 92} ${CX + 58},${CY - 92} ${CX + 5},${CY - 8} ${CX - 5},${CY - 8}" fill="${color}" opacity="0.85"/>
      <polygon points="${CX - 30},${CY + 92} ${CX + 30},${CY + 92} ${CX + 4},${CY + 40} ${CX - 4},${CY + 40}" fill="${color}" opacity="0.85"/>
      <rect x="${CX - 92}" y="${CY - 126}" width="184" height="16" rx="6" fill="${color}"/>
      <rect x="${CX - 92}" y="${CY + 110}" width="184" height="16" rx="6" fill="${color}"/>
    </g>`;
}

/** A skull — Morvane the Necromancer. */
function skullGlyph(color: string): string {
  return `
    <g>
      <path d="M ${CX - 82},${CY - 6} a 82,92 0 1 1 164,0 v 44 a 24,24 0 0 1 -24,24 h -18 l -12,34 h -56 l -12,-34 h -18 a 24,24 0 0 1 -24,-24 z" fill="${color}" opacity="0.92"/>
      <circle cx="${CX - 34}" cy="${CY - 14}" r="24" fill="#0b0e14"/>
      <circle cx="${CX + 34}" cy="${CY - 14}" r="24" fill="#0b0e14"/>
      <polygon points="${CX},${CY + 10} ${CX + 13},${CY + 38} ${CX - 13},${CY + 38}" fill="#0b0e14"/>
    </g>`;
}

const SIGILS: Partial<Record<CharId, (color: string) => string>> = {
  // v0.4.0 roster — no painted portraits, so they render as a sigil the way Dax/Mira did before
  // they were removed. Kage reuses the crossed blades; Chronos and Morvane get their own below.
  Chronos: hourglassGlyph,
  Kage: daggersGlyph,
  Morvane: skullGlyph,
};

export function hasSigil(charId: CharId): boolean {
  return charId in SIGILS;
}

export function sigilDataUri(charId: CharId): string {
  const build = SIGILS[charId];
  const color = CLASS_COLOR[charId];
  const svg = build ? frame(color, build(color)) : frame(color, '');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
