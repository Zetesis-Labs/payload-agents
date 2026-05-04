import type { CollectionConfig } from 'payload'

export const buildDocumentsCollection = (slug: string): CollectionConfig => ({
  slug,
  admin: {
    useAsTitle: 'filename',
    group: 'Content',
    description: 'Documents parsed to markdown via LlamaParse.',
    defaultColumns: ['filename', 'parse_status', 'parsed_at']
  },
  upload: {
    staticDir: slug,
    mimeTypes: ['application/pdf']
  },
  fields: [
    {
      name: 'parse_action',
      type: 'ui',
      admin: {
        components: {
          Field: '@zetesis/payload-documents/client#ParseButtonField'
        }
      }
    },
    {
      name: 'parse_status',
      type: 'select',
      defaultValue: 'idle',
      options: [
        { label: 'Idle', value: 'idle' },
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Done', value: 'done' },
        { label: 'Error', value: 'error' }
      ],
      admin: {
        readOnly: true,
        position: 'sidebar'
      }
    },
    {
      name: 'parse_job_id',
      type: 'text',
      admin: {
        readOnly: true,
        position: 'sidebar'
      }
    },
    {
      name: 'parsed_at',
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime'
        }
      }
    },
    {
      name: 'parse_error',
      type: 'textarea',
      admin: {
        readOnly: true,
        condition: (data: Record<string, unknown> | undefined) => data?.parse_status === 'error'
      }
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Params',
          fields: [
            {
              name: 'language',
              type: 'text',
              admin: {
                description: 'Optional language hint for OCR (e.g. "es", "en").'
              }
            },
            {
              name: 'mode',
              type: 'select',
              defaultValue: 'parse_page_with_llm',
              options: [
                // Page-level modes (one prompt per page, faster + cheaper)
                { label: 'Page · without LLM (cheapest, OCR only)', value: 'parse_page_without_llm' },
                { label: 'Page · with LLM (default, balanced)', value: 'parse_page_with_llm' },
                { label: 'Page · with LVM (vision, premium)', value: 'parse_page_with_lvm' },
                { label: 'Page · with agent', value: 'parse_page_with_agent' },
                { label: 'Page · with layout agent', value: 'parse_page_with_layout_agent' },
                // Document-level modes (whole-doc context, slower + more thorough)
                { label: 'Document · with LLM', value: 'parse_document_with_llm' },
                { label: 'Document · with LVM (vision)', value: 'parse_document_with_lvm' },
                { label: 'Document · with agent (highest quality)', value: 'parse_document_with_agent' }
              ],
              admin: {
                description:
                  'LlamaParse mode passed as `parse_mode`. Page-level is fast + per-page; document-level is slower but reasons across the whole doc. See https://docs.cloud.llamaindex.ai/llamaparse/parameters/parse_mode'
              }
            },
            {
              name: 'parsing_instruction',
              type: 'textarea',
              admin: {
                description: 'Free-form instruction to guide LlamaParse (e.g. "preserve tables").'
              }
            }
          ]
        },
        {
          label: 'Output',
          fields: [
            {
              name: 'parsed_text',
              type: 'code',
              admin: {
                language: 'markdown',
                description: 'Markdown returned by LlamaParse. Editable.'
              }
            }
          ]
        }
      ]
    }
  ]
})
