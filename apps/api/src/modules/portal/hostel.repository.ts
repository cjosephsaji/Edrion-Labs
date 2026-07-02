import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  HostelAllocation,
  HostelBlock,
  HostelRoom,
  NewHostelAllocation,
  NewHostelBlock,
  NewHostelRoom,
} from '@edrion/database';
import type { HostelBlocksListQuery, HostelRoomsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const studentDisplayName = sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`;

export interface HostelBlockRow extends HostelBlock {
  roomCount: number;
}
export interface HostelRoomRow extends HostelRoom {
  blockName: string | null;
  available: number;
}
export interface HostelAllocationRow extends HostelAllocation {
  studentName: string | null;
  admissionNo: string | null;
}
export interface HostellerRow {
  id: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  roomId: string;
  roomNo: string | null;
  blockId: string | null;
  blockName: string | null;
  bedNo: string | null;
  fromDate: string | null;
  status: string;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type HostelRefTable = 'hostelBlocks' | 'students';

/**
 * Typed SQL for the institution-portal hostel tables (blocks + rooms + allocations). Same contract as
 * the other portal repos: every query is confined to one institution; campus-scoped reads also include
 * institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit and the
 * allocate→occupancy bridge that re-derives a room's occupancy.
 */
@Injectable()
export class HostelRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: HostelRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- blocks ----------------------------------------------------------------

  async listBlocks(institutionId: string, campusIds: CampusFilter, q: HostelBlocksListQuery): Promise<Page<HostelBlockRow>> {
    const t = schema.hostelBlocks;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.code, `%${q.search}%`), ilike(t.warden, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, blockType: t.blockType, status: t.status, createdAt: t.createdAt };
    const roomCount = sql<number>`(select count(*) from ${schema.hostelRooms} hr where hr.block_id = ${t.id})`;
    const rows = await this.db
      .select({ block: t, roomCount })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.block, roomCount: Number(r.roomCount ?? 0) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findBlock(id: string, institutionId: string): Promise<HostelBlock | undefined> {
    const t = schema.hostelBlocks;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertBlock(values: NewHostelBlock): Promise<HostelBlock> {
    const [row] = await this.db.insert(schema.hostelBlocks).values(values).returning();
    return row!;
  }

  async updateBlock(id: string, version: number, patch: Partial<NewHostelBlock>): Promise<HostelBlock | undefined> {
    const t = schema.hostelBlocks;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteBlock(id: string, version: number): Promise<boolean> {
    const t = schema.hostelBlocks;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- rooms -----------------------------------------------------------------

  async listRooms(institutionId: string, campusIds: CampusFilter, q: HostelRoomsListQuery): Promise<Page<HostelRoomRow>> {
    const t = schema.hostelRooms;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.blockId) conds.push(eq(t.blockId, q.blockId));
    if (q.search) {
      const s = or(ilike(t.roomNo, `%${q.search}%`), ilike(t.floor, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      roomNo: t.roomNo,
      capacity: t.capacity,
      occupied: t.occupied,
      status: t.status,
      createdAt: t.createdAt,
    };
    const rows = await this.db
      .select({ room: t, blockName: schema.hostelBlocks.name })
      .from(t)
      .leftJoin(schema.hostelBlocks, eq(schema.hostelBlocks.id, t.blockId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.roomNo))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.room, blockName: r.blockName, available: Math.max(0, r.room.capacity - r.room.occupied) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findRoom(id: string, institutionId: string): Promise<HostelRoom | undefined> {
    const t = schema.hostelRooms;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertRoom(values: NewHostelRoom): Promise<HostelRoom> {
    const [row] = await this.db.insert(schema.hostelRooms).values(values).returning();
    return row!;
  }

  async updateRoom(id: string, version: number, patch: Partial<NewHostelRoom>): Promise<HostelRoom | undefined> {
    const t = schema.hostelRooms;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteRoom(id: string, version: number): Promise<boolean> {
    const t = schema.hostelRooms;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- allocations (against a room) ------------------------------------------

  async listAllocations(roomId: string): Promise<HostelAllocationRow[]> {
    const t = schema.hostelAllocations;
    const rows = await this.db
      .select({ allocation: t, studentName: studentDisplayName, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(eq(t.roomId, roomId))
      .orderBy(desc(t.createdAt));
    return rows.map((r) => ({ ...r.allocation, studentName: r.studentName, admissionNo: r.admissionNo }));
  }

  /** Institution-wide list of active residents, joined to their room + block + student. */
  async listHostellers(
    institutionId: string,
    campusIds: CampusFilter,
    q: { page: number; pageSize: number; search?: string },
  ): Promise<Page<HostellerRow>> {
    const a = schema.hostelAllocations;
    const r = schema.hostelRooms;
    const b = schema.hostelBlocks;
    const conds: SQL[] = [eq(a.institutionId, institutionId), eq(a.status, 'active')];
    if (campusIds) {
      // Allocations inherit the room's campus — scope through it.
      const inScope = or(isNull(r.campusId), inArray(r.campusId, campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.search) {
      const s = or(ilike(studentDisplayName, `%${q.search}%`), ilike(schema.students.admissionNo, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const rows = await this.db
      .select({
        id: a.id,
        studentId: a.studentId,
        studentName: studentDisplayName,
        admissionNo: schema.students.admissionNo,
        roomId: a.roomId,
        roomNo: r.roomNo,
        blockId: r.blockId,
        blockName: b.name,
        bedNo: a.bedNo,
        fromDate: a.fromDate,
        status: a.status,
      })
      .from(a)
      .leftJoin(r, eq(r.id, a.roomId))
      .leftJoin(b, eq(b.id, r.blockId))
      .leftJoin(schema.students, eq(schema.students.id, a.studentId))
      .where(where)
      .orderBy(desc(a.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db
      .select({ value: count() })
      .from(a)
      .leftJoin(r, eq(r.id, a.roomId))
      .leftJoin(schema.students, eq(schema.students.id, a.studentId))
      .where(where);
    return { items: rows as HostellerRow[], total: Number(tot?.value ?? 0) };
  }

  async findAllocation(id: string, roomId: string): Promise<HostelAllocation | undefined> {
    const t = schema.hostelAllocations;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.roomId, roomId))).limit(1);
    return row;
  }

  /** An active allocation already exists for this (room, student)? (friendly 409). */
  async findActiveAllocation(roomId: string, studentId: string): Promise<HostelAllocation | undefined> {
    const t = schema.hostelAllocations;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.roomId, roomId), eq(t.studentId, studentId), eq(t.status, 'active')))
      .limit(1);
    return row;
  }

  async insertAllocation(values: NewHostelAllocation): Promise<HostelAllocation> {
    const [row] = await this.db.insert(schema.hostelAllocations).values(values).returning();
    return row!;
  }

  async updateAllocation(id: string, version: number, patch: Partial<NewHostelAllocation>): Promise<HostelAllocation | undefined> {
    const t = schema.hostelAllocations;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteAllocation(id: string): Promise<boolean> {
    const t = schema.hostelAllocations;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  /** Count active allocations for a room — drives the occupancy bridge. */
  async countActiveAllocations(roomId: string): Promise<number> {
    const t = schema.hostelAllocations;
    const [row] = await this.db
      .select({ value: count() })
      .from(t)
      .where(and(eq(t.roomId, roomId), eq(t.status, 'active')));
    return Number(row?.value ?? 0);
  }
}
