const PALETTES = {
  default: { primary: '#00A8A8', danger: '#E63946', bg: '#F0F2F5' },
  deuteranopia: { primary: '#0077BB', danger: '#EE7733', bg: '#F0F2F5' },
  protanopia: { primary: '#3366CC', danger: '#DDAA33', bg: '#F0F2F5' },
  tritanopia: { primary: '#009988', danger: '#CC3311', bg: '#F0F2F5' },
};

function getPalette(name) {
  return PALETTES[name] || PALETTES.default;
}

function cyclePalette(current) {
  const names = Object.keys(PALETTES);
  const idx = names.indexOf(current);
  return names[(idx + 1) % names.length];
}

function listPalettes() {
  return Object.keys(PALETTES);
}

module.exports = { getPalette, cyclePalette, listPalettes, PALETTES };
