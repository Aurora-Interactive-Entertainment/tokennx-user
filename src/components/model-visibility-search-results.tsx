import { useTranslation } from 'react-i18next';

type SearchOption = { id: string; name: string; description: string };

export default function ModelVisibilitySearchResults({
  query,
  departments,
  people,
  selection,
  onToggleDepartment,
  onTogglePerson,
}: {
  query: string;
  departments: SearchOption[];
  people: SearchOption[];
  selection: { departments: string[]; people: string[] };
  onToggleDepartment: (id: string) => void;
  onTogglePerson: (id: string) => void;
}) {
  const { t } = useTranslation();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (option: SearchOption) =>
    `${option.name} ${option.description}`.toLocaleLowerCase().includes(normalizedQuery);
  // 搜索覆盖所有层级；结果保留部门路径，避免同名部门无法区分。
  const groups = [
    { key: 'departments', items: departments.filter(matches), selected: selection.departments, onToggle: onToggleDepartment },
    { key: 'people', items: people.filter(matches), selected: selection.people, onToggle: onTogglePerson },
  ];

  if (groups.every((group) => group.items.length === 0)) {
    return <p className="model-visibility-empty" role="status">{t('console.enterprise.model.visibility.noSearchResults')}</p>;
  }

  return groups.filter((group) => group.items.length > 0).map((group) => (
    <section key={group.key} aria-label={t(`console.enterprise.model.visibility.${group.key}`)}>
      <div className="model-visibility-breadcrumb">
        <strong>{t(`console.enterprise.model.visibility.${group.key}`)}</strong>
      </div>
      <div className="model-visibility-people-list">
        {group.items.map((item) => (
          <label key={item.id} title={`${item.name} · ${item.description}`}>
            <input
              type="checkbox"
              checked={group.selected.includes(item.id)}
              onChange={() => group.onToggle(item.id)}
              aria-label={item.name}
            />
            <span>
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </span>
          </label>
        ))}
      </div>
    </section>
  ));
}
