import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { CreateClassMaterialInput, CreateStreamPostInput } from '@edrion/schemas';
import { DATABASE, API_ENV } from '../../../common/tokens';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalCourseContentService extends PortalResourceService {
  private readonly driver: LocalDiskDriver;

  constructor(
    crud: PortalCrudEngine,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    super(crud);
    this.driver = new LocalDiskDriver(env);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    stream: resourceConfig(schema.classStreamPosts, {
      module: 'portal-course-content',
      entityType: 'class_stream_post',
      actionPrefix: 'class_stream',
      search: [schema.classStreamPosts.title, schema.classStreamPosts.body],
      sortable: { postedAt: schema.classStreamPosts.postedAt, createdAt: schema.classStreamPosts.createdAt },
      snapshot: (r) => ({ kind: r.kind, title: r.title }),
    }),
    materials: resourceConfig(schema.classMaterials, {
      module: 'portal-course-content',
      entityType: 'class_material',
      actionPrefix: 'class_material',
      search: [schema.classMaterials.title],
      sortable: { createdAt: schema.classMaterials.createdAt },
      snapshot: (r) => ({ title: r.title, kindLabel: r.kindLabel }),
    }),
  };

  createStream(ctx: PortalActionContext, input: CreateStreamPostInput) {
    return this.create('stream', ctx, {
      institutionId: ctx.principal.institutionId,
      contextType: input.contextType,
      contextId: input.contextId,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body ?? null,
      topicKey: input.topicKey ?? null,
      requiresAck: input.requiresAck,
      postedBy: ctx.principal.institutionUserId,
    });
  }

  createMaterial(ctx: PortalActionContext, input: CreateClassMaterialInput) {
    return this.create('materials', ctx, {
      institutionId: ctx.principal.institutionId,
      contextType: input.contextType,
      contextId: input.contextId,
      title: input.title,
      description: input.description ?? null,
      kindLabel: input.kindLabel,
      objectId: input.objectId,
      weekNo: input.weekNo ?? null,
      postedBy: ctx.principal.institutionUserId,
    });
  }

  async uploadMaterialFile(ctx: PortalActionContext, filename: string, mimeType: string, buffer: Buffer) {
    if (!buffer.length) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The file is empty.' });
    const scopeKey = `inst/${ctx.principal.institutionId}/staff/${ctx.principal.institutionUserId}`;
    const storageKey = await this.driver.put(scopeKey, buffer);
    const [row] = await this.db
      .insert(schema.storageObjects)
      .values({
        institutionId: ctx.principal.institutionId,
        ownerStaffUserId: ctx.principal.institutionUserId,
        kind: 'class_material',
        driver: 'local',
        storageKey,
        filename: filename.slice(0, 255),
        mimeType,
        sizeBytes: buffer.length,
        processingStatus: 'ready',
        derived: {},
      })
      .returning();
    if (!row) throw new Error('Failed to store file');
    return { id: row.id, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
  }
}
