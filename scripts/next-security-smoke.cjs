const assert = require('node:assert/strict');
const { defaultConfig } = require('next/dist/server/config-shared');
const { detectContentType } = require('next/dist/server/image-optimizer/detect-content-type');
const { imageOptimizerTransform } = require('next/dist/server/image-optimizer/transform');
const sharp = require('sharp');

// Exercise the installed framework boundary with bounded synthetic bytes.
// No fixture is exposed through an application route or persisted as user data.
async function smokeNextSecurity(origin) {
  for (const brand of ['avif', 'heic']) {
    const svg = Buffer.from(`<!--ftyp${brand}--><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>`);
    assert.equal(await detectContentType(svg), 'image/svg+xml');
    await assert.rejects(
      imageOptimizerTransform({ buffer: svg, etag: 'synthetic-svg', cacheControl: 'no-store' },
        { href: '/synthetic.svg', width: 64, quality: 75 }, defaultConfig),
      error => error.statusCode === 400 && /image type is not allowed/.test(error.message)
    );
  }

  const input = { create: { width: 1, height: 1, channels: 3, background: '#123456' } };
  const png = await sharp(input).png().toBuffer();
  const avif = await sharp(input).avif().toBuffer();
  assert.equal(await detectContentType(avif), 'image/avif');
  const result = await imageOptimizerTransform(
    { buffer: png, etag: 'synthetic-png', cacheControl: 'no-store' },
    { href: '/synthetic.png', width: 64, quality: 75 }, defaultConfig
  );
  assert.equal(result.error, undefined, 'Native raster optimization must succeed');
  assert.equal(result.contentType, 'image/png');
  assert.equal((await sharp(result.buffer).metadata()).width, 1);

  // The public URL parser must reject unconfigured sources before fetching them.
  for (const path of ['/_next/image',
    '/_next/image?url=https%3A%2F%2Fexample.invalid%2Fimage.svg&w=64&q=75',
    '/_next/image?url=%2F%2Fexample.invalid%2Fimage.svg&w=64&q=75']) {
    const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('x-middleware-set-cookie'), null);
    await response.arrayBuffer();
  }
  console.log('PASS framework SVG/AVIF/HEIC rejection, native PNG/AVIF controls and image URL boundary');
}

module.exports = { smokeNextSecurity };
