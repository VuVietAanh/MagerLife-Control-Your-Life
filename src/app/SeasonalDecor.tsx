import { authFallingObjects, authMovingGifs, type AuthDecorMode } from "./authDecorConfig";

type SeasonalDecorProps = {
  mode: AuthDecorMode;
};

export function SeasonalDecor({ mode }: SeasonalDecorProps) {
  const movingGifs = authMovingGifs[mode];
  const fallingObjects = authFallingObjects;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbf9_46%,#fff7df_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(16,185,129,0.06),transparent_26%),radial-gradient(circle_at_76%_88%,rgba(245,158,11,0.13),transparent_34%)]" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-amber-100/50 via-amber-50/30 to-transparent" />

      {fallingObjects.map((item, index) => (
        <img
          key={`fall-object-${index}`}
          src={item.image}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className={`absolute z-0 object-contain opacity-90 drop-shadow-md ${item.className}`}
          style={{ animation: item.animation }}
        />
      ))}

      {movingGifs.map((gif, index) => (
        <img
          key={`moving-gif-${index}`}
          src={gif.image}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className={`absolute object-contain drop-shadow-md ${gif.className}`}
          style={{ animation: gif.animation }}
        />
      ))}

      <style>{`
        @keyframes fallObjectA {
          0% { transform: translate3d(0, -50px, 0) rotate(0deg) scale(.82); opacity: 0; }
          8% { opacity: .88; }
          42% { transform: translate3d(78px, 38vh, 0) rotate(160deg) scale(1); }
          78% { transform: translate3d(24px, 74vh, 0) rotate(310deg) scale(.92); opacity: .85; }
          100% { transform: translate3d(52px, 92vh, 0) rotate(390deg) scale(.55); opacity: 0; }
        }
        @keyframes fallObjectB {
          0% { transform: translate3d(0, -46px, 0) rotate(0deg) scale(.78); opacity: 0; }
          10% { opacity: .84; }
          38% { transform: translate3d(-62px, 34vh, 0) rotate(-130deg) scale(1.04); }
          76% { transform: translate3d(34px, 72vh, 0) rotate(-280deg) scale(.88); opacity: .82; }
          100% { transform: translate3d(-20px, 91vh, 0) rotate(-350deg) scale(.52); opacity: 0; }
        }
        @keyframes fallObjectC {
          0% { transform: translate3d(0, -42px, 0) rotate(0deg) scale(.8); opacity: 0; }
          9% { opacity: .82; }
          45% { transform: translate3d(34px, 42vh, 0) rotate(120deg) scale(1); }
          80% { transform: translate3d(92px, 76vh, 0) rotate(240deg) scale(.84); opacity: .78; }
          100% { transform: translate3d(74px, 93vh, 0) rotate(310deg) scale(.52); opacity: 0; }
        }
        @keyframes catWalk {
          0% { transform: translateX(-160px); }
          48% { transform: translateX(calc(100vw - 90px)); }
          50% { transform: translateX(calc(100vw - 90px)) scaleX(-1); }
          98% { transform: translateX(-160px) scaleX(-1); }
          100% { transform: translateX(-160px); }
        }
        @keyframes floatIdle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes wiggleIdle {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      `}</style>
    </div>
  );
}
