const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'assets');
const logoPath = path.join(assetsDir, 'family-vakay-logo.png');

const brand = {
  primary: '#0EA5A8', // ocean teal
  accent: '#FF8A4C', // sunset orange
  background: '#F8FAFC',
};

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

async function generateIcon() {
  const size = 1024;
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brand.background,
    },
  }).png();

  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath)
      .resize(Math.round(size * 0.6))
      .png()
      .toBuffer();
    await base
      .composite([{ input: logo, gravity: 'center' }])
      .toFile(path.join(assetsDir, 'icon.png'));
  } else {
    await base.toFile(path.join(assetsDir, 'icon.png'));
  }
}

async function generateAdaptiveIcon() {
  const size = 1024;
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      // Android background color
      background: brand.background,
    },
  }).png();

  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath)
      .resize(Math.round(size * 0.6))
      .png()
      .toBuffer();
    await base
      .composite([{ input: logo, gravity: 'center' }])
      .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  } else {
    await base.toFile(path.join(assetsDir, 'adaptive-icon.png'));
  }
}

async function generateSplash() {
  const size = 2048;
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brand.background,
    },
  }).png();

  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath)
      .resize(Math.round(size * 0.45))
      .png()
      .toBuffer();
    await base
      .composite([{ input: logo, gravity: 'center' }])
      .toFile(path.join(assetsDir, 'splash.png'));
  } else {
    await base.toFile(path.join(assetsDir, 'splash.png'));
  }
}

async function generateFavicon() {
  const size = 96;
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: brand.background,
    },
  }).png();

  if (fs.existsSync(logoPath)) {
    const logo = await sharp(logoPath)
      .resize(Math.round(size * 0.8))
      .png()
      .toBuffer();
    await base
      .composite([{ input: logo, gravity: 'center' }])
      .toFile(path.join(assetsDir, 'favicon.png'));
  } else {
    await base.toFile(path.join(assetsDir, 'favicon.png'));
  }
}

async function run() {
  await generateIcon();
  await generateAdaptiveIcon();
  await generateSplash();
  await generateFavicon();
  console.log('Brand assets generated.');
}

run().catch(err => console.error('Error generating assets:', err));