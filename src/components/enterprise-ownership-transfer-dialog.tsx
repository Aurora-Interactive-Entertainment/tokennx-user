import { useTranslation } from 'react-i18next'
import Button from '@douyinfe/semi-ui/lib/es/button'
import Input from '@douyinfe/semi-ui/lib/es/input'
import InputGroup from '@douyinfe/semi-ui/lib/es/input/inputGroup'
import Select from '@douyinfe/semi-ui/lib/es/select'
import SemiFormLabel from '@douyinfe/semi-ui/lib/es/form/label'
import '@douyinfe/semi-foundation/lib/es/form/form.css'
import AppModal from './app-modal'
import { useEnterpriseOwnershipTransfer, type EnterpriseOwnershipTransferProps } from './use-enterprise-ownership-transfer'
import './enterprise-ownership-transfer.css'

/** 在标准弹窗内完成必填校验并直接提交转让，提交中锁定表单。 */
export function EnterpriseOwnershipTransferDialog(props: EnterpriseOwnershipTransferProps) {
  const { t } = useTranslation()
  const flow = useEnterpriseOwnershipTransfer(props)
  const text = (key: string) => t(`console.ownershipTransfer.${key}`)
  const hasContact = flow.profile?.phone.bound || flow.profile?.email.bound
  const fieldDisabled = flow.busy || !flow.canTransfer
  return <AppModal
    visible={props.visible} title={text('title')} width={560}
    className="enterprise-ownership-modal" maskClosable={!flow.busy} closable={!flow.busy} closeOnEsc={!flow.busy}
    onCancel={() => { if (!flow.busy) props.onClose() }}
    footer={<div className="enterprise-ownership-footer">
      <Button theme="outline" type="tertiary" disabled={flow.busy} onClick={props.onClose}>{text('cancel')}</Button>
      <Button theme="solid" type="primary" loading={flow.saving} disabled={flow.busy || !flow.canTransfer || !hasContact || !flow.targets.length || flow.refreshNeeded}
        onClick={() => { void flow.submit() }}>{text('confirm')}</Button>
    </div>}
  >
    <div className="enterprise-ownership-content">
      {!flow.canTransfer && <p role="status">{text('unavailable')}</p>}
      {flow.refreshNeeded && <Button theme="outline" loading={flow.refreshing} disabled={flow.busy} onClick={() => { void flow.refresh() }}>{text('retry')}</Button>}
      <div className="enterprise-ownership-field">
        <SemiFormLabel id="ownership-target-label" name="ownership-target" required>{text('target')}</SemiFormLabel>
        <Select id="ownership-target" aria-labelledby="ownership-target-label" filter value={flow.targetId || undefined} placeholder={text('targetPlaceholder')}
          aria-required="true" aria-invalid={Boolean(flow.targetError)} aria-describedby={flow.targetError ? 'ownership-target-error' : undefined}
          validateStatus={flow.targetError ? 'error' : 'default'} onBlur={() => flow.validateField('target')}
          disabled={fieldDisabled || !flow.targets.length} onChange={(value) => flow.setTargetId(String(value ?? ''))}
          optionList={flow.targets.map((member) => ({ value: member.id, label: `${member.display_name}${member.masked_contact ? ` · ${member.masked_contact}` : ''}` }))} />
        {flow.targetError && <span className="enterprise-ownership-field-error" id="ownership-target-error" role="alert">{flow.targetError}</span>}
        {!flow.targets.length && <small>{text('noTargets')}</small>}
      </div>
      {flow.profileLoading ? <p role="status">{text('profileLoading')}</p> : !flow.profile ? <Button theme="outline" onClick={flow.reloadProfile}>{text('retry')}</Button> : !hasContact ? <p role="status">{text('noContact')}</p> : <>
        <div className="enterprise-ownership-field">
          <SemiFormLabel name="ownership-contact" required>{t('console.ownershipTransfer.contact', { provider: text(flow.provider) })}</SemiFormLabel>
          <span id="ownership-provider-label" hidden>{text('verification')}</span>
          {/* 复用 Semi 组合输入框，保持原有颜色、控件高度和校验样式。 */}
          <InputGroup className="enterprise-ownership-contact-group" disabled={fieldDisabled}>
            <Select id="ownership-provider" className="enterprise-ownership-provider" aria-labelledby="ownership-provider-label" value={flow.provider}
              validateStatus={flow.contactError ? 'error' : 'default'} dropdownMatchSelectWidth={false}
              renderSelectedItem={() => text(flow.provider)}
              onChange={(value) => flow.changeContact(value === 'email' ? 'email' : 'phone')}
              optionList={(['phone', 'email'] as const).filter((provider) => flow.profile?.[provider].bound).map((provider) => ({ value: provider, label: `${text(provider)} · ${flow.profile?.[provider].masked_identifier}` }))} />
            <Input id="ownership-contact" value={flow.destination} type={flow.provider === 'email' ? 'email' : 'tel'} autoComplete={flow.provider === 'email' ? 'email' : 'tel-national'}
              required aria-required="true" aria-invalid={Boolean(flow.contactError)} aria-describedby={flow.contactError ? 'ownership-contact-error' : undefined}
              validateStatus={flow.contactError ? 'error' : 'default'} onBlur={() => flow.validateField('contact')}
              placeholder={text(`${flow.provider}Placeholder`)} onChange={(value) => flow.changeContact(flow.provider, value)} />
          </InputGroup>
          {flow.contactError && <span className="enterprise-ownership-field-error" id="ownership-contact-error" role="alert">{flow.contactError}</span>}
        </div>
        <div className="enterprise-ownership-field">
          <SemiFormLabel name="ownership-code" required>{text('code')}</SemiFormLabel>
          <div className="enterprise-ownership-code-row">
            <Input id="ownership-code" value={flow.code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={fieldDisabled} placeholder={text('codePlaceholder')} onChange={flow.setCode}
              required aria-required="true" aria-invalid={Boolean(flow.codeError)} aria-describedby={flow.codeError ? 'ownership-code-error' : undefined}
              validateStatus={flow.codeError ? 'error' : 'default'} onBlur={() => flow.validateField('code')} />
            <Button theme="outline" loading={flow.sending} disabled={fieldDisabled || flow.retryAfter > 0} onClick={() => { void flow.sendCode() }}>{flow.retryAfter > 0 ? t('console.ownershipTransfer.retryAfter', { seconds: flow.retryAfter }) : text('sendCode')}</Button>
          </div>
          {flow.codeError && <span className="enterprise-ownership-field-error" id="ownership-code-error" role="alert">{flow.codeError}</span>}
        </div>
      </>}
      <p className="enterprise-ownership-notice">{text('consequences')}</p>
    </div>
  </AppModal>
}

