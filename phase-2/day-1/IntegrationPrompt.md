Context:
Act as a Senior AI Solutions Architect and design a detailed integration architecture and implementation plan for integrating Moderation layer refereing the Postman collection AI-shield.postman_Collection.json

The Moderation Layer acts as a mandatory validation gateway between the Test Case Generator and the LLM. Every user request must be validated by the Moderation Layer before it is sent to the LLM for test case generation.

The Moderation Layer must be configurable through an environment variable so that the integration can be enabled or disabled based on the deployment environment.

Instructions

[MANDATORY] Analyze the Postman collection AI-shield.postman_Collection.json before starting the implementation.

[MANDATORY] Use the API contracts available in the Postman collection as the source of truth. Do not assume or create new API endpoints, request fields, or response fields unless they are explicitly required and documented.

[MANDATORY] When MODERATION_ENABLED=true, invoke the following endpoint before every request to the LLM:

POST /api/moderate

[MANDATORY] If the Moderation Layer response indicates that the content is ALLOW, ALLOWED, or the equivalent value defined in the Postman API contract:

Allow the request to proceed.
Send the approved content to the LLM.
Continue with the existing test case generation workflow.
Generate the test cases.
Return the generated test cases to the user.

Expected flow:

Moderation Decision: ALLOW
    ↓
Proceed with LLM Request
    ↓
Generate Test Cases
    ↓
Return Generated Test Cases

[MANDATORY] Use the exact decision field and allowed value available in the Moderation Layer API response. Do not assume the response property name.

If the Moderation Layer response indicates that the action or decision is BLOCK, BLOCKED, or the equivalent value defined in the Postman API contract:

Immediately stop request processing.
Do not initiate a request to the LLM.
Do not generate test cases.
Extract the moderation reason from the API response.
Extract all relevant detector details from the API response.
Return a structured response to the UI.
Display a user-friendly error message.

[MANDATORY] There must be no code path through which blocked content can reach the LLM.

Expected flow:

Moderation Decision: BLOCK
    ↓
Stop Request Processing
    ↓
LLM Invocation: Not Allowed
    ↓
Extract Moderation Reason
    ↓
Extract Detector Details
    ↓
Return Structured Error Response
    ↓
Display User-Friendly Message

Suggested user-facing message:

Your request could not be processed because the submitted content did not meet the content validation requirements. Review the detected issue, update the content, and try again.

[MANDATORY] Do not expose internal system information, detector implementation logic, security rules, stack traces, or sensitive information to the user.

[MANDATORY] - For every blocked request, display the moderation reason along with the detector details returned by the Moderation Layer.

The UI must display:

Moderation status
Moderation decision/action
User-friendly reason
Detector name
Detector category
Detector result
Relevant validation details returned by the API
Recommended next action

Example:

Request Blocked

Your request could not be processed because the content did not meet the validation requirements.

Reason:
Sensitive information was detected in the submitted content.

Detector:
Secret Detector

Recommended Action:
Remove API keys, passwords, access tokens, or other sensitive information and submit the request again.

[MANDATORY] Display only the detector information available in the Moderation Layer API response.

[MANDATORY] Do not generate detector names, reasons, categories, or recommendations that are not supported by the API response.

[MANDATORY] If multiple detectors cause the request to be blocked, display all relevant detector details in a clear and readable format.

[MANDATORY] Create a standardized backend response for blocked requests.

Example:

{
  "success": false,
  "code": "CONTENT_BLOCKED",
  "message": "Your request could not be processed because the submitted content did not meet the content validation requirements.",
  "moderation": {
    "action": "BLOCK",
    "reason": "<reason returned by the Moderation Layer>",
    "detectors": [
      {
        "name": "<detector name>",
        "category": "<detector category>",
        "details": "<safe detector details>"
      }
    ]
  }
}

[MANDATORY] Update this structure based on the actual response fields identified in AI-shield.postman_Collection.json.

[MANDATORY] Preserve the existing Test Case Generator API response structure wherever possible to avoid breaking existing UI functionality.
