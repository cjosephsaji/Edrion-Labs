import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignRolesSchema,
  createEmployeeSchema,
  employeeStatusActionSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  type AssignRolesInput,
  type CreateEmployeeInput,
  type EmployeeStatusActionInput,
  type ListEmployeesQuery,
  type UpdateEmployeeInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('employees.view')
  async list(@Query(zodBody(listEmployeesQuerySchema)) query: ListEmployeesQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  @Get('summary')
  @RequirePermissions('employees.view')
  summary() {
    return this.service.summary();
  }

  @Get(':id')
  @RequirePermissions('employees.view')
  get(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermissions('employees.create')
  create(
    @Body(zodBody(createEmployeeSchema)) body: CreateEmployeeInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, this.ctx(pc, request));
  }

  @Patch(':id')
  @RequirePermissions('employees.update')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateEmployeeSchema)) body: UpdateEmployeeInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  @Post(':id/disable')
  @RequirePermissions('employees.disable')
  disable(
    @Param('id') id: string,
    @Body(zodBody(employeeStatusActionSchema)) body: EmployeeStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.disable(id, body, this.ctx(pc, request));
  }

  @Post(':id/restore')
  @RequirePermissions('employees.disable')
  restore(
    @Param('id') id: string,
    @Body(zodBody(employeeStatusActionSchema)) body: EmployeeStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.restore(id, body, this.ctx(pc, request));
  }

  @Post(':id/roles')
  @RequirePermissions('employees.assign_roles')
  assignRoles(
    @Param('id') id: string,
    @Body(zodBody(assignRolesSchema)) body: AssignRolesInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.assignRoles(id, body, this.ctx(pc, request));
  }
}
