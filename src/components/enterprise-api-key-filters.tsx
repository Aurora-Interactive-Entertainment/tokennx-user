import { useTranslation } from "react-i18next";
import { CompatSelect as Select } from "@/components/semi-compat";
import type {
  EnterpriseDepartment,
  EnterpriseMember,
} from "@/api/enterprise-console";
import { formatPersonOptionLabel } from "@/utils/format";
import "./enterprise-api-key-filters.css";

type EnterpriseApiKeyFiltersProps = {
  departmentID: string;
  memberID: string;
  departments: EnterpriseDepartment[];
  members: EnterpriseMember[];
  loading: boolean;
  errorMessage: string;
  onDepartmentChange: (departmentID: string) => void;
  onMemberChange: (memberID: string) => void;
  onMemberSearch: (keyword: string) => void;
};

export function EnterpriseApiKeyFilters({
  departmentID,
  memberID,
  departments,
  members,
  loading,
  errorMessage,
  onDepartmentChange,
  onMemberChange,
  onMemberSearch,
}: EnterpriseApiKeyFiltersProps) {
  const { t } = useTranslation();

  return (
    <div
      className="enterprise-api-key-filters"
      role="group"
      aria-label={t("console.account.enterpriseKeyFilters")}
    >
      <span className="enterprise-api-key-filter-label" id="enterprise-api-key-department-filter-label">
        {t("console.account.departmentFilter")}
      </span>
      <Select
        className="trae-select enterprise-api-key-filter-select"
        dropdownClassName="trae-select-dropdown trae-members-filter-dropdown enterprise-api-key-filter-dropdown"
        value={departmentID}
        loading={loading}
        aria-labelledby="enterprise-api-key-department-filter-label"
        onSelect={(value) => onDepartmentChange(String(value ?? "all"))}
      >
        <Select.Option value="all">
          {t("console.account.allDepartments")}
        </Select.Option>
        {departments.map((department) => (
          <Select.Option key={department.id} value={department.id}>
            {department.name}
          </Select.Option>
        ))}
      </Select>

      <span className="enterprise-api-key-filter-label" id="enterprise-api-key-member-filter-label">
        {t("console.account.memberFilter")}
      </span>
      <Select
        className="trae-select enterprise-api-key-filter-select enterprise-api-key-member-filter"
        dropdownClassName="trae-select-dropdown trae-members-filter-dropdown enterprise-api-key-filter-dropdown"
        value={memberID}
        loading={loading}
        filter
        searchPosition="dropdown"
        searchPlaceholder={t("console.account.memberSearch")}
        emptyContent={
          errorMessage || t("console.account.memberFilterEmpty")
        }
        aria-labelledby="enterprise-api-key-member-filter-label"
        onSearch={onMemberSearch}
        onSelect={(value) => onMemberChange(String(value ?? "all"))}
      >
        <Select.Option value="all">
          {t("console.account.allMembers")}
        </Select.Option>
        {members.map((member) => (
          <Select.Option key={member.id} value={member.id}>
            {formatPersonOptionLabel(member.display_name || member.user_id, member.masked_contact)}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}
