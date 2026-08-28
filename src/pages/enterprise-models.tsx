import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import Toast from '@douyinfe/semi-ui/lib/es/toast';
import {
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconDelete,
  IconMore,
  IconSearch,
  IconTick,
  IconUserGroup,
} from '@douyinfe/semi-icons';
import {
  getEnterpriseModels,
  updateEnterpriseModel,
  type EnterpriseContext,
  type EnterpriseModel,
  type EnterpriseModelPage,
} from '@/api/enterprise-console';
import { isApiError } from '@/api/http';
import {
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  EnterpriseRefreshButton,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from './enterprise-console-shared';
import './enterprise-models.css';

type DirectoryModel = EnterpriseModel & {
  iconKey?: string;
};
type VisibilityScope = 'all' | 'partial';
type SelectionKind = 'department' | 'person';
type Department = {
  id: string;
  name: string;
  path: string;
  children?: Department[];
};
type VisibilitySelection = { departments: string[]; people: string[] };

const PEOPLE = [
  { id: 'lhb', name: 'lhb', email: '1197715732@qq.com' },
  { id: 'zhuhanxin', name: 'zhuhanxin', email: 'zhuhanxin0308@163.com' },
  { id: 'han', name: 'han', email: 'abca12a@gmail.com' },
  { id: '伍佰', name: '伍佰', email: 'ljingfind@126.com' },
];

const PAGE_SIZE = 10;

// The platform directory mirrors the system models shown in the enterprise console.
const MODEL_SEEDS: Array<[string, string, string, boolean, string]> = [
  [
    'doubao-seed-evolving',
    'Doubao-Seed-Evolving',
    'Volcengine',
    true,
    'doubao',
  ],
  ['doubao-seed-2.1-pro', 'Doubao-Seed-2.1-Pro', 'Volcengine', false, 'doubao'],
  [
    'doubao-seed-2.1-turbo',
    'Doubao-Seed-2.1-Turbo',
    'Volcengine',
    false,
    'doubao',
  ],
  [
    'doubao-seed-2.0-code',
    'Doubao-Seed-2.0-Code',
    'Volcengine',
    false,
    'doubao',
  ],
  ['doubao-seed-code', 'Doubao-Seed-Code', 'Volcengine', true, 'doubao'],
  ['glm-5.3', 'GLM-5.3', '智谱 AI', true, 'glm'],
  ['glm-5.2', 'GLM-5.2', '智谱 AI', true, 'glm'],
  ['glm-5.1', 'GLM-5.1', '智谱 AI', true, 'glm'],
  ['glm-5v-turbo', 'GLM-5V-Turbo', '智谱 AI', true, 'glm'],
  ['glm-5', 'GLM-5', '智谱 AI', true, 'glm'],
  ['minimax-m3', 'MiniMax-M3', 'MiniMax', true, 'minimax'],
  ['minimax-m2.7', 'MiniMax-M2.7', 'MiniMax', true, 'minimax'],
  ['qwen3.8-max', 'Qwen3.8-Max', 'Qwen', true, 'qwen'],
  ['qwen-3.7-plus', 'Qwen3.7-Plus', 'Qwen', false, 'qwen'],
  ['kimi-k2.7-code', 'Kimi-K2.7-Code', 'Moonshot AI', true, 'kimi'],
  [
    'deepseek-v4-pro-official',
    'DeepSeek-V4-Pro 正式版',
    'DeepSeek',
    true,
    'deepseek',
  ],
  ['deepseek-v4-pro', 'DeepSeek-V4-Pro', 'DeepSeek', true, 'deepseek'],
  ['deepseek-v4-flash', 'DeepSeek-V4-Flash', 'DeepSeek', true, 'deepseek'],
  [
    'deepseek-v4-flash-official',
    'DeepSeek-V4-Flash 正式版',
    'DeepSeek',
    true,
    'deepseek',
  ],
  ['glm-5-turbo', 'GLM-5-Turbo', '智谱 AI', true, 'glm'],
];

const SYSTEM_MODELS: DirectoryModel[] = MODEL_SEEDS.map(
  ([id, name, company, enabled, iconKey]) => ({
    id,
    code: id,
    name,
    company,
    modality: 'text',
    capabilities: ['chat'],
    enabled,
    setting_version: 1,
    iconKey,
  }),
);

const deepDepartment: Department = {
  id: 'level-5',
  name: '五级',
  path: '极光互娱科技（深圳）有限公司/测试子级别部门/五级',
};
let deepDepartmentParent = deepDepartment;
for (const [index, name] of [
  '六级',
  '七级',
  '八级',
  '九级',
  '十级',
  '11',
].entries()) {
  const child: Department = {
    id: `level-${index + 6}`,
    name,
    path: `${deepDepartmentParent.path}/${name}`,
  };
  deepDepartmentParent.children = [child];
  deepDepartmentParent = child;
}

const DEPARTMENTS: Department = {
  id: 'root',
  name: '极光互娱科技（深圳）有限公司',
  path: '极光互娱科技（深圳）有限公司',
  children: [
    {
      id: 'operations',
      name: '运营',
      path: '极光互娱科技（深圳）有限公司/运营',
    },
    {
      id: 'test-level-1',
      name: '测试子级别部门',
      path: '极光互娱科技（深圳）有限公司/测试子级别部门',
      children: [
        {
          id: 'test-level-2',
          name: '测试三级子部门',
          path: '极光互娱科技（深圳）有限公司/测试子级别部门/测试三级子部门',
        },
        deepDepartment,
      ],
    },
  ],
};

function modelIcon(model: DirectoryModel): string {
  if (model.iconKey === 'deepseek') return 'DS';
  if (model.iconKey === 'minimax') return '〽';
  if (model.iconKey === 'kimi') return 'K';
  if (model.iconKey === 'qwen') return 'Q';
  if (model.iconKey === 'glm') return 'Z';
  return '◐';
}

function normalizeDirectory(data: EnterpriseModelPage): EnterpriseModelPage {
  const modelMeta = new Map(SYSTEM_MODELS.map((model) => [model.id, model]));
  // 中文：接口有数据时完全遵循服务端返回的可用模型，不再人为注入或锁定默认模型。
  const items = data.items.length > 0
    ? data.items.map((item) => ({
        ...item,
        iconKey: modelMeta.get(item.id)?.iconKey,
      }))
    : SYSTEM_MODELS;
  return {
    ...data,
    items,
    total: items.length,
    page_size: items.length,
    enabled_count: items.filter((item) => item.enabled).length,
    disabled_count: items.filter((item) => !item.enabled).length,
  };
}

function applyModelUpdate(
  data: EnterpriseModelPage,
  updated: EnterpriseModel,
): EnterpriseModelPage {
  const current = data.items.find((item) => item.id === updated.id);
  const enabledDelta =
    current && current.enabled !== updated.enabled
      ? updated.enabled
        ? 1
        : -1
      : 0;
  return {
    ...data,
    items: data.items.map((item) =>
      item.id === updated.id ? { ...item, ...updated } : item,
    ),
    enabled_count: data.enabled_count + enabledDelta,
    disabled_count: Math.max(0, data.disabled_count - enabledDelta),
  };
}

function collectDepartments(node: Department): Department[] {
  return [node, ...(node.children ?? []).flatMap(collectDepartments)];
}

function SelectionSummary({
  selection,
  onRemove,
  t,
}: {
  selection: VisibilitySelection;
  onRemove: (kind: SelectionKind, id: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const departments = collectDepartments(DEPARTMENTS).filter((item) =>
    selection.departments.includes(item.id),
  );
  const people = selection.people.map((id) => {
    const person = PEOPLE.find((item) => item.id === id);
    return {
      id,
      name: person?.name ?? id,
      path: person?.email ?? '极光互娱科技（深圳）有限公司',
    };
  });
  return (
    <div className="model-visibility-selected">
      <div className="model-visibility-selected-title">
        <strong>{t('console.enterprise.model.visibility.selected')}</strong>
        <span>
          {t('console.enterprise.model.visibility.selectedSummary', {
            departments: selection.departments.length,
            people: selection.people.length,
          })}
        </span>
        <button
          type="button"
          className="model-visibility-icon-button"
          aria-label={t('console.enterprise.model.visibility.clear')}
          onClick={() => {
            selection.departments.forEach((id) => onRemove('department', id));
            selection.people.forEach((id) => onRemove('person', id));
          }}
        >
          <IconDelete />
        </button>
      </div>
      <div className="model-visibility-selected-list">
        {departments.map((item) => (
          <div
            className="model-visibility-selected-item"
            key={item.id}
            title={`${item.name} · ${item.path}`}
          >
            <div>
              <strong>{item.name}</strong>
              <small>{item.path}</small>
            </div>
            <button
              type="button"
              className="model-visibility-icon-button"
              aria-label={`${t('console.enterprise.model.visibility.removeDepartment')} ${item.name}`}
              onClick={() => onRemove('department', item.id)}
            >
              <IconClose />
            </button>
          </div>
        ))}
        {people.map((item) => (
          <div
            className="model-visibility-selected-item"
            key={item.id}
            title={`${item.name} · ${item.path}`}
          >
            <div>
              <strong>{item.name}</strong>
              <small>{item.path}</small>
            </div>
            <button
              type="button"
              className="model-visibility-icon-button"
              aria-label={`${t('console.enterprise.model.visibility.removePerson')} ${item.name}`}
              onClick={() => onRemove('person', item.id)}
            >
              <IconClose />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentNode({
  node,
  selected,
  expanded,
  onToggle,
  onExpand,
  t,
}: {
  node: Department;
  selected: string[];
  expanded: string[];
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  t: (key: string) => string;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.includes(node.id);
  return (
    <div className="model-visibility-tree-node">
      <div
        className={`model-visibility-tree-row${selected.includes(node.id) ? ' is-selected' : ''}`}
        style={
          {
            '--tree-depth':
              node.id === 'root' ? 0 : node.path.split('/').length - 1,
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="model-visibility-tree-expand"
          aria-label={
            isExpanded
              ? t('console.enterprise.model.visibility.collapse')
              : t('console.enterprise.model.visibility.expand')
          }
          onClick={() => hasChildren && onExpand(node.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <IconChevronDown />
            ) : (
              <IconChevronRight />
            )
          ) : (
            <span />
          )}
        </button>
        <input
          type="checkbox"
          checked={selected.includes(node.id)}
          onChange={() => onToggle(node.id)}
          aria-label={node.name}
        />
        <button
          type="button"
          className="model-visibility-tree-name"
          onClick={() => onToggle(node.id)}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div>
          {node.children?.map((child) => (
            <DepartmentNode
              key={child.id}
              node={child}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={onExpand}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModelVisibilityDialog({
  model,
  initialScope,
  initialSelection,
  onClose,
  onSave,
}: {
  model: DirectoryModel;
  initialScope: VisibilityScope;
  initialSelection: VisibilitySelection;
  onClose: () => void;
  onSave: (scope: VisibilityScope, selection: VisibilitySelection) => void;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState(initialScope);
  const [kind, setKind] = useState<SelectionKind | null>(null);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<VisibilitySelection>(() => ({
    departments: [...initialSelection.departments],
    people: [...initialSelection.people],
  }));
  const [expanded, setExpanded] = useState<string[]>([
    'root',
    'test-level-1',
    'level-5',
    'level-6',
    'level-7',
    'level-8',
    'level-9',
    'level-10',
  ]);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  function toggleDepartment(id: string): void {
    setSelection((current) => ({
      ...current,
      departments: current.departments.includes(id)
        ? current.departments.filter((item) => item !== id)
        : [...current.departments, id],
    }));
  }
  function removeSelection(selectionKind: SelectionKind, id: string): void {
    setSelection((current) => ({
      ...current,
      [selectionKind === 'department' ? 'departments' : 'people']:
        (selectionKind === 'department'
          ? current.departments
          : current.people
        ).filter((item) => item !== id),
    }));
  }
  const visiblePeople = query
    ? PEOPLE.filter((person) =>
        `${person.name} ${person.email}`.includes(query),
      )
    : PEOPLE;
  return (
    <div
      className="model-visibility-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="model-visibility-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modelVisibilityTitle"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="model-visibility-header">
          <h2 id="modelVisibilityTitle">
            {t('console.enterprise.model.visibility.title')}
          </h2>
          <button
            type="button"
            className="model-visibility-close"
            aria-label={t('console.enterprise.model.visibility.close')}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>
        <div
          className="model-visibility-radios"
          role="radiogroup"
          aria-label={t('console.enterprise.model.visibility.scope')}
        >
          <label>
            <input
              type="radio"
              name="model-scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            {t('console.enterprise.model.visibility.all')}
          </label>
          <label>
            <input
              type="radio"
              name="model-scope"
              checked={scope === 'partial'}
              onChange={() => setScope('partial')}
            />
            {t('console.enterprise.model.visibility.partial')}
          </label>
        </div>
        {scope === 'all' ? (
          <div className="model-visibility-all-state">
            <IconTick />
            <span>{t('console.enterprise.model.visibility.allHint')}</span>
          </div>
        ) : (
          <div className="model-visibility-picker">
            <div className="model-visibility-picker-left">
              <div className="model-visibility-search">
                <IconSearch />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('console.enterprise.model.visibility.search')}
                  aria-label={t('console.enterprise.model.visibility.search')}
                />
              </div>
              {kind === null ? (
                <div className="model-visibility-kind-menu">
                  <button type="button" onClick={() => setKind('department')}>
                    <span>
                      {t('console.enterprise.model.visibility.departments')}
                    </span>
                    <IconChevronRight />
                  </button>
                  <button type="button" onClick={() => setKind('person')}>
                    <span>
                      {t('console.enterprise.model.visibility.people')}
                    </span>
                    <IconChevronRight />
                  </button>
                </div>
              ) : null}
              <div className="model-visibility-picker-content">
                {kind ? (
                  <div className="model-visibility-breadcrumb">
                    <button type="button" onClick={() => setKind(null)}>
                      {t('console.enterprise.model.visibility.scopeRoot')}
                    </button>
                    <span>/</span>
                    <strong>
                      {kind === 'department'
                        ? t('console.enterprise.model.visibility.departments')
                        : t('console.enterprise.model.visibility.people')}
                    </strong>
                  </div>
                ) : null}
                <div className="model-visibility-scroll-area">
                  {kind === 'department' ? (
                    <DepartmentNode
                      node={DEPARTMENTS}
                      selected={selection.departments}
                      expanded={expanded}
                      onToggle={toggleDepartment}
                      onExpand={(id) =>
                        setExpanded((current) =>
                          current.includes(id)
                            ? current.filter((item) => item !== id)
                            : [...current, id],
                        )
                      }
                      t={t}
                    />
                  ) : kind === 'person' ? (
                    <div className="model-visibility-people-list">
                      {visiblePeople.map((person) => (
                        <label
                          key={person.id}
                          title={`${person.name} · ${person.email}`}
                        >
                          <input
                            type="checkbox"
                            checked={selection.people.includes(person.id)}
                            onChange={() =>
                              setSelection((current) => ({
                                ...current,
                                people: current.people.includes(person.id)
                                  ? current.people.filter(
                                      (item) => item !== person.id,
                                    )
                                  : [...current.people, person.id],
                              }))
                            }
                          />
                          <span>
                            <strong>{person.name}</strong>
                            <small>{person.email}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <SelectionSummary
              selection={selection}
              onRemove={removeSelection}
              t={t}
            />
          </div>
        )}
        <footer className="model-visibility-footer">
          <button
            type="button"
            className="model-visibility-cancel"
            onClick={onClose}
          >
            {t('console.enterprise.model.visibility.cancel')}
          </button>
          <button
            type="button"
            className="model-visibility-confirm"
            onClick={() => {
              onSave(scope, selection);
              onClose();
            }}
          >
            {t('console.enterprise.model.visibility.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ModelScopeIndicator({
  scope,
  t,
}: {
  scope: VisibilityScope;
  t: (key: string) => string;
}) {
  return scope === 'partial' ? (
    <span
      className="model-scope-indicator"
      title={t('console.enterprise.model.visibility.partial')}
      aria-label={t('console.enterprise.model.visibility.partial')}
    >
      <IconUserGroup />
    </span>
  ) : null;
}

function ModelStateControl({
  model,
  canManage,
  saving,
  scope,
  onToggle,
  onOpenVisibility,
}: {
  model: DirectoryModel;
  canManage: boolean;
  saving: boolean;
  scope: VisibilityScope;
  onToggle: (model: DirectoryModel) => void;
  onOpenVisibility: (model: DirectoryModel) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="enterprise-model-state">
      <ModelScopeIndicator scope={scope} t={t} />
      {canManage ? (
        <div className="enterprise-model-actions">
          <button
            type="button"
            className="enterprise-model-more"
            aria-label={t('console.enterprise.model.visibility.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <IconMore />
          </button>
          {menuOpen ? (
            <div className="enterprise-model-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenVisibility(model);
                }}
              >
                {t('console.enterprise.model.visibility.scopeAction')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        className={`enterprise-model-switch${model.enabled ? ' is-on' : ''}`}
        type="button"
        role="switch"
        aria-checked={model.enabled}
        aria-label={`${model.enabled ? t('console.enterprise.model.disable') : t('console.enterprise.model.enable')} ${model.name}`}
        disabled={!canManage || saving}
        aria-busy={saving}
        onClick={() => onToggle(model)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

function ModelsTable({
  items,
  canManage,
  savingModelID,
  scopes,
  onToggle,
  onOpenVisibility,
}: {
  items: DirectoryModel[];
  canManage: boolean;
  savingModelID: string;
  scopes: Record<string, VisibilityScope>;
  onToggle: (model: DirectoryModel) => void;
  onOpenVisibility: (model: DirectoryModel) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="enterprise-models-table-scroll"
      role="region"
      aria-label={t('console.enterprise.model.title')}
      tabIndex={0}
    >
      <table className="enterprise-models-table enterprise-models-table--managed">
        <tbody>
          {items.map((model) => (
            <tr key={model.id}>
              <td>
                <div className="enterprise-model-identity">
                  <span
                    className={`enterprise-model-badge model-icon-${model.iconKey ?? 'default'}`}
                    aria-hidden="true"
                  >
                    {modelIcon(model)}
                  </span>
                  <span>
                    <strong title={model.name}>{model.name}</strong>
                  </span>
                </div>
              </td>
              <td>
                <ModelStateControl
                  model={model}
                  canManage={canManage}
                  saving={savingModelID === model.id}
                  scope={scopes[model.id] ?? 'all'}
                  onToggle={onToggle}
                  onOpenVisibility={onOpenVisibility}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelsContent({ context }: { context: EnterpriseContext }) {
  const { t } = useTranslation();
  const handleError = useEnterpriseErrorHandler();
  const canManage = context.capabilities.can_manage_models;
  const [data, setData] = useState<EnterpriseModelPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EnterpriseRequestError | null>(null);
  const [actionError, setActionError] = useState<EnterpriseRequestError | null>(
    null,
  );
  const [savingModelID, setSavingModelID] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [openModel, setOpenModel] = useState<DirectoryModel | null>(null);
  const [scopes, setScopes] = useState<Record<string, VisibilityScope>>({
    'doubao-seed-2.1-pro': 'partial',
  });
  const [selections, setSelections] = useState<
    Record<string, VisibilitySelection>
  >({ 'doubao-seed-2.1-pro': { departments: ['operations'], people: [] } });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getEnterpriseModels(
      { enterprise_id: context.id },
      {
        page: 1,
        page_size: PAGE_SIZE,
        include_disabled: true,
        signal: controller.signal,
      },
    )
      .then((result) => {
        if (active) setData(normalizeDirectory(result));
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) setError(handled);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [context.id, handleError, reloadToken]);
  async function toggleModel(model: DirectoryModel): Promise<void> {
    if (!canManage || savingModelID) return;
    setSavingModelID(model.id);
    setActionError(null);
    try {
      const updated = await updateEnterpriseModel(
        { enterprise_id: context.id },
        model.id,
        { enabled: !model.enabled, expected_version: model.setting_version },
      );
      setData((previous) =>
        previous ? applyModelUpdate(previous, updated) : previous,
      );
      Toast.success(
        updated.enabled
          ? t('console.enterprise.model.updated')
          : t('console.enterprise.model.updateDisabled'),
      );
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (handled) setActionError(handled);
      if (isApiError(reason) && reason.code === 140004) {
        Toast.warning(t('console.enterprise.model.conflict'));
        setReloadToken((value) => value + 1);
      }
    } finally {
      setSavingModelID('');
    }
  }
  function saveVisibility(
    scope: VisibilityScope,
    selection: VisibilitySelection,
  ): void {
    if (!openModel) return;
    setScopes((current) => ({ ...current, [openModel.id]: scope }));
    setSelections((current) => ({ ...current, [openModel.id]: selection }));
    Toast.success(t('console.enterprise.model.visibility.saved'));
  }
  const directoryItems = useMemo(
    () => (data?.items ?? []) as DirectoryModel[],
    [data],
  );
  return (
    <section
      className="enterprise-models-directory"
      aria-labelledby="enterpriseModelsDirectoryTitle"
    >
      <div className="enterprise-models-directory-head">
        <h2 id="enterpriseModelsDirectoryTitle">
          {t('console.enterprise.model.systemModels')}
        </h2>
      </div>
      {actionError ? (
        <div className="enterprise-models-action-error" role="alert">
          <span>{actionError.message}</span>
          {actionError.requestId ? (
            <small>
              {t('console.common.requestIdValue', {
                requestId: actionError.requestId,
              })}
            </small>
          ) : null}
          <EnterpriseRefreshButton
            onClick={() => setReloadToken((value) => value + 1)}
            label={t('console.enterprise.model.refreshDirectory')}
          />
        </div>
      ) : null}
      {error && !data ? (
        <EnterpriseError
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReloadToken((value) => value + 1)}
        />
      ) : loading && !data ? (
        <EnterpriseLoading label={t('console.enterprise.model.loading')} />
      ) : (
        <ModelsTable
          items={directoryItems}
          canManage={canManage}
          savingModelID={savingModelID}
          scopes={scopes}
          onToggle={(model) => {
            void toggleModel(model);
          }}
          onOpenVisibility={setOpenModel}
        />
      )}
      {openModel ? (
        <ModelVisibilityDialog
          model={openModel}
          initialScope={scopes[openModel.id] ?? 'all'}
          initialSelection={
            selections[openModel.id] ?? { departments: [], people: [] }
          }
          onClose={() => setOpenModel(null)}
          onSave={saveVisibility}
        />
      ) : null}
    </section>
  );
}

export function EnterpriseModelsPage() {
  const { t } = useTranslation();
  return (
    <EnterprisePageShell
      title={t('console.enterprise.model.pageTitle')}
      description=""
      capability="can_view_models"
      className="enterprise-models-page"
    >
      {(context) => <ModelsContent context={context} />}
    </EnterprisePageShell>
  );
}
