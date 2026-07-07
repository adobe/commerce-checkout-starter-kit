import { beforeEach, vi } from "vitest";

global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  if (global.fetch?.mockReset) {
    global.fetch.mockReset();
  }
});
