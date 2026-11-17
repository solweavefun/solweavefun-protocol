// The ONLY file in the project that holds colour literals.
// Provenance (sampled with sharp from the files in brand/ and reference/):
//   bg      #03000d  most frequent exact pixel, brand/LOGO WEAVE PNG.png (opaque logo, IHDR colortype 6)
//   surface #050014  most frequent exact pixel, reference/WEAVE 1.jpg.jpeg
//   raised  #140b1e  most frequent exact pixel, reference/SAMPUL WEAVE JPG.jpg.jpeg
//   ink     #ffffff  most frequent bright pixel, reference/SAMPUL WEAVE JPG.jpg.jpeg (weave glyph / wordmark)
//   purple  #5928a7  mean of vivid-purple pixels (max>120, spread>90), reference/WEAVE 1.jpg.jpeg
//   down    #c29fad  mean of vivid pixels, reference/SAMPUL WEAVE JPG.jpg.jpeg (rose highlights)
//   accent  #00ffcc  stated by the project brief for the own-token mint pulse (not sampled)
export const palette = {
  bg: '#03000d',
  surface: '#050014',
  raised: '#140b1e',
  ink: '#ffffff',
  purple: '#5928a7',
  down: '#c29fad',
  accent: '#00ffcc',
};

export const fonts = {
  display: "'Manrope', system-ui, sans-serif",
  body: "'DM Sans', system-ui, sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
};

export function tokensCss() {
  const lines = Object.entries(palette).map(([k, v]) => `  --c-${k}: ${v};`);
  lines.push('  --color-accent: var(--c-accent);');
  for (const [k, v] of Object.entries(fonts)) lines.push(`  --font-${k}: ${v};`);
  return `/* generated from src/tokens.js — do not edit */\n:root {\n${lines.join('\n')}\n}\n`;
}
