import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import seedance from "@/assets/svg/Seedance.svg";
import { ModelLogo, type ModelLogoModel } from "./model-logo";

describe("模型图标兼容与回退", () => {
  it.each(["Jimeng", "ByteDance", "字节跳动", "New Provider"])(
    "Seedance 新版本优先使用系列图标（%s）",
    (company) => {
      const { container } = render(
        <ModelLogo
          model={{ company, name: "Seedance 3.0", modality: "video" }}
        />,
      );
      expect(container.querySelector("img")).toHaveAttribute("src", seedance);
    },
  );

  it.each([
    [" ZHIPU_ai ", "Zhipu"],
    ["Z.ai", "Zhipu"],
    ["智谱AI", "Zhipu"],
    ["moonshot-ai", "MoonshotAI"],
    ["MoonshotAI", "MoonshotAI"],
    ["月之暗面", "MoonshotAI"],
    ["Jimeng", "Jimeng"],
    ["即梦 AI", "Jimeng"],
    ["MiniMax", "Minimax"],
    ["Alibaba Cloud", "Qwen"],
    ["DeepSeek", "DeepSeek"],
    ["OpenAI", "OpenAI"],
  ])("识别厂商名称 %s", (company, title) => {
    const { container } = render(
      <ModelLogo model={{ company, modality: "text" }} />,
    );
    expect(container.querySelector("svg title")).toHaveTextContent(title);
  });

  it.each([
    ["code", "vendor/glm6.0", "Zhipu"],
    ["alias", "kimi-k4", "MoonshotAI"],
    ["name", "qwen4", "Qwen"],
    ["name", "MiniMax-M4", "Minimax"],
  ])("厂商未知时从 %s 识别模型系列 %s", (field, value, title) => {
    const { container } = render(
      <ModelLogo
        model={{ company: "新厂商", modality: "text", [field]: value }}
      />,
    );
    expect(container.querySelector("svg title")).toHaveTextContent(title);
  });

  it("未知模型使用模态图标，不按名称子串误认厂商", () => {
    const { container } = render(
      <ModelLogo
        model={{
          company: "Unknown",
          name: "my-seedance-tool",
          modality: "video",
        }}
      />,
    );
    expect(container.querySelector(".semi-icon-video")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("全新品牌优先显示后台图标，图片失败后保留通用回退", () => {
    const { container } = render(
      <ModelLogo
        model={{
          company: "New Brand",
          name: "New Model",
          modality: "video",
          iconUrl: "/new-brand.svg",
        }}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/new-brand.svg",
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".semi-icon-video")).toBeInTheDocument();
  });

  it("后台图片失败回退品牌图标，切换到新地址后重新加载", () => {
    const model: ModelLogoModel = {
      company: "Zhipu AI",
      modality: "text",
      iconUrl: "/broken.svg",
    };
    const { container, rerender } = render(<ModelLogo model={model} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("svg title")).toHaveTextContent("Zhipu");
    rerender(<ModelLogo model={{ ...model, iconUrl: "/updated.svg" }} />);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/updated.svg",
    );
  });

  it("后台和本地图片连续失败时停止重试，回退模态图标", () => {
    const { container } = render(
      <ModelLogo
        model={{
          company: "Jimeng",
          name: "seedance2.5",
          modality: "video",
          iconUrl: "/broken.svg",
        }}
      />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toHaveAttribute("src", seedance);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".semi-icon-video")).toBeInTheDocument();
  });
});
