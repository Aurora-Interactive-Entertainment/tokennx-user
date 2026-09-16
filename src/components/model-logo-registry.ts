import deepseek from "@lobehub/icons-static-svg/icons/deepseek-color.svg?raw";
import anthropic from "@lobehub/icons-static-svg/icons/claude-color.svg?raw";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import qwen from "@lobehub/icons-static-svg/icons/qwen-color.svg?raw";
import zhipu from "@lobehub/icons-static-svg/icons/zhipu-color.svg?raw";
import gemini from "@lobehub/icons-static-svg/icons/gemini-color.svg?raw";
import meta from "@lobehub/icons-static-svg/icons/meta-color.svg?raw";
import mistral from "@lobehub/icons-static-svg/icons/mistral-color.svg?raw";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg?raw";
import yi from "@lobehub/icons-static-svg/icons/yi-color.svg?raw";
import baichuan from "@lobehub/icons-static-svg/icons/baichuan-color.svg?raw";
import doubao from "@lobehub/icons-static-svg/icons/doubao-color.svg?raw";
import midjourney from "@lobehub/icons-static-svg/icons/midjourney.svg?raw";
import stability from "@lobehub/icons-static-svg/icons/stability-color.svg?raw";
import jimeng from "@lobehub/icons-static-svg/icons/jimeng-color.svg?raw";
import minimax from "@lobehub/icons-static-svg/icons/minimax-color.svg?raw";
import hunyuan from "@lobehub/icons-static-svg/icons/hunyuan-color.svg?raw";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?raw";
import seedance from "@/assets/svg/Seedance.svg";

type LogoAsset =
  { markup: string; src?: never } | { src: string; markup?: never };
type ModelIdentity = {
  company: string;
  name?: string;
  code?: string;
  alias?: string;
};

// 新品牌只需补充这一处登记；中英文别名统一忽略大小写、空格和常见分隔符。
const BRANDS: { aliases: string[]; asset: LogoAsset }[] = [
  { aliases: ["DeepSeek", "深度求索"], asset: { markup: deepseek } },
  { aliases: ["Anthropic", "Claude"], asset: { markup: anthropic } },
  { aliases: ["OpenAI"], asset: { markup: openai } },
  {
    aliases: [
      "阿里云",
      "Alibaba",
      "Alibaba Cloud",
      "Aliyun",
      "Qwen",
      "通义千问",
    ],
    asset: { markup: qwen },
  },
  {
    aliases: ["智谱", "智谱AI", "Zhipu", "Zhipu AI", "Z.ai", "GLM"],
    asset: { markup: zhipu },
  },
  {
    aliases: ["Google", "Google DeepMind", "Gemini"],
    asset: { markup: gemini },
  },
  { aliases: ["Meta", "Meta AI"], asset: { markup: meta } },
  { aliases: ["Mistral", "Mistral AI"], asset: { markup: mistral } },
  {
    aliases: ["月之暗面", "Moonshot", "Moonshot AI", "Kimi"],
    asset: { markup: moonshot },
  },
  { aliases: ["零一万物", "01.AI", "Yi"], asset: { markup: yi } },
  { aliases: ["百川智能", "Baichuan"], asset: { markup: baichuan } },
  {
    aliases: ["字节跳动", "ByteDance", "Doubao", "豆包"],
    asset: { markup: doubao },
  },
  { aliases: ["Midjourney"], asset: { markup: midjourney } },
  { aliases: ["Stability", "Stability AI"], asset: { markup: stability } },
  {
    aliases: ["即梦", "即梦AI", "Jimeng", "Jimeng AI"],
    asset: { markup: jimeng },
  },
  { aliases: ["Seedance"], asset: { src: seedance } },
  { aliases: ["MiniMax", "稀宇科技"], asset: { markup: minimax } },
  {
    aliases: ["腾讯", "Tencent", "Hunyuan", "腾讯混元", "混元"],
    asset: { markup: hunyuan },
  },
  { aliases: ["xAI", "Grok"], asset: { markup: xai } },
];

function normalizeBrand(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");
}

const BRAND_ASSETS = new Map(
  BRANDS.flatMap(({ aliases, asset }) =>
    aliases.map((alias) => [normalizeBrand(alias), asset] as const),
  ),
);

// 按系列识别，不绑定具体版本；前缀边界避免把不相关名称误判为品牌。
const MODEL_FAMILIES: [RegExp, string][] = [
  [/^seedance(?=$|[\s._\d-])/i, "Seedance"],
  [/^deepseek(?=$|[\s._\d-])/i, "DeepSeek"],
  [/^(?:chatglm|glm)(?=$|[\s._\d-])/i, "Zhipu"],
  [/^(?:kimi|moonshot)(?=$|k?\d|[\s._-])/i, "Moonshot"],
  [/^qwen(?=$|[\s._\d-])/i, "Qwen"],
  [/^claude(?=$|[\s._\d-])/i, "Anthropic"],
  [/^(?:gpt|chatgpt|dall-e|sora)(?=$|[\s._\d-])/i, "OpenAI"],
  [/^gemini(?=$|[\s._\d-])/i, "Google"],
  [/^llama(?=$|[\s._\d-])/i, "Meta"],
  [/^(?:mistral|mixtral)(?=$|[\s._\d-])/i, "Mistral"],
  [/^minimax(?=$|[\s._\d-])/i, "MiniMax"],
  [/^doubao(?=$|[\s._\d-])/i, "Doubao"],
  [/^hunyuan(?=$|[\s._\d-])/i, "Hunyuan"],
  [/^grok(?=$|[\s._\d-])/i, "xAI"],
];

export function resolveModelLogo(model: ModelIdentity): LogoAsset | undefined {
  // 模型系列优先于厂商，避免同一厂商的 Seedance 被显示成其他产品图标。
  for (const value of [model.alias, model.code, model.name]) {
    const name = value?.trim().split("/").pop()?.trim();
    if (!name) continue;
    const family = MODEL_FAMILIES.find(([pattern]) => pattern.test(name));
    if (family) return BRAND_ASSETS.get(normalizeBrand(family[1]));
  }
  return BRAND_ASSETS.get(normalizeBrand(model.company));
}
