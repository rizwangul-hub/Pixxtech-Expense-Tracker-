import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, Sparkles, X } from 'lucide-react';

/**
 * Color palettes for celebrations
 */
const VOUCHER_BALLOON_PALETTES = [
  { color: '#2563EB', highlight: '#93C5FD', dark: '#1D4ED8' }, // Blue
  { color: '#10B981', highlight: '#A7F3D0', dark: '#047857' }, // Emerald
  { color: '#F59E0B', highlight: '#FDE68A', dark: '#D97706' }, // Yellow/Amber
  { color: '#EC4899', highlight: '#FBCFE8', dark: '#BE185D' }, // Pink
  { color: '#8B5CF6', highlight: '#DDD6FE', dark: '#6D28D9' }, // Purple
  { color: '#F97316', highlight: '#FED7AA', dark: '#C2410C' }, // Orange
  { color: '#EF4444', highlight: '#FECACA', dark: '#B91C1C' }, // Red
  { color: '#06B6D4', highlight: '#A5F3FC', dark: '#0E7490' }, // Cyan
];

const VERIFICATION_BALLOON_PALETTES = [
  { color: '#7C3AED', highlight: '#C4B5FD', dark: '#5B21B6' }, // Royal Purple
  { color: '#D97706', highlight: '#FDE68A', dark: '#B45309' }, // Radiant Gold
  { color: '#06B6D4', highlight: '#67E8F9', dark: '#0891B2' }, // Cyan
  { color: '#059669', highlight: '#6EE7B7', dark: '#047857' }, // Emerald
  { color: '#DC2626', highlight: '#FCA5A5', dark: '#991B1B' }, // Crimson
  { color: '#1D4ED8', highlight: '#93C5FD', dark: '#1E40AF' }, // Sapphire
  { color: '#C026D3', highlight: '#F5D0FE', dark: '#86198F' }, // Fuchsia
  { color: '#EAB308', highlight: '#FEF08A', dark: '#CA8A04' }, // Pure Gold
];

const VOUCHER_CONFETTI_COLORS = [
  '#2563EB', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#EF4444', '#06B6D4', '#EAB308',
];

const VERIFICATION_CONFETTI_COLORS = [
  '#FBBF24', '#A78BFA', '#34D399', '#22D3EE', '#F472B6', '#F87171', '#FDE047', '#E2E8F0', '#818CF8',
];

/**
 * Premium Celebration Overlay Component
 *
 * Features:
 * - Floating 3D helium balloons with strings, knots, and specular highlights
 * - Naturally tumbling multicolored confetti ribbons & shapes
 * - Sparkling stars with pulse glow
 * - Full-screen transparent overlay (pointer-events-none: non-blocking)
 * - Premium glassmorphism success notification card
 * - Auto-dismiss after 3-5 seconds with smooth exit animation
 * - Respects prefers-reduced-motion
 */
export default function CelebrationOverlay({
  isOpen,
  type = 'voucher', // 'voucher' | 'verification'
  title,
  subtitle,
  voucherNo,
  duration = 4200,
  onClose,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerRef = useRef(null);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(false);

  // Check user preference for reduced motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const defaultTitle =
    type === 'verification'
      ? '🎊 Transaction Verified Successfully!'
      : '🎉 Voucher Recorded Successfully!';

  const defaultSubtitle =
    type === 'verification'
      ? 'Your verification has been completed successfully.'
      : 'Your transaction has been saved successfully.';

  const displayTitle = title || defaultTitle;
  const displaySubtitle = subtitle || defaultSubtitle;

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      if (onClose) onClose();
    }, 400);
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      setExiting(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    setVisible(true);
    setExiting(false);

    // Auto-dismiss timer
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, duration);

    // If reduced motion is preferred, don't run heavy canvas animations
    if (prefersReducedMotion) {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Setup Balloons
    const balloonPalettes =
      type === 'verification' ? VERIFICATION_BALLOON_PALETTES : VOUCHER_BALLOON_PALETTES;
    const balloonCount = Math.min(14, Math.max(9, Math.floor(width / 90)));
    const balloons = [];

    for (let i = 0; i < balloonCount; i++) {
      const palette = balloonPalettes[i % balloonPalettes.length];
      const radiusX = 22 + Math.random() * 14; // width radius
      const radiusY = radiusX * 1.25; // height radius
      const startX = (width / (balloonCount + 1)) * (i + 1) + (Math.random() * 40 - 20);
      const startY = height + 60 + Math.random() * 200;
      const speedY = 3.2 + Math.random() * 2.2;
      const swayAmp = 1.2 + Math.random() * 1.8;
      const swaySpeed = 0.025 + Math.random() * 0.02;
      const swayOffset = Math.random() * Math.PI * 2;

      balloons.push({
        x: startX,
        y: startY,
        baseX: startX,
        rX: radiusX,
        rY: radiusY,
        color: palette.color,
        highlightColor: palette.highlight,
        darkColor: palette.dark,
        speedY,
        swayAmp,
        swaySpeed,
        swayOffset,
        angle: 0,
        sway: 0,
      });
    }

    // Setup Confetti Particles
    const confettiColors =
      type === 'verification' ? VERIFICATION_CONFETTI_COLORS : VOUCHER_CONFETTI_COLORS;
    const confettiCount = Math.min(130, Math.max(70, Math.floor(width / 11)));
    const confetti = [];
    const shapes = ['rect', 'rect', 'circle', 'star'];

    for (let i = 0; i < confettiCount; i++) {
      confetti.push({
        x: Math.random() * width,
        y: -20 - Math.random() * (height * 0.6),
        width: 7 + Math.random() * 8,
        height: 10 + Math.random() * 10,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        speedY: 2.5 + Math.random() * 3.5,
        speedX: Math.random() * 2 - 1,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        tilt: Math.random() * Math.PI,
        tiltSpeed: 0.04 + Math.random() * 0.05,
        opacity: 0.95 + Math.random() * 0.05,
      });
    }

    // Setup Sparkling Stars
    const starCount = 32;
    const stars = [];
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * (height * 0.7),
        size: 3 + Math.random() * 6,
        color: type === 'verification' ? '#FDE047' : '#FFFFFF',
        alpha: Math.random(),
        speed: 0.03 + Math.random() * 0.04,
      });
    }

    // Star helper
    const drawStar = (cx, cy, spikes, outerRadius, innerRadius) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(cx, cy - outerRadius);
      for (let s = 0; s < spikes; s++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.fill();
    };

    let tick = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      tick++;

      // 1. Draw Sparkling Stars
      stars.forEach((st) => {
        st.alpha += st.speed;
        const currentAlpha = (Math.sin(st.alpha) + 1) / 2; // 0 to 1 smooth twinkle
        if (currentAlpha > 0.1) {
          ctx.save();
          ctx.fillStyle = st.color;
          ctx.globalAlpha = currentAlpha * 0.85;
          ctx.shadowBlur = 10;
          ctx.shadowColor = st.color;
          drawStar(st.x, st.y, 4, st.size, st.size * 0.4);
          ctx.restore();
        }
      });

      // 2. Draw Confetti Falling
      confetti.forEach((p) => {
        p.y += p.speedY;
        p.x += Math.sin(p.tilt) * 1.5 + p.speedX;
        p.rotation += p.rotSpeed;
        p.tilt += p.tiltSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;

        if (p.shape === 'rect') {
          const scaleY = Math.cos(p.tilt);
          ctx.scale(1, scaleY);
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        } else if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'star') {
          drawStar(0, 0, 4, p.width, p.width * 0.4);
        }
        ctx.restore();
      });

      // 3. Draw Balloons Rising Upward
      balloons.forEach((b) => {
        b.y -= b.speedY;
        b.sway = Math.sin(tick * b.swaySpeed + b.swayOffset);
        b.x = b.baseX + b.sway * b.swayAmp * 14;
        b.angle = b.sway * 7; // gentle wobble rotation

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate((b.angle * Math.PI) / 180);

        // Hanging String (wobbly bezier)
        ctx.beginPath();
        ctx.moveTo(0, b.rY);
        ctx.bezierCurveTo(
          b.sway * 14,
          b.rY + 24,
          -b.sway * 12,
          b.rY + 48,
          b.sway * 6,
          b.rY + 70
        );
        ctx.strokeStyle = 'rgba(210, 215, 225, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Balloon Body (tapered egg/balloon geometry)
        ctx.beginPath();
        ctx.moveTo(0, -b.rY);
        ctx.bezierCurveTo(b.rX * 1.25, -b.rY, b.rX * 1.2, b.rY * 0.7, 0, b.rY);
        ctx.bezierCurveTo(-b.rX * 1.2, b.rY * 0.7, -b.rX * 1.25, -b.rY, 0, -b.rY);
        ctx.closePath();

        // 3D Spherical Radial Highlight
        const grad = ctx.createRadialGradient(
          -b.rX * 0.35,
          -b.rY * 0.35,
          b.rX * 0.1,
          0,
          0,
          b.rY * 1.1
        );
        grad.addColorStop(0, b.highlightColor);
        grad.addColorStop(0.35, b.color);
        grad.addColorStop(1, b.darkColor);
        ctx.fillStyle = grad;
        ctx.shadowBlur = 12;
        ctx.shadowColor = b.color + '66';
        ctx.fill();

        // Specular White Highlight Reflection (Glossy Shine)
        ctx.beginPath();
        ctx.ellipse(
          -b.rX * 0.35,
          -b.rY * 0.42,
          b.rX * 0.22,
          b.rY * 0.12,
          -Math.PI / 4,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.shadowBlur = 0;
        ctx.fill();

        // Bottom Tie / Knot
        ctx.beginPath();
        ctx.moveTo(-4, b.rY);
        ctx.lineTo(4, b.rY);
        ctx.lineTo(6, b.rY + 5);
        ctx.lineTo(-6, b.rY + 5);
        ctx.closePath();
        ctx.fillStyle = b.darkColor;
        ctx.fill();

        ctx.restore();
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, type, duration, handleDismiss, prefersReducedMotion]);

  if (!visible) return null;

  const isVerification = type === 'verification';

  return (
    <>
      {/* Self-contained CSS Animation Keyframes */}
      <style>{`
        @keyframes celebrationCardIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -30px) scale(0.85);
          }
          60% {
            opacity: 1;
            transform: translate(-50%, 8px) scale(1.03);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
        @keyframes celebrationCardOut {
          0% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -25px) scale(0.9);
          }
        }
        @keyframes celebrationGlowPulse {
          0%, 100% {
            box-shadow: 0 20px 40px -15px rgba(16, 185, 129, 0.45), 0 0 25px 2px rgba(16, 185, 129, 0.25);
          }
          50% {
            box-shadow: 0 25px 50px -10px rgba(59, 130, 246, 0.55), 0 0 35px 6px rgba(139, 92, 246, 0.35);
          }
        }
        @keyframes celebrationGlowPurple {
          0%, 100% {
            box-shadow: 0 20px 40px -15px rgba(139, 92, 246, 0.5), 0 0 25px 3px rgba(245, 158, 11, 0.3);
          }
          50% {
            box-shadow: 0 25px 50px -10px rgba(217, 119, 6, 0.6), 0 0 35px 6px rgba(14, 165, 233, 0.4);
          }
        }
        .animate-celebration-in {
          animation: celebrationCardIn 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .animate-celebration-out {
          animation: celebrationCardOut 0.35s ease-in forwards;
        }
        .glow-voucher {
          animation: celebrationGlowPulse 2.8s ease-in-out infinite;
        }
        .glow-verification {
          animation: celebrationGlowPurple 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Full-Screen Canvas for Confetti, Balloons & Sparkles */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[9998]"
        style={{ width: '100vw', height: '100vh' }}
      />

      {/* Premium Glassmorphic Celebration Notification Card */}
      <div
        className={`fixed top-6 sm:top-10 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto max-w-[92vw] sm:max-w-md w-full ${
          exiting ? 'animate-celebration-out' : 'animate-celebration-in'
        }`}
      >
        <div
          className={`relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl border px-5 py-4 text-white shadow-2xl transition-all ${
            isVerification
              ? 'border-purple-500/50 glow-verification'
              : 'border-emerald-500/50 glow-voucher'
          }`}
        >
          {/* Subtle top rainbow accent strip */}
          <div
            className={`absolute top-0 left-0 right-0 h-1.5 ${
              isVerification
                ? 'bg-gradient-to-r from-purple-500 via-amber-400 to-cyan-400'
                : 'bg-gradient-to-r from-emerald-400 via-sky-400 to-pink-500'
            }`}
          />

          <div className="flex items-start gap-3.5 pt-1">
            {/* Animated Icon Avatar */}
            <div
              className={`shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-lg ${
                isVerification
                  ? 'bg-gradient-to-br from-purple-500 to-amber-500 text-white'
                  : 'bg-gradient-to-br from-emerald-500 to-sky-500 text-white'
              }`}
            >
              {isVerification ? (
                <Sparkles className="w-6 h-6 animate-pulse" />
              ) : (
                <CheckCircle2 className="w-6 h-6" />
              )}
            </div>

            {/* Message Body */}
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  {displayTitle}
                </h3>
                {voucherNo && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/15">
                    {voucherNo}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5 leading-snug">
                {displaySubtitle}
              </p>
            </div>

            {/* Quick Dismiss Button */}
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
