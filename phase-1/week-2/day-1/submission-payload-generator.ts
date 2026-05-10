import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

type JsonObject = {
  [key: string]: JsonValue;
};

type PermutationValue = {
  label: string;
  value: JsonValue;
};

type PermutationField = {
  key: string;
  path: string;
  values: PermutationValue[];
};

type GeneratorConfig = {
  endpoint: string;
  outputDir: string;
  clearOutputDir: boolean;
  filenameDelimiter?: string;
  basePayload: JsonObject;
  permutationFields: PermutationField[];
};

type CombinationSelection = {
  key: string;
  label: string;
  path: string;
  value: JsonValue;
};

type GenerationContext = {
  runId: string;
  timestampIso: string;
  combinationIndex: number;
  uniquePhone: string;
  uniqueEmail: string;
};

export type GenerationResult = {
  outputDir: string;
  generatedFiles: string[];
};

const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const E2E_ROOT = resolve(__dirname, "..");
const DEFAULT_CONFIG_PATH = resolve(
  E2E_ROOT,
  "config/submission-payload-generator.config.json"
);

function loadJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function loadGeneratorConfig(configPath = DEFAULT_CONFIG_PATH): GeneratorConfig {
  return loadJsonFile<GeneratorConfig>(resolve(configPath));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function shuffleValues<T>(values: T[]): T[] {
  const shuffledValues = [...values];

  for (let currentIndex = shuffledValues.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    const currentValue = shuffledValues[currentIndex];
    shuffledValues[currentIndex] = shuffledValues[randomIndex];
    shuffledValues[randomIndex] = currentValue;
  }

  return shuffledValues;
}

function buildRunId(timestampIso: string): string {
  return timestampIso.replace(/[-:.TZ]/g, "").slice(0, 14);
}

function buildUniquePhone(combinationIndex: number): string {
  return `7${String(100000000 + combinationIndex).slice(0, 9)}`;
}

function buildUniqueEmail(runId: string, combinationIndex: number): string {
  return `storm.worker+${runId}-${combinationIndex}@example.com`;
}

function replacePlaceholdersInString(value: string, context: GenerationContext): string {
  return value
    .replaceAll("__RUN_ID__", context.runId)
    .replaceAll("__TIMESTAMP_ISO__", context.timestampIso)
    .replaceAll("__COMBINATION_INDEX__", String(context.combinationIndex))
    .replaceAll("__UNIQUE_PHONE__", context.uniquePhone)
    .replaceAll("__UNIQUE_PHONE_NUMBER__", context.uniquePhone)
    .replaceAll("__UNIQUE_EMAIL__", context.uniqueEmail);
}

function applyPlaceholders(value: JsonValue, context: GenerationContext): JsonValue {
  if (typeof value === "string") {
    if (value === "__UNIQUE_PHONE_NUMBER__") {
      return Number(context.uniquePhone);
    }

    return replacePlaceholdersInString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyPlaceholders(item, context));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        applyPlaceholders(nestedValue, context),
      ])
    );
  }

  return value;
}

function setNestedValue(target: JsonObject, path: string, value: JsonValue): void {
  const segments = path.split(".");
  let current: Record<string, JsonValue> = target;

  segments.slice(0, -1).forEach((segment) => {
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, JsonValue>;
  });

  current[segments[segments.length - 1]] = value;
}

function sanitizeFileNamePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildCombinationFileName(
  selections: CombinationSelection[],
  combinationIndex: number,
  delimiter: string
): string {
  const fileNameSegments = selections.map(
    ({ key, label }) => `${sanitizeFileNamePart(key)}-${sanitizeFileNamePart(label)}`
  );

  return `${String(combinationIndex).padStart(3, "0")}${delimiter}${fileNameSegments.join(delimiter)}.json`;
}

function buildSelections(fields: PermutationField[]): CombinationSelection[][] {
  if (fields.length === 0) {
    return [[]];
  }

  const [currentField, ...remainingFields] = fields;
  const remainingSelections = buildSelections(remainingFields);

  return currentField.values.flatMap((candidateValue) =>
    remainingSelections.map((selectionSet) => [
      {
        key: currentField.key,
        label: candidateValue.label,
        path: currentField.path,
        value: candidateValue.value,
      },
      ...selectionSet,
    ])
  );
}

function ensureCleanOutputDirectory(outputDir: string): void {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
}

function assignUniqueState(payload: JsonObject, stateName: string): void {
  setNestedValue(payload, "data.data.home_state", stateName);
  setNestedValue(payload, "data.metadata.selectData.home_state.label", stateName);
}

export function generatePayloadFiles(config: GeneratorConfig): GenerationResult {
  const delimiter = config.filenameDelimiter ?? "__";
  const outputDir = resolve(E2E_ROOT, config.outputDir);

  if (config.clearOutputDir) {
    ensureCleanOutputDirectory(outputDir);
  } else {
    mkdirSync(outputDir, { recursive: true });
  }

  const combinationSelections = buildSelections(config.permutationFields);
  const generatedFiles: string[] = [];
  const availableStates = shuffleValues(US_STATES);

  if (combinationSelections.length > availableStates.length) {
    throw new Error(
      `Cannot assign unique US states to ${combinationSelections.length} payloads. Maximum unique states available: ${availableStates.length}.`
    );
  }

  combinationSelections.forEach((selections, selectionIndex) => {
    const combinationIndex = selectionIndex + 1;
    const timestampIso = new Date().toISOString();
    const runId = buildRunId(timestampIso);
    const context: GenerationContext = {
      runId,
      timestampIso,
      combinationIndex,
      uniquePhone: buildUniquePhone(combinationIndex),
      uniqueEmail: buildUniqueEmail(runId, combinationIndex),
    };

    const payload = applyPlaceholders(deepClone(config.basePayload), context) as JsonObject;

    selections.forEach((selection) => {
      setNestedValue(payload, selection.path, selection.value);
    });

    assignUniqueState(payload, availableStates[selectionIndex]);

    const fileName = buildCombinationFileName(selections, combinationIndex, delimiter);
    const outputFilePath = join(outputDir, fileName);

    writeFileSync(outputFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    generatedFiles.push(outputFilePath);
  });

  return {
    outputDir,
    generatedFiles,
  };
}

function buildSummary(result: GenerationResult): string {
  const generatedEntries = readdirSync(result.outputDir).length;

  return [
    `Endpoint: submission`,
    `Output directory: ${result.outputDir}`,
    `Generated payload files: ${generatedEntries}`,
  ].join("\n");
}

function main(): void {
  const configPathArgument = process.argv[2];
  const config = loadGeneratorConfig(
    configPathArgument ? resolve(E2E_ROOT, configPathArgument) : DEFAULT_CONFIG_PATH
  );
  const result = generatePayloadFiles(config);

  console.log(buildSummary(result));
}

if (require.main === module) {
  main();
}