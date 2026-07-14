import { describe, expect, it } from "vitest";

import {
  N8N_NODE_TYPES,
  POSTGRES_RESERVATION_QUERY,
  inspectNodeCompatibility,
  isRetryProofPostgresReservation,
  listSupportedNodeContracts,
  type N8nNode,
} from "@/lib/n8n";

import { makeSupportedWorkflow } from "./fixtures";

describe("versioned n8n node catalog", () => {
  it("covers the declared Webhook, Set, If/Switch, HTTP, Postgres, and Respond families", () => {
    const contracts = listSupportedNodeContracts();
    expect(new Set(contracts.map((contract) => contract.kind))).toEqual(
      new Set([
        "webhook",
        "set",
        "if",
        "switch",
        "httpRequest",
        "postgres",
        "respondToWebhook",
      ]),
    );
    for (const node of makeSupportedWorkflow().nodes) {
      expect(inspectNodeCompatibility(node)).toMatchObject({ supported: true });
    }
  });

  it("supports Switch only with declarative rules", () => {
    const switchNode: N8nNode = {
      id: "switch",
      name: "Switch",
      type: N8N_NODE_TYPES.switch,
      typeVersion: 3.2,
      position: [0, 0],
      parameters: { rules: { values: [] } },
    };
    expect(inspectNodeCompatibility(switchNode).supported).toBe(true);
    switchNode.parameters.rules = null;
    expect(inspectNodeCompatibility(switchNode)).toMatchObject({
      supported: false,
      issues: [{ code: "INVALID_NODE_PARAMETERS" }],
    });
  });

  it("blocks arbitrary SQL while accepting only the reservation template", () => {
    const reservation = makeSupportedWorkflow().nodes[3];
    expect(isRetryProofPostgresReservation(reservation)).toBe(true);
    expect(inspectNodeCompatibility(reservation).supported).toBe(true);

    const arbitrary = structuredClone(reservation);
    arbitrary.parameters.query = "delete from customer_data";
    expect(isRetryProofPostgresReservation(arbitrary)).toBe(false);
    expect(inspectNodeCompatibility(arbitrary)).toMatchObject({
      supported: false,
      issues: expect.arrayContaining([{ code: "UNSAFE_POSTGRES_QUERY", jsonPath: "$.parameters.query" }]),
    });

    const equivalentWhitespace = structuredClone(reservation);
    equivalentWhitespace.parameters.query = ` ${POSTGRES_RESERVATION_QUERY}; `;
    expect(isRetryProofPostgresReservation(equivalentWhitespace)).toBe(true);

    const wrongReplacement = structuredClone(reservation);
    (wrongReplacement.parameters.options as Record<string, unknown>).queryReplacement =
      "={{ $json.customer.account }}";
    expect(isRetryProofPostgresReservation(wrongReplacement)).toBe(false);
  });

  it("rejects IF condition shapes that the translator cannot model exactly", () => {
    const node = structuredClone(makeSupportedWorkflow().nodes[2]);
    node.parameters.conditions = {};
    expect(inspectNodeCompatibility(node)).toMatchObject({
      supported: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "INVALID_NODE_PARAMETERS" }),
      ]),
    });
  });

  it("fails closed on unknown nodes, versions, and executable expressions", () => {
    const unknown = structuredClone(makeSupportedWorkflow().nodes[0]);
    unknown.type = "n8n-nodes-base.code";
    expect(inspectNodeCompatibility(unknown)).toMatchObject({
      supported: false,
      issues: [{ code: "UNSUPPORTED_NODE_TYPE" }],
    });

    const wrongVersion = structuredClone(makeSupportedWorkflow().nodes[0]);
    wrongVersion.typeVersion = 999;
    expect(inspectNodeCompatibility(wrongVersion)).toMatchObject({
      supported: false,
      issues: expect.arrayContaining([
        { code: "UNSUPPORTED_NODE_VERSION", jsonPath: "$.typeVersion" },
      ]),
    });

    const expression = structuredClone(makeSupportedWorkflow().nodes[4]);
    expression.parameters.body = "={{ (() => process.env.SECRET)() }}";
    expect(inspectNodeCompatibility(expression)).toMatchObject({
      supported: false,
      issues: expect.arrayContaining([
        { code: "UNSUPPORTED_EXPRESSION", jsonPath: "$.parameters.body" },
      ]),
    });
  });
});
