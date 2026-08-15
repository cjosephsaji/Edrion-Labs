import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PERMISSIONS_KEY, RECENT_AUTH_KEY } from "../../common/decorators";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { PetrosLearnerModelController } from "./petros-learner-model.controller";

describe("Petros learner-model authorization boundary", () => {
  it("marks identifiable reads ai.view and every mutation ai.configure", () => {
    const prototype = PetrosLearnerModelController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.diagnostic)).toEqual([
      "ai.view",
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.export)).toEqual([
      "ai.view",
    ]);
    for (const handler of [
      prototype.import,
      prototype.syncSources,
      prototype.rebuild,
      prototype.retry,
      prototype.cancel,
      prototype.delete,
    ]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        "ai.configure",
      ]);
    }
    expect(Reflect.getMetadata(RECENT_AUTH_KEY, prototype.syncSources)).toBe(
      true,
    );
    expect(Reflect.getMetadata(RECENT_AUTH_KEY, prototype.export)).toBe(true);
    expect(Reflect.getMetadata(RECENT_AUTH_KEY, prototype.delete)).toBe(true);
  });

  it("denies a support principal without ai.view before controller execution", () => {
    const guard = new PermissionsGuard(new Reflector(), {
      RECENT_AUTH_ENABLED: false,
    } as never);
    const request = {
      principalContext: {
        principal: {
          permissions: {
            keys: new Set(["support.view", "support.manage"]),
            hasWildcard: false,
          },
          lastAuthAt: new Date().toISOString(),
        },
      },
    };
    const context = {
      getHandler: () => PetrosLearnerModelController.prototype.diagnostic,
      getClass: () => PetrosLearnerModelController,
      switchToHttp: () => ({ getRequest: () => request }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });
});
