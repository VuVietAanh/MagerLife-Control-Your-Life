export type AuthDecorMode = "login" | "register" | "enrich" | "priority" | "confirm";

type DecorImageItem = {
  image: string;
  className: string;
  animation: string;
};

type FallingObjectItem = DecorImageItem & {
  fallback: string;
};

// EDIT GIFS HERE.
// Put GIF files in: public/images/cats
// Use image path like: /images/cats/your-file.gif
// className controls position and size: left/right/top/bottom + h/w.
// Pixel values must use brackets: bottom-[210px]. To push below the screen, use negative values: bottom-[-40px].
// animation: "" means stand still. Example moving animation: "catWalk 30s linear infinite".
export const authMovingGifs: Record<AuthDecorMode, DecorImageItem[]> = {
  register: [
    { image: "/images/cats/rainbow cat remix.gif", className: "left-0 bottom-[-45px] h-56 w-56", animation: "catWalk 15s linear infinite" },
    { image: "/images/cats/cat paw loading.gif", className: "left-3 bottom-210 h-32 w-32", animation: "" },
    { image: "/images/cats/4e784ad0-f128-11ee-bbb7-b76f60dbd4ce.gif", className: "right-[20px] bottom-185 h-56 w-56", animation: "" },
  ],
  login: [
    { image: "/images/cats/7260a746-a612-11ee-b2ee-2f3d03bd5fdb.gif", className: "right-3 bottom-180 h-56 w-56", animation: "" },
  ],
  enrich: [
    { image: "/images/cats/", className: "left-4 bottom-[120px] h-32 w-32", animation: "floatIdle 4s ease-in-out infinite" },
  ],
  priority: [
    { image: "/images/cats/", className: "right-8 bottom-[120px] h-40 w-40", animation: "wiggleIdle 2.8s ease-in-out infinite" },
  ],
  confirm: [
    { image: "/images/cats/", className: "right-6 bottom-[130px] h-32 w-32", animation: "" },
  ],
};

// EDIT FALLING OBJECTS HERE.
// Put PNG/WebP/GIF files in: public/images/falling-objects
export const authFallingObjects: FallingObjectItem[] = [
  { image: "/images/falling-objects/leaf-1.png", fallback: "bg-amber-400", className: "left-[8%] -top-10 h-8 w-8", animation: "fallObjectA 10s linear 0s infinite" },
  { image: "/images/falling-objects/leaf-2.png", fallback: "bg-orange-400", className: "left-[22%] -top-12 h-10 w-10", animation: "fallObjectB 13s linear 1.4s infinite" },
  { image: "/images/falling-objects/leaf-3.png", fallback: "bg-yellow-400", className: "left-[38%] -top-10 h-8 w-8", animation: "fallObjectC 11s linear .7s infinite" },
  { image: "/images/falling-objects/Blue Frozen Snowflake - 1144x1188.png", fallback: "bg-amber-500", className: "left-[55%] -top-12 h-9 w-9", animation: "fallObjectA 14s linear 3s infinite" },
  { image: "/images/falling-objects/Blue Winter Snowflake - 2834x3255.png", fallback: "bg-orange-500", className: "left-[72%] -top-10 h-10 w-10", animation: "fallObjectB 12s linear 4.2s infinite" },
  { image: "/images/falling-objects/Freezing Snowflake White - 1504x1404.png", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },
  { image: "/images/falling-objects/Frosty Snowflake Winter - 3166x3633.png", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },
  { image: "/images/falling-objects/Frozen Christmas Snowflake - 1980x2000.png", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },
  { image: "/images/falling-objects/Snowy Snowflake Winter - 2161x2219.png", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },
  { image: "/images/falling-objects/", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },
  { image: "/images/falling-objects/", fallback: "bg-yellow-500", className: "left-[88%] -top-12 h-8 w-8", animation: "fallObjectC 15s linear 2.2s infinite" },

];
