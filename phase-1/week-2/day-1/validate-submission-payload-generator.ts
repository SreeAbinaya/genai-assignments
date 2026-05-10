import { existsSync, readFileSync } from "fs";
import assert from "assert/strict";

import {
  generatePayloadFiles,
  loadGeneratorConfig,
} from "./submission-payload-generator";

const US_STATES = new Set([
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
]);

type GeneratedSubmissionPayload = {
  data: {
    data: {
      gender: string;
      have_valid_cdl: string;
      have_valid_medical_card: string;
      sms_consent: string;
      phone_number: number;
      home_state: string;
    };
    metadata: {
      selectData: {
        home_state: {
          label: string;
        };
      };
    };
  };
};

function main(): void {
  const config = loadGeneratorConfig();
  const result = generatePayloadFiles(config);
  const expectedCount = config.permutationFields.reduce(
    (total, field) => total * field.values.length,
    1
  );

  assert.equal(result.generatedFiles.length, expectedCount);
  assert.ok(result.generatedFiles.every((filePath) => existsSync(filePath)));

  const generatedPayloads = result.generatedFiles.map((filePath) =>
    JSON.parse(readFileSync(filePath, "utf8")) as GeneratedSubmissionPayload
  );
  const firstPayload = generatedPayloads[0];
  const generatedStates = generatedPayloads.map((payload) => payload.data.data.home_state);

  assert.ok(["Male", "Female"].includes(firstPayload.data.data.gender));
  assert.ok(["yes", "no"].includes(firstPayload.data.data.have_valid_cdl));
  assert.ok(["yes", "no"].includes(firstPayload.data.data.have_valid_medical_card));
  assert.ok(["yes", "no"].includes(firstPayload.data.data.sms_consent));
  assert.equal(typeof firstPayload.data.data.phone_number, "number");
  assert.ok(generatedStates.every((stateName) => US_STATES.has(stateName)));
  assert.equal(new Set(generatedStates).size, generatedStates.length);
  assert.ok(
    generatedPayloads.every(
      (payload) =>
        payload.data.data.home_state === payload.data.metadata.selectData.home_state.label
    )
  );

  console.log(`Validated ${result.generatedFiles.length} generated submission payload files.`);
}

main();