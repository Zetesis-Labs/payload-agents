import r2wc from '@r2wc/react-to-web-component'
import { AgentChatProvider, AgentThread } from '@zetesis/agent-ui'
import { type FC, useMemo } from 'react'
import shadowCss from './styles.css?inline'

interface Props {
  endpoint?: string
  agentSlug?: string
  agentName?: string
  authToken?: string
  welcomeTitle?: string
  welcomeSubtitle?: string
}

const ChatRoot: FC<Props> = ({
  endpoint,
  agentSlug,
  agentName,
  authToken,
  welcomeTitle,
  welcomeSubtitle
}) => {
  const headers = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken]
  )

  if (!endpoint || !agentSlug) {
    return (
      <div style={{ padding: 16, color: '#666' }}>
        <strong>&lt;zetesis-agent-chat&gt;</strong> requires <code>endpoint</code> and{' '}
        <code>agent-slug</code>.
      </div>
    )
  }

  return (
    <>
      <style>{shadowCss}</style>
      <div className="flex h-full w-full flex-col bg-background text-foreground">
        <AgentChatProvider
          endpoint={endpoint}
          agentSlug={agentSlug}
          agentName={agentName}
          headers={headers}
        >
          <AgentThread welcomeTitle={welcomeTitle} welcomeSubtitle={welcomeSubtitle} />
        </AgentChatProvider>
      </div>
    </>
  )
}

const WebComponent = r2wc(ChatRoot, {
  shadow: 'open',
  props: {
    endpoint: 'string',
    agentSlug: 'string',
    agentName: 'string',
    authToken: 'string',
    welcomeTitle: 'string',
    welcomeSubtitle: 'string'
  }
})

if (typeof customElements !== 'undefined' && !customElements.get('zetesis-agent-chat')) {
  customElements.define('zetesis-agent-chat', WebComponent)
}

export {}
