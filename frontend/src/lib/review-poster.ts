import QRCode from "qrcode";

/** Google's "G", the same paths the widget uses, for drawing on a canvas. */
const GOOGLE_G: [string, string][] = [
  ["#4285F4", "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"],
  ["#34A853", "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"],
  ["#FBBC05", "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"],
  ["#EA4335", "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"],
];

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

/** Shrinks an uploaded logo to fit 256px, so it stays a small data URL. */
export async function shrinkLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
    throw new Error("Pick a PNG, JPG, WebP or SVG image.");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth || 256, img.naturalHeight || 256));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 256) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 256) * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    // A busy photo can make a large PNG; WebP keeps it small.
    return png.length <= 300_000 ? png : canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the image inside a box, keeping its proportions. */
function drawContained(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) {
  const ratio = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * ratio;
  const h = img.naturalHeight * ratio;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

/**
 * Draws the whole image inside a circle: the largest rectangle of its shape
 * whose corners stay in the circle, so a tall or wide logo is never cut.
 */
function drawInCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
  const h = (2 * r) / Math.sqrt(1 + aspect * aspect);
  const w = h * aspect;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Lines of text that fit a width, at most `max` lines (the last one ellipsed). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    let last = kept[max - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[max - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/**
 * A QR code for the review link. With a logo, the middle of the code carries
 * it on a white tile; the highest error correction keeps the code scannable.
 */
export async function drawQr(canvas: HTMLCanvasElement, link: string, size: number, logo: HTMLImageElement | null) {
  await QRCode.toCanvas(canvas, link, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: size,
    color: { dark: "#111827", light: "#ffffff" },
  });
  if (!logo) return;
  const ctx = canvas.getContext("2d")!;
  const tile = Math.round(canvas.width * 0.24);
  const x = (canvas.width - tile) / 2;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, x, tile, tile, tile * 0.18);
  ctx.fill();
  const pad = tile * 0.12;
  drawContained(ctx, logo, x + pad, x + pad, tile - pad * 2);
}

export const DEFAULT_POSTER_COLOR = "#0096D6";

/** Ready-made colours for the poster band; any other comes from the picker. */
export const POSTER_COLORS = ["#0096D6", "#DC2626", "#EA580C", "#CA8A04", "#059669", "#0891B2", "#2563EB", "#7C3AED", "#111827"];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `a` moved towards `b` by `t` (0-1). */
function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type PosterOptions = {
  /** Band colour, #rrggbb. */
  color: string;
  businessName: string;
  headline: string;
  subtext: string;
  link: string;
  logo: HTMLImageElement | null;
  logoInQr: boolean;
};

export const POSTER_WIDTH = 1240;
export const POSTER_HEIGHT = 1754; // A4 at 150 dpi

/** The printable "review us" poster: A4 portrait, drawn at print resolution. */
export async function drawPoster(canvas: HTMLCanvasElement, o: PosterOptions) {
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Colour band with the business. Its height follows what is in it (a logo,
  // one or two lines of name), so nothing is clipped at its edge.
  ctx.font = `800 76px ${FONT}`;
  const nameLines = wrap(ctx, o.businessName, W - 200, 2);
  const logoSize = 220;
  const firstLine = o.logo ? 90 + logoSize + 100 : 190;
  const band = Math.max(360, firstLine + (nameLines.length - 1) * 90 + 90);
  const color = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : DEFAULT_POSTER_COLOR;
  const grad = ctx.createLinearGradient(0, 0, W, band);
  grad.addColorStop(0, mix(color, "#ffffff", 0.22));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, band);

  if (o.logo) {
    const top = 90;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(W / 2, top + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    // A little inside the white circle, so the logo keeps a margin.
    drawInCircle(ctx, o.logo, W / 2, top + logoSize / 2, logoSize / 2 - 22);
  }
  // Dark text on a light colour, white on a dark one.
  ctx.fillStyle = luminance(color) > 0.6 ? "#111827" : "#ffffff";
  let y = o.logo ? firstLine : (band - (nameLines.length - 1) * 90) / 2 + 26;
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y);
    y += 90;
  }

  // the ask
  y = band + 150;
  ctx.fillStyle = "#1E293B";
  ctx.font = `800 84px ${FONT}`;
  for (const line of wrap(ctx, o.headline, W - 180, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 100;
  }
  ctx.fillStyle = "#F59E0B";
  ctx.font = `120px ${FONT}`;
  ctx.fillText("★★★★★", W / 2, y + 60);
  y += 150;
  ctx.fillStyle = "#475569";
  ctx.font = `500 44px ${FONT}`;
  for (const line of wrap(ctx, o.subtext, W - 240, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 58;
  }

  // The foot is fixed; the QR code takes the room left above it (a logo band
  // or a two-line name leaves less), within sizes that scan comfortably.
  const footY = H - 80;
  const scanY = footY - 100;
  const qrTop = y + 50;
  const qrSize = Math.round(Math.max(380, Math.min(560, scanY - 100 - qrTop)));

  // QR code on a soft card
  ctx.fillStyle = "#F8FAFC";
  roundRect(ctx, (W - qrSize) / 2 - 40, qrTop - 40, qrSize + 80, qrSize + 80, 48);
  ctx.fill();
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 3;
  ctx.stroke();
  const qr = document.createElement("canvas");
  await drawQr(qr, o.link, qrSize, o.logoInQr ? o.logo : null);
  ctx.drawImage(qr, (W - qrSize) / 2, qrTop, qrSize, qrSize);

  ctx.fillStyle = "#64748B";
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText("Scan with your phone camera", W / 2, scanY);

  // Google mark at the foot
  ctx.font = `700 42px ${FONT}`;
  const label = "Review us on Google";
  const textW = ctx.measureText(label).width;
  const g = 52;
  const startX = (W - (g + 20 + textW)) / 2;
  ctx.save();
  ctx.translate(startX, footY - g + 8);
  ctx.scale(g / 24, g / 24);
  for (const [color, d] of GOOGLE_G) {
    ctx.fillStyle = color;
    ctx.fill(new Path2D(d));
  }
  ctx.restore();
  ctx.fillStyle = "#1E293B";
  ctx.textAlign = "left";
  ctx.fillText(label, startX + g + 20, footY);
}
