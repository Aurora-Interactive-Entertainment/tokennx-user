import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import SemiCard from "@douyinfe/semi-ui/lib/es/card";
import SemiInput from "@douyinfe/semi-ui/lib/es/input";
import SemiSelect from "@douyinfe/semi-ui/lib/es/select";
import SemiTextArea from "@douyinfe/semi-ui/lib/es/input/textarea";

type SelectValue = string | number | Record<string, unknown>;

type CompatSelectProps<T = SelectValue> = Omit<
  ComponentProps<typeof SemiSelect>,
  "defaultValue" | "onChange" | "value"
> & {
  defaultValue?: T | T[];
  onChange?: (value: T | T[] | undefined) => void;
  value?: T | T[];
  block?: boolean;
};

type CompatSelectComponent = {
  <T = SelectValue>(props: CompatSelectProps<T>): ReactElement | null;
  Option: typeof SemiSelect.Option;
  OptGroup: typeof SemiSelect.OptGroup;
};

const CompatSelect = (({ block, style, className, dropdownClassName, ...props }: CompatSelectProps) => {
  const { i18n } = useTranslation();
  // 兼容旧版 block 语义，同时保留调用方显式传入的其他样式。
  const mergedStyle = block ? { ...style, width: "100%" } : style;
  const mergedClassName = className ? `app-select ${className}` : "app-select";
  const mergedDropdownClassName = dropdownClassName ? `app-select-dropdown ${dropdownClassName}` : "app-select-dropdown";
  // Semi Select caches option labels internally. Rebuild it when the active language changes.
  const languageKey = i18n.resolvedLanguage ?? i18n.language;
  return <SemiSelect key={languageKey} {...props} className={mergedClassName} dropdownClassName={mergedDropdownClassName} style={mergedStyle} />;
}) as CompatSelectComponent;

CompatSelect.Option = SemiSelect.Option;
CompatSelect.OptGroup = SemiSelect.OptGroup;

export { CompatSelect };

type CompatCardProps = ComponentProps<typeof SemiCard> & {
  headerExtra?: ReactNode;
};

export function CompatCard({
  headerExtra,
  headerExtraContent,
  ...props
}: CompatCardProps) {
  // 兼容旧版 headerExtra 属性，统一交给当前版本的 headerExtraContent 渲染。
  return (
    <SemiCard
      {...props}
      headerExtraContent={headerExtraContent ?? headerExtra}
    />
  );
}

type CompatInputProps = ComponentProps<typeof SemiInput>;
type CompatTextAreaProps = ComponentProps<typeof SemiTextArea>;

function CompatInputBase({ className, ...props }: CompatInputProps) {
  const mergedClassName = className ? `app-input ${className}` : "app-input";
  return <SemiInput {...props} className={mergedClassName} />;
}

function CompatTextArea({ className, ...props }: CompatTextAreaProps) {
  const mergedClassName = className ? `app-textarea ${className}` : "app-textarea";
  return <SemiTextArea {...props} className={mergedClassName} />;
}

// 输入框与下拉框通过兼容层自动接入统一的 TRAE 控件样式。
export const CompatInput = Object.assign(CompatInputBase, {
  TextArea: CompatTextArea,
});
