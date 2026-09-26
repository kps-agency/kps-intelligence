import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it("returns status ok with an ISO timestamp", () => {
    const result = controller.check();
    expect(result.status).toBe("ok");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
