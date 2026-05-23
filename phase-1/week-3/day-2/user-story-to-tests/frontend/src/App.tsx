import { useState } from 'react'
import { generateFeatureFile, generateTests, viewJiraUserStories } from './api'
import { GenerateFeatureResponse, GenerateRequest, GenerateResponse, JiraCredentials, JiraUserStory, TestCase } from './types'

function App() {
  const [formData, setFormData] = useState<GenerateRequest>({
    storyTitle: '',
    acceptanceCriteria: '',
    description: '',
    additionalInfo: ''
  })
  const [results, setResults] = useState<GenerateResponse | null>(null)
  const [featureResult, setFeatureResult] = useState<GenerateFeatureResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [loadingMessage, setLoadingMessage] = useState<string>('Generating...')
  const [error, setError] = useState<string | null>(null)
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set())
  const [isJiraDialogOpen, setIsJiraDialogOpen] = useState<boolean>(false)
  const [jiraCredentials, setJiraCredentials] = useState<JiraCredentials>({
    baseUrl: '',
    email: '',
    apiKey: ''
  })
  const [jiraError, setJiraError] = useState<string | null>(null)
  const [jiraStatus, setJiraStatus] = useState<string | null>(null)
  const [isFetchingJiraStories, setIsFetchingJiraStories] = useState<boolean>(false)
  const [jiraStories, setJiraStories] = useState<JiraUserStory[]>([])
  const [isStoriesDialogOpen, setIsStoriesDialogOpen] = useState<boolean>(false)
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null)

  const toggleTestCaseExpansion = (testCaseId: string) => {
    const newExpanded = new Set(expandedTestCases)
    if (newExpanded.has(testCaseId)) {
      newExpanded.delete(testCaseId)
    } else {
      newExpanded.add(testCaseId)
    }
    setExpandedTestCases(newExpanded)
  }

  const handleInputChange = (field: keyof GenerateRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleJiraInputChange = (field: keyof JiraCredentials, value: string) => {
    setJiraCredentials(prev => ({ ...prev, [field]: value }))
  }

  const handleOpenJiraDialog = () => {
    setJiraError(null)
    setJiraStatus(null)
    setIsJiraDialogOpen(true)
  }

  const handleCloseJiraDialog = () => {
    setIsJiraDialogOpen(false)
    setJiraError(null)
    setJiraStatus(null)
    setJiraCredentials(prev => ({ ...prev, apiKey: '' }))
  }

  const validateJiraCredentials = (): string | null => {
    const { baseUrl, email, apiKey } = jiraCredentials

    if (!baseUrl.trim() || !email.trim() || !apiKey.trim()) {
      return 'Base URL, Email ID and JIRA API Key are required'
    }

    try {
      const parsed = new URL(baseUrl.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'JIRA Base URL must start with http:// or https://'
      }
    } catch {
      return 'Please provide a valid JIRA Base URL'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return 'Please provide a valid Email ID'
    }

    return null
  }

  const handleViewUserStories = async () => {
    const validationError = validateJiraCredentials()
    if (validationError) {
      setJiraError(validationError)
      setJiraStatus(null)
      return
    }

    setJiraError(null)
    setJiraStatus('Connecting to JIRA and fetching user stories...')
    setIsFetchingJiraStories(true)

    try {
      const result = await viewJiraUserStories({
        baseUrl: jiraCredentials.baseUrl.trim(),
        email: jiraCredentials.email.trim(),
        apiKey: jiraCredentials.apiKey.trim()
      })
      setJiraStories(result.stories)
      setSelectedStoryKey(null)
      setIsJiraDialogOpen(false)
      setIsStoriesDialogOpen(true)
    } catch (err) {
      setJiraError(err instanceof Error ? err.message : 'Failed to fetch user stories from JIRA')
      setJiraStatus(null)
    } finally {
      setIsFetchingJiraStories(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.storyTitle.trim() || !formData.acceptanceCriteria.trim()) {
      setError('Story Title and Acceptance Criteria are required')
      return
    }

    setIsLoading(true)
    setLoadingMessage('Generating test cases...')
    setError(null)
    
    try {
      const response = await generateTests(formData)
      setResults(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCloseStoriesDialog = () => {
    setIsStoriesDialogOpen(false)
    setSelectedStoryKey(null)
    setJiraStories([])
  }

  const handleUseSelectedStory = () => {
    const story = jiraStories.find((s) => s.key === selectedStoryKey)
    if (!story) return

    setFormData(prev => ({
      ...prev,
      storyTitle: story.title,
      description: story.description ?? ''
    }))

    setIsStoriesDialogOpen(false)
    setSelectedStoryKey(null)
    setJiraStories([])
  }

  const handleGenerateFeatureFile = async () => {
    if (!formData.storyTitle.trim() || !formData.acceptanceCriteria.trim()) {
      setError('Story Title and Acceptance Criteria are required')
      return
    }

    setIsLoading(true)
    setLoadingMessage('Generating feature file...')
    setError(null)

    try {
      const response = await generateFeatureFile(formData)
      setFeatureResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate feature file')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background-color: #f5f5f5;
          color: #333;
          line-height: 1.6;
        }
        
        .container {
          max-width: 95%;
          width: 100%;
          margin: 0 auto;
          padding: 20px;
          min-height: 100vh;
        }
        
        @media (min-width: 768px) {
          .container {
            max-width: 90%;
            padding: 30px;
          }
        }
        
        @media (min-width: 1024px) {
          .container {
            max-width: 85%;
            padding: 40px;
          }
        }
        
        @media (min-width: 1440px) {
          .container {
            max-width: 1800px;
            padding: 50px;
          }
        }
        
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        
        .title {
          font-size: 2.5rem;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        .subtitle {
          color: #666;
          font-size: 1.1rem;
        }
        
        .form-container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: #2c3e50;
        }
        
        .form-input, .form-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e1e8ed;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        
        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: #3498db;
        }
        
        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        
        .submit-btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .submit-btn:hover:not(:disabled) {
          background: #2980b9;
        }
        
        .submit-btn:disabled {
          background: #bdc3c7;
          cursor: not-allowed;
        }

        .button-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .jira-btn {
          background: #8e44ad;
        }

        .jira-btn:hover:not(:disabled) {
          background: #7d3c98;
        }

        .feature-btn {
          background: #2ecc71;
        }

        .feature-btn:hover:not(:disabled) {
          background: #27ae60;
        }
        
        .error-banner {
          background: #e74c3c;
          color: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 18px;
        }
        
        .results-container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .feature-container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }

        .feature-content {
          margin-top: 16px;
          background: #f8f9fa;
          border: 1px solid #e1e8ed;
          border-radius: 6px;
          padding: 16px;
          white-space: pre-wrap;
          font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
          font-size: 13px;
          overflow-x: auto;
        }
        
        .results-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e1e8ed;
        }
        
        .results-title {
          font-size: 1.8rem;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        .results-meta {
          color: #666;
          font-size: 14px;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        
        .results-table th,
        .results-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e1e8ed;
        }
        
        .results-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .results-table tr:hover {
          background: #f8f9fa;
        }
        
        .category-positive { color: #27ae60; font-weight: 600; }
        .category-negative { color: #e74c3c; font-weight: 600; }
        .category-edge { color: #f39c12; font-weight: 600; }
        .category-authorization { color: #9b59b6; font-weight: 600; }
        .category-non-functional { color: #34495e; font-weight: 600; }
        
        .test-case-id {
          cursor: pointer;
          color: #3498db;
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 4px;
          transition: background-color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .test-case-id:hover {
          background: #f8f9fa;
        }
        
        .test-case-id.expanded {
          background: #e3f2fd;
          color: #1976d2;
        }
        
        .expand-icon {
          font-size: 10px;
          transition: transform 0.2s;
        }
        
        .expand-icon.expanded {
          transform: rotate(90deg);
        }
        
        .expanded-details {
          margin-top: 15px;
          background: #fafbfc;
          border: 1px solid #e1e8ed;
          border-radius: 8px;
          padding: 20px;
        }
        
        .step-item {
          background: white;
          border: 1px solid #e1e8ed;
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .step-header {
          display: grid;
          grid-template-columns: 80px 1fr 1fr 1fr;
          gap: 15px;
          align-items: start;
        }
        
        .step-id {
          font-weight: 600;
          color: #2c3e50;
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          text-align: center;
          font-size: 12px;
        }
        
        .step-description {
          color: #2c3e50;
          line-height: 1.5;
        }
        
        .step-test-data {
          color: #666;
          font-style: italic;
          font-size: 14px;
        }
        
        .step-expected {
          color: #27ae60;
          font-weight: 500;
          font-size: 14px;
        }
        
        .step-labels {
          display: grid;
          grid-template-columns: 80px 1fr 1fr 1fr;
          gap: 15px;
          margin-bottom: 10px;
          font-weight: 600;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .jira-overlay {
          position: fixed;
          inset: 0;
          background: rgba(44, 62, 80, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .jira-dialog {
          width: 100%;
          max-width: 560px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 14px 48px rgba(0, 0, 0, 0.2);
          padding: 24px;
        }

        .jira-dialog-title {
          font-size: 1.5rem;
          color: #2c3e50;
          margin-bottom: 8px;
        }

        .jira-dialog-subtitle {
          color: #5f6b76;
          margin-bottom: 20px;
        }

        .jira-inline-error {
          background: #fdecea;
          color: #c0392b;
          border: 1px solid #f5c6cb;
          border-radius: 6px;
          padding: 10px 12px;
          margin-top: 12px;
        }

        .jira-inline-status {
          background: #eaf6ee;
          color: #1e824c;
          border: 1px solid #c6e8d2;
          border-radius: 6px;
          padding: 10px 12px;
          margin-top: 12px;
        }

        .dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }

        .secondary-btn {
          background: #ecf0f1;
          color: #2c3e50;
        }

        .secondary-btn:hover:not(:disabled) {
          background: #dfe6e9;
        }

        .stories-dialog {
          width: 100%;
          max-width: 680px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 14px 48px rgba(0, 0, 0, 0.2);
          padding: 24px;
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }

        .stories-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .stories-dialog-title {
          font-size: 1.5rem;
          color: #2c3e50;
        }

        .stories-count-badge {
          background: #8e44ad;
          color: white;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }

        .stories-dialog-subtitle {
          color: #5f6b76;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .stories-list {
          flex: 1;
          overflow-y: auto;
          max-height: 420px;
          border: 1px solid #e1e8ed;
          border-radius: 8px;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .story-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 2px solid #e1e8ed;
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          user-select: none;
        }

        .story-item:hover {
          border-color: #c39bd3;
          background: #faf5fd;
        }

        .story-item.selected {
          border-color: #8e44ad;
          background: #f5edfb;
        }

        .story-radio {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid #bdc3c7;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.15s;
        }

        .story-item.selected .story-radio {
          border-color: #8e44ad;
        }

        .story-radio-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8e44ad;
        }

        .story-key-badge {
          flex-shrink: 0;
          background: #eaf0fb;
          color: #2c5282;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          letter-spacing: 0.3px;
          font-family: Menlo, Monaco, Consolas, monospace;
        }

        .story-title-text {
          font-size: 14px;
          color: #2c3e50;
          line-height: 1.4;
          flex: 1;
        }

        .stories-empty {
          text-align: center;
          padding: 40px 20px;
          color: #95a5a6;
          font-size: 14px;
        }

        .use-story-btn {
          background: #8e44ad;
        }

        .use-story-btn:hover:not(:disabled) {
          background: #7d3c98;
        }
      `}</style>
      
      <div className="container">
        <div className="header">
          <h1 className="title">User Story to Tests</h1>
          <p className="subtitle">Generate comprehensive test cases from your user stories</p>
        </div>
        
        <form onSubmit={handleSubmit} className="form-container">
          <div className="form-group">
            <label htmlFor="storyTitle" className="form-label">
              Story Title *
            </label>
            <input
              type="text"
              id="storyTitle"
              className="form-input"
              value={formData.storyTitle}
              onChange={(e) => handleInputChange('storyTitle', e.target.value)}
              placeholder="Enter the user story title..."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              id="description"
              className="form-textarea"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Additional description (optional)..."
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="acceptanceCriteria" className="form-label">
              Acceptance Criteria *
            </label>
            <textarea
              id="acceptanceCriteria"
              className="form-textarea"
              value={formData.acceptanceCriteria}
              onChange={(e) => handleInputChange('acceptanceCriteria', e.target.value)}
              placeholder="Enter the acceptance criteria..."
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="additionalInfo" className="form-label">
              Additional Info
            </label>
            <textarea
              id="additionalInfo"
              className="form-textarea"
              value={formData.additionalInfo}
              onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
              placeholder="Any additional information (optional)..."
            />
          </div>
          
          <div className="button-row">
            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </button>
            <button
              type="button"
              className="submit-btn feature-btn"
              disabled={isLoading}
              onClick={handleGenerateFeatureFile}
            >
              {isLoading ? 'Generating...' : 'Generate Feature file'}
            </button>
            <button
              type="button"
              className="submit-btn jira-btn"
              disabled={isLoading}
              onClick={handleOpenJiraDialog}
            >
              Connect to JIRA
            </button>
          </div>
        </form>

        {isJiraDialogOpen && (
          <div className="jira-overlay" role="dialog" aria-modal="true" aria-labelledby="jira-dialog-title">
            <div className="jira-dialog">
              <h3 id="jira-dialog-title" className="jira-dialog-title">Connect to JIRA</h3>
              <p className="jira-dialog-subtitle">Enter your JIRA credentials to fetch user stories.</p>

              <div className="form-group">
                <label htmlFor="jiraBaseUrl" className="form-label">JIRA Base URL *</label>
                <input
                  type="url"
                  id="jiraBaseUrl"
                  className="form-input"
                  value={jiraCredentials.baseUrl}
                  onChange={(e) => handleJiraInputChange('baseUrl', e.target.value)}
                  placeholder="https://your-domain.atlassian.net"
                  autoComplete="url"
                />
              </div>

              <div className="form-group">
                <label htmlFor="jiraEmail" className="form-label">Email ID *</label>
                <input
                  type="email"
                  id="jiraEmail"
                  className="form-input"
                  value={jiraCredentials.email}
                  onChange={(e) => handleJiraInputChange('email', e.target.value)}
                  placeholder="qa.user@company.com"
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="jiraApiKey" className="form-label">JIRA API Key *</label>
                <input
                  type="password"
                  id="jiraApiKey"
                  className="form-input"
                  value={jiraCredentials.apiKey}
                  onChange={(e) => handleJiraInputChange('apiKey', e.target.value)}
                  placeholder="Enter JIRA API key"
                  autoComplete="off"
                />
              </div>

              {jiraError && <div className="jira-inline-error">{jiraError}</div>}
              {jiraStatus && <div className="jira-inline-status">{jiraStatus}</div>}

              <div className="dialog-actions">
                <button type="button" className="submit-btn secondary-btn" onClick={handleCloseJiraDialog} disabled={isFetchingJiraStories}>
                  Cancel
                </button>
                <button type="button" className="submit-btn jira-btn" onClick={handleViewUserStories} disabled={isFetchingJiraStories}>
                  {isFetchingJiraStories ? 'Fetching...' : 'View UserStories'}
                </button>
              </div>
            </div>
          </div>
        )}

        {isStoriesDialogOpen && (
          <div className="jira-overlay" role="dialog" aria-modal="true" aria-labelledby="stories-dialog-title">
            <div className="stories-dialog">
              <div className="stories-dialog-header">
                <h3 id="stories-dialog-title" className="stories-dialog-title">JIRA User Stories</h3>
                {jiraStories.length > 0 && (
                  <span className="stories-count-badge">{jiraStories.length} {jiraStories.length === 1 ? 'story' : 'stories'}</span>
                )}
              </div>
              <p className="stories-dialog-subtitle">Select a user story to load into the test generator.</p>

              <div className="stories-list">
                {jiraStories.length === 0 ? (
                  <div className="stories-empty">No user stories found in JIRA.</div>
                ) : (
                  jiraStories.map((story) => {
                    const isSelected = selectedStoryKey === story.key
                    return (
                      <div
                        key={story.key}
                        className={`story-item${isSelected ? ' selected' : ''}`}
                        onClick={() => setSelectedStoryKey(story.key)}
                        role="radio"
                        aria-checked={isSelected}
                      >
                        <div className="story-radio">
                          {isSelected && <div className="story-radio-dot" />}
                        </div>
                        <span className="story-key-badge">{story.key}</span>
                        <span className="story-title-text">{story.title}</span>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="dialog-actions">
                <button type="button" className="submit-btn secondary-btn" onClick={handleCloseStoriesDialog}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="submit-btn use-story-btn"
                  disabled={!selectedStoryKey}
                  onClick={handleUseSelectedStory}
                >
                  Use Selected Story
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="loading">
            {loadingMessage}
          </div>
        )}

        {featureResult && (
          <div className="feature-container">
            <div className="results-header">
              <h2 className="results-title">Generated Feature File</h2>
              <div className="results-meta">
                {featureResult.model && `Model: ${featureResult.model}`}
                {featureResult.promptTokens > 0 && ` • Tokens: ${featureResult.promptTokens + featureResult.completionTokens}`}
              </div>
            </div>
            <pre className="feature-content">{featureResult.featureContent}</pre>
          </div>
        )}

        {results && (
          <div className="results-container">
            <div className="results-header">
              <h2 className="results-title">Generated Test Cases</h2>
              <div className="results-meta">
                {results.cases.length} test case(s) generated
                {results.model && ` • Model: ${results.model}`}
                {results.promptTokens > 0 && ` • Tokens: ${results.promptTokens + results.completionTokens}`}
              </div>
            </div>
            
            <div className="table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Test Case ID</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Expected Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.cases.map((testCase: TestCase) => (
                    <>
                      <tr key={testCase.id}>
                        <td>
                          <div 
                            className={`test-case-id ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}
                            onClick={() => toggleTestCaseExpansion(testCase.id)}
                          >
                            <span className={`expand-icon ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}>
                              ▶
                            </span>
                            {testCase.id}
                          </div>
                        </td>
                        <td>{testCase.title}</td>
                        <td>
                          <span className={`category-${testCase.category.toLowerCase()}`}>
                            {testCase.category}
                          </span>
                        </td>
                        <td>{testCase.expectedResult}</td>
                      </tr>
                      {expandedTestCases.has(testCase.id) && (
                        <tr key={`${testCase.id}-details`}>
                          <td colSpan={4}>
                            <div className="expanded-details">
                              <h4 style={{marginBottom: '15px', color: '#2c3e50'}}>Test Steps for {testCase.id}</h4>
                              <div className="step-labels">
                                <div>Step ID</div>
                                <div>Step Description</div>
                                <div>Test Data</div>
                                <div>Expected Result</div>
                              </div>
                              {testCase.steps.map((step, index) => (
                                <div key={index} className="step-item">
                                  <div className="step-header">
                                    <div className="step-id">S{String(index + 1).padStart(2, '0')}</div>
                                    <div className="step-description">{step}</div>
                                    <div className="step-test-data">{testCase.testData || 'N/A'}</div>
                                    <div className="step-expected">
                                      {index === testCase.steps.length - 1 ? testCase.expectedResult : 'Step completed successfully'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App