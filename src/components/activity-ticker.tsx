import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./activity-ticker.css";

export default function ActivityTicker({ messages, label }: { messages: ReactNode[]; label: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ distance: 0, copies: 1 });

  useLayoutEffect(() => {
    const container = viewport.current;
    const content = group.current;
    if (!container || !content) return;
    // 测量原始消息组，复制内容不参与溢出判断；字体、语言和窗口变化均重新计算。
    const measure = () => {
      const width = content.getBoundingClientRect().width;
      const available = container.clientWidth;
      const single = content.firstElementChild?.getBoundingClientRect().width ?? 0;
      const scrolling = messages.length > 1 || single > available;
      setLayout({ distance: scrolling ? width : 0, copies: scrolling && width > 0 ? Math.ceil(available / width) + 1 : 1 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [messages]);

  if (messages.length === 0) return null;
  return (
    <div className="purchase-activity" ref={viewport} aria-label={label}>
      <div className={`activity-ticker-track${layout.distance > 0 ? " is-scrolling" : ""}`} style={{
        "--ticker-distance": `${-layout.distance}px`,
        "--ticker-duration": `${Math.max(layout.distance / 40, 1)}s`,
      } as CSSProperties}>
        {Array.from({ length: layout.copies }, (_, copy) => (
          <div className="activity-ticker-group" key={copy} ref={copy === 0 ? group : undefined} aria-hidden={copy > 0 ? true : undefined}>
            {messages.map((message, index) => <div className="purchase-activity-item" key={index}>{message}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
