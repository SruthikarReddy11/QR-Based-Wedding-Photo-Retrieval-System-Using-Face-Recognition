import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Download, Sparkles, Heart } from 'lucide-react';

interface WeddingQRCodeProps {
  url: string;
  size?: number;
  coupleNames?: string;
  venueInfo?: string;
  showDownload?: boolean;
  className?: string;
}

export const WeddingQRCode: React.FC<WeddingQRCodeProps> = ({
  url,
  size = 340,
  coupleNames = 'The Happy Couple',
  venueInfo,
  showDownload = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render high-res custom romantic QR code (matching Image 2)
  const renderQRCode = (canvas: HTMLCanvasElement, targetSize: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use High-DPI scaling
    const dpr = 2;
    canvas.width = targetSize * dpr;
    canvas.height = targetSize * dpr;
    canvas.style.width = `${targetSize}px`;
    canvas.style.height = `${targetSize}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, targetSize, targetSize);

    // 1. Draw Ivory Porcelain Card with rounded corners and warm glow
    const cardPadding = targetSize * 0.035;
    const cardSize = targetSize - cardPadding * 2;
    const cardRadius = targetSize * 0.11;

    ctx.save();
    ctx.shadowColor = 'rgba(216, 64, 97, 0.18)';
    ctx.shadowBlur = targetSize * 0.05;
    ctx.shadowOffsetY = targetSize * 0.02;

    // Card background gradient
    const cardGrad = ctx.createLinearGradient(0, 0, targetSize, targetSize);
    cardGrad.addColorStop(0, '#FFF9F5');
    cardGrad.addColorStop(0.5, '#FFF4EE');
    cardGrad.addColorStop(1, '#FAF0E8');

    ctx.fillStyle = cardGrad;
    drawRoundedRect(ctx, cardPadding, cardPadding, cardSize, cardSize, cardRadius);
    ctx.fill();

    // Subtle golden outer rim
    ctx.strokeStyle = '#EBD5BD';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 2. Generate QR Bit Matrix with High Error Correction (30% recoverable)
    const qrData = QRCode.create(url || 'https://wedsnap.com', {
      errorCorrectionLevel: 'H',
    });
    const matrix = qrData.modules;
    const matrixSize = matrix.size;

    const qrInnerPadding = targetSize * 0.09;
    const qrAreaSize = targetSize - qrInnerPadding * 2;
    const moduleSize = qrAreaSize / matrixSize;

    // Colors matching Image 2
    const rubyColor = '#9A0026'; // Rich deep crimson/ruby

    // Center cutout dimensions for double golden hearts logo
    const centerCutoutRatio = 0.28;
    const centerCutoutRadius = (qrAreaSize * centerCutoutRatio) / 2;
    const centerX = targetSize / 2;
    const centerY = targetSize / 2;

    // Check if a module is inside one of the 3 corner finder zones (7x7 modules)
    const isFinderZone = (row: number, col: number) => {
      // Top-Left (0..7, 0..7)
      if (row < 8 && col < 8) return true;
      // Top-Right (0..7, size-8..size)
      if (row < 8 && col >= matrixSize - 8) return true;
      // Bottom-Left (size-8..size, 0..7)
      if (row >= matrixSize - 8 && col < 8) return true;
      return false;
    };

    // Check if module is inside center cutout zone
    const isCenterZone = (row: number, col: number) => {
      const mx = qrInnerPadding + col * moduleSize + moduleSize / 2;
      const my = qrInnerPadding + row * moduleSize + moduleSize / 2;
      const dist = Math.hypot(mx - centerX, my - centerY);
      return dist < centerCutoutRadius + moduleSize * 0.5;
    };

    // 3. Draw Regular Modules (Soft rounded squares)
    ctx.fillStyle = rubyColor;
    for (let r = 0; r < matrixSize; r++) {
      for (let c = 0; c < matrixSize; c++) {
        if (isFinderZone(r, c) || isCenterZone(r, c)) {
          continue; // Skipped for custom corner eyes and center logo
        }

        if (matrix.get(r, c)) {
          const mx = qrInnerPadding + c * moduleSize;
          const my = qrInnerPadding + r * moduleSize;
          const modPad = moduleSize * 0.08;
          const modW = moduleSize - modPad * 2;
          const modRad = moduleSize * 0.28; // soft organic rounded module

          drawRoundedRect(ctx, mx + modPad, my + modPad, modW, modW, modRad);
          ctx.fill();
        }
      }
    }

    // 4. Draw Custom Finder Patterns with Solid Crimson Hearts (Image 2 style)
    const finderSize = moduleSize * 7;
    const drawCustomFinder = (fx: number, fy: number) => {
      ctx.save();

      // Outer thick rounded ruby square
      ctx.fillStyle = rubyColor;
      const outerRad = finderSize * 0.28;
      drawRoundedRect(ctx, fx, fy, finderSize, finderSize, outerRad);
      ctx.fill();

      // Inner porcelain gap cutout
      const gapSize = finderSize * 0.68;
      const gapOffset = (finderSize - gapSize) / 2;
      const gapRad = gapSize * 0.24;
      ctx.fillStyle = '#FFF5EE';
      drawRoundedRect(ctx, fx + gapOffset, fy + gapOffset, gapSize, gapSize, gapRad);
      ctx.fill();

      // Center Solid Ruby Crimson Heart ❤️
      const heartCenter = fx + finderSize / 2;
      const heartCenterY = fy + finderSize / 2;
      const heartSize = finderSize * 0.52;
      drawSolidHeart(ctx, heartCenter, heartCenterY, heartSize, rubyColor);

      ctx.restore();
    };

    // Top-Left Finder
    drawCustomFinder(qrInnerPadding, qrInnerPadding);

    // Top-Right Finder
    drawCustomFinder(qrInnerPadding + (matrixSize - 7) * moduleSize, qrInnerPadding);

    // Bottom-Left Finder
    drawCustomFinder(qrInnerPadding, qrInnerPadding + (matrixSize - 7) * moduleSize);

    // 5. Draw Center Cutout & Interlocked Golden Hearts Logo
    ctx.save();
    // Center porcelain circular background with soft golden ring
    ctx.shadowColor = 'rgba(216, 64, 97, 0.12)';
    ctx.shadowBlur = targetSize * 0.03;

    ctx.fillStyle = '#FFF6F0';
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerCutoutRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#EBD5BD';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // 6. Draw Two Intertwined Metallic Golden Hearts (Image 2 exact center design)
    ctx.save();
    const goldHeartSize = centerCutoutRadius * 0.95;
    const leftHeartX = centerX - goldHeartSize * 0.18;
    const leftHeartY = centerY - goldHeartSize * 0.05;
    const rightHeartX = centerX + goldHeartSize * 0.22;
    const rightHeartY = centerY + goldHeartSize * 0.12;

    // Left (Larger) Golden Wire Heart
    drawHollowGoldHeart(ctx, leftHeartX, leftHeartY, goldHeartSize * 0.78, -12, 2.8);

    // Right (Interlocked) Golden Wire Heart
    drawHollowGoldHeart(ctx, rightHeartX, rightHeartY, goldHeartSize * 0.58, 14, 2.4);
    ctx.restore();

    // Render completed
  };

  useEffect(() => {
    if (canvasRef.current) {
      renderQRCode(canvasRef.current, size);
    }
  }, [url, size]);

  // High-Resolution 1200x1200px PNG Download
  const handleDownload = () => {
    const exportCanvas = document.createElement('canvas');
    renderQRCode(exportCanvas, 1200);

    const link = document.createElement('a');
    link.download = `wedding-qr-${coupleNames.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      {/* QR Canvas Display */}
      <div className="relative p-2 rounded-[32px] bg-white shadow-xl border-2 border-[#EFE9E1] transition-transform duration-300 hover:scale-[1.02]">
        <canvas ref={canvasRef} className="rounded-[28px]" />

        {/* Ambient Corner Sparkle Badge */}
        <div className="absolute -top-2.5 -right-2.5 px-2.5 py-0.5 rounded-full bg-[#9A0026] text-white text-[10px] font-serif font-bold shadow-md flex items-center gap-1 border border-white">
          <Sparkles className="w-3 h-3 text-amber-300" />
          <span>Romantic AI</span>
        </div>
      </div>

      {/* Couple Name & Instructions */}
      {coupleNames && (
        <div className="mt-4 text-center">
          <div className="text-xs font-serif font-bold text-[#1E232A] flex items-center justify-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-[#9A0026] fill-current" />
            <span>{coupleNames}</span>
            <Heart className="w-3.5 h-3.5 text-[#9A0026] fill-current" />
          </div>
          {venueInfo && <div className="text-[11px] text-[#64748B] mt-0.5">{venueInfo}</div>}
        </div>
      )}

      {/* High-Res PNG Download Button */}
      {showDownload && (
        <button
          type="button"
          onClick={handleDownload}
          className="mt-4 px-5 py-2.5 rounded-full bg-[#9A0026] text-white text-xs font-semibold hover:bg-[#800020] transition-all shadow-md shadow-[#9A0026]/25 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          <span>Download High-Res QR PNG (1200px)</span>
        </button>
      )}
    </div>
  );
};

// ==========================================
// Canvas Helper Functions
// ==========================================

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Solid Heart for Finder Pattern Centers (❤️)
function drawSolidHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();

  const topY = cy - size * 0.32;
  const bottomY = cy + size * 0.42;
  const leftX = cx - size * 0.48;
  const rightX = cx + size * 0.48;
  const midY = cy - size * 0.08;

  ctx.moveTo(cx, bottomY);
  // Left curve
  ctx.bezierCurveTo(
    cx - size * 0.15,
    bottomY - size * 0.25,
    leftX,
    midY + size * 0.1,
    leftX,
    topY + size * 0.25
  );
  ctx.bezierCurveTo(
    leftX,
    topY - size * 0.05,
    cx - size * 0.05,
    topY - size * 0.05,
    cx,
    topY + size * 0.15
  );
  // Right curve
  ctx.bezierCurveTo(
    cx + size * 0.05,
    topY - size * 0.05,
    rightX,
    topY - size * 0.05,
    rightX,
    topY + size * 0.25
  );
  ctx.bezierCurveTo(
    rightX,
    midY + size * 0.1,
    cx + size * 0.15,
    bottomY - size * 0.25,
    cx,
    bottomY
  );

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Hollow Double Golden Wire Hearts for Center Logo
function drawHollowGoldHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotationDeg: number,
  lineWidth: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);

  // Metallic Golden Gradient Stroke
  const grad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#FFF0B8');
  grad.addColorStop(0.25, '#ECC662');
  grad.addColorStop(0.65, '#D4AF37');
  grad.addColorStop(1, '#9C750C');

  ctx.strokeStyle = grad;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Subtle outer drop shadow for 3D metallic feel
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = size * 0.08;
  ctx.shadowOffsetY = size * 0.03;

  ctx.beginPath();
  const topY = -size * 0.35;
  const bottomY = size * 0.44;
  const leftX = -size * 0.48;
  const rightX = size * 0.48;
  const midY = -size * 0.08;

  ctx.moveTo(0, bottomY);
  ctx.bezierCurveTo(-size * 0.15, bottomY - size * 0.25, leftX, midY + size * 0.1, leftX, topY + size * 0.25);
  ctx.bezierCurveTo(leftX, topY - size * 0.05, -size * 0.05, topY - size * 0.05, 0, topY + size * 0.15);
  ctx.bezierCurveTo(size * 0.05, topY - size * 0.05, rightX, topY - size * 0.05, rightX, topY + size * 0.25);
  ctx.bezierCurveTo(rightX, midY + size * 0.1, size * 0.15, bottomY - size * 0.25, 0, bottomY);
  ctx.closePath();
  ctx.stroke();

  // Fine specular golden highlight
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = lineWidth * 0.25;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();
}
