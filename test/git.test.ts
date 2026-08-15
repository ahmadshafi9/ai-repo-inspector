import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedFiles } from "../src/git.js";
import { createFixtureRepo, removeFixtureRepo } from "./fixture-repo.js";

describe("changedFiles", () => {
  let repository: string;
  beforeAll(() => {
    repository = createFixtureRepo();
  });
  afterAll(() => removeFixtureRepo(repository));

  it("returns every file when the list fits", () => {
    const changes = changedFiles(repository, "main");

    expect(changes).toEqual({
      files: [
        { path: "added.txt", status: "added" },
        { path: "base.txt", status: "modified" },
      ],
      truncated: false,
      totalFiles: 2,
    });
  });

  it("caps the list and reports both the flag and the real total", () => {
    const changes = changedFiles(repository, "main", 1);

    expect(changes).toEqual({
      files: [{ path: "added.txt", status: "added" }],
      truncated: true,
      totalFiles: 2,
    });
  });
});
