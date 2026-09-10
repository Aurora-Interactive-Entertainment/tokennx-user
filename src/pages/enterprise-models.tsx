import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '@douyinfe/semi-ui/lib/es/button';
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
  getAllEnterpriseMembers,
  getEnterpriseDepartments,
  getEnterpriseModels,
  updateEnterpriseModel,
  type EnterpriseContext,
  type EnterpriseDepartment,
  type EnterpriseMember,
  type EnterpriseModel,
  type EnterpriseModelPage,
} from '@/api/enterprise-console';
import { isApiError } from '@/api/http';
import {
  EnterpriseError,
  EnterpriseLoading,
  EnterprisePageShell,
  useEnterpriseErrorHandler,
  type EnterpriseRequestError,
} from './enterprise-console-shared';
import AppModal from '@/components/app-modal';
import { appToast } from '@/components/app-toast';
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
type VisibilityPerson = { id: string; name: string; email: string };
type VisibilitySelection = { departments: string[]; people: string[] };

const PAGE_SIZE = 10;

// 模型目录为分页接口；页面需要完整目录来避免隐藏可管理模型。
async function loadAllEnterpriseModels(
  context: EnterpriseContext,
  signal: AbortSignal,
): Promise<EnterpriseModelPage> {
  const first = await getEnterpriseModels(
    { enterprise_id: context.id },
    { page: 1, page_size: PAGE_SIZE, include_disabled: true, signal },
  );
  const items = [...(Array.isArray(first.items) ? first.items : [])];
  const total = Number(first.total) || items.length;
  let page = 2;
  // 以请求 page_size 计算上限，且保留空页短路，避免异常服务端响应导致死循环。
  while (items.length < total && page <= Math.ceil(total / PAGE_SIZE)) {
    const next = await getEnterpriseModels(
      { enterprise_id: context.id },
      { page, page_size: PAGE_SIZE, include_disabled: true, signal },
    );
    const nextItems = Array.isArray(next.items) ? next.items : [];
    items.push(...nextItems);
    if (nextItems.length === 0) break;
    page += 1;
  }
  return { ...first, items };
}

function modelIcon(model: DirectoryModel): string {
  if (model.iconKey === 'deepseek') return 'DS';
  if (model.iconKey === 'minimax') return '〽';
  if (model.iconKey === 'kimi') return 'K';
  if (model.iconKey === 'qwen') return 'Q';
  if (model.iconKey === 'glm') return 'Z';
  return '◐';
}

function modelIconKey(model: EnterpriseModel): string | undefined {
  const identity = `${model.code} ${model.company}`.toLowerCase();
  if (identity.includes('deepseek')) return 'deepseek';
  if (identity.includes('minimax')) return 'minimax';
  if (identity.includes('kimi') || identity.includes('moonshot')) return 'kimi';
  if (identity.includes('qwen')) return 'qwen';
  if (identity.includes('glm') || identity.includes('智谱')) return 'glm';
  if (identity.includes('doubao') || identity.includes('volcengine')) return 'doubao';
  return undefined;
}

function normalizeDirectory(data: EnterpriseModelPage): EnterpriseModelPage {
  // 目录为空时如实展示空状态，不能注入本地演示模型覆盖后端结果。
  const items = (Array.isArray(data.items) ? data.items : []).map((item) => ({
    ...item,
    iconKey: modelIconKey(item),
  }));
  return {
    ...data,
    items,
    total: Number.isFinite(data.total) ? data.total : items.length,
    page_size: Number.isFinite(data.page_size) ? data.page_size : items.length,
    enabled_count: Number.isFinite(data.enabled_count)
      ? data.enabled_count
      : items.filter((item) => item.enabled).length,
    disabled_count: Number.isFinite(data.disabled_count)
      ? data.disabled_count
      : items.filter((item) => !item.enabled).length,
  };
}

async function loadVisibilityDepartments(
  context: EnterpriseContext,
  signal: AbortSignal,
): Promise<Department[]> {
  async function loadChildren(
    parentID: string | undefined,
    parentPath: string,
  ): Promise<Department[]> {
    const records: EnterpriseDepartment[] = [];
    let page = 1;
    let total = 0;
    do {
      const response = await getEnterpriseDepartments(
        { enterprise_id: context.id },
        { parent_id: parentID, page, page_size: 100, signal },
      );
      records.push(...(Array.isArray(response.items) ? response.items : []));
      total = Number.isFinite(response.total) ? response.total : records.length;
      if (!response.items?.length || records.length >= total) break;
      page += 1;
    } while (page <= Math.ceil(total / 100));

    return Promise.all(
      records.map(async (department) => {
        const path = parentPath
          ? `${parentPath}/${department.name}`
          : department.name;
        return {
          id: department.id,
          name: department.name,
          path,
          children: department.child_count > 0
            ? await loadChildren(department.id, path)
            : [],
        };
      }),
    );
  }

  // 根查询不传 parent_id，服务端返回一级部门；选择器再按 child_count 递归读取下级。
  return loadChildren(undefined, '');
}

async function loadVisibilityPeople(
  context: EnterpriseContext,
  signal: AbortSignal,
): Promise<VisibilityPerson[]> {
  const members: EnterpriseMember[] = await getAllEnterpriseMembers(
    { enterprise_id: context.id },
    { signal },
  );
  return members.map((member) => ({
    id: member.id,
    name: member.display_name || member.user_id,
    email: member.masked_contact || '',
  }));
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

function visibilitySelectionFromModel(model: EnterpriseModel): {
  scope: VisibilityScope;
  selection: VisibilitySelection;
} {
  const visibility = model.visibility;
  return {
    scope: visibility?.scope === 'partial' ? 'partial' : 'all',
    selection: {
      departments: Array.isArray(visibility?.departments)
        ? visibility.departments.map((item) => item.id)
        : [],
      people: Array.isArray(visibility?.members)
        ? visibility.members.map((item) => item.id)
        : [],
    },
  };
}

function visibilityUpdatePayload(
  scope: VisibilityScope,
  selection: VisibilitySelection,
): {
  visibility_scope: VisibilityScope;
  department_ids: string[];
  member_ids: string[];
} {
  return {
    visibility_scope: scope,
    // 服务端要求 all 范围显式传空数组，partial 范围传所选部门/成员公开 ID。
    department_ids: scope === 'partial' ? [...selection.departments] : [],
    member_ids: scope === 'partial' ? [...selection.people] : [],
  };
}

function modelVisibilityPayload(model: EnterpriseModel): {
  visibility_scope?: VisibilityScope;
  department_ids?: string[];
  member_ids?: string[];
} {
  if (!model.visibility) return {};
  return visibilityUpdatePayload(
    model.visibility.scope === 'partial' ? 'partial' : 'all',
    {
      departments: Array.isArray(model.visibility.departments)
        ? model.visibility.departments.map((item) => item.id)
        : [],
      people: Array.isArray(model.visibility.members)
        ? model.visibility.members.map((item) => item.id)
        : [],
    },
  );
}

function collectDepartments(node: Department): Department[] {
  return [node, ...(node.children ?? []).flatMap(collectDepartments)];
}

function SelectionSummary({
  selection,
  departments,
  people,
  onRemove,
  t,
}: {
  selection: VisibilitySelection;
  departments: Department[];
  people: VisibilityPerson[];
  onRemove: (kind: SelectionKind, id: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const selectedDepartments = departments
    .flatMap(collectDepartments)
    .filter((item) => selection.departments.includes(item.id));
  const selectedPeople = selection.people.map((id) => {
    const person = people.find((item) => item.id === id);
    return {
      id,
      name: person?.name ?? id,
      path: person?.email ?? '',
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
        {selectedDepartments.map((item) => (
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
        {selectedPeople.map((item) => (
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
  initialScope,
  initialSelection,
  departments,
  people,
  saving,
  onClose,
  onSave,
}: {
  initialScope: VisibilityScope;
  initialSelection: VisibilitySelection;
  departments: Department[];
  people: VisibilityPerson[];
  saving: boolean;
  onClose: () => void;
  onSave: (
    scope: VisibilityScope,
    selection: VisibilitySelection,
  ) => void | Promise<boolean | void>;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
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
  // 先切换 visible 触发 AppModal 的退出动画，动画结束后再卸载业务节点。
  function closeDialog(): void {
    setVisible(false);
  }
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
    ? people.filter((person) =>
        `${person.name} ${person.email}`.includes(query),
      )
    : people;
  return (
    <AppModal
      className="model-visibility-modal"
      visible={visible}
      width={800}
      height={560}
      motion
      title={t('console.enterprise.model.visibility.title')}
      maskClosable
      onCancel={closeDialog}
      afterClose={onClose}
      footer={
        <div className="model-visibility-footer">
          <Button
            theme="outline"
            type="tertiary"
            onClick={closeDialog}
          >
            {t('console.enterprise.model.visibility.cancel')}
          </Button>
          <Button
            theme="solid"
            type="primary"
            loading={saving}
            disabled={saving}
            onClick={async () => {
              if (scope === 'partial' && selection.departments.length === 0 && selection.people.length === 0) {
                Toast.warning(t('console.enterprise.model.visibility.partialRequired'));
                return;
              }
              const saved = await onSave(scope, selection);
              // 保存失败时保持弹窗打开，便于用户修正范围或重试；成功后再执行退出动画。
              if (saved !== false) closeDialog();
            }}
          >
            {t('console.enterprise.model.visibility.confirm')}
          </Button>
        </div>
      }
    >
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
                    departments.length > 0 ? departments.map((department) => (
                      <DepartmentNode
                        key={department.id}
                        node={department}
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
                    )) : (
                      <p className="model-visibility-empty">{t('console.enterprise.model.visibility.emptyDepartments')}</p>
                    )
                  ) : kind === 'person' ? (
                    visiblePeople.length > 0 ? (
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
                    ) : (
                      <p className="model-visibility-empty">{t('console.enterprise.model.visibility.emptyPeople')}</p>
                    )
                  ) : null}
                </div>
              </div>
            </div>
            <SelectionSummary
              selection={selection}
              departments={departments}
              people={people}
              onRemove={removeSelection}
              t={t}
            />
          </div>
          )}
    </AppModal>
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
  menuOpen,
  onToggle,
  onOpenVisibility,
  onMenuOpenChange,
}: {
  model: DirectoryModel;
  canManage: boolean;
  saving: boolean;
  scope: VisibilityScope;
  menuOpen: boolean;
  onToggle: (model: DirectoryModel) => void;
  onOpenVisibility: (model: DirectoryModel) => void;
  onMenuOpenChange: (modelID: string | null) => void;
}) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }
    function updateMenuPosition(): void {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // 菜单挂到 body 后按按钮右侧对齐，并固定显示在按钮下方。
      setMenuPosition({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen]);

  return (
    <div className="enterprise-model-state">
      <ModelScopeIndicator scope={scope} t={t} />
      {canManage ? (
        <div className="enterprise-model-actions">
          <button
            ref={triggerRef}
            type="button"
            className="enterprise-model-more"
            aria-label={t('console.enterprise.model.visibility.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => onMenuOpenChange(menuOpen ? null : model.id)}
          >
            <IconMore />
          </button>
          {menuOpen
            ? createPortal(
                <div
                  className="enterprise-model-menu"
                  role="menu"
                  style={{
                    top: menuPosition?.top ?? 0,
                    right: menuPosition?.right ?? 0,
                    visibility: menuPosition ? 'visible' : 'hidden',
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onMenuOpenChange(null);
                      onOpenVisibility(model);
                    }}
                  >
                    {t('console.enterprise.model.visibility.scopeAction')}
                  </button>
                </div>,
                document.body,
              )
            : null}
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
  const [openMenuModelID, setOpenMenuModelID] = useState<string | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('.enterprise-model-actions, .enterprise-model-menu')
      ) {
        return;
      }
      setOpenMenuModelID(null);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

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
                  menuOpen={openMenuModelID === model.id}
                  onToggle={onToggle}
                  onOpenVisibility={onOpenVisibility}
                  onMenuOpenChange={setOpenMenuModelID}
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
  const [savingModelID, setSavingModelID] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [openModel, setOpenModel] = useState<DirectoryModel | null>(null);
  const [scopes, setScopes] = useState<Record<string, VisibilityScope>>({});
  const [selections, setSelections] = useState<Record<string, VisibilitySelection>>({});
  const [visibilityDepartments, setVisibilityDepartments] = useState<Department[]>([]);
  const [visibilityPeople, setVisibilityPeople] = useState<VisibilityPerson[]>([]);

  // 错误只通过顶部 Toast 提示，避免错误内容进入页面流导致目录布局跳动。
  function notifyError(nextError: EnterpriseRequestError): void {
    const requestHint = nextError.requestId
      ? ` ${t('console.common.requestIdValue', { requestId: nextError.requestId })}`
      : '';
    appToast.error(`${nextError.message}${requestHint}`);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    loadAllEnterpriseModels(context, controller.signal)
      .then((result) => {
        if (!active) return;
        const normalized = normalizeDirectory(result);
        setData(normalized);
        // 可见范围以服务端目录为准；旧响应缺失 visibility 时按全员可见兼容。
        const nextScopes: Record<string, VisibilityScope> = {};
        const nextSelections: Record<string, VisibilitySelection> = {};
        normalized.items.forEach((model) => {
          const current = visibilitySelectionFromModel(model);
          nextScopes[model.id] = current.scope;
          nextSelections[model.id] = current.selection;
        });
        setScopes(nextScopes);
        setSelections(nextSelections);
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

  useEffect(() => {
    if (!openModel) return;
    const controller = new AbortController();
    let active = true;
    // 只在打开可见范围弹窗时读取目录，避免模型列表页额外发起成员/部门请求。
    void Promise.all([
      loadVisibilityDepartments(context, controller.signal),
      loadVisibilityPeople(context, controller.signal),
    ])
      .then(([departments, people]) => {
        if (!active) return;
        setVisibilityDepartments(departments);
        setVisibilityPeople(people);
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        const handled = handleError(reason);
        if (handled) notifyError(handled);
        // 目录失败时清空选择项，避免继续提交无法校验的本地演示 ID。
        setVisibilityDepartments([]);
        setVisibilityPeople([]);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [context.id, handleError, openModel]);

  async function toggleModel(model: DirectoryModel): Promise<void> {
    if (!canManage || savingModelID) return;
    setSavingModelID(model.id);
    try {
      const updated = await updateEnterpriseModel(
        { enterprise_id: context.id },
        model.id,
        {
          enabled: !model.enabled,
          ...modelVisibilityPayload(model),
          expected_version: model.setting_version,
        },
      );
      setData((previous) =>
        previous ? applyModelUpdate(previous, updated) : previous,
      );
      if (updated.visibility) {
        const current = visibilitySelectionFromModel(updated);
        setScopes((previous) => ({ ...previous, [updated.id]: current.scope }));
        setSelections((previous) => ({ ...previous, [updated.id]: current.selection }));
      }
      Toast.success(
        updated.enabled
          ? t('console.enterprise.model.updated')
          : t('console.enterprise.model.updateDisabled'),
      );
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (isApiError(reason) && reason.code === 140004) {
        Toast.warning(handled?.message ?? t('console.enterprise.model.conflict'));
        setReloadToken((value) => value + 1);
      } else if (handled) {
        notifyError(handled);
      }
    } finally {
      setSavingModelID('');
    }
  }
  async function saveVisibility(
    scope: VisibilityScope,
    selection: VisibilitySelection,
  ): Promise<boolean> {
    if (!openModel) return false;
    const currentModel = data?.items.find((item) => item.id === openModel.id) ?? openModel;
    setSavingModelID(currentModel.id);
    try {
      const updated = await updateEnterpriseModel(
        { enterprise_id: context.id },
        currentModel.id,
        {
          enabled: currentModel.enabled,
          ...visibilityUpdatePayload(scope, selection),
          expected_version: currentModel.setting_version,
        },
      );
      setData((previous) =>
        previous ? applyModelUpdate(previous, updated) : previous,
      );
      const next = updated.visibility
        ? visibilitySelectionFromModel(updated)
        : { scope, selection };
      setScopes((current) => ({ ...current, [currentModel.id]: next.scope }));
      setSelections((current) => ({ ...current, [currentModel.id]: next.selection }));
      Toast.success(t('console.enterprise.model.visibility.saved'));
      return true;
    } catch (reason: unknown) {
      const handled = handleError(reason);
      if (isApiError(reason) && reason.code === 140004) {
        Toast.warning(handled?.message ?? t('console.enterprise.model.conflict'));
        setReloadToken((value) => value + 1);
      } else if (handled) {
        notifyError(handled);
      }
      return false;
    } finally {
      setSavingModelID('');
    }
  }
  const directoryItems = useMemo(
    () => (data?.items ?? []) as DirectoryModel[],
    [data],
  );
  return (
    <section
      className="enterprise-models-directory"
      aria-label={t('console.enterprise.model.systemModels')}
    >
      {error && !data ? (
        <EnterpriseError
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setReloadToken((value) => value + 1)}
        />
      ) : loading && !data ? (
        <EnterpriseLoading label={t('console.enterprise.model.loading')} />
      ) : (
        directoryItems.length > 0 ? (
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
        ) : (
          <div className="enterprise-models-empty" role="status">
            {t('console.common.noModels')}
          </div>
        )
      )}
      {openModel ? (
        <ModelVisibilityDialog
          initialScope={scopes[openModel.id] ?? 'all'}
          initialSelection={
            selections[openModel.id] ?? { departments: [], people: [] }
          }
          departments={visibilityDepartments}
          people={visibilityPeople}
          saving={savingModelID === openModel.id}
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
