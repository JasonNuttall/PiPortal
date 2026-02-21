import { useMemo } from "react";

const BLOBS = [
  {
    className: "animate-cdrift-a",
    style: {
      width: 600,
      height: 500,
      background:
        "radial-gradient(ellipse, rgba(15, 118, 110, 0.4), transparent 70%)",
      top: "-12%",
      left: "-8%",
    },
  },
  {
    className: "animate-cdrift-b",
    style: {
      width: 500,
      height: 500,
      background:
        "radial-gradient(ellipse, rgba(56, 189, 248, 0.15), transparent 70%)",
      top: "35%",
      right: "-10%",
    },
  },
  {
    className: "animate-cdrift-a",
    style: {
      width: 550,
      height: 400,
      background:
        "radial-gradient(ellipse, rgba(45, 212, 191, 0.12), transparent 70%)",
      bottom: "-8%",
      left: "25%",
      animationDelay: "-5s",
      animationDuration: "15s",
    },
  },
];

const SHARDS = [
  {
    style: {
      width: 50,
      height: 180,
      background:
        "linear-gradient(180deg, rgba(56, 189, 248, 0.4), transparent)",
      clipPath: "polygon(50% 0%, 100% 35%, 85% 100%, 15% 100%, 0% 35%)",
      top: "5%",
      left: "2%",
      transform: "rotate(-12deg)",
      animationDuration: "5s",
    },
  },
  {
    style: {
      width: 40,
      height: 140,
      background:
        "linear-gradient(180deg, rgba(45, 212, 191, 0.35), transparent)",
      clipPath: "polygon(50% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)",
      top: "15%",
      right: "3%",
      transform: "rotate(8deg)",
      animationDuration: "7s",
      animationDelay: "-2s",
    },
  },
  {
    style: {
      width: 60,
      height: 200,
      background: "linear-gradient(0deg, rgba(56, 189, 248, 0.3), transparent)",
      clipPath: "polygon(50% 100%, 100% 65%, 85% 0%, 15% 0%, 0% 65%)",
      bottom: 0,
      left: "8%",
      transform: "rotate(5deg)",
      animationDuration: "6s",
      animationDelay: "-1s",
    },
  },
  {
    style: {
      width: 35,
      height: 120,
      background: "linear-gradient(0deg, rgba(45, 212, 191, 0.3), transparent)",
      clipPath: "polygon(50% 100%, 100% 60%, 80% 0%, 20% 0%, 0% 60%)",
      bottom: 0,
      right: "12%",
      transform: "rotate(-7deg)",
      animationDuration: "4s",
      animationDelay: "-3s",
    },
  },
  {
    style: {
      width: 45,
      height: 160,
      background:
        "linear-gradient(180deg, rgba(15, 118, 110, 0.5), transparent)",
      clipPath: "polygon(50% 0%, 100% 30%, 90% 100%, 10% 100%, 0% 30%)",
      top: "40%",
      left: 0,
      transform: "rotate(-20deg)",
      animationDuration: "8s",
      animationDelay: "-4s",
    },
  },
  {
    style: {
      width: 55,
      height: 190,
      background:
        "linear-gradient(0deg, rgba(56, 189, 248, 0.25), transparent)",
      clipPath: "polygon(50% 100%, 100% 70%, 75% 0%, 25% 0%, 0% 70%)",
      bottom: "5%",
      left: "45%",
      transform: "rotate(3deg)",
      animationDuration: "6s",
      animationDelay: "-2s",
    },
  },
];

const PARTICLE_COLORS = [
  "rgba(56,189,248,0.5)",
  "rgba(45,212,191,0.4)",
  "rgba(94,234,212,0.4)",
  "rgba(240,240,255,0.3)",
];

const CrystalBackground = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const sz = 8 + Math.random() * 8;
      const color =
        PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      const ypos = 5 + Math.random() * 90;
      return {
        key: i,
        style: {
          top: `${ypos}%`,
          width: sz,
          height: sz,
          background: color,
          boxShadow: `0 0 ${sz}px ${color}`,
          transform: "rotate(45deg)",
          animationDuration: `${20 + Math.random() * 20}s`,
          animationDelay: `${-Math.random() * 40}s`,
          "--yoff": `${ypos}vh`,
          "--ydrift": `${(Math.random() - 0.5) * 60}px`,
        },
      };
    });
  }, []);

  return (
    <>
      {/* Blurred blobs */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {BLOBS.map((blob, i) => (
          <div
            key={i}
            className={`absolute rounded-full blur-[100px] opacity-35 will-change-transform ${blob.className}`}
            style={blob.style}
          />
        ))}
        {/* Crystal shards - hidden on mobile */}
        {SHARDS.map((shard, i) => (
          <div
            key={`shard-${i}`}
            className="absolute opacity-20 animate-crystal-pulse hidden sm:block"
            style={shard.style}
          />
        ))}
      </div>

      {/* Floating diamond particles */}
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.key}
            className="absolute opacity-0"
            style={{
              ...p.style,
              animation: `crystal-float ${p.style.animationDuration} linear infinite`,
              animationDelay: p.style.animationDelay,
            }}
          />
        ))}
      </div>
    </>
  );
};

export default CrystalBackground;
