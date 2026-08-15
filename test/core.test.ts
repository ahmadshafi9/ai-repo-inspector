import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
import { reviewResultSchema } from "../src/types.js";
import { createFixtureRepo, removeFixtureRepo } from "./fixture-repo.js";

describe("reviewRepository", () => {
  let repository: string;
  beforeAll(() => {
    repository = createFixtureRepo();
  });
  afterAll(() => removeFixtureRepo(repository));

  it("returns a result that satisfies the published schema", async () => {
    const result = await reviewRepository({ repositoryPath: repository });

    expect(() => reviewResultSchema.parse(result)).not.toThrow();
    expect(result.changes.baseRef).toBe("main");
    expect(result.changes.files).toEqual([
      { path: "added.txt", status: "added" },
      { path: "base.txt", status: "modified" },
    ]);
  });

  it('reports "not-run" when no validation was requested', async () => {
    const result = await reviewRepository({ repositoryPath: repository });

    expect(result.validation).toEqual({ status: "not-run", results: [] });
  });

  it("fails the overall status if any single command fails", async () => {
    const result = await reviewRepository({
      repositoryPath: repository,
      validationCommands: ["echo fine", "exit 2"],
    });

    expect(result.validation.status).toBe("failed");
    expect(result.validation.results.map((entry) => entry.exitCode)).toEqual([0, 2]);
  });
});
