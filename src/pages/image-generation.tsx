import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import Button from "@douyinfe/semi-ui/lib/es/button";
import Tooltip from "@douyinfe/semi-ui/lib/es/tooltip";
import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconClose,
  IconEdit,
  IconImage,
  IconPlus,
  IconSearch,
  IconUpload,
  IconSend,
  IconStop,
} from "@douyinfe/semi-icons";
import { CompatInput as Input } from "@/components/semi-compat";
import "./image-generation.css";

type ImageMode = "generate" | "edit";
type ImageHistory = {
  id: string;
  prompt: string;
  mode: ImageMode;
  createdAt: string;
  preview?: string;
};

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

function ImageModelPicker({
  visible,
  selected,
  format,
  ratio,
  size,
  quality,
  onClose,
  onConfirm,
  onToggle,
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
  onConfirm: () => void;
  onToggle: (model: string) => void;
  onPreviewModel: (model: string) => void;
  onFormatChange: (format: "jpeg" | "png") => void;
  onRatioChange: (ratio: string) => void;
  onSizeChange: (size: string) => void;
  onQualityChange: (quality: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [previewModel, setPreviewModel] = useState(selected[0] ?? IMAGE_MODELS[0][0]);
  useEffect(() => {
    if (visible) setPreviewModel(selected[0] ?? IMAGE_MODELS[0][0]);
  }, [visible]);
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
                  className={`image-model-option${selected.includes(name) ? " is-selected" : ""}${previewModel === name ? " is-previewing" : ""}`}
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
                    checked={selected.includes(name)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation();
                      onToggle(name);
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
            disabled={selected.length === 0}
            aria-label={t("console.image.chooseModels", {
              count: selected.length,
            })}
            onClick={onConfirm}
          >
            {t("console.common.confirm")}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function ImagePage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImageMode>("generate");
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
  const [history, setHistory] = useState<ImageHistory[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generationTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (generationTimerRef.current !== null)
        window.clearTimeout(generationTimerRef.current);
      if (uploadedImage.startsWith("blob:")) URL.revokeObjectURL(uploadedImage);
    },
    [uploadedImage],
  );

  function toggleModel(model: string): void {
    setSelectedModels((current) =>
      current.includes(model)
        ? current.filter((item) => item !== model)
        : [...current, model],
    );
  }

  function previewModel(model: string): void {
    setRatio(modelDefaultRatio(model));
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (uploadedImage.startsWith("blob:")) URL.revokeObjectURL(uploadedImage);
    setUploadedImage(URL.createObjectURL(file));
  }

  function createGeneration(): void {
    if (generating || !prompt.trim() || selectedModels.length === 0) return;
    setGenerating(true);
    // 中文：这里是后端图片任务接口的接入边界，先用本地状态还原生成中的交互。
    generationTimerRef.current = window.setTimeout(() => {
      setHistory((current) => [
        {
          id: `${Date.now()}`,
          prompt: prompt.trim(),
          mode,
          createdAt: new Date().toLocaleTimeString(),
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
          <div
            className="image-mode-switch"
            role="tablist"
            aria-label={t("console.image.mode")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "generate"}
              className={mode === "generate" ? "is-active" : ""}
              onClick={() => setMode("generate")}
            >
              <IconImage aria-hidden="true" />
              {t("console.image.generateMode")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              className={mode === "edit" ? "is-active" : ""}
              onClick={() => setMode("edit")}
            >
              <IconEdit aria-hidden="true" />
              {t("console.image.editMode")}
            </button>
          </div>
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
                  <strong>
                    {item.mode === "generate"
                      ? t("console.image.generateMode")
                      : t("console.image.editMode")}
                  </strong>
                  <span>{item.createdAt}</span>
                  <small>{item.prompt}</small>
                </button>
              ))}
            </div>
          )}
        </aside>
        <main className="image-workspace">
          {mode === "generate" ? (
            <>
              <div
                className={`image-generate-stage${history.length ? " has-results" : ""}`}
              >
                {history.length ? (
                  <div className="image-results" aria-live="polite">
                    {history.map((item) => (
                      <article className="image-result-card" key={item.id}>
                        {item.preview ? (
                          <img src={item.preview} alt="" />
                        ) : (
                          <div className="image-result-placeholder">
                            <IconImage aria-hidden="true" />
                          </div>
                        )}
                        <span>{item.prompt}</span>
                      </article>
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
                  <Button
                    theme="borderless"
                    className="image-model-trigger"
                    onClick={() => setPickerVisible(true)}
                    aria-label={t("console.image.chooseModel")}
                  >
                    <IconImage aria-hidden="true" />
                    {selectedModels.length === 1
                      ? selectedModels[0]
                      : selectedModels.length
                        ? t("console.image.modelsSelected", {
                            count: selectedModels.length,
                          })
                        : t("console.image.chooseModel")}
                    <IconChevronDown className="image-chevron" aria-hidden="true" />
                  </Button>
                  <Button
                    className="image-generate-button"
                    theme="solid"
                    type="primary"
                    icon={generating ? <IconStop /> : <IconSend />}
                    aria-label={t("console.image.generate")}
                    disabled={generating ? false : !canGenerate}
                    onClick={generating ? stopGeneration : createGeneration}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="image-edit-empty">
              {uploadedImage ? (
                <img
                  src={uploadedImage}
                  alt={t("console.image.uploadedPreview")}
                />
              ) : (
                <div className="image-edit-art">
                  <span />
                  <span />
                  <span />
                </div>
              )}
              <strong>
                {uploadedImage
                  ? t("console.image.editReady")
                  : t("console.image.editTitle")}
              </strong>
              <p>
                {uploadedImage
                  ? t("console.image.editHint")
                  : t("console.image.editSubtitle")}
              </p>
              {uploadedImage ? (
                <Input.TextArea
                  value={prompt}
                  onChange={setPrompt}
                  rows={2}
                  placeholder={t("console.image.editPromptPlaceholder")}
                  aria-label={t("console.image.promptLabel")}
                />
              ) : null}
              <Button
                theme="solid"
                type="primary"
                icon={<IconUpload />}
                onClick={() => fileInputRef.current?.click()}
              >
                {t("console.image.upload")}
              </Button>
            </div>
          )}
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
        onConfirm={() => setPickerVisible(false)}
        onToggle={toggleModel}
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
