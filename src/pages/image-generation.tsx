import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconChevronDown,
  IconClose,
  IconCopy,
  IconDeleteStroked,
  IconEditStroked,
  IconImage,
  IconInfoCircle,
  IconMoreStroked,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStop,
} from "@douyinfe/semi-icons";
import { CompatInput as Input } from "@/components/semi-compat";
import { useAppSelector } from "@/store/hooks";
import {
  IMAGE_SESSION_HISTORY_KEY,
  readUserSessionHistory,
  writeUserSessionHistory,
} from "@/utils/ephemeral-history";
import "./image-generation.css";

type ImageHistory = {
  id: string;
  prompt: string;
  title: string;
  createdAt: string;
  model: string;
  ratio: string;
  size: string;
  format: "jpeg" | "png";
  outputs: number;
  status: "succeeded" | "failed";
  requestId: string;
  errorMessage?: string;
  preview?: string;
};

function isImageHistory(value: unknown): value is ImageHistory {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ImageHistory>;
  return typeof item.id === "string"
    && typeof item.prompt === "string"
    && typeof item.title === "string"
    && typeof item.createdAt === "string"
    && typeof item.model === "string"
    && typeof item.ratio === "string"
    && typeof item.size === "string"
    && (item.format === "jpeg" || item.format === "png")
    && typeof item.outputs === "number"
    && Number.isFinite(item.outputs)
    && (item.status === "succeeded" || item.status === "failed")
    && typeof item.requestId === "string"
    && (item.errorMessage === undefined || typeof item.errorMessage === "string")
    && (item.preview === undefined || typeof item.preview === "string");
}

function compactImageHistoryEntry(item: ImageHistory): Omit<ImageHistory, "preview"> {
  return {
    id: item.id.slice(0, 256),
    prompt: item.prompt.slice(0, 8_000),
    title: item.title.slice(0, 8_000),
    createdAt: item.createdAt.slice(0, 128),
    model: item.model.slice(0, 1_024),
    ratio: item.ratio.slice(0, 32),
    size: item.size.slice(0, 64),
    format: item.format,
    outputs: Math.max(0, Math.min(20, Math.floor(item.outputs))),
    status: item.status,
    requestId: item.requestId.slice(0, 512),
    ...(item.errorMessage ? { errorMessage: item.errorMessage.slice(0, 4_000) } : {}),
  };
}

type ImageResultCardProps = {
  item: ImageHistory;
  onEdit: (prompt: string) => void;
  onRegenerate: (prompt: string) => void;
  onDelete: (id: string) => void;
};

// 中文：结果卡片字段与后端任务响应保持一一对应，接入接口时只需替换数据来源。
function ImageResultCard({
  item,
  onEdit,
  onRegenerate,
  onDelete,
}: ImageResultCardProps): ReactNode {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [requestCopied, setRequestCopied] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreWrapRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [moreOpen]);

  async function copyRequestId(): Promise<void> {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(item.requestId);
      setRequestCopied(true);
      window.setTimeout(() => setRequestCopied(false), 1600);
    } catch {
      setRequestCopied(false);
    }
  }

  return (
    <article className="image-result-card">
      <header className="image-result-heading">
        <strong>{item.title}</strong>
        <div className="image-result-meta">
          <span>{item.model}</span>
          <span aria-hidden="true">·</span>
          <span>{item.ratio}</span>
          <span aria-hidden="true">·</span>
          <span>{item.size}</span>
          <span aria-hidden="true">·</span>
          <span>
            {item.outputs} {t("console.image.outputs")}
          </span>
          <Tooltip content={t("console.image.resultDetails")} position="top">
            <span
              className="image-result-info"
              role="img"
              aria-label={t("console.image.resultDetails")}
            >
              <IconInfoCircle aria-hidden="true" />
            </span>
          </Tooltip>
        </div>
      </header>

      {item.status === "failed" ? (
        <div className="image-result-error" role="alert">
          <strong>{t("console.image.resultFailed")}</strong>
          <p>{item.errorMessage ?? t("console.image.generationError")}</p>
          <button type="button" className="image-request-id" onClick={copyRequestId}>
            <IconCopy aria-hidden="true" />
            {requestCopied
              ? t("console.image.copySuccess")
              : t("console.image.copyRequestId")}
          </button>
        </div>
      ) : item.preview ? (
        <img src={item.preview} alt={item.prompt} />
      ) : (
        <div className="image-result-placeholder" aria-label={t("console.image.resultSuccess")}>
          <IconImage aria-hidden="true" />
          <span>{t("console.image.resultSuccess")}</span>
        </div>
      )}

      <footer className="image-result-actions">
        <Button
          aria-label={t("console.image.editPrompt")}
          title={t("console.image.editPrompt")}
          theme="outline"
          size="small"
          icon={<IconEditStroked />}
          onClick={() => onEdit(item.prompt)}
        />
        <Button
          aria-label={t("console.image.regenerate")}
          title={t("console.image.regenerate")}
          theme="outline"
          size="small"
          icon={<IconRefresh />}
          onClick={() => onRegenerate(item.prompt)}
        />
        <div className="image-result-more-wrap" ref={moreWrapRef}>
          <Button
            theme="outline"
            size="small"
            icon={<IconMoreStroked />}
            aria-label={t("console.image.moreActions")}
            title={t("console.image.moreActions")}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((value) => !value)}
          />
          {moreOpen ? (
            <div className="image-result-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onDelete(item.id);
                }}
              >
                <IconDeleteStroked aria-hidden="true" />
                {t("console.image.deleteResult")}
              </button>
            </div>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

// 中文：历史栏使用 div 交互项时补齐键盘操作，与智能对话页保持一致。
function activateImageAction(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

const IMAGE_MODELS = [
  ["Muse Image 1.0", "Meta"],
  ["Kling-v3", "KlingAI"],
  ["Agnes Image 2.1 Flash", "Sapiens AI"],
  ["Qwen-Image-3.0", "Alibaba Cloud"],
  ["Qwen-Image-3.0-Pro", "Alibaba Cloud"],
  ["Seedream-5.0-pro", "Volcengine"],
  ["Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image)", "Google Vertex"],
  ["Nano Banana 2", "Google Vertex"],
  ["Nano Banana Pro", "Google Vertex"],
  ["GPT-Image-2", "OpenAI"],
  ["Qwen-Image-2.0", "Alibaba Cloud"],
  ["Qwen-Image-2.0-Pro", "Alibaba Cloud"],
  ["Seedream-5.0-lite", "Volcengine"],
  ["GLM-Image", "Z.ai"],
  ["FLUX.2 Max", "Black Forest Labs"],
  ["GPT-Image-1.5", "OpenAI"],
  ["FLUX.2 Flex", "Black Forest Labs"],
  ["FLUX.2 Pro", "Black Forest Labs"],
  ["Gemini 2.5 Flash Image (Nano Banana)", "Google Vertex"],
  ["HY-Image-V3.0", "TencentCloud"],
  ["Kling-v2", "KlingAI"],
] as const;

// 中文：先用本地能力表还原不同模型的比例偏好，后续可直接替换为后端返回的模型配置。
const IMAGE_RATIO_OPTIONS = [
  "1:1",
  "2:3",
  "3:2",
  "4:3",
  "3:4",
  "9:16",
  "16:9",
  "2:1",
] as const;
const MODEL_DEFAULT_RATIOS: Record<string, string> = {
  "Kling-v3": "16:9",
  "Kling-v2": "16:9",
  "Seedream-5.0-pro": "16:9",
  "Seedream-5.0-lite": "16:9",
  "Agnes Image 2.1 Flash": "1:1",
  "Nano Banana 2 Lite (Gemini 3.1 Flash-Lite Image)": "1:1",
  "Nano Banana 2": "1:1",
  "Nano Banana Pro": "1:1",
};

function modelDefaultRatio(model: string): string {
  return MODEL_DEFAULT_RATIOS[model] ?? "1:1";
}

function ImageModelAvatar({ model: _model }: { model: string }): ReactNode {
  return (
    <span className="image-model-avatar" aria-hidden="true">
      <IconImage />
    </span>
  );
}

function ImageSelectedModels({
  selected,
  ratio,
  size,
  format,
  onOpen,
}: {
  selected: string[];
  ratio: string;
  size: string;
  format: "jpeg" | "png";
  onOpen: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const visibleAvatars = selected.slice(0, 3);
  return (
    <div className="image-selected-models">
      <Button
        theme="borderless"
        className={`image-model-trigger${selected.length > 1 ? " is-multiple" : ""}`}
        onClick={onOpen}
        aria-label={
          selected.length > 1
            ? t("console.image.modelsSelected", { count: selected.length })
            : selected[0] ?? t("console.image.chooseModel")
        }
      >
        {selected.length > 1 ? (
          <span className="image-model-avatar-stack" aria-hidden="true">
            {visibleAvatars.map((model) => (
              <ImageModelAvatar key={model} model={model} />
            ))}
          </span>
        ) : selected.length === 1 ? (
          <>
            <ImageModelAvatar model={selected[0]} />
            <span className="image-model-trigger-name">{selected[0]}</span>
          </>
        ) : (
          <>
            <ImageModelAvatar model="" />
            <span className="image-model-trigger-name">{t("console.image.chooseModel")}</span>
          </>
        )}
        <IconChevronDown className="image-chevron" aria-hidden="true" />
      </Button>
      {selected.length > 0 ? (
        <div className="image-model-hover-card" role="tooltip">
          {selected.map((model) => (
            <div className="image-model-hover-item" key={model}>
              <ImageModelAvatar model={model} />
              <span className="image-model-hover-copy">
                <strong>{model}</strong>
                <small>
                  {t("console.image.modelOutputMeta", {
                    ratio,
                    size,
                    format: format.toUpperCase(),
                    count: 1,
                  })}
                </small>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImageModelPicker({
  visible,
  selected,
  format,
  ratio,
  size,
  quality,
  onClose,
  onConfirm,
  onPreviewModel,
  onFormatChange,
  onRatioChange,
  onSizeChange,
  onQualityChange,
}: {
  visible: boolean;
  selected: string[];
  format: "jpeg" | "png";
  ratio: string;
  size: string;
  quality: string;
  onClose: () => void;
  onConfirm: (models: string[]) => void;
  onPreviewModel: (model: string) => void;
  onFormatChange: (format: "jpeg" | "png") => void;
  onRatioChange: (ratio: string) => void;
  onSizeChange: (size: string) => void;
  onQualityChange: (quality: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [previewModel, setPreviewModel] = useState(selected[0] ?? IMAGE_MODELS[0][0]);
  const [draftSelected, setDraftSelected] = useState<string[]>(selected);
  useEffect(() => {
    if (visible) {
      setPreviewModel(selected[0] ?? IMAGE_MODELS[0][0]);
      setDraftSelected(selected);
    }
  }, [selected, visible]);
  const filtered = useMemo(
    () =>
      IMAGE_MODELS.filter(([name, provider]) =>
        `${name} ${provider}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  if (!visible) return null;
  return (
    <div
      className="image-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="image-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-picker-title"
      >
        <header className="image-picker-header">
          <strong id="image-picker-title">
            {t("console.image.selectModel")}
          </strong>
          <Button
            theme="borderless"
            icon={<IconClose />}
            aria-label={t("console.image.closeModelPicker")}
            onClick={onClose}
          />
        </header>
        <div className="image-picker-body">
          <div className="image-picker-models-pane">
            <div className="image-picker-search">
              <IconSearch aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("console.image.searchModels")}
                aria-label={t("console.image.searchModels")}
                autoFocus
              />
            </div>
            <div className="image-picker-list">
              {filtered.map(([name, provider]) => (
                <button
                  type="button"
                  className={`image-model-option${draftSelected.includes(name) ? " is-selected" : ""}${previewModel === name ? " is-previewing" : ""}`}
                  key={name}
                  onClick={() => {
                    setPreviewModel(name);
                    onPreviewModel(name);
                  }}
                >
                  <span className="image-model-option-info">
                    <span className="image-model-logo" aria-hidden="true">
                      <IconImage />
                    </span>
                    <span>
                      <strong>{name}</strong>
                      <em>{provider}</em>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={draftSelected.includes(name)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation();
                      setDraftSelected((current) =>
                        current.includes(name)
                          ? current.filter((item) => item !== name)
                          : [...current, name],
                      );
                    }}
                    aria-label={name}
                  />
                </button>
              ))}
              {filtered.length === 0 ? (
                <p className="image-picker-empty">
                  {t("console.image.noModels")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="image-picker-settings">
            <fieldset>
              <legend>{t("console.image.ratio")}</legend>
              <div
                className="image-setting-grid image-ratio-grid"
                role="radiogroup"
                aria-label={t("console.image.ratio")}
              >
                {IMAGE_RATIO_OPTIONS.map((value) => (
                  <label
                    className={ratio === value ? "is-active" : ""}
                    key={value}
                  >
                    <input
                      type="radio"
                      checked={ratio === value}
                      onChange={() => onRatioChange(value)}
                    />
                    <span
                      className="image-ratio-icon"
                      data-ratio={value}
                      aria-hidden="true"
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("console.image.size")}</legend>
              <div
                className="image-setting-segment"
                role="radiogroup"
                aria-label={t("console.image.size")}
              >
                {["1K", "2K", "3K", "4K"].map((value) => (
                  <label
                    className={size === value ? "is-active" : ""}
                    key={value}
                  >
                    <input
                      type="radio"
                      checked={size === value}
                      onChange={() => onSizeChange(value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("console.image.quality")}</legend>
              <div
                className="image-setting-segment"
                role="radiogroup"
                aria-label={t("console.image.quality")}
              >
                {["Auto"].map((value) => (
                  <label className="is-active" key={value}>
                    <input
                      type="radio"
                      checked={quality === value}
                      onChange={() => onQualityChange(value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t("console.image.format")}</legend>
              <div
                className="image-setting-segment"
                role="radiogroup"
                aria-label={t("console.image.format")}
              >
                <label className={format === "jpeg" ? "is-active" : ""}>
                  <input
                    type="radio"
                    checked={format === "jpeg"}
                    onChange={() => onFormatChange("jpeg")}
                  />
                  JPEG
                </label>
                <label className={format === "png" ? "is-active" : ""}>
                  <input
                    type="radio"
                    checked={format === "png"}
                    onChange={() => onFormatChange("png")}
                  />
                  PNG
                </label>
              </div>
            </fieldset>
          </div>
        </div>
        <footer className="image-picker-footer">
          <Button theme="borderless" onClick={onClose}>
            {t("console.common.cancel")}
          </Button>
          <Button
            theme="solid"
            type="primary"
            disabled={draftSelected.length === 0}
            aria-label={t("console.image.chooseModels", {
              count: draftSelected.length,
            })}
            onClick={() => onConfirm(draftSelected)}
          >
            {t("console.image.chooseModels", { count: draftSelected.length })}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function ImagePage() {
  const { t } = useTranslation();
  const auth = useAppSelector((state) => state.auth);
  const userId = auth.status === "authenticated"
    ? auth.user?.id ?? null
    : auth.status === "unauthenticated"
      ? null
      : "";
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([
    "Nano Banana 2",
  ]);
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [ratio, setRatio] = useState("1:1");
  const [size, setSize] = useState("1K");
  const [quality, setQuality] = useState("Auto");
  const [pickerVisible, setPickerVisible] = useState(false);
  const [history, setHistory] = useState<ImageHistory[]>(() =>
    readUserSessionHistory(IMAGE_SESSION_HISTORY_KEY, userId, isImageHistory),
  );
  const historyOwnerRef = useRef(userId);
  const historyHydratingRef = useRef(true);
  const [generating, setGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    historyOwnerRef.current = userId;
    historyHydratingRef.current = true;
    setHistory(readUserSessionHistory(IMAGE_SESSION_HISTORY_KEY, userId, isImageHistory));
  }, [userId]);

  useEffect(() => {
    if (historyOwnerRef.current !== userId || historyHydratingRef.current) {
      historyHydratingRef.current = false;
      return;
    }
    // 中文：不保存 blob/data URL 预览，避免上传图片和大体积二进制内容进入本地存储。
    writeUserSessionHistory(
      IMAGE_SESSION_HISTORY_KEY,
      userId,
      history.map(compactImageHistoryEntry),
    );
  }, [history, userId]);

  useEffect(
    () => () => {
      if (generationTimerRef.current !== null)
        window.clearTimeout(generationTimerRef.current);
      if (uploadedImage.startsWith("blob:")) URL.revokeObjectURL(uploadedImage);
    },
    [uploadedImage],
  );

  function previewModel(model: string): void {
    setRatio(modelDefaultRatio(model));
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (uploadedImage.startsWith("blob:")) URL.revokeObjectURL(uploadedImage);
    setUploadedImage(URL.createObjectURL(file));
  }

  const composerInputRef = useRef<HTMLTextAreaElement>(null);

  function createGeneration(promptOverride?: string): void {
    const generationPrompt = (promptOverride ?? prompt).trim();
    if (generating || !generationPrompt || selectedModels.length === 0) return;
    const requestId = `image-${Date.now()}`;
    const generationModels = selectedModels.join(", ");
    const generationOutputs = selectedModels.length;
    const generationRatio = ratio;
    const generationSize = size;
    const generationFormat = format;
    if (promptOverride !== undefined) setPrompt(generationPrompt);
    setGenerating(true);
    // 中文：这里是后端图片任务接口的接入边界，先用本地状态还原生成中的交互。
    generationTimerRef.current = window.setTimeout(() => {
      if (historyOwnerRef.current !== userId) {
        setGenerating(false);
        generationTimerRef.current = null;
        return;
      }
      setHistory((current) => [
        {
          id: `${Date.now()}`,
          prompt: generationPrompt,
          title: t("console.image.resultTitle", { prompt: generationPrompt }),
          createdAt: new Date().toLocaleTimeString(),
          model: generationModels,
          ratio: generationRatio,
          size: generationSize,
          format: generationFormat,
          outputs: generationOutputs,
          // 中文：本地占位结果先模拟接口失败响应，方便直接调试错误态布局。
          status: "failed",
          requestId,
          errorMessage: t("console.image.generationError"),
          preview: uploadedImage || undefined,
        },
        ...current,
      ]);
      setPrompt("");
      setGenerating(false);
      generationTimerRef.current = null;
    }, 900);
  }

  function stopGeneration(): void {
    if (generationTimerRef.current !== null)
      window.clearTimeout(generationTimerRef.current);
    generationTimerRef.current = null;
    setGenerating(false);
  }

  function startNewSession(): void {
    setPrompt("");
    setUploadedImage("");
  }

  const canGenerate = Boolean(
    prompt.trim() && selectedModels.length > 0 && !generating,
  );
  return (
    <div
      className={`image-console-page${historyCollapsed ? " image-console-page--collapsed" : ""}`}
    >
      <section className="image-shell" aria-label={t("console.image.title")}>
        <div className="image-modebar">
          <button
            className="image-mobile-history"
            type="button"
            aria-label={t("console.image.history")}
            onClick={() => setHistoryCollapsed((value) => !value)}
          >
            <IconImage aria-hidden="true" />
          </button>
        </div>
        <aside
          className="image-history"
          aria-label={t("console.image.history")}
        >
          <div className="image-history-heading">
            <Tooltip
              content={t("console.image.createNewSession")}
              position="top"
            >
              <div
                className="image-new-session-button"
                role="button"
                tabIndex={0}
                aria-label={t("console.image.createNewSession")}
                onClick={startNewSession}
                onKeyDown={(event) =>
                  activateImageAction(event, startNewSession)
                }
              >
                <IconPlus aria-hidden="true" />
                <span>{t("console.image.newSession")}</span>
              </div>
            </Tooltip>
            <div
              className="image-history-collapse-button"
              role="button"
              tabIndex={0}
              aria-label={
                historyCollapsed
                  ? t("console.image.expandHistory")
                  : t("console.image.collapseHistory")
              }
              title={
                historyCollapsed
                  ? t("console.image.expandHistory")
                  : t("console.image.collapseHistory")
              }
              onClick={() => setHistoryCollapsed((value) => !value)}
              onKeyDown={(event) =>
                activateImageAction(event, () =>
                  setHistoryCollapsed((value) => !value),
                )
              }
            >
              {historyCollapsed ? (
                <IconArrowRight aria-hidden="true" />
              ) : (
                <IconArrowLeft aria-hidden="true" />
              )}
            </div>
          </div>
          {history.length === 0 ? (
            <div className="image-history-empty">
              <IconImage aria-hidden="true" />
              <span>{t("console.image.noHistory")}</span>
            </div>
          ) : (
            <div className="image-history-list">
              {history.map((item) => (
                <button
                  type="button"
                  className="image-history-item"
                  key={item.id}
                  onClick={() => setPrompt(item.prompt)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.createdAt}</span>
                  <small>{item.prompt}</small>
                </button>
              ))}
            </div>
          )}
        </aside>
        <main className="image-workspace">
          <div
            className={`image-generate-stage${history.length ? " has-results" : ""}`}
          >
            {history.length ? (
              <div className="image-results" aria-live="polite">
                {history.map((item) => (
                  <ImageResultCard
                    key={item.id}
                    item={item}
                    onEdit={(nextPrompt) => {
                      setPrompt(nextPrompt);
                      window.requestAnimationFrame(() => composerInputRef.current?.focus());
                    }}
                    onRegenerate={(nextPrompt) => createGeneration(nextPrompt)}
                    onDelete={(id) =>
                      setHistory((current) => current.filter((entry) => entry.id !== id))
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="image-welcome">
                <div className="image-welcome-art">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <strong>{t("console.image.welcomeTitle")}</strong>
                <p>{t("console.image.welcomeHint")}</p>
              </div>
            )}
          </div>
          <div className="image-composer">
            <div className="image-composer-main">
              <button
                type="button"
                className="image-add-reference"
                aria-label={t("console.image.addReference")}
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPlus aria-hidden="true" />
                <span>{t("console.image.referenceShort")}</span>
              </button>
              <Input.TextArea
                ref={composerInputRef}
                value={prompt}
                onChange={(value) => setPrompt(value.slice(0, 8000))}
                rows={2}
                placeholder={t("console.image.promptPlaceholder")}
                aria-label={t("console.image.promptLabel")}
                disabled={generating}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    createGeneration();
                  }
                }}
              />
            </div>
            <div className="image-composer-controls">
              <ImageSelectedModels
                selected={selectedModels}
                ratio={ratio}
                size={size}
                format={format}
                onOpen={() => setPickerVisible(true)}
              />
              <Button
                className="generation-send-button image-generate-button"
                theme="solid"
                type="primary"
                icon={generating ? <IconStop /> : <IconArrowUp />}
                aria-label={t("console.image.generate")}
                disabled={generating ? false : !canGenerate}
                onClick={generating ? () => stopGeneration() : () => createGeneration()}
              />
            </div>
          </div>
        </main>
      </section>
      <input
        ref={fileInputRef}
        className="image-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUpload}
        aria-label={t("console.image.upload")}
      />
      <ImageModelPicker
        visible={pickerVisible}
        selected={selectedModels}
        format={format}
        onClose={() => setPickerVisible(false)}
        onConfirm={(models) => {
          setSelectedModels(models);
          setPickerVisible(false);
        }}
        onPreviewModel={previewModel}
        onFormatChange={setFormat}
        ratio={ratio}
        size={size}
        quality={quality}
        onRatioChange={setRatio}
        onSizeChange={setSize}
        onQualityChange={setQuality}
      />
    </div>
  );
}
