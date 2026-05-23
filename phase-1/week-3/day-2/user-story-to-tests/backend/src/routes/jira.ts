import express from 'express'
import fetch from 'node-fetch'
import {
  JiraCredentialsSchema,
  JiraUserStoriesResponseSchema,
  JiraUserStory
} from '../schemas'

export const jiraRouter = express.Router()

const JIRA_SEARCH_PATH = '/rest/api/3/search/jql'

const JIRA_SEARCH_BODY = {
  jql: 'project = UserStories AND issuetype = Story',
  fields: ['key', 'summary', 'description', 'status', 'reporter']
}

function extractAdfText(node: unknown): string {
  if (!node) {
    return ''
  }

  if (typeof node === 'string') {
    return node
  }

  if (typeof node !== 'object') {
    return ''
  }

  const n = node as { text?: string; content?: unknown[]; type?: string }

  if (typeof n.text === 'string') {
    return n.text
  }

  if (!Array.isArray(n.content)) {
    return ''
  }

  const separator = n.type === 'paragraph' ? '\n' : ' '
  return n.content.map(extractAdfText).filter(Boolean).join(separator).replace(/\n{2,}/g, '\n').trim()
}

function normalizeDescription(descriptionField: unknown): string {
  const text = extractAdfText(descriptionField)
  return text.trim()
}

function extractAcceptanceCriteria(description: string): string {
  const match = description.match(/acceptance\s*criteria[:\-\s]*([\s\S]*)/i)
  if (!match || !match[1]) {
    return ''
  }

  return match[1].trim()
}

jiraRouter.post('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const validation = JiraCredentialsSchema.safeParse(req.body)
    if (!validation.success) {
      res.status(400).json({
        error: `Validation error: ${validation.error.message}`
      })
      return
    }

    const baseUrl = validation.data.baseUrl.trim().replace(/\/+$/, '')
    const email = validation.data.email.trim()
    const apiKey = validation.data.apiKey.trim()

    const endpoint = `${baseUrl}${JIRA_SEARCH_PATH}`
    const authorization = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`

    const jiraResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authorization
      },
      body: JSON.stringify(JIRA_SEARCH_BODY)
    })

    if (!jiraResponse.ok) {
      const errorBody = await jiraResponse.text()

      if (jiraResponse.status === 401 || jiraResponse.status === 403) {
        res.status(401).json({
          error: 'JIRA authentication failed. Please verify base URL, email ID, and API key.'
        })
        return
      }

      res.status(502).json({
        error: `JIRA API request failed (${jiraResponse.status}): ${errorBody || jiraResponse.statusText}`
      })
      return
    }

    const data = await jiraResponse.json() as { issues?: Array<{ id?: string; key?: string; fields?: { summary?: string; description?: unknown } }> }

    const stories: JiraUserStory[] = (data.issues || []).map((issue) => {
      const description = normalizeDescription(issue.fields?.description)
      const acceptanceCriteria = extractAcceptanceCriteria(description)

      return {
        id: issue.id || '',
        key: issue.key || '',
        title: issue.fields?.summary || 'Untitled Story',
        description: description || undefined,
        acceptanceCriteria: acceptanceCriteria || undefined
      }
    }).filter((story) => !!story.id && !!story.key)

    const responsePayload = { stories }
    const responseValidation = JiraUserStoriesResponseSchema.safeParse(responsePayload)

    if (!responseValidation.success) {
      res.status(502).json({
        error: 'JIRA response mapping failed'
      })
      return
    }

    res.json(responseValidation.data)
  } catch (error) {
    console.error('Error fetching JIRA user stories:', error)
    res.status(500).json({
      error: 'Failed to fetch user stories from JIRA'
    })
  }
})
