import { PublicLayout } from '@/components/common'
import { MarkdownContent } from '@/components/markdown-content'
import privacyPolicyMarkdown from '@/content/legal/privacy-policy.md?raw'
import topUpAgreementMarkdown from '@/content/legal/top-up-agreement.md?raw'
import userAgreementMarkdown from '@/content/legal/user-agreement.md?raw'
import './legal.css'

export type LegalPageKind = 'terms' | 'privacy' | 'recharge'

const LEGAL_MARKDOWN: Record<LegalPageKind, string> = {
  terms: userAgreementMarkdown,
  privacy: privacyPolicyMarkdown,
  recharge: topUpAgreementMarkdown,
}

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  // Legal documents are static snapshots so agreement text cannot change during a visit.
  return (
    <PublicLayout mainClassName="legal-page">
      <article className="legal-page-article">
        <MarkdownContent className="docs-markdown" content={LEGAL_MARKDOWN[kind]} enhancedCodeBlocks />
      </article>
    </PublicLayout>
  )
}
