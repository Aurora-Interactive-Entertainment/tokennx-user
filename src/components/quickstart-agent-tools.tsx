import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { publicPath } from '@/routes/public-path'
import chatGptLogo from '@lobehub/icons-static-svg/icons/openai.svg'
import codeBuddyLogo from '@lobehub/icons-static-svg/icons/codebuddy-color.svg'
import hermesLogo from '@lobehub/icons-static-svg/icons/hermesagent.svg'
import kiloCodeLogo from '@lobehub/icons-static-svg/icons/kilocode.svg'
import cherryStudioLogo from '@lobehub/icons-static-svg/icons/cherrystudio-color.svg'
import openCodeLogo from '@/assets/ai-tools/opencode.svg'
import workBuddyLogo from '@/assets/ai-tools/workbuddy.svg'
import cursorLogo from '@/assets/ai-tools/cursor.svg'
import traeLogo from '@/assets/ai-tools/trae.svg'
import './quickstart-agent-tools.css'

// 与使用指南「开发工具」顺序一致，文档位置变化时由文档页回退到使用指南。
const AGENT_TOOLS = [
  { id: 'chatGpt', logo: chatGptLogo, monochrome: true, document: '01M074Z9VZ3ZVE60PRQYNFDVEQ/chatgpt' },
  { id: 'openCodeDesktop', logo: openCodeLogo, monochrome: true, document: '01M074Z9VZCQHJJYXD38M8C6QD/opencode-desktop' },
  { id: 'workBuddy', logo: workBuddyLogo, monochrome: false, document: '01M074Z9VZA7TN69HNMJG6BAY1/workbuddy' },
  { id: 'codeBuddy', logo: codeBuddyLogo, monochrome: false, document: '01M074Z9VZJ64B7AMDSAANE0X9/codebuddy' },
  { id: 'cursor', logo: cursorLogo, monochrome: true, document: '01M074Z9VZQAKBA72757SS2J1Y/cursor' },
  { id: 'hermesAgent', logo: hermesLogo, monochrome: true, document: '01M074Z9VZDTQ59SB7F80TW1GP/hermes-agent' },
  { id: 'kiloCode', logo: kiloCodeLogo, monochrome: true, document: '01M074Z9VZZFYDP7W07HQW8MHG/kilo-code' },
  { id: 'cherryStudio', logo: cherryStudioLogo, monochrome: false, document: '01M074Z9VZRFKCX72EKCTBBK87/cherry-studio' },
  { id: 'trae', logo: traeLogo, monochrome: false, document: '01M074Z9VZ7XNKVXWESFPA1PR6/trae' },
] as const

function ToolLogo({ tool }: { tool: typeof AGENT_TOOLS[number] }) {
  return <img className={`quickstart-pdf-agent-tool-icon${tool.monochrome ? ' is-monochrome' : ''}`} src={tool.logo} alt="" aria-hidden="true" />
}

export function QuickstartAgentTools() {
  const { t, i18n } = useTranslation()
  const [selectedTool, setSelectedTool] = useState<string>('workBuddy')
  const tool = AGENT_TOOLS.find((item) => item.id === selectedTool) ?? AGENT_TOOLS[0]
  return <div className="quickstart-pdf-agent-tools">
    <div className="quickstart-pdf-agent-tool-tabs" role="tablist" aria-label={t('console.quickstart.agentTools.title')}>
      {AGENT_TOOLS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={selectedTool === item.id} className={selectedTool === item.id ? 'is-active' : ''} onClick={() => setSelectedTool(item.id)}>
        <ToolLogo tool={item} />
        <span>{t(`console.quickstart.agentTools.${item.id}`)}</span>
      </button>)}
    </div>
    <div className="quickstart-pdf-agent-tool-content" role="tabpanel">
      <h3><ToolLogo tool={tool} />{t(`console.quickstart.agentTools.${tool.id}`)}</h3>
      <p>{t('console.quickstart.agentTools.description')}</p>
      <Link to={publicPath(`/docs/${tool.document}`, i18n.resolvedLanguage ?? i18n.language)} state={{ quickstartUsageGuide: true }}>{t('console.quickstart.agentTools.viewDocs')} ↗</Link>
    </div>
  </div>
}
