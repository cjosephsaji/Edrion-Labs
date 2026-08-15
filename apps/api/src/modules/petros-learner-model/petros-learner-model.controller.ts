import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { PrincipalContext } from "@edrion/auth";
import {
  petrosLearnerModelDeleteSchema,
  petrosLearnerModelDiagnosticQuerySchema,
  petrosLearnerModelImportSchema,
  petrosLearnerModelJobActionSchema,
  petrosLearnerModelRebuildSchema,
  petrosLearnerModelSourceSyncSchema,
  type PetrosLearnerModelDeleteInput,
  type PetrosLearnerModelDiagnosticQuery,
  type PetrosLearnerModelImportInput,
  type PetrosLearnerModelJobActionInput,
  type PetrosLearnerModelRebuildInput,
  type PetrosLearnerModelSourceSyncInput,
} from "@edrion/schemas";
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  RequireRecentAuth,
} from "../../common/decorators";
import type { ActionContext } from "../../common/action-context";
import type { EdrionRequestContext } from "../../common/request-context";
import { zodBody } from "../../common/zod-validation.pipe";
import { PetrosLearnerModelService } from "./petros-learner-model.service";
import { PetrosLearningSourceIngestionService } from "./petros-learning-source-ingestion.service";

@Controller("petros-learner-model")
export class PetrosLearnerModelController {
  constructor(
    private readonly service: PetrosLearnerModelService,
    private readonly sourceIngestion: PetrosLearningSourceIngestionService,
  ) {}

  private ctx(
    principalContext: PrincipalContext,
    request: EdrionRequestContext,
  ): ActionContext {
    return { principalContext, request };
  }

  @Get("diagnostic")
  @RequirePermissions("ai.view")
  diagnostic(
    @Query(zodBody(petrosLearnerModelDiagnosticQuerySchema))
    query: PetrosLearnerModelDiagnosticQuery,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.diagnostic(query, this.ctx(principal, request));
  }

  @Post("evidence/import")
  @RequirePermissions("ai.configure")
  @RequireRecentAuth()
  import(
    @Body(zodBody(petrosLearnerModelImportSchema))
    body: PetrosLearnerModelImportInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.import(body, this.ctx(principal, request));
  }

  @Post("evidence/sync-sources")
  @RequirePermissions("ai.configure")
  @RequireRecentAuth()
  syncSources(
    @Body(zodBody(petrosLearnerModelSourceSyncSchema))
    body: PetrosLearnerModelSourceSyncInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.sourceIngestion.syncAll(body, this.ctx(principal, request));
  }

  @Post("jobs")
  @RequirePermissions("ai.configure")
  @RequireRecentAuth()
  rebuild(
    @Body(zodBody(petrosLearnerModelRebuildSchema))
    body: PetrosLearnerModelRebuildInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.requestRebuild(body, this.ctx(principal, request));
  }

  @Post("jobs/:id/run")
  @RequirePermissions("ai.configure")
  run(
    @Param("id") id: string,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.runJob(id, this.ctx(principal, request));
  }

  @Post("jobs/:id/retry")
  @RequirePermissions("ai.configure")
  retry(
    @Param("id") id: string,
    @Body(zodBody(petrosLearnerModelJobActionSchema))
    body: PetrosLearnerModelJobActionInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.retryJob(id, body.reason, this.ctx(principal, request));
  }

  @Post("jobs/:id/cancel")
  @RequirePermissions("ai.configure")
  cancel(
    @Param("id") id: string,
    @Body(zodBody(petrosLearnerModelJobActionSchema))
    body: PetrosLearnerModelJobActionInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.cancelJob(
      id,
      body.reason,
      this.ctx(principal, request),
    );
  }

  @Get("export")
  @Header("content-type", "application/json")
  @RequirePermissions("ai.view")
  @RequireRecentAuth()
  export(
    @Query(zodBody(petrosLearnerModelDiagnosticQuerySchema))
    query: PetrosLearnerModelDiagnosticQuery,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.export(
      { institutionId: query.institutionId, studentId: query.studentId },
      this.ctx(principal, request),
    );
  }

  @Delete()
  @RequirePermissions("ai.configure")
  @RequireRecentAuth()
  delete(
    @Body(zodBody(petrosLearnerModelDeleteSchema))
    body: PetrosLearnerModelDeleteInput,
    @PrincipalCtx() principal: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.delete(
      { institutionId: body.institutionId, studentId: body.studentId },
      body.reason,
      this.ctx(principal, request),
    );
  }
}
