export const API_KEY_WHITELIST_MAX_COUNT = 64;

function isValidIPv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
  );
}

function ipv6SegmentCount(value: string): number {
  if (!value) return 0;
  const groups = value.split(":");
  let count = 0;
  for (const [index, group] of groups.entries()) {
    if (group.includes(".")) {
      if (index !== groups.length - 1 || !isValidIPv4(group)) return -1;
      count += 2;
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return -1;
      count += 1;
    }
  }
  return count;
}

function isValidIPv6(value: string): boolean {
  if (!value || value.includes(":::")) return false;
  const parts = value.split("::");
  if (parts.length > 2) return false;
  if (parts.length === 2) {
    // 内嵌 IPv4 只能出现在整个地址末尾，“::” 至少压缩一个分段。
    if (parts[0].includes(".")) return false;
    const leftCount = ipv6SegmentCount(parts[0]);
    const rightCount = ipv6SegmentCount(parts[1]);
    return leftCount >= 0 && rightCount >= 0 && leftCount + rightCount < 8;
  }
  return ipv6SegmentCount(value) === 8;
}

export function parseApiKeyWhitelist(value: string): {
  entries: string[];
  invalid: string | null;
  tooMany: boolean;
} {
  const entries = new Set<string>();
  for (const entry of value.split(/[,，;；|\n\r\t]+/).map((item) => item.trim()).filter(Boolean)) {
    const [address, prefix, extra] = entry.split("/");
    const ipv6 = address.includes(":");
    const maxPrefix = ipv6 ? 128 : 32;
    const validAddress = ipv6 ? isValidIPv6(address) : isValidIPv4(address);
    if (!validAddress || extra !== undefined || (prefix !== undefined &&
      (!/^\d{1,3}$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > maxPrefix))) {
      return { entries: [], invalid: entry, tooMany: false };
    }
    // 与接口保持一致：单地址补齐前缀后按文本去重，最终规范化仍由服务端负责。
    entries.add(`${address}/${prefix === undefined ? maxPrefix : Number(prefix)}`);
  }
  return { entries: [...entries], invalid: null, tooMany: entries.size > API_KEY_WHITELIST_MAX_COUNT };
}
