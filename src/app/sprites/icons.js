// Tiny canvas-drawn icons used in the top bar and breakdowns.
// Each icon function paints inside a (sx, sy, size, size) box.

export function drawResourceIcon(ctx, key, sx, sy, size = 16) {
  switch (key) {
    case "grain":
      // Wheat sheaf
      ctx.strokeStyle = "#a8783a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + size * 0.5, sy + size - 2);
      ctx.lineTo(sx + size * 0.5, sy + 3);
      ctx.stroke();
      ctx.fillStyle = "#e8c552";
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(sx + size * 0.4, sy + 5 + i * 3, 2, 1.2, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(sx + size * 0.6, sy + 5 + i * 3, 2, 1.2, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "cloth":
      // Folded cloth with diagonal stripes
      ctx.fillStyle = "#7796b0";
      ctx.fillRect(sx + 2, sy + 4, size - 4, size - 7);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 2, sy + 7);
      ctx.lineTo(sx + size - 2, sy + 4);
      ctx.moveTo(sx + 2, sy + 11);
      ctx.lineTo(sx + size - 2, sy + 8);
      ctx.stroke();
      ctx.fillStyle = "#3b5871";
      ctx.fillRect(sx + 2, sy + size - 3, size - 4, 1);
      break;
    case "wood":
      // Stack of three logs (cross-section circles)
      for (let row = 0; row < 2; row += 1) {
        const yy = sy + 6 + row * 5;
        for (let col = 0; col < 3 - row; col += 1) {
          const xx = sx + 2 + row * 2.5 + col * 4;
          ctx.fillStyle = "#8a5d34";
          ctx.beginPath();
          ctx.arc(xx + 2, yy, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#c19767";
          ctx.beginPath();
          ctx.arc(xx + 2, yy, 1.0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#3e2617";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(xx + 2, yy, 2.2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    case "coin":
      // Round coin with square hole
      ctx.fillStyle = "#d6a838";
      ctx.beginPath();
      ctx.arc(sx + size / 2, sy + size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2914";
      ctx.fillRect(sx + size / 2 - 2, sy + size / 2 - 2, 4, 4);
      ctx.strokeStyle = "#7c5a1f";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx + size / 2, sy + size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "labor":
      // Stylized person
      ctx.fillStyle = "#d8c8b6";
      ctx.beginPath();
      ctx.arc(sx + size / 2, sy + 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(sx + size / 2 - 3, sy + 7, 6, 6);
      ctx.fillRect(sx + size / 2 - 3, sy + 13, 2, 4);
      ctx.fillRect(sx + size / 2 + 1, sy + 13, 2, 4);
      break;
    default: break;
  }
}

export function drawIndicatorIcon(ctx, key, sx, sy, size = 16) {
  switch (key) {
    case "morale":
      // Smile / heart-ish
      ctx.fillStyle = "#cc4d6c";
      ctx.beginPath();
      ctx.arc(sx + size * 0.35, sy + size * 0.4, 3, 0, Math.PI * 2);
      ctx.arc(sx + size * 0.65, sy + size * 0.4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx + size * 0.18, sy + size * 0.5);
      ctx.lineTo(sx + size * 0.5, sy + size - 3);
      ctx.lineTo(sx + size * 0.82, sy + size * 0.5);
      ctx.fill();
      break;
    case "order":
      // Shield
      ctx.fillStyle = "#7c5a3d";
      ctx.beginPath();
      ctx.moveTo(sx + size / 2, sy + 2);
      ctx.lineTo(sx + size - 3, sy + 5);
      ctx.lineTo(sx + size - 3, sy + size * 0.6);
      ctx.lineTo(sx + size / 2, sy + size - 2);
      ctx.lineTo(sx + 3, sy + size * 0.6);
      ctx.lineTo(sx + 3, sy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8c552";
      ctx.fillRect(sx + size / 2 - 1, sy + 5, 2, size - 9);
      ctx.fillRect(sx + size / 2 - 4, sy + size * 0.45, 8, 2);
      break;
    case "prestige":
      // 8-point star
      ctx.fillStyle = "#e8c552";
      ctx.beginPath();
      const cx = sx + size / 2;
      const cy = sy + size / 2;
      const outer = size / 2 - 1;
      const inner = outer * 0.45;
      for (let i = 0; i < 16; i += 1) {
        const r = i % 2 === 0 ? outer : inner;
        const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    default: break;
  }
}
