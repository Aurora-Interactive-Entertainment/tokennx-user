import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type EmotionId = "00" | "01" | "02";

interface EmotionDefinition {
  id: string;
  gaze?: boolean;
}

interface EmotionEngine {
  readonly emotionId: string | null;
  setEmotion: (id: EmotionId) => boolean;
  setGaze: (x: number, y: number) => EmotionEngine;
  clearGaze: () => EmotionEngine;
  destroy: () => void;
  on: (
    event: "change",
    listener: (payload: { id: string; def: EmotionDefinition }) => void,
  ) => EmotionEngine;
}

interface EmotionBallApi {
  create: (
    target: HTMLElement,
    options: {
      emotion: EmotionId;
      shape: "blob";
      label: string;
      gazeScale?: number;
      gazeSpeed?: number;
      gazeUpScale?: number;
      gazeDownScale?: number;
      gazeCenterY?: number;
      gazeEyeScale?: number;
      equalizeEyeSize?: boolean;
      gazeIdleDelay?: number;
      gazeOverride?: boolean;
    },
  ) => EmotionEngine;
}

declare global {
  interface Window {
    EmotionBall?: EmotionBallApi;
    __supportEmotionBallVersion?: string;
  }
}

export interface SupportEmotionBallHandle {
  /** 保留旧入口的唤醒接口；在线助手默认直接保持 02 待机放空。 */
  wake: () => void;
}

interface SupportEmotionBallProps {
  className?: string;
}

const EMOTION_BALL_ASSET_VERSION = "support-gaze-v9";
// 感应半径取视口短边的 58%，并限制上下界，方便统一调整跟随区域大小。
const GAZE_RANGE_RATIO = 0.58;
const GAZE_RANGE_MIN = 220;
const GAZE_RANGE_MAX = 720;

const SCRIPT_PATHS = [
  "/emotion-ball/rings.js",
  "/emotion-ball/emotions.js",
  "/emotion-ball/ball.js",
  `/emotion-ball/engine.js?v=${EMOTION_BALL_ASSET_VERSION}`,
] as const;

let emotionBallLoader: Promise<EmotionBallApi> | null = null;

function loadEmotionBall(): Promise<EmotionBallApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("EmotionBall 只能在浏览器中加载"));
  }
  if (
    window.EmotionBall &&
    window.__supportEmotionBallVersion === EMOTION_BALL_ASSET_VERSION
  ) {
    return Promise.resolve(window.EmotionBall);
  }
  if (emotionBallLoader) return emotionBallLoader;

  emotionBallLoader = SCRIPT_PATHS.reduce<Promise<void>>((promise, path) => {
    return promise.then(
      () =>
        new Promise<void>((resolve, reject) => {
          // 脚本按 rings → emotions → ball → engine 顺序加载，保证参考引擎的全局依赖已就绪。
          const existing = document.querySelector<HTMLScriptElement>(
            `script[data-support-emotion-ball="${path}"]`,
          );
          if (existing?.dataset.loaded === "true") {
            resolve();
            return;
          }
          const script = existing ?? document.createElement("script");
          script.src = path;
          script.async = false;
          script.dataset.supportEmotionBall = path;
          script.addEventListener(
            "load",
            () => {
              script.dataset.loaded = "true";
              resolve();
            },
            { once: true },
          );
          script.addEventListener(
            "error",
            () => reject(new Error(`无法加载表情资源：${path}`)),
            { once: true },
          );
          if (!existing) document.head.appendChild(script);
        }),
    );
  }, Promise.resolve()).then(() => {
    if (!window.EmotionBall) throw new Error("表情引擎初始化失败");
    // 记录独立脚本版本，开发热更新时不会继续复用旧的鼠标注视实现。
    window.__supportEmotionBallVersion = EMOTION_BALL_ASSET_VERSION;
    return window.EmotionBall;
  });
  return emotionBallLoader;
}

function FallbackEmotionBall({
  emotion,
  gaze,
}: {
  emotion: EmotionId;
  gaze: { x: number; y: number };
}) {
  const open = emotion === "00" ? 0.08 : 1;
  const eyeHeight = 1.4 + open * 5.8;
  const eyeShiftX = emotion === "02" ? gaze.x * 3.8 : 0;
  const eyeShiftY = emotion === "02" ? gaze.y * 2.7 : 0;
  return (
    <svg
      className="manuscript-support-assistant-fallback"
      viewBox="0 0 64 64"
      width="47"
      height="47"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="support-fallback-gradient" cx="31%" cy="24%" r="76%">
          <stop offset="0" stopColor="#fffdfb" />
          <stop offset="0.72" stopColor="#f3f0ea" />
          <stop offset="1" stopColor="#ddd9d1" />
        </radialGradient>
        <filter id="support-fallback-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.7" floodColor="#726e6a" floodOpacity=".22" />
        </filter>
      </defs>
      <g filter="url(#support-fallback-shadow)">
        <circle cx="32" cy="32" r="25.5" fill="url(#support-fallback-gradient)" />
        <ellipse cx="25" cy="17" rx="11" ry="5" fill="#fff" opacity=".19" transform="rotate(-18 25 17)" />
        <g fill="#1a1a1a">
          <ellipse cx="22.5" cy="29.2" rx="4.2" ry={eyeHeight} transform={`translate(${eyeShiftX} ${eyeShiftY}) rotate(${emotion === "02" ? -13 - gaze.x * 5 : -6} 22.5 29.2)`} />
          <ellipse cx="41.5" cy="29.2" rx="4.2" ry={eyeHeight} transform={`translate(${eyeShiftX} ${eyeShiftY}) rotate(${emotion === "02" ? 13 - gaze.x * 5 : 6} 41.5 29.2)`} />
        </g>
        <path d="M28 42h8" stroke="#1a1a1a" strokeWidth="1.25" strokeLinecap="round" opacity=".56" />
        {emotion === "00" ? (
          <text x="46" y="14" fill="#7b4dff" fontSize="6" fontFamily="Arial" fontWeight="700">z</text>
        ) : null}
      </g>
    </svg>
  );
}

/**
 * 客服入口的表情球适配器。
 * 参考源码负责 SVG 形变、呼吸、睡眠 zzz 和眼睛弹簧插值，本组件只负责加载和绑定页面交互。
 */
export const SupportEmotionBall = forwardRef<
  SupportEmotionBallHandle,
  SupportEmotionBallProps
>(function SupportEmotionBall({ className = "" }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EmotionEngine | null>(null);
  const gazeInRangeRef = useRef(false);
  const initialEmotionRef = useRef<EmotionId>("02");
  const [emotion, setEmotion] = useState<EmotionId>("02");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadEmotionBall()
      .then((api) => {
        if (disposed || !hostRef.current) return;
        const engine = api.create(hostRef.current, {
          emotion: initialEmotionRef.current,
          shape: "blob",
          label: "客服助手表情",
          // 入口尺寸较小，放大眼睛位移并快速平滑转向，保证 47px 区域内也能准确辨认方向。
          gazeScale: 1.8,
          gazeSpeed: 18,
          // 原眼型位置偏上，降低向上行程并增强向下行程，使上下视觉幅度更均衡。
          gazeUpScale: 0.78,
          gazeDownScale: 1.6,
          gazeCenterY: 8,
          // 补偿眼睛移到球面边缘时的透视缩小，仅在鼠标接管期间轻微放大。
          gazeEyeScale: 1.12,
          // 按最终投影尺寸统一双眼，避免右眼因球面压缩显得更小。
          equalizeEyeSize: true,
          // 鼠标移动时完整接管眼神；停止 5 秒后再平滑恢复 02 的自主扫视。
          gazeIdleDelay: 5000,
          gazeOverride: true,
        });
        engineRef.current = engine;
        engine.on("change", ({ id }) => {
          if (id === "00" || id === "01" || id === "02") setEmotion(id);
        });
        setReady(true);
      })
      .catch((error: unknown) => {
        // 资源加载失败时保留空容器，不影响客服面板和按钮本身的可用性。
        console.error("[SupportEmotionBall]", error);
      });

    return () => {
      disposed = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const engine = engineRef.current;
      const host = hostRef.current;
      if (!engine || !host) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      /* 只在右下角助手周围的扇形区域接管眼神；半径随视口短边变化，兼容不同屏幕。 */
      const followRadius = Math.min(
        GAZE_RANGE_MAX,
        Math.max(
          GAZE_RANGE_MIN,
          Math.min(window.innerWidth, window.innerHeight) * GAZE_RANGE_RATIO,
        ),
      );
      if (distance > followRadius) {
        if (gazeInRangeRef.current) {
          gazeInRangeRef.current = false;
          engine.clearGaze();
        }
        return;
      }
      gazeInRangeRef.current = true;
      /* 引擎横纵最大位移分别为 24/15，预先反向校正椭圆比例；
       * 这样 SVG 最终位移方向会严格平行于“图标中心 → 鼠标”的真实像素向量。 */
      const directionLength = Math.hypot(dx / 24, dy / 15);
      // 从中心到感应边界平滑增加注视幅度，边界内保持连续，不会突然跳动。
      const strength = Math.sin(
        (Math.min(distance, followRadius) / followRadius) * (Math.PI / 2),
      );
      const nx =
        directionLength > 0 ? (dx / 24 / directionLength) * strength : 0;
      const ny =
        directionLength > 0 ? (dy / 15 / directionLength) * strength : 0;
      // 直接更新 SVG 引擎，避免 pointermove 触发 React 高频重渲染造成跟随卡顿。
      engine.setGaze(nx, ny);
    };
    const handlePointerLeave = () => {
      gazeInRangeRef.current = false;
      engineRef.current?.clearGaze();
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      wake: () => {
        const engine = engineRef.current;
        // 兼容旧的点击唤醒调用，但入口始终保持用户要求的 02 待机放空。
        if (engine && engine.emotionId !== "02") engine.setEmotion("02");
        setEmotion("02");
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className={`manuscript-support-assistant-canvas${ready ? " is-ready" : ""} ${className}`.trim()}
      aria-hidden="true"
      data-emotion={emotion}
    >
      {/* 只在参考引擎尚未加载时显示回退表情，避免回退 SVG 与真实表情叠成两个球。 */}
      {!ready ? (
        <FallbackEmotionBall emotion={emotion} gaze={{ x: 0, y: 0 }} />
      ) : null}
      {/* 引擎异步加载期间保留尺寸占位，兼容旧入口的图片尺寸和无闪烁布局。 */}
      <img
        className="manuscript-support-assistant-image"
        src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
        alt=""
        width="33"
        height="33"
        aria-hidden="true"
      />
    </div>
  );
});
