import type { CollectionConfig } from 'payload'

export const buildDocumentsCollection = (slug: string): CollectionConfig => ({
  slug,
  admin: {
    useAsTitle: 'filename',
    group: 'Content',
    description: 'Documents parsed to markdown via LlamaParse.'
  },
  upload: {
    staticDir: slug,
    mimeTypes: ['application/pdf']
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Parsing',
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
            }
          ]
        },
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
              defaultValue: 'default',
              options: [
                { label: 'Fast', value: 'fast' },
                { label: 'Default', value: 'default' },
                { label: 'Premium', value: 'premium' }
              ],
              admin: {
                description: 'Speed vs. quality. Premium enables enhanced OCR.'
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
