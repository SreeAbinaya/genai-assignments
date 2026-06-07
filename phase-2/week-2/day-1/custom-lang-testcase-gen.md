Context:You are a Frontend developer who is going to build a web page for a Test case Generator.

I have already the Langflow created and running in my local. I want you to use the Langflow Chat Interface for building the Tool.

I need to give the input in Embed Langflow chat interface and it should connect using can link which is given below and provide the output.INSTRUCTION

1) [CRITICAL] - Embed the Langflow chat interface for Testcase generation at top right with proper css styling and also proper alignment .
<script src="https://cdn.jsdelivr.net/gh/langflow-ai/langflow-embedded-chat@main/dist/build/static/js/bundle.min.js"></script>
with host_url,flow_id and API Key
host_url="http://localhost:7860"
flow_id="b395702a-9bc0-4a7b-94da-9a0a9597baf7"
api_key="sk-khRGYF7basHvsc_TGA5dpf-tw4KzVb7_vYyddMYEE2Q"

2) [MANDATORY] - Add Heading of the Tool as KYRO TEST GEN - AI POWERED TESTCASE GENERATOR
3) [MANDATORY] Chat has to be opened by default and the chat window should be from top of the screen to bottom with the default width
4) [MANDTORY] Give the user friendly instructions on how to use the Testcase Generator in the left side of the page
5) [MANDATORY] Give an option to copy paste the sample user stories for the user.
6) [MANDATORY] Implement clear option to clear the chat
7) [MANDATORY] Implement copy option to copy the chat output
8) [MANDATORY] Add a button to download the results as a excel file
9) [MANDATORY] Add Proper scrolling options with scroll bars
10) [MANDATORY] Add Thinking when you are generatiing the output
11) [MANDATORY] I want you to use rgb(12, 35, 64), rgb(255, 255, 255) as theme for the HTML page;  Use this background colour for the header kind of thing. background-color: rgb(12, 35, 64);Text as color: rgb(255, 255, 255); when the background is  rgb(255, 255, 255) use this text colour rgb(12, 35, 64)
12) [MANDATORY] - Have the request and response in the light shades of blue which co ordinates with the theme colour.
13) [MANDATORY] - Give the chat name as Kyro QA Genie
14) [MANDATORY] - Create all these requirements as fully functional single
-page HTML UI for an AI-powered Testcase Generator


Example:
Sample Banking Domain User Stories to include:
1. As a customer, I want to transfer funds between my accounts so that I can manage my money efficiently.
2. As a customer, I want to view my transaction history for the last 90 days so that I can track my spending.

Output:
1)All HTML structure in one file
2)The Langflow chat widget script and embed configuration
3)No external dependencies except the Langflow CDN script