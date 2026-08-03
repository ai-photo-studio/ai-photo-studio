import assert from "node:assert/strict";
import { test } from "node:test";
import { RestorationDraftController } from "./restoration-draft.controller";

const config = {} as never;

function response() {
  const result: { statusCode?: number; body?: unknown } = {};
  return {
    result,
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; }
  };
}

test("unknown draft controller exceptions return generic 500 without backend detail", async () => {
  const controller = new RestorationDraftController(config);
  const drafts = (controller as unknown as { drafts: { getDraft: () => Promise<never> } }).drafts;
  drafts.getDraft = async () => { throw new Error("postgres://user:secret@internal/storage-key/base64-data"); };
  const res = response();
  await controller.getDraft({ params: { id: "draft-1" }, headers: {} } as never, res as never);
  assert.equal(res.result.statusCode, 500);
  assert.deepEqual(res.result.body, { success: false, code: "INTERNAL_ERROR", message: "Unable to process this request" });
});
