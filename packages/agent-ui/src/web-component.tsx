import React from 'react'
import { createRoot } from 'react-dom/client'
import { AgentChatProvider } from './runtime/AgentChatProvider'
import { FloatingChatWrapper } from './components/chat-wrapper/FloatingChatWrapper'
import type { AgentChatDataSource, AgentInfo, SessionSummary } from './components/chat-wrapper/types'
// Tailwind is bundled via vite if we import the css here
import './styles/input.css'

class ZetesisChatElement extends HTMLElement {
  private root: ReturnType<typeof createRoot> | null = null

  connectedCallback() {
    this.render()
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
  }

  static get observedAttributes() {
    return ['endpoint', 'ticket', 'agent-slug']
  }

  attributeChangedCallback() {
    this.render()
  }

  private render() {
    if (!this.root) {
      this.root = createRoot(this)
    }

    const endpoint = this.getAttribute('endpoint')
    const ticket = this.getAttribute('ticket')
    const agentSlug = this.getAttribute('agent-slug')

    if (!endpoint || !ticket || !agentSlug) {
      this.root.render(<div>Missing required attributes for zetesis-chat</div>)
      return
    }

    // A mock data source for the v0 PoC embed, since we don't have historical cross-origin
    // sessions implemented yet. We just return the current agent.
    const mockDataSource: AgentChatDataSource = {
      getAgents: async (): Promise<AgentInfo[]> => [
        { id: 1, slug: agentSlug, title: 'Support Agent' }
      ],
      getRecentSessions: async (): Promise<SessionSummary[]> => [],
      getSession: async () => {
        throw new Error('Not implemented in embed')
      },
      renameSession: async () => {},
      deleteSession: async () => {}
    }

    this.root.render(
      <React.StrictMode>
        <AgentChatProvider
          endpoint={endpoint}
          agentSlug={agentSlug}
          headers={{ Authorization: `Bearer ${ticket}` }}
        >
          <FloatingChatWrapper
            dataSource={mockDataSource}
            defaultAgentSlug={agentSlug}
          />
        </AgentChatProvider>
      </React.StrictMode>
    )
  }
}

if (!customElements.get('zetesis-chat')) {
  customElements.define('zetesis-chat', ZetesisChatElement)
}
