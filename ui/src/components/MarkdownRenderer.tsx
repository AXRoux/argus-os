// ═══════════════════════════════════════════════════════════════
// Markdown Renderer — Renders AI responses with proper formatting
// ═══════════════════════════════════════════════════════════════

import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MarkdownRendererProps = {
  content: string
}

export const MarkdownRenderer = memo<MarkdownRendererProps>(({ content }) => {
  return (
    <div className="assistant-response">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'
