const PALETTES = {
  default: { primary: '#00A8A8', danger: '#E63946', bg: '#0F1026' },
  deuteranopia: { primary: '#0077BB', danger: '#EE7733', bg: '#0F1026' },
  protanopia: { primary: '#3366CC', danger: '#DDAA33', bg: '#0F1026' },
  tritanopia: { primary: '#009988', danger: '#CC3311', bg: '#0F1026' },
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
