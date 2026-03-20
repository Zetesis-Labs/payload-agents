import type { AgentConfig } from '@zetesis/payload-typesense'

export const defaultAgent: AgentConfig = {
  slug: 'assistant',
  name: 'Assistant',
  apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
  llmModel: process.env.GEMINI_API_KEY ? 'google/gemini-2.0-flash' : 'openai/gpt-4o-mini',
  systemPrompt:
    'You are a helpful assistant that answers questions based on the provided context. ' +
    'Always cite your sources when possible. If you cannot find relevant information in the context, say so.',
  searchCollections: ['posts_chunk'],
  kResults: 5,
  welcomeTitle: 'Hi! How can I help you?',
  welcomeSubtitle: 'Ask me anything about the content in this site.',
  suggestedQuestions: [
    {
      prompt: 'What topics are covered in the latest posts?',
      title: 'Latest topics',
      description: 'Explore recent content'
    }
  ]
}

export const agents: AgentConfig[] = [defaultAgent]
