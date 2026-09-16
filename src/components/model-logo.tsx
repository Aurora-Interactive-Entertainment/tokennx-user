import { useState, type ReactNode } from "react";
import { IconImage, IconPlayCircle, IconVideo } from "@douyinfe/semi-icons";
import type { ModelRecord } from "@/data/models";
import { resolveModelLogo } from "./model-logo-registry";

export type ModelLogoModel = Pick<ModelRecord, "company" | "modality"> &
  Partial<Pick<ModelRecord, "iconUrl" | "name" | "code" | "alias">>;

function LogoImage({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  // 不重试失效地址，避免破图和请求循环；父级以地址作为 key，换图时重新加载。
  return failed ? (
    fallback
  ) : (
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

export function ModelLogo({
  model,
  size = "default",
  className = "",
}: {
  model: ModelLogoModel;
  size?: "small" | "default" | "large";
  className?: string;
}) {
  const companyClass = model.company.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const asset = resolveModelLogo(model);
  const modalityIcon =
    model.modality === "image" ? (
      <IconImage />
    ) : model.modality === "video" ? (
      <IconVideo />
    ) : model.modality === "audio" ? (
      <IconPlayCircle />
    ) : (
      <svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M5 12h14M12 5v14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    );
  const fallback = asset?.src ? (
    <LogoImage key={asset.src} src={asset.src} fallback={modalityIcon} />
  ) : asset?.markup ? (
    <span dangerouslySetInnerHTML={{ __html: asset.markup }} />
  ) : (
    modalityIcon
  );
  const iconUrl = model.iconUrl?.trim();

  return (
    <span
      className={`model-logo model-logo--${size} model-logo--${model.modality} model-logo--${companyClass}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {/* 后台图标优先，加载失败后依次回退到本地品牌和模态图标。 */}
      {iconUrl ? (
        <LogoImage key={iconUrl} src={iconUrl} fallback={fallback} />
      ) : (
        fallback
      )}
    </span>
  );
}
