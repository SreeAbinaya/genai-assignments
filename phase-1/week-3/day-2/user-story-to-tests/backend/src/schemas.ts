import { z } from 'zod'

export const GenerateRequestSchema = z.object({
  storyTitle: z.string().min(1, 'Story title is required'),
  acceptanceCriteria: z.string().min(1, 'Acceptance criteria is required'),
  description: z.string().optional(),
  additionalInfo: z.string().optional()
})

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.string()),
  testData: z.string().optional(),
  expectedResult: z.string(),
  category: z.string()
})

export const GenerateResponseSchema = z.object({
  cases: z.array(TestCaseSchema),
  model: z.string().optional(),
  promptTokens: z.number(),
  completionTokens: z.number()
})

export const GenerateFeatureResponseSchema = z.object({
  featureContent: z.string().min(1, 'Feature content is required'),
  model: z.string().optional(),
  promptTokens: z.number(),
  completionTokens: z.number()
})

export const JiraCredentialsSchema = z.object({
  baseUrl: z.string().url('Valid JIRA base URL is required'),
  email: z.string().email('Valid email is required'),
  apiKey: z.string().min(1, 'JIRA API key is required')
})

export const JiraUserStorySchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional()
})

export const JiraUserStoriesResponseSchema = z.object({
  stories: z.array(JiraUserStorySchema)
})

// Type exports
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type TestCase = z.infer<typeof TestCaseSchema>
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>
export type GenerateFeatureResponse = z.infer<typeof GenerateFeatureResponseSchema>
export type JiraCredentials = z.infer<typeof JiraCredentialsSchema>
export type JiraUserStory = z.infer<typeof JiraUserStorySchema>
export type JiraUserStoriesResponse = z.infer<typeof JiraUserStoriesResponseSchema>