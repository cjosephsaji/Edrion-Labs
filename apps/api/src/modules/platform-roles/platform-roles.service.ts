import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@edrion/permissions';
import { PlatformRolesRepository, type RoleWithMeta } from './platform-roles.repository';

@Injectable()
export class PlatformRolesService {
  constructor(private readonly repo: PlatformRolesRepository) {}

  list(): Promise<RoleWithMeta[]> {
    return this.repo.list();
  }

  async get(id: string): Promise<RoleWithMeta> {
    const role = await this.repo.findById(id);
    if (!role) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
    return role;
  }

  /** The permission catalogue — source of truth for the role/override UIs. */
  catalogue() {
    return PERMISSIONS.map((p) => ({
      key: p.key,
      group: p.group,
      description: p.description,
      sensitive: Boolean(p.sensitive),
    }));
  }
}
