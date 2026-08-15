import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reviewRepository } from "../src/core.js";
import { InspectorError, reviewResultSchema } from "../src/types.js";
import { createFixtureRepo, removeFixtureRepo } from "./fixture-repo.js";

describe("reviewRepository", () => {
  let repository: string;
  beforeAll(() => {
    repository = createFixtureRepo({ allowedValidationCommands: ["touch allowed.txt", "touch first.txt"] });
  });
  afterAll(() => removeFixtureRepo(repository));

  it("returns a result that satisfies the published schema", async () => {
    const result = await reviewRepository({ repositoryPath: repository, callerTrust: "trusted-shell-caller" });

    expect(() => reviewResultSchema.parse(result)).not.toThrow();
    expect(result.changes.baseRef).toBe("main");
    expect(result.changes.files).toEqual([
      { path: "added.txt", status: "added" },
      { path: "base.txt", status: "modified" },
    ]);
  });

  it('reports "not-run" when no validation was requested', async () => {
    const result = await reviewRepository({ repositoryPath: repository, callerTrust: "trusted-shell-caller" });

    expect(result.validation).toEqual({ status: "not-run", results: [] });
  });

  it("reports the resolved work tree root, not the path it was handed", async () => {
    const subdirectory = join(repository, "nested");
    mkdirSync(subdirectory, { recursive: true });

    const result = await reviewRepository({
      repositoryPath: subdirectory,
      callerTrust: "trusted-shell-caller",
    });

    expect(result.repositoryPath).toBe(repository);
  });

  it.each([join(tmpdir(), "inspector-does-not-exist"), tmpdir(), ""])(
    'refuses "%s" instead of falling back to the current directory',
    async (path) => {
      await expect(
        reviewRepository({ repositoryPath: path, callerTrust: "trusted-shell-caller" }),
      ).rejects.toThrow(InspectorError);
    },
  );

  it("authorizes the whole batch before running any of it", async () => {
    await expect(
      reviewRepository({
        repositoryPath: repository,
        callerTrust: "untrusted-caller",
        // The first command is allowlisted, the second is not.
        validationCommands: ["touch first.txt", "touch pwned.txt"],
      }),
    ).rejects.toThrow(InspectorError);

    expect(existsSync(join(repository, "pwned.txt"))).toBe(false);
    expect(existsSync(join(repository, "first.txt"))).toBe(false);
  });

  it("runs an allowlisted command for an untrusted caller", async () => {
    const result = await reviewRepository({
      repositoryPath: repository,
      callerTrust: "untrusted-caller",
      validationCommands: ["touch allowed.txt"],
    });

    expect(result.validation.status).toBe("passed");
    expect(existsSync(join(repository, "allowed.txt"))).toBe(true);
  });

  it("fails the overall status if any single command fails", async () => {
    const result = await reviewRepository({
      repositoryPath: repository,
      callerTrust: "trusted-shell-caller",
      validationCommands: ["echo fine", "exit 2"],
    });

    expect(result.validation.status).toBe("failed");
    expect(result.validation.results.map((entry) => entry.exitCode)).toEqual([0, 2]);
  });
});
