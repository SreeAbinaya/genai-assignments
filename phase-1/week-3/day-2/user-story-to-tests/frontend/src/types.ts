export interface GenerateRequest {
  storyTitle: string
  acceptanceCriteria: string
  description?: string
  additionalInfo?: string
}

export interface TestCase {
  id: string
  title: string
  steps: string[]
  testData?: string
  expectedResult: string
  category: string
}

export interface GenerateResponse {
  cases: TestCase[]
  model?: string
  promptTokens: number
  completionTokens: number
}

export interface GenerateFeatureResponse {
  featureContent: string
  model?: string
  promptTokens: number
  completionTokens: number
}

export interface JiraCredentials {
  baseUrl: string
  email: string
  apiKey: string
}

export interface JiraUserStory {
  id: string
  key: string
  title: string
  description?: string
  acceptanceCriteria?: string
}

export interface JiraUserStoriesResponse {
  stories: JiraUserStory[]
}