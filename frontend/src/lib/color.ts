const SAMPLES = 48;

export async function averageColorFromImage(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();

    const size = Math.min(img.naturalWidth, img.naturalHeight) || 1;
    const sx = (img.naturalWidth - size) / 2;
    const sy = (img.naturalHeight - size) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLES;
    canvas.height = SAMPLES;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, sx, sy, size, size, 0, 0, SAMPLES, SAMPLES);
    const { data } = ctx.getImageData(0, 0, SAMPLES, SAMPLES);

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 125) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    if (count === 0) return null;

    const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch {
    return null;
  }
}