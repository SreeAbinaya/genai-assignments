/**
 * Collection of default prompts for different use cases (ICE POT Format)
 */
export const DEFAULT_PROMPTS = {
 
  /**
   * Selenium Java Page Object Prompt (No Test Class)
   */
  SELENIUM_JAVA_PAGE_ONLY: `
    Instructions:
    - Generate ONLY a Selenium Java Page Object Class (no test code).
    - Add JavaDoc for methods & class.
    - Use Selenium 2.30+ compatible imports.
    - Use meaningful method names.
    - Do NOT include explanations or test code.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`

    Example:
    \`\`\`java
    package com.testleaf.pages;

    /**
     * Page Object for Component Page
     */
    public class ComponentPage {
        // Add methods as per the DOM
    }
    \`\`\`

    Persona:
    - Audience: Automation engineer focusing on maintainable POM structure.

    Output Format:
    - A single Java class inside a \`\`\`java\`\`\` block.

    Tone:
    - Clean, maintainable, enterprise-ready.
  `,

  /**
   * Cucumber Feature File Only Prompt
   */
  CUCUMBER_ONLY: `
    Instructions:
    - Generate ONLY a Cucumber (.feature) file.
    - Use Scenario Outline with Examples table.
    - Make sure every step is relevant to the provided DOM.
    - Do not combine multiple actions into one step.
    - Use South India realistic dataset (names, addresses, pin codes, mobile numbers).
    - Use dropdown values only from provided DOM.
    - Generate multiple scenarios if applicable.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`

    Example:
    \`\`\`gherkin
    Feature: Login to OpenTaps

    Scenario Outline: Successful login with valid credentials
      Given I open the login page
      When I type "<username>" into the Username field
      And I type "<password>" into the Password field
      And I click the Login button
      Then I should be logged in successfully

    Examples:
      | username   | password  |
      | "testuser" | "testpass"|
      | "admin"    | "admin123"|
    \`\`\`

    Persona:
    - Audience: BDD testers who only need feature files.

    Output Format:
    - Only valid Gherkin in a \`\`\`gherkin\`\`\` block.

    Tone:
    - Clear, structured, executable.
  `,

  /**
   * Cucumber with Step Definitions
   */
  CUCUMBER_WITH_SELENIUM_JAVA_STEPS: `
    Instructions:
    - Generate BOTH:
      1. A Cucumber .feature file.
      2. A Java step definition class for selenium.
    - Do NOT include Page Object code.
    - Step defs must include WebDriver setup, explicit waits, and actual Selenium code.
    - Use Scenario Outline with Examples table (South India realistic data).

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Example:
    \`\`\`gherkin
    Feature: Login to OpenTaps

    Scenario Outline: Successful login with valid credentials
      Given I open the login page
      When I type "<username>" into the Username field
      And I type "<password>" into the Password field
      And I click the Login button
      Then I should be logged in successfully

    Examples:
      | username   | password  |
\      | "admin"    | "admin123"|
    \`\`\`

    \`\`\`java
    package com.leaftaps.stepdefs;

    import io.cucumber.java.en.*;
    import org.openqa.selenium.*;
    import org.openqa.selenium.chrome.ChromeDriver;
    import org.openqa.selenium.support.ui.*;

    public class LoginStepDefinitions {
        private WebDriver driver;
        private WebDriverWait wait;

        @io.cucumber.java.Before
        public void setUp() {
            driver = new ChromeDriver();
            wait = new WebDriverWait(driver, Duration.ofSeconds(10));
            driver.manage().window().maximize();
        }

        @io.cucumber.java.After
        public void tearDown() {
            if (driver != null) driver.quit();
        }

        @Given("I open the login page")
        public void openLoginPage() {
            driver.get("\${pageUrl}");
        }

        @When("I type {string} into the Username field")
        public void enterUsername(String username) {
            WebElement el = wait.until(ExpectedConditions.elementToBeClickable(By.id("username")));
            el.sendKeys(username);
        }

        @When("I type {string} into the Password field")
        public void enterPassword(String password) {
            WebElement el = wait.until(ExpectedConditions.elementToBeClickable(By.id("password")));
            el.sendKeys(password);
        }

        @When("I click the Login button")
        public void clickLogin() {
            driver.findElement(By.xpath("//button[contains(text(),'Login')]")).click();
        }

        @Then("I should be logged in successfully")
        public void verifyLogin() {
            WebElement success = wait.until(ExpectedConditions.visibilityOfElementLocated(By.className("success")));
            assert success.isDisplayed();
        }
    }
    \`\`\`

    Persona:
    - Audience: QA engineers working with Cucumber & Selenium.

    Output Format:
    - Gherkin in \`\`\`gherkin\`\`\` block + Java code in \`\`\`java\`\`\` block.

    Tone:
    - Professional, executable, structured.
  `,

  /**
   * Playwright TypeScript Page Object Prompt (No Test Spec)
   */
  PLAYWRIGHT_TYPESCRIPT_PAGE_ONLY: `
    Instructions:
    - Generate ONLY a Playwright TypeScript Page Object class (no test spec code).
    - Use TypeScript best practices with strong typing.
    - Use meaningful method names and robust locators.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Example:
    \`\`\`typescript
    import { Page } from '@playwright/test';

    export class ComponentPage {
      readonly page: Page;

      constructor(page: Page) {
        this.page = page;
      }

      async open() {
        await this.page.goto('\${pageUrl}');
      }
    }
    \`\`\`

    Persona:
    - Audience: QA engineers building maintainable Playwright POM framework.

    Output Format:
    - A single TypeScript class in a \`\`\`typescript\`\`\` block.

    Tone:
    - Clean, maintainable, enterprise-ready.
  `,

  /**
   * Playwright TypeScript + Cucumber (Feature + Page Object)
   */
  PLAYWRIGHT_TYPESCRIPT_WITH_CUCUMBER: `
    Instructions:
    - Generate BOTH:
      1. A Cucumber .feature file.
      2. A Playwright TypeScript Page Object class.
    - Feature file should use Scenario Outline with Examples.
    - Steps must map clearly to actions available in DOM.
    - Do NOT generate step definitions in this output.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Persona:
    - Audience: BDD QA engineers using Cucumber + Playwright.

    Output Format:
    - Gherkin in \`\`\`gherkin\`\`\` block.
    - TypeScript Page Object in \`\`\`typescript\`\`\` block.

    Tone:
    - Professional, structured, executable.
  `,

  /**
   * Cucumber with Playwright TypeScript Step Definitions
   */
  CUCUMBER_WITH_PLAYWRIGHT_TYPESCRIPT_STEPS: `
    Instructions:
    - Generate BOTH:
      1. A Cucumber .feature file.
      2. TypeScript step definitions using Cucumber + Playwright.
    - Do NOT include Page Object code.
    - Use Scenario Outline with Examples table (South India realistic data).
    - Include Playwright setup and teardown.
    - Use stable locators and async/await in step definitions.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Example:
    \`\`\`gherkin
    Feature: Login

    Scenario Outline: Successful login
      Given I open the application
      When I enter "<username>" and "<password>"
      And I click Login
      Then I should see the home page

    Examples:
      | username | password |
      | abinaya  | Welcome1 |
    \`\`\`

    \`\`\`typescript
    import { Given, Before, After } from '@cucumber/cucumber';
    import { chromium, Browser, Page } from '@playwright/test';

    let browser: Browser;
    let page: Page;

    Before(async () => {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      page = await context.newPage();
    });

    After(async () => {
      await browser?.close();
    });

    Given('I open the application', async function () {
      await page.goto('\${pageUrl}');
    });
    \`\`\`

    Persona:
    - Audience: QA engineers building Cucumber + Playwright automation.

    Output Format:
    - Gherkin in \`\`\`gherkin\`\`\` block + TypeScript in \`\`\`typescript\`\`\` block.

    Tone:
    - Professional, executable, structured.
  `,

  /**
   * Cypress TypeScript Page Object Prompt (No Test Spec)
   */
  CYPRESS_TYPESCRIPT_PAGE_ONLY: `
    Instructions:
    - Generate ONLY a Cypress TypeScript Page Object-style class/module (no test spec code).
    - Use TypeScript and Cypress idioms.
    - Use clear method names and reliable selectors.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Example:
    \`\`\`typescript
    export class ComponentPage {
      visit() {
        cy.visit('\${pageUrl}');
      }

      typeUsername(value: string) {
        cy.get('#username').type(value);
      }
    }
    \`\`\`

    Persona:
    - Audience: QA engineers building maintainable Cypress TypeScript framework.

    Output Format:
    - A single TypeScript class/module in a \`\`\`typescript\`\`\` block.

    Tone:
    - Clean, maintainable, enterprise-ready.
  `,

  /**
   * Cypress TypeScript + Cucumber (Feature + Page Object)
   */
  CYPRESS_TYPESCRIPT_WITH_CUCUMBER: `
    Instructions:
    - Generate BOTH:
      1. A Cucumber .feature file.
      2. A Cypress TypeScript Page Object-style class/module.
    - Feature file should use Scenario Outline with Examples.
    - Steps must align with elements in provided DOM.
    - Do NOT generate step definitions in this output.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Persona:
    - Audience: BDD QA engineers using Cucumber + Cypress.

    Output Format:
    - Gherkin in \`\`\`gherkin\`\`\` block.
    - TypeScript class/module in \`\`\`typescript\`\`\` block.

    Tone:
    - Professional, structured, executable.
  `,

  /**
   * Cucumber with Cypress TypeScript Step Definitions
   */
  CUCUMBER_WITH_CYPRESS_TYPESCRIPT_STEPS: `
    Instructions:
    - Generate BOTH:
      1. A Cucumber .feature file.
      2. TypeScript step definitions for Cucumber + Cypress.
    - Do NOT include Page Object code.
    - Use Scenario Outline with Examples table (South India realistic data).
    - Use Cypress commands with clear and stable selectors.
    - Do NOT include explanations.

    Context:
    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`
    URL: \${pageUrl}

    Example:
    \`\`\`gherkin
    Feature: Login

    Scenario Outline: Successful login
      Given I open the application
      When I enter "<username>" and "<password>"
      And I click Login
      Then I should see the home page

    Examples:
      | username | password |
      | abinaya  | Welcome1 |
    \`\`\`

    \`\`\`typescript
    import { Given } from '@badeball/cypress-cucumber-preprocessor';

    Given('I open the application', () => {
      cy.visit('\${pageUrl}');
    });
    \`\`\`

    Persona:
    - Audience: QA engineers building Cucumber + Cypress automation.

    Output Format:
    - Gherkin in \`\`\`gherkin\`\`\` block + TypeScript in \`\`\`typescript\`\`\` block.

    Tone:
    - Professional, executable, structured.
  `,

  /**
   * Test Script from generated Page Class and selected action sequence
   */
  TEST_SCRIPT_FROM_ACTION_SEQUENCE: `
    Instructions:
    - Generate ONLY test script code based on the selected action method sequence.
    - Do NOT regenerate the page class.
    - Respect exact action order from Step 1 to Step N.
    - Execute methods strictly in the listed order without reordering or skipping selected steps.
    - Do NOT include BDD feature output or page class output in this section.
    - Use language binding: \${languageBinding}.
    - Use browser engine: \${browserEngine}.
    - If BDD mode is enabled (\${includeBdd} = true), include a matching feature scenario and step implementation.
    - If BDD mode is disabled, generate only executable test script code.
    - Do NOT include explanations.

    Context:
    URL: \${pageUrl}

    Page Class:
    \`\`\`
    \${pageClassCode}
    \`\`\`

    Selected Action Sequence:
    \${actionMethods}

    DOM:
    \`\`\`html
    \${domContent}
    \`\`\`

    Output Format:
    - Provide only code blocks relevant to the selected stack.

    Tone:
    - Professional, executable, structured.
  `
};

/**
 * Helper function to escape code blocks in prompts
 */
function escapeCodeBlocks(text) {
  return text.replace(/```/g, '\\`\\`\\`');
}

/**
 * Function to fill template variables in a prompt
 */
export function getPrompt(promptKey, variables = {}) {
  let prompt = DEFAULT_PROMPTS[promptKey];
  if (!prompt) {
    throw new Error(`Prompt not found: ${promptKey}`);
  }

  Object.entries(variables).forEach(([k, v]) => {
    const regex = new RegExp(`\\$\\{${k}\\}`, 'g');
    prompt = prompt.replace(regex, v);
  });

  return prompt.trim();
}

export const CODE_GENERATOR_TYPES = {
  SELENIUM_JAVA_PAGE_ONLY: 'Selenium-Java-Page-Only',
  CUCUMBER_ONLY: 'Cucumber-Only',
  CUCUMBER_WITH_SELENIUM_JAVA_STEPS: 'Cucumber-With-Selenium-Java-Steps',
  PLAYWRIGHT_TYPESCRIPT_PAGE_ONLY: 'Playwright-Typescript-Page-Only',
  PLAYWRIGHT_TYPESCRIPT_WITH_CUCUMBER: 'Playwright-Typescript-With-Cucumber',
  CUCUMBER_WITH_PLAYWRIGHT_TYPESCRIPT_STEPS: 'Cucumber-With-Playwright-Typescript-Steps',
  CYPRESS_TYPESCRIPT_PAGE_ONLY: 'Cypress-Typescript-Page-Only',
  CYPRESS_TYPESCRIPT_WITH_CUCUMBER: 'Cypress-Typescript-With-Cucumber',
  CUCUMBER_WITH_CYPRESS_TYPESCRIPT_STEPS: 'Cucumber-With-Cypress-Typescript-Steps',
};
