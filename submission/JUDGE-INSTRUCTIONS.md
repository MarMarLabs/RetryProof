# RetryProof judge instructions

## No-rebuild path

1. Open `[DEPLOYED_HTTPS_URL]` in a current desktop browser. No account is required.
2. Select **Try refund demo**.
3. Confirm the import reports `6/6 supported` and shows source hash `da09120d…`.
4. Select **Analyze risk contract**. The deterministic judge deployment is intentionally labeled **Cached demonstration analysis**; the plan is cached, while import, approval, simulator, validator, and evidence hashing run now.
5. Approve **At most one refund effect per event.id**.
6. Select **Timeout after effect** and run the fault suite.
7. Confirm the red result shows event `evt_refund_001`, scenario `timeout_after_refund`, seed `demo-v1`, two deliveries, two refund effects, and **Fail**.
8. Open **Repair**, review the labeled Codex repair, and run the regression recheck.
9. Confirm the green comparison preserves the same event, scenario, seed, and two deliveries, with one refund effect and **Pass**.
10. Download the evidence ZIP and inspect its manifest, patch, regression fixture, receipt, and README.

Expected completion time: under two minutes after the page loads.

## Supported platforms

- Hosted judge path: current Safari, Chrome, Edge, or Firefox with JavaScript enabled.
- Source development: Node.js 20+ on macOS or Linux.
- Production persistence: PostgreSQL 15+.
- Input: pinned supported n8n declarative workflow JSON up to 1 MiB.

## Boundaries

- The judge path is entirely synthetic and makes zero real network side effects.
- Cached provenance never means an agent response was generated in the current judge run.
- A green result applies only to the approved invariant, exact snapshot, fixture, and declared deterministic fault model.
- RetryProof does not prove exactly-once execution or production safety.

## If the hosted path is unavailable

Use the public video and screenshots first. The repository can then be run with:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

No OpenAI key or PostgreSQL instance is required for the cached synthetic judge path.
