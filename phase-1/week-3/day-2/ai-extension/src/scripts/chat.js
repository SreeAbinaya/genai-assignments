import { getPrompt } from '../scripts/prompts.js';

// Constants
const INITIAL_SYSTEM_MESSAGE = ``;

class ChatUI {
    constructor() {
        // Grab references
        this.messagesContainer     = document.getElementById('chatMessages');
        this.inputField            = document.getElementById('chatInput');
        this.sendButton            = document.getElementById('sendMessage');
        this.inspectorButton       = document.getElementById('inspectorButton');
        this.resetButton           = document.getElementById('resetChat');
        this.runTestButton         = document.getElementById('runTestButton');
        this.pushAndRunButton      = document.getElementById('pushAndRunButton');

        // Language / Browser dropdown

        // Language / Browser dropdown
        this.languageBindingSelect = document.getElementById('languageBinding');
        this.browserEngineSelect   = document.getElementById('browserEngine');

        // Additional states
        this.selectedDomContent    = null;
        this.isInspecting          = false;
        this.markdownReady         = false;
        this.codeGeneratorType     = 'SELENIUM_JAVA_PAGE_ONLY'; // default 
        this.tokenWarningThreshold = 10000;
        this.selectedModel         = '';
        this.selectedProvider      = '';
        this.generatedCode         = '';

        // Clear existing messages + add initial system message
        this.messagesContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
            </div>
        `;
        this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');

        // Initialize everything
        this.initialize();
        this.initializeGenerationModeRules();
        this.initializeMarkdown();
        this.initializeTokenThreshold();
        this.initializeCodeGeneratorType();
    }

    initializeGenerationModeRules() {
        const featureCheckbox = document.getElementById('javaGenModeFeature');
        const pageCheckbox = document.getElementById('javaGenModePage');
        const testScriptCheckbox = document.getElementById('javaGenModeTestScript');
        let lockPageCheckbox = false;

        if (!featureCheckbox || !pageCheckbox || !testScriptCheckbox) {
            return;
        }

        const syncCheckboxState = () => {
            if (testScriptCheckbox.checked) {
                // Test script always requires Page Object / Page Class.
                pageCheckbox.checked = true;
                pageCheckbox.disabled = lockPageCheckbox;
            } else {
                lockPageCheckbox = false;
                pageCheckbox.disabled = false;
            }
        };

        testScriptCheckbox.addEventListener('change', () => {
            if (testScriptCheckbox.checked) {
                // Lock only when Test script is chosen without any prior mode selections.
                const hasOtherSelections = featureCheckbox.checked || pageCheckbox.checked;
                lockPageCheckbox = !hasOtherSelections;
            } else {
                lockPageCheckbox = false;
            }
            syncCheckboxState();
        });

        featureCheckbox.addEventListener('change', () => {
            if (featureCheckbox.checked) {
                lockPageCheckbox = false;
            }
            syncCheckboxState();
        });

        pageCheckbox.addEventListener('change', () => {
            if (testScriptCheckbox.checked && !pageCheckbox.checked) {
                pageCheckbox.checked = true;
            }
            syncCheckboxState();
        });

        syncCheckboxState();
    }

    initialize() {
        // Reset chat
        if (this.resetButton) {
            this.resetButton.addEventListener('click', () => {
                this.messagesContainer.innerHTML = '';
                this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');
                this.selectedDomContent = null;
                this.generatedCode = '';
                this.inspectorButton.classList.remove('has-content','active');
                this.inspectorButton.innerHTML = `
                    <i class="fas fa-mouse-pointer"></i>
                    <span>Inspect</span>
                `;
                this.isInspecting = false;
                
                // Hide all action buttons
                if (this.runTestButton) this.runTestButton.style.display = 'none';
            });
        }

        // Load stored keys
        chrome.storage.sync.get(
          ['groqApiKey','openaiApiKey','testleafApiKey','selectedModel','selectedProvider'],
          (result) => {
            if (result.groqApiKey)   this.groqAPI   = new GroqAPI(result.groqApiKey);
            if (result.openaiApiKey) this.openaiAPI = new OpenAIAPI(result.openaiApiKey);
            if (result.testleafApiKey) this.testleafAPI = new TestleafAPI(result.testleafApiKey);

            this.selectedModel    = result.selectedModel    || '';
            this.selectedProvider = result.selectedProvider || '';
        });

        // Listen for changes
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.groqApiKey)       this.groqAPI   = new GroqAPI(changes.groqApiKey.newValue);
            if (changes.openaiApiKey)     this.openaiAPI = new OpenAIAPI(changes.openaiApiKey.newValue);
            if (changes.testleafApiKey)   this.testleafAPI = new TestleafAPI(changes.testleafApiKey.newValue);
            if (changes.selectedModel)    this.selectedModel = changes.selectedModel.newValue;
            if (changes.selectedProvider) this.selectedProvider = changes.selectedProvider.newValue;
        });

        // Listen for SELECTED_DOM_CONTENT from content.js
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.type === 'SELECTED_DOM_CONTENT') {
                this.selectedDomContent = msg.content;
                this.inspectorButton.classList.add('has-content');
            }
        });

        // Send button
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Inspector button
        this.inspectorButton.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                    console.log('Cannot use inspector on this page');
                    return;
                }
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content/content.js']
                    });
                } catch (error) {
                    if (!error.message.includes('already been injected')) {
                        throw error;
                    }
                }
                const port = chrome.tabs.connect(tab.id);
                port.postMessage({ type: 'TOGGLE_INSPECTOR', reset: true });
                this.isInspecting = !this.isInspecting;
                this.updateInspectorButtonState();
            } catch (error) {
                console.error('Inspector error:', error);
                this.addMessage('Failed to activate inspector. Please refresh and try again.', 'system');
                this.isInspecting = false;
                this.updateInspectorButtonState();
            }
        });

        // Run Test button
        if (this.runTestButton) {
            this.runTestButton.addEventListener('click', () => this.runCucumberTest());
        }

    }

    // ===================
    // Markdown / Parsing
    // ===================
    initializeMarkdown() {
        const checkLibraries = setInterval(() => {
            if (window.marked && window.Prism) {
                
                window.marked.setOptions({
                    highlight: (code, lang) => {
                        // Normalize language name
                        let normalizedLang = lang?.toLowerCase().trim();
                        
                        // Map common language aliases
                        const languageMap = {
                            'feature': 'gherkin',
                            'cucumber': 'gherkin',
                            'bdd': 'gherkin'
                        };
                        
                        if (languageMap[normalizedLang]) {
                            normalizedLang = languageMap[normalizedLang];
                        }
                        
                        if (normalizedLang && Prism.languages[normalizedLang]) {
                            try {
                                return Prism.highlight(code, Prism.languages[normalizedLang], normalizedLang);
                            } catch (e) {
                                console.error('Prism highlight error:', e);
                                return code;
                            }
                        }
                        return code;
                    },
                    langPrefix: 'language-',
                    breaks: true,
                    gfm: true
                });
                const renderer = new marked.Renderer();
            renderer.code = (code, language) => {
                console.log('🎨 Rendering code block:', { language, codeLength: code?.length });
                
                if (typeof code === 'object') {
                    if (code.text) {
                        code = code.text;
                    } else if (code.raw) {
                        code = code.raw.replace(/^```[\\w]*\\n/, '').replace(/\\n```$/, '');
                    } else {
                        code = JSON.stringify(code, null, 2);
                    }
                }
                
                // Normalize language name
                let validLanguage = language?.toLowerCase().trim() || 'typescript';
                console.log('Original language:', language, '-> Normalized:', validLanguage);
                
                // Map common language aliases
                const languageMap = {
                    'feature': 'gherkin',
                    'cucumber': 'gherkin',
                    'bdd': 'gherkin',
                    'js': 'javascript',
                    'ts': 'typescript',
                    'py': 'python',
                    'cs': 'csharp'
                };
                
                if (languageMap[validLanguage]) {
                    console.log('Language mapped:', validLanguage, '->', languageMap[validLanguage]);
                    validLanguage = languageMap[validLanguage];
                }
                
                let highlighted = code;
                
                // Check if Prism language is available
                if (validLanguage && Prism.languages[validLanguage]) {
                    try {
                        console.log('Highlighting with Prism for language:', validLanguage);
                        highlighted = Prism.highlight(code, Prism.languages[validLanguage], validLanguage);
                        console.log('✅ Highlighting successful');
                    } catch (e) {
                        console.error('❌ Highlighting failed for', validLanguage, ':', e);
                        highlighted = code;
                    }
                } else {
                    console.warn('⚠️ Language not supported by Prism:', validLanguage);
                }
                
                const result = `<pre class=\"language-${validLanguage}\"><code class=\"language-${validLanguage}\">${highlighted}</code></pre>`;
                console.log('Final HTML classes:', `language-${validLanguage}`);
                return result;
            };
                window.marked.setOptions({ renderer });
                this.markdownReady = true;
                clearInterval(checkLibraries);
            }
        }, 100);
    }



    parseMarkdown(content) {
        if (!this.markdownReady) {
            return `<pre>${content}</pre>`;
        }
        let textContent;
        if (typeof content === 'string') {
            const match = content.match(/^```(\w+)/);
            textContent = content.replace(/^```\w+/, '```');
        } else if (typeof content === 'object') {
            textContent = content.content || 
                         content.message?.content ||
                         content.choices?.[0]?.message?.content ||
                         JSON.stringify(content, null, 2);
        } else {
            textContent = String(content);
        }
        let processedContent = textContent
            .replace(/&#x60;/g, '`')
            .replace(/&grave;/g, '`')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/```(\w*)/g, '\n```$1\n')
            .replace(/```\s*$/g, '\n```\n')
            .replace(/\n{3,}/g, '\n\n');
        try {
            const renderer = new marked.Renderer();
            renderer.code = (code, language) => {
                if (typeof code === 'object') {
                    if (code.text) {
                        code = code.text;
                    } else if (code.raw) {
                        code = code.raw.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
                    } else {
                        code = JSON.stringify(code, null, 2);
                    }
                }
                const validLanguage = language?.toLowerCase().trim() || 'typescript';
                let highlighted = code;
                if (validLanguage && Prism.languages[validLanguage]) {
                    try {
                        highlighted = Prism.highlight(code, Prism.languages[validLanguage], validLanguage);
                    } catch (e) {
                        console.error('Highlighting failed:', e);
                    }
                }
                return `<pre class="language-${validLanguage}"><code class="language-${validLanguage}">${highlighted}</code></pre>`;
            };
            window.marked.setOptions({ renderer });
            const parsed = window.marked.parse(processedContent);
            
            // Apply syntax highlighting after DOM is updated
            setTimeout(() => {
                const codeBlocks = document.querySelectorAll('pre code[class*="language-"]');
                console.log('📝 Post-parse highlighting for', codeBlocks.length, 'code blocks');
                
                codeBlocks.forEach((block, index) => {
                    // Standard Prism highlighting for all languages
                    try {
                        Prism.highlightElement(block);
                    } catch (e) {
                        console.error('Prism highlighting error:', e);
                    }
                });
            }, 100);
            
            return parsed;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return `<pre>${textContent}</pre>`;
        }
    }

    removeActiveLoader() {
        const loader = this.messagesContainer.querySelector('.loading-indicator.active');
        if (loader) loader.remove();
    }

    showLoadingIndicator(text = 'Generating Code') {
        const loader = document.createElement('div');
        loader.className = 'loading-indicator active';
        loader.innerHTML = `
          <div class="loading-spinner"></div>
          <span class="loading-text">${text}</span>
        `;
        this.messagesContainer.appendChild(loader);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    formatSectionOutput(title, content) {
        return `### ${title}\n\n${content}`;
    }

    resolvePagePromptKey(language, engine) {
        const lang = language?.toLowerCase() || '';
        const eng = engine?.toLowerCase() || '';

        if (this.isJavaSelenium(lang, eng)) return 'SELENIUM_JAVA_PAGE_ONLY';
        if (this.isTypeScriptPlaywright(lang, eng)) return 'PLAYWRIGHT_TYPESCRIPT_PAGE_ONLY';
        if (this.isTypeScriptCypress(lang, eng)) return 'CYPRESS_TYPESCRIPT_PAGE_ONLY';
        return null;
    }

    async sendPromptRequest(apiRef, promptKey, variables, userMsg) {
        const builtPrompt = getPrompt(promptKey, variables);
        const finalPrompt = builtPrompt + ' Additional Instructions: ' + userMsg;
        const resp = await apiRef.sendMessage(finalPrompt, this.selectedModel);
        const content = (resp?.content || resp || '').trim();

        return {
            content,
            inputTokens: resp?.usage?.input_tokens || 0,
            outputTokens: resp?.usage?.output_tokens || 0
        };
    }

    extractPrimaryCodeBlock(text) {
        if (typeof text !== 'string') return String(text || '');
        const match = text.match(/```[\w-]*\n([\s\S]*?)```/);
        return match ? match[1].trim() : text.trim();
    }

    extractActionMethods(pageClassCode) {
        const source = (pageClassCode || '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');

        const classNameMatch = source.match(/\bclass\s+([A-Za-z_]\w*)/);
        const className = classNameMatch?.[1] || '';
        const seen = new Set();
        const methods = [];
        const clickableMethodPattern = /(click|tap|press|submit|select|choose|check|uncheck|toggle)/i;

        const blockedNames = new Set([
            'constructor', 'if', 'for', 'while', 'switch', 'catch', 'else', 'try'
        ]);

        const collect = (methodName) => {
            if (!methodName) return;
            if (blockedNames.has(methodName)) return;
            if (className && methodName === className) return;
            if (seen.has(methodName)) return;
            if (!clickableMethodPattern.test(methodName)) return;
            seen.add(methodName);
            methods.push(methodName);
        };

        const javaStylePattern = /\b(?:public|private|protected)\s+(?:static\s+)?(?:async\s+)?[\w<>,\[\]\s?]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;
        let match;
        while ((match = javaStylePattern.exec(source)) !== null) {
            collect(match[1]);
        }

        const tsStylePattern = /(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{/g;
        while ((match = tsStylePattern.exec(source)) !== null) {
            collect(match[1]);
        }

        return methods;
    }

    showTestScriptMethodDialog(actionMethods) {
        return new Promise((resolve) => {
            const methods = [...actionMethods];
            const stepCount = methods.length;

            const popup = window.open('', 'test-script-selector', 'width=720,height=760,resizable=yes,scrollbars=yes');
            if (!popup) {
                resolve(null);
                return;
            }

            const titleText = 'Generate Test Script';
            const subtitleText = `Select one action method per step (${stepCount} steps).`;

            popup.document.open();
            popup.document.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleText}</title>
    <style>
        body {
            margin: 0;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #1f1f1f;
            color: #f0f0f0;
        }
        .container {
            max-width: 680px;
            margin: 0 auto;
            padding: 18px;
        }
        h2 {
            margin: 0 0 8px;
            color: #ff6b2b;
            font-size: 22px;
        }
        .subtitle {
            margin: 0 0 14px;
            color: #cfcfcf;
            font-size: 14px;
        }
        .steps {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 14px;
        }
        .step-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: #2a2a2a;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 10px;
        }
        .step-row label {
            font-size: 12px;
            color: #dedede;
            font-weight: 700;
        }
        .step-select {
            width: 100%;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #545454;
            background: #141414;
            color: #fff;
        }
        .preview {
            background: #2a2a2a;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 14px;
        }
        .preview-title {
            font-size: 12px;
            color: #ffb289;
            font-weight: 700;
            margin-bottom: 6px;
        }
        .preview ol {
            margin: 0;
            padding-left: 18px;
            font-size: 12px;
            color: #e6e6e6;
        }
        .actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            position: sticky;
            bottom: 0;
            background: #1f1f1f;
            padding-top: 8px;
        }
        button {
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            cursor: pointer;
            font-weight: 700;
        }
        .cancel {
            background: #4a4a4a;
            color: #fff;
        }
        .generate {
            background: #ff6b2b;
            color: #fff;
        }
        .generate:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>${titleText}</h2>
        <p class="subtitle">${subtitleText}</p>
        <div class="steps" id="steps"></div>
        <div class="preview">
            <div class="preview-title">Selected Action Sequence</div>
            <ol id="previewList"></ol>
        </div>
        <div class="actions">
            <button class="cancel" id="cancelBtn">Cancel</button>
            <button class="generate" id="generateBtn" disabled>Generate Test Script</button>
        </div>
    </div>
</body>
</html>
            `);
            popup.document.close();
            popup.focus();

            let settled = false;
            const selects = [];

            const cleanup = () => {
                clearInterval(closeWatcher);
            };

            const finish = (payload) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(payload);
                if (popup && !popup.closed) {
                    popup.close();
                }
            };

            const initializePopupUi = () => {
                const doc = popup.document;
                const stepsRoot = doc.getElementById('steps');
                const previewList = doc.getElementById('previewList');
                const cancelBtn = doc.getElementById('cancelBtn');
                const generateBtn = doc.getElementById('generateBtn');

                if (!stepsRoot || !previewList || !cancelBtn || !generateBtn) {
                    finish(null);
                    return;
                }

                for (let i = 0; i < stepCount; i++) {
                    const row = doc.createElement('div');
                    row.className = 'step-row';

                    const label = doc.createElement('label');
                    label.textContent = `Step ${i + 1}`;

                    const select = doc.createElement('select');
                    select.className = 'step-select';
                    select.dataset.stepIndex = String(i);

                    row.appendChild(label);
                    row.appendChild(select);
                    stepsRoot.appendChild(row);
                    selects.push(select);
                }

                const syncSequentialSelections = () => {
                    const used = new Set();

                    selects.forEach((select, index) => {
                        const previous = select.value;
                        const isEnabled = index === 0 || Boolean(selects[index - 1].value);
                        const currentValue = isEnabled ? previous : '';
                        const available = methods.filter((methodName) => !used.has(methodName) || methodName === previous);

                        select.innerHTML = '';

                        const placeholderOption = doc.createElement('option');
                        placeholderOption.value = '';
                        placeholderOption.textContent = 'Select action method';
                        select.appendChild(placeholderOption);

                        available.forEach((methodName) => {
                            const option = doc.createElement('option');
                            option.value = methodName;
                            option.textContent = methodName;
                            select.appendChild(option);
                        });

                        select.disabled = !isEnabled;

                        if (!isEnabled || available.length === 0) {
                            select.value = '';
                        } else if (!available.includes(currentValue)) {
                            select.value = '';
                        } else {
                            select.value = currentValue;
                        }

                        if (select.value) {
                            used.add(select.value);
                        }
                    });

                    generateBtn.disabled = !selects.some((select) => Boolean(select.value));

                    previewList.innerHTML = '';
                    selects.forEach((select) => {
                        const li = doc.createElement('li');
                        li.textContent = select.value || 'Not selected';
                        previewList.appendChild(li);
                    });
                };

                selects.forEach((select) => {
                    select.addEventListener('change', syncSequentialSelections);
                });

                cancelBtn.addEventListener('click', () => {
                    finish(null);
                });

                generateBtn.addEventListener('click', () => {
                    const selectedSequence = selects.map((select) => select.value).filter(Boolean);
                    const sequenceText = selectedSequence.map((methodName, index) => `${index + 1}. ${methodName}`).join('\n');
                    const shouldContinue = popup.confirm(
                        `Please confirm the test script sequence:\n\n${sequenceText}\n\nContinue with generation?`
                    );

                    if (!shouldContinue) return;
                    finish(selectedSequence);
                });

                syncSequentialSelections();
            };

            initializePopupUi();

            const closeWatcher = setInterval(() => {
                if (!popup || popup.closed) {
                    finish(null);
                }
            }, 300);
        });
    }



    // =============
    // Send Message
    // =============
    async sendMessage() {
        const userMsg = this.inputField.value.trim();
        let apiRef = null;
        this.isInspecting = false;
        this.updateInspectorButtonState();
      
        if (this.selectedProvider === 'groq') apiRef = this.groqAPI;
        else if (this.selectedProvider === 'openai') apiRef = this.openaiAPI;
        else apiRef = this.testleafAPI;
        if (!apiRef) {
          this.addMessage(`Please set your ${this.selectedProvider} API key in the Settings tab.`, 'system');
          return;
        }

        if (!this.selectedDomContent) {
            this.addMessage('Please select some DOM on the page first.', 'system');
            return;
        }

        // --- Retain only 3 <option> elements in <select> tags to simulate real data ---
        function stripExtraOptions(selectElement) {
            const options = selectElement.querySelectorAll('option');
            if (options.length > 3) {
                for (let i = 3; i < options.length; i++) {
                    options[i].remove();
                }
            }
        }

        let domContentProcessed = this.selectedDomContent;
        if (typeof domContentProcessed === 'string') {
            // Parse string to DOM
            const parser = new DOMParser();
            const doc = parser.parseFromString(domContentProcessed, 'text/html');
            const selects = doc.querySelectorAll('select');
            selects.forEach(stripExtraOptions);
            // Serialize back to string
            domContentProcessed = doc.body.innerHTML;
        } else if (domContentProcessed instanceof HTMLElement) {
            // Directly process if it's an HTMLElement
            const selects = domContentProcessed.querySelectorAll('select');
            selects.forEach(stripExtraOptions);
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const pageUrl = tab?.url || 'unknown';
            const lang = this.languageBindingSelect.value;
            const eng = this.browserEngineSelect.value;
            const featureCheckbox = document.getElementById('javaGenModeFeature');
            const testScriptCheckbox = document.getElementById('javaGenModeTestScript');
            const isFeatureChecked = Boolean(featureCheckbox?.checked);
            const isTestScriptChecked = Boolean(testScriptCheckbox?.checked);
            const promptKeys = this.getPromptKeys(lang, eng);

            const finalSnippet = typeof domContentProcessed === 'string'
                ? domContentProcessed
                : JSON.stringify(domContentProcessed, null, 2);

            this.sendButton.disabled = true;
            this.inputField.disabled = true;
            this.sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            this.addMessage(userMsg, 'user');
            this.inputField.value = '';

            let combinedContent = '';
            let totalInputTokens = 0;
            let totalOutputTokens = 0;

            if (isTestScriptChecked) {
                const generatedSections = [];
                const pagePromptKey = this.resolvePagePromptKey(lang, eng);
                if (!pagePromptKey) {
                    this.addUnsupportedLanguageMessage(lang, eng);
                    this.removeActiveLoader();
                    return;
                }

                // Strict sequence: BDD (if selected) -> Page Class -> Test Script.
                if (isFeatureChecked) {
                    const bddResult = await this.sendPromptRequest(apiRef, 'CUCUMBER_ONLY', {
                        domContent: finalSnippet,
                        pageUrl,
                        userAction: ''
                    }, userMsg);

                    const bddSection = this.formatSectionOutput('BDD', bddResult.content);

                    totalInputTokens += bddResult.inputTokens;
                    totalOutputTokens += bddResult.outputTokens;
                    generatedSections.push(bddSection);

                    this.removeActiveLoader();
                    this.addMessageWithMetadata(bddSection, 'assistant', {
                        inputTokens: bddResult.inputTokens,
                        outputTokens: bddResult.outputTokens
                    });

                    this.showLoadingIndicator('Generating Page Class');
                }

                const pageResult = await this.sendPromptRequest(apiRef, pagePromptKey, {
                    domContent: finalSnippet,
                    pageUrl,
                    userAction: ''
                }, userMsg);

                const pageSection = this.formatSectionOutput('Page Class', pageResult.content);

                totalInputTokens += pageResult.inputTokens;
                totalOutputTokens += pageResult.outputTokens;
                generatedSections.push(pageSection);

                this.removeActiveLoader();
                this.addMessageWithMetadata(pageSection, 'assistant', {
                    inputTokens: pageResult.inputTokens,
                    outputTokens: pageResult.outputTokens
                });

                const pageClassCode = this.extractPrimaryCodeBlock(pageResult.content);
                const actionMethods = this.extractActionMethods(pageClassCode);

                if (actionMethods.length === 0) {
                    throw new Error('No clickable action methods found in the generated page class.');
                }

                // Show step dialog where each step maps to one page-class action method.
                const selectedSequence = await this.showTestScriptMethodDialog(actionMethods);
                if (!selectedSequence) {
                    this.addMessage('Test script generation cancelled by user.', 'system');
                    this.generatedCode = generatedSections.join('\n\n').trim();
                    return;
                }

                this.showLoadingIndicator('Generating Test Script');

                const testScriptResult = await this.sendPromptRequest(apiRef, 'TEST_SCRIPT_FROM_ACTION_SEQUENCE', {
                    domContent: finalSnippet,
                    pageUrl,
                    languageBinding: lang,
                    browserEngine: eng,
                    pageClassCode,
                    includeBdd: 'false',
                    actionMethods: selectedSequence.map((methodName, index) => `${index + 1}. ${methodName}`).join('\n')
                }, userMsg);

                const testScriptSection = this.formatSectionOutput('Test Script', testScriptResult.content);

                totalInputTokens += testScriptResult.inputTokens;
                totalOutputTokens += testScriptResult.outputTokens;
                generatedSections.push(testScriptSection);

                this.removeActiveLoader();
                this.addMessageWithMetadata(testScriptSection, 'assistant', {
                    inputTokens: testScriptResult.inputTokens,
                    outputTokens: testScriptResult.outputTokens
                });

                combinedContent = generatedSections.join('\n\n');
            } else {
                for (const key of promptKeys) {
                    const result = await this.sendPromptRequest(apiRef, key, {
                        domContent: finalSnippet,
                        pageUrl: pageUrl,
                        userAction: ''
                    }, userMsg);

                    combinedContent += result.content + '\n\n';
                    totalInputTokens += result.inputTokens;
                    totalOutputTokens += result.outputTokens;
                }

                this.removeActiveLoader();
                this.addMessageWithMetadata(combinedContent.trim(), 'assistant', {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens
                });
            }

            this.selectedDomContent = null;
            this.inspectorButton.classList.remove('has-content','active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
            this.isInspecting = false;
            if (tab) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SELECTION' });
                } catch (err) {
                    const port = chrome.tabs.connect(tab.id);
                    port.postMessage({ type: 'CLEAR_SELECTION' });
                    port.disconnect();
                }
            }
            this.generatedCode = combinedContent.trim();
        } catch (err) {
            this.removeActiveLoader();
            this.addMessage(`Error: ${err.message}`, 'system');
        } finally {
            this.sendButton.disabled = false;
            this.inputField.disabled = false;
            this.sendButton.innerHTML = 'Generate';
        }
    }
      

    // ==============
    // addMessage UI
    // ==============
    addMessage(content, type) {
        if (!content) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${type}-message`;
        if (type === 'system') {
            msgDiv.innerHTML = content;
        } else {
            const markdownDiv = document.createElement('div');
            markdownDiv.className = 'markdown-content';
            markdownDiv.innerHTML = this.parseMarkdown(content);
            msgDiv.appendChild(markdownDiv);
        }
        this.messagesContainer.appendChild(msgDiv);
        if (type === 'user') {
            const loader = document.createElement('div');
            loader.className = 'loading-indicator';
            const genType = this.codeGeneratorType.includes('PLAYWRIGHT') ? 'Playwright' : 'Selenium';
            loader.innerHTML = `
              <div class="loading-spinner"></div>
              <span class="loading-text">Generating ${genType} Code</span>
            `;
            this.messagesContainer.appendChild(loader);
            setTimeout(() => loader.classList.add('active'), 0);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        const msgCount = this.messagesContainer.querySelectorAll('.chat-message').length;
        if (msgCount > 1 && this.resetButton) {
            this.resetButton.classList.add('visible');
        }
    }

    addMessageWithMetadata(content, type, metadata) {
        if (type !== 'assistant') {
            this.addMessage(content, type);
            return;
        }
        const container = document.createElement('div');
        container.className = 'assistant-message';
        const mdDiv = document.createElement('div');
        mdDiv.className = 'markdown-content';
        mdDiv.innerHTML = this.parseMarkdown(content);
        container.appendChild(mdDiv);
        const metaContainer = document.createElement('div');
        metaContainer.className = 'message-metadata collapsed';
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'metadata-toggle';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'metadata-toggle';
        copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`;
        copyBtn.onclick = () => {
            const codeBlocks = mdDiv.querySelectorAll('pre code');
            if (codeBlocks.length === 0) {
                copyBtn.innerHTML = `<i class="fas fa-times"></i> No content found`;
                setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy`; }, 2000);
                return;
            }
            let combinedCode = Array.from(codeBlocks).map(block => block.textContent.trim()).join('\n\n');
            combinedCode = combinedCode.replace(/^```[\w-]*\n/, '').replace(/\n```$/, '');
            navigator.clipboard.writeText(combinedCode)
                .then(() => {
                    copyBtn.innerHTML = `<i class="fas fa-check"></i> Copied!`;
                    setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy code`; }, 2000);
                })
                .catch(err => {
                    console.error('Copy failed:', err);
                    copyBtn.innerHTML = `<i class="fas fa-times"></i> Failed to copy`;
                    setTimeout(() => { copyBtn.innerHTML = `<i class="fas fa-copy"></i> Copy code`; }, 2000);
                });
        };
        actions.appendChild(toggleBtn);
        actions.appendChild(copyBtn);
        metaContainer.appendChild(actions);
        const details = document.createElement('div');
        details.className = 'metadata-content';
        details.innerHTML = `
          <div class="metadata-row"><span>Input Tokens:</span><span>${metadata.inputTokens}</span></div>
          <div class="metadata-row"><span>Output Tokens:</span><span>${metadata.outputTokens}</span></div>
        `;
        metaContainer.appendChild(details);
        container.appendChild(metaContainer);
        this.messagesContainer.appendChild(container);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        if (this.resetButton) {
            this.resetButton.classList.add('visible');
        }
    }
    
    updateInspectorButtonState() {
        if (this.isInspecting) {
            this.inspectorButton.classList.add('active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Stop</span>
            `;
        } else {
            this.inspectorButton.classList.remove('active');
            if (!this.selectedDomContent) {
                this.inspectorButton.classList.remove('has-content');
            }
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
        }
    }

    getPromptKeys(language, engine) {
        const checkboxes = Array.from(document.querySelectorAll('input[name="javaGenerationMode"]:checked'));
        const promptKeys = [];
        const lang = language?.toLowerCase() || '';
        const eng = engine?.toLowerCase() || '';

        // Extract selected generation modes
        const isFeatureChecked = checkboxes.some(box => box.value === 'FEATURE');
        const isPageChecked = checkboxes.some(box => box.value === 'PAGE');

        // Validate that at least one option is selected
        if (!isFeatureChecked && !isPageChecked) {
            console.warn('No generation mode selected. Defaulting to Page Object generation.');
            // Default fallback to page object generation
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('SELENIUM_JAVA_PAGE_ONLY');
            } else if (this.isTypeScriptPlaywright(lang, eng)) {
                promptKeys.push('PLAYWRIGHT_TYPESCRIPT_PAGE_ONLY');
            } else if (this.isTypeScriptCypress(lang, eng)) {
                promptKeys.push('CYPRESS_TYPESCRIPT_PAGE_ONLY');
            }
            return promptKeys;
        }

        // Generate appropriate prompt keys based on selections and language/engine combination
        if (isFeatureChecked && isPageChecked) {
            // Both feature and page selected - generate combined output
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('CUCUMBER_WITH_SELENIUM_JAVA_STEPS');
            } else if (this.isTypeScriptPlaywright(lang, eng)) {
                promptKeys.push('CUCUMBER_WITH_PLAYWRIGHT_TYPESCRIPT_STEPS');
            } else if (this.isTypeScriptCypress(lang, eng)) {
                promptKeys.push('CUCUMBER_WITH_CYPRESS_TYPESCRIPT_STEPS');
            } else {
                // For non-Java/Selenium combinations, generate separately
                promptKeys.push('CUCUMBER_ONLY');
                this.addUnsupportedLanguageMessage(lang, eng);
            }
        } else if (isFeatureChecked) {
            // Feature file only
            if (this.isTypeScriptPlaywright(lang, eng)) {
                promptKeys.push('PLAYWRIGHT_TYPESCRIPT_WITH_CUCUMBER');
            } else if (this.isTypeScriptCypress(lang, eng)) {
                promptKeys.push('CYPRESS_TYPESCRIPT_WITH_CUCUMBER');
            } else {
                promptKeys.push('CUCUMBER_ONLY');
            }
        } else if (isPageChecked) {
            // Page object only
            if (this.isJavaSelenium(lang, eng)) {
                promptKeys.push('SELENIUM_JAVA_PAGE_ONLY');
            } else if (this.isTypeScriptPlaywright(lang, eng)) {
                promptKeys.push('PLAYWRIGHT_TYPESCRIPT_PAGE_ONLY');
            } else if (this.isTypeScriptCypress(lang, eng)) {
                promptKeys.push('CYPRESS_TYPESCRIPT_PAGE_ONLY');
            } else {
                this.addUnsupportedLanguageMessage(lang, eng);
            }
        }

        return promptKeys;
    }

    /**
     * Helper method to check if the combination is Java + Selenium
     */
    isJavaSelenium(language, engine) {
        return language === 'java' && engine === 'selenium';
    }

    isTypeScriptPlaywright(language, engine) {
        return (language === 'ts' || language === 'typescript') && engine === 'playwright';
    }

    isTypeScriptCypress(language, engine) {
        return (language === 'ts' || language === 'typescript') && engine === 'cypress';
    }

    isCSharpSelenium(language, engine) {
        return language === 'csharp' && engine === 'selenium';
    }

    isPythonSelenium(language, engine) {
        return language === 'python' && engine === 'selenium';
    }

    // typescript/selenium not supported by the selenium webdriver



    /**
     * Helper method to show unsupported language/engine combination message
     */
    addUnsupportedLanguageMessage(language, engine) {
        const message = `⚠️ ${language}/${engine} combination is not yet supported. Only Java/Selenium is currently available.`;
        this.addMessage(message, 'system');
    }

    async initializeCodeGeneratorType() {
        const { codeGeneratorType } = await chrome.storage.sync.get(['codeGeneratorType']);
        if (codeGeneratorType) {
            this.codeGeneratorType = codeGeneratorType;
            const codeGenDrop = document.getElementById('codeGeneratorType');
            if (codeGenDrop) codeGenDrop.value = this.codeGeneratorType;
        }
    }

    async initializeTokenThreshold() {
        const { tokenWarningThreshold } = await chrome.storage.sync.get(['tokenWarningThreshold']);
        if (tokenWarningThreshold) {
            this.tokenWarningThreshold = tokenWarningThreshold;
        }
        const threshInput = document.getElementById('tokenThreshold');
        if (threshInput) {
            threshInput.value = this.tokenWarningThreshold;
            threshInput.addEventListener('change', async (e) => {
                const val = parseInt(e.target.value,10);
                if (val >= 100) {
                    this.tokenWarningThreshold = val;
                    await chrome.storage.sync.set({ tokenWarningThreshold: val });
                } else {
                    e.target.value = this.tokenWarningThreshold;
                }
            });
        }
    }







    async resetChat() {
        try {
            this.messagesContainer.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                </div>
            `;
            this.selectedDomContent = null;
            this.isInspecting       = false;
            this.markdownReady      = false;
            this.inspectorButton.classList.remove('has-content','active');
            this.inspectorButton.innerHTML = `
                <i class="fas fa-mouse-pointer"></i>
                <span>Inspect</span>
            `;
            this.inputField.value = '';
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Generate';
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && !tab.url.startsWith('chrome://')) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'CLEANUP' });
                } catch (err) {
                    console.log('Cleanup error:', err);
                }
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/content/content.js']
                    });
                } catch (err) {
                    if (!err.message.includes('already been injected')) {
                        console.error('Re-inject error:', err);
                    }
                }
            }
            if (this.resetButton) {
                this.resetButton.classList.remove('visible');
            }
            if (this.runTestButton) {
                this.runTestButton.style.display = 'none';
            }
            this.addMessage(INITIAL_SYSTEM_MESSAGE, 'system');
        } catch (err) {
            console.error('Error resetting chat:', err);
            this.addMessage('Error resetting chat. Please close and reopen.', 'system');
        }
    }
}


// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new ChatUI();
});
