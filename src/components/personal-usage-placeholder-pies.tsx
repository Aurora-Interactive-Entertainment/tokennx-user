import { useTranslation } from "react-i18next";
import "./personal-usage-placeholder-pies.css";

const PLACEHOLDER_SEGMENTS = [
  "#4f79e8",
  "#24c98b",
  "#a998ff",
  "#f5b84b",
] as const;

function PlaceholderPie({ title, id }: { title: string; id: string }) {
  const { t } = useTranslation();
  return (
    <section className="personal-usage-pie-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="personal-usage-pie-content">
        <div className="personal-usage-pie-legend" aria-hidden="true">
          {PLACEHOLDER_SEGMENTS.slice(0, 3).map((color, index) => (
            <div className="personal-usage-pie-legend-item" key={color}>
              <i style={{ backgroundColor: color }} />
              <span>
                {t("console.personalUsage.piePlaceholder.item", {
                  index: index + 1,
                })}
              </span>
              <b>--</b>
            </div>
          ))}
        </div>
        <div
          className="personal-usage-pie-placeholder"
          role="img"
          aria-label={`${title} · ${t("console.personalUsage.piePlaceholder.pending")}`}
        >
          <div className="personal-usage-pie-ring" aria-hidden="true" />
          <span>{t("console.personalUsage.piePlaceholder.pending")}</span>
        </div>
      </div>
    </section>
  );
}

export function PersonalUsagePlaceholderPies() {
  const { t } = useTranslation();
  return (
    <div className="personal-usage-pie-grid">
      <PlaceholderPie
        id="personal-usage-model-pie"
        title={t("console.personalUsage.piePlaceholder.models")}
      />
      <PlaceholderPie
        id="personal-usage-source-pie"
        title={t("console.personalUsage.piePlaceholder.sources")}
      />
    </div>
  );
}
