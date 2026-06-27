import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { PlatformRolesService } from './platform-roles.service';

@ApiTags('platform-roles')
@Controller('platform-roles')
export class PlatformRolesController {
  constructor(private readonly service: PlatformRolesService) {}

  @Get()
  @RequirePermissions('employees.view')
  async list() {
    return { items: await this.service.list() };
  }

  /** The full permission catalogue (key/group/description/sensitive) for role + override UIs. */
  @Get('permissions')
  @RequirePermissions('employees.view')
  permissions() {
    return { items: this.service.catalogue() };
  }

  @Get(':id')
  @RequirePermissions('employees.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
